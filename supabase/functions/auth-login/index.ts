// Edge Function: auth-login
// Fase 3 da auditoria 2026-05-18 — emite JWT customizado (HS256, 30d) assinado
// com SUPABASE_JWT_SECRET. PostgREST aceita esse JWT como autenticação válida
// (auth.jwt()->>'sub' = player_id, role=authenticated), permitindo que RPCs
// extraiam o caller_id confiável em vez de receber via body.
//
// POST { phone, password } -> { ok: true, token, user } | { ok: false, error }
//
// Co-existe com login legacy via RPC login_with_password — ambos retornam o
// mesmo objeto user; este adiciona o campo `token`.

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

async function importJwtKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
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

    const { data, error } = await supabase.rpc('login_with_password', {
      p_phone: cleanPhone,
      p_password: password,
    })
    if (error) {
      console.error('login_with_password error:', error)
      return json({ ok: false, error: 'Erro ao validar credenciais' }, 500)
    }
    if (!data?.success) {
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
