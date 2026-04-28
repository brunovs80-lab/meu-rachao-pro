// Edge Function: send-push
//
// POST { player_ids: string[], title, body, data?, type? }
//
// - Lê tokens FCM em device_tokens via RPC `get_device_tokens_for_players`.
// - Troca FIREBASE_SERVICE_ACCOUNT_JSON (secret) por OAuth access token
//   (JWT-bearer flow). Cacheia o token em memória pelo TTL.
// - Chama POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send
//   pra cada token. Tokens inválidos (UNREGISTERED/NOT_FOUND/INVALID_ARGUMENT)
//   são removidos via `unregister_device_token`.
//
// Autorização: verify_jwt=true. Edge functions internas chamam com o
// SUPABASE_SERVICE_ROLE_KEY no Authorization header.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface ServiceAccount {
  client_email: string
  private_key: string
  project_id: string
  token_uri?: string
}

let serviceAccount: ServiceAccount | null = null
function getServiceAccount(): ServiceAccount | null {
  if (serviceAccount) return serviceAccount
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')
  if (!raw) return null
  try {
    serviceAccount = JSON.parse(raw)
    return serviceAccount
  } catch (e) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON parse error:', e)
    return null
  }
}

function b64urlFromString(s: string): string {
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}
function b64urlFromBytes(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token
  }

  const header = b64urlFromString(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64urlFromString(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const data = `${header}.${claims}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(data),
  )
  const jwt = `${data}.${b64urlFromBytes(new Uint8Array(sig))}`

  const resp = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(jwt)}`,
  })

  const tokenJson = await resp.json()
  if (!resp.ok || !tokenJson.access_token) {
    throw new Error(`OAuth token error: ${JSON.stringify(tokenJson)}`)
  }

  const expiresIn = Number(tokenJson.expires_in || 3600)
  cachedAccessToken = {
    token: tokenJson.access_token,
    expiresAt: now + expiresIn,
  }
  return cachedAccessToken.token
}

interface SendResult {
  player_id: string
  token: string
  ok: boolean
  error?: string
  invalid?: boolean
}

async function sendOne(
  accessToken: string,
  projectId: string,
  fcmToken: string,
  payload: { title: string; body: string; data?: Record<string, string>; type?: string },
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const dataPayload: Record<string, string> = { ...(payload.data || {}) }
  if (payload.type) dataPayload.type = payload.type

  const message = {
    message: {
      token: fcmToken,
      notification: { title: payload.title, body: payload.body },
      data: Object.keys(dataPayload).length ? dataPayload : undefined,
      android: { priority: 'HIGH' as const, notification: { sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
    },
  }

  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    },
  )

  const respBody = await resp.json().catch(() => ({}))
  return { ok: resp.ok, status: resp.status, body: respBody }
}

function isInvalidTokenError(status: number, body: any): boolean {
  if (status === 404) return true
  const errorStatus = body?.error?.status
  const details = body?.error?.details || []
  if (errorStatus === 'NOT_FOUND') return true
  if (errorStatus === 'UNREGISTERED') return true
  if (errorStatus === 'INVALID_ARGUMENT') {
    for (const d of details) {
      const code = d?.errorCode || d?.error_code
      if (code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') return true
    }
  }
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const playerIds: string[] = Array.isArray(body.player_ids) ? body.player_ids : []
    const title: string = String(body.title || '').slice(0, 200)
    const messageBody: string = String(body.body || '').slice(0, 500)
    const dataRaw: Record<string, unknown> = body.data && typeof body.data === 'object' ? body.data : {}
    const type: string | undefined = body.type ? String(body.type) : undefined

    if (!playerIds.length || !title || !messageBody) {
      return json({ ok: false, error: 'player_ids, title e body são obrigatórios' }, 400)
    }

    // FCM data deve ter apenas strings
    const dataPayload: Record<string, string> = {}
    for (const [k, v] of Object.entries(dataRaw)) dataPayload[k] = String(v)

    const sa = getServiceAccount()
    if (!sa) {
      return json({
        ok: false,
        error: 'FIREBASE_SERVICE_ACCOUNT_JSON não configurado',
        skipped: true,
      }, 200)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: tokens, error: tokensErr } = await supabase
      .rpc('get_device_tokens_for_players', { p_player_ids: playerIds })

    if (tokensErr) {
      console.error('get_device_tokens_for_players error:', tokensErr)
      return json({ ok: false, error: 'Erro buscando tokens' }, 500)
    }
    if (!tokens || !tokens.length) {
      return json({ ok: true, sent: 0, failed: 0, no_tokens: true })
    }

    const accessToken = await getAccessToken(sa)

    let sent = 0
    let failed = 0
    const results: SendResult[] = []
    const tokensToRemove: string[] = []

    for (const t of tokens as Array<{ player_id: string; fcm_token: string; platform: string }>) {
      try {
        const r = await sendOne(accessToken, sa.project_id, t.fcm_token, {
          title, body: messageBody, data: dataPayload, type,
        })
        if (r.ok) {
          sent++
          results.push({ player_id: t.player_id, token: t.fcm_token, ok: true })
        } else {
          failed++
          const invalid = isInvalidTokenError(r.status, r.body)
          if (invalid) tokensToRemove.push(t.fcm_token)
          results.push({
            player_id: t.player_id,
            token: t.fcm_token,
            ok: false,
            invalid,
            error: JSON.stringify((r.body as any)?.error || r.body),
          })
        }
      } catch (err) {
        failed++
        const msg = err instanceof Error ? err.message : String(err)
        results.push({ player_id: t.player_id, token: t.fcm_token, ok: false, error: msg })
      }
    }

    for (const tok of tokensToRemove) {
      await supabase.rpc('unregister_device_token', { p_fcm_token: tok }).catch(() => {})
    }

    return json({
      ok: failed === 0,
      sent,
      failed,
      removed_invalid: tokensToRemove.length,
      results: results.length <= 20 ? results : undefined,
    })
  } catch (err) {
    console.error('send-push unexpected:', err)
    return json({ ok: false, error: 'Erro interno' }, 500)
  }
})
