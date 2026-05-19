// Edge Function: auth-login
// Fase 3 da auditoria 2026-05-18 — emite JWT customizado (HS256, 30d) assinado
// com JWT_SECRET. PostgREST aceita esse JWT como autenticação válida
// (auth.jwt()->>'sub' = player_id, role=authenticated), permitindo que RPCs
// extraiam o caller_id confiável em vez de receber via body.
//
// POST { phone, password } -> { ok: true, token, user } | { ok: false, error }
//
// Rate limit (hardening): 5 falhas/15min por phone OU 20 reqs/15min por IP
// dispara 429. Tentativas registradas em login_attempts (acessada só via
// service_role).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

// CORS restritivo (allowlist) em vez de '*'.
const ALLOWED_ORIGINS = new Set([
  'https://meurachaopro.com.br',
  'https://www.meurachaopro.com.br',
  'capacitor://localhost',
  'http://localhost',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])
function cors(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://meurachaopro.com.br'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 dias

// Rate limit
const RATE_WINDOW_MINUTES = 15
const PHONE_FAIL_LIMIT = 5
const IP_REQ_LIMIT = 20

async function importJwtKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function extractIp(req: Request): string {
  const cf = req.headers.get('CF-Connecting-IP')
  if (cf) return cf.trim()
  const xff = req.headers.get('X-Forwarded-For')
  if (xff) return xff.split(',')[0].trim()
  return ''
}

Deno.serve(async (req) => {
  const corsHeaders = cors(req)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const { phone, password } = await req.json()
    if (!phone || !password) {
      return json({ ok: false, error: 'phone e password obrigatórios' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    // Não pode ser SUPABASE_* — esse prefixo é reservado pela plataforma.
    const jwtSecret = Deno.env.get('JWT_SECRET')
    if (!jwtSecret) return json({ ok: false, error: 'JWT_SECRET ausente' }, 500)

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const cleanPhone = String(phone).replace(/\D/g, '')
    const ip = extractIp(req)
    const sinceIso = new Date(Date.now() - RATE_WINDOW_MINUTES * 60 * 1000).toISOString()

    // ========== Rate limit check ==========
    const { count: phoneFails } = await supabase
      .from('login_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('phone', cleanPhone)
      .eq('success', false)
      .gte('attempted_at', sinceIso)

    if ((phoneFails ?? 0) >= PHONE_FAIL_LIMIT) {
      return json({
        ok: false,
        error: `Muitas tentativas com este telefone. Aguarde ${RATE_WINDOW_MINUTES} minutos.`,
        code: 'RATE_LIMIT_PHONE',
      }, 429)
    }

    if (ip) {
      const { count: ipReqs } = await supabase
        .from('login_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('ip', ip)
        .gte('attempted_at', sinceIso)

      if ((ipReqs ?? 0) >= IP_REQ_LIMIT) {
        return json({
          ok: false,
          error: `Muitas tentativas deste IP. Aguarde ${RATE_WINDOW_MINUTES} minutos.`,
          code: 'RATE_LIMIT_IP',
        }, 429)
      }
    }

    // ========== Login propriamente dito ==========
    const { data, error } = await supabase.rpc('login_with_password', {
      p_phone: cleanPhone,
      p_password: password,
    })

    const success = !error && data?.success === true

    // Registra tentativa (fire-and-forget — não bloquear login se falhar)
    supabase.from('login_attempts').insert({
      phone: cleanPhone,
      ip: ip || null,
      success,
    }).then(({ error: insErr }) => {
      if (insErr) console.error('login_attempts insert failed:', insErr)
    })

    if (error) {
      console.error('login_with_password error:', error)
      return json({ ok: false, error: 'Erro ao validar credenciais' }, 500)
    }
    if (!success) {
      return json({ ok: false, error: data?.error || 'Credenciais inválidas' }, 401)
    }

    const user = data.user
    const now = getNumericDate(0)
    const payload = {
      aud: 'authenticated',
      role: 'authenticated',
      sub: user.id,
      iat: now,
      exp: getNumericDate(TOKEN_TTL_SECONDS),
    }

    const key = await importJwtKey(jwtSecret)
    const token = await create({ alg: 'HS256', typ: 'JWT' }, payload, key)

    return json({ ok: true, token, user, expires_in: TOKEN_TTL_SECONDS })
  } catch (err) {
    console.error('auth-login fatal:', err)
    return json({ ok: false, error: String(err?.message || err) }, 500)
  }
})
