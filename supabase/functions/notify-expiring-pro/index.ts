// Edge Function: notify-expiring-pro
//
// Avisa usuários por push quando assinatura Pro está perto de vencer:
//   - 7 dias antes
//   - 1 dia antes
//
// Chamada por cron (pg_cron + pg_net) diariamente. Cron passa header
// `x-cron-secret` que deve bater com env var CRON_NOTIFY_SECRET.
// Verify_jwt=false porque autenticação é via header próprio.
//
// Tracking de "já avisado" via pro_subscriptions.metadata:
//   - notify_7d_for: ISO date do expires_at quando 7d-warn foi enviado
//   - notify_1d_for: ISO date do expires_at quando 1d-warn foi enviado
// Se o usuário renova (expires_at muda), o "for" não bate mais e re-notifica.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// JWT anon legacy hardcoded (público, mesmo de js/config.js). Necessário porque
// SUPABASE_ANON_KEY no env atual vem em novo formato sb_publishable_xxx, que
// send-push rejeita como Invalid JWT (UNAUTHORIZED_INVALID_JWT_FORMAT).
const LEGACY_ANON_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqdGhscHRkZ3BtYnZmeGlmbm9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTYzMDcsImV4cCI6MjA5MTc3MjMwN30.n4OReYR6jxTdvtwaH6GvccEp8lvMNxc_H1w-ipNr9wA'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const cronSecret = Deno.env.get('CRON_NOTIFY_SECRET')
  const reqSecret = req.headers.get('x-cron-secret')
  if (!cronSecret) return json({ error: 'CRON_NOTIFY_SECRET não configurado' }, 500)
  if (reqSecret !== cronSecret) return json({ error: 'unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://ajthlptdgpmbvfxifnon.supabase.co'
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const now = Date.now()
  const in8d = new Date(now + 8 * 24 * 3600 * 1000).toISOString()
  const nowIso = new Date(now).toISOString()

  const { data: subs, error: subsErr } = await supabase
    .from('pro_subscriptions')
    .select('user_id, expires_at, is_lifetime, metadata')
    .eq('is_lifetime', false)
    .not('expires_at', 'is', null)
    .gte('expires_at', nowIso)
    .lte('expires_at', in8d)

  if (subsErr) {
    console.error('[notify-expiring-pro] erro query subs:', subsErr)
    return json({ ok: false, error: subsErr.message }, 500)
  }

  const notify_7d: any[] = []
  const notify_1d: any[] = []

  for (const sub of subs || []) {
    const expMs = new Date(sub.expires_at).getTime()
    const daysUntil = (expMs - now) / (24 * 3600 * 1000)
    const expDate = sub.expires_at.split('T')[0]
    const meta = (sub.metadata as Record<string, any>) || {}

    if (daysUntil < 2 && meta.notify_1d_for !== expDate) {
      notify_1d.push({ ...sub, expDate, meta })
    } else if (daysUntil >= 6 && daysUntil < 8 && meta.notify_7d_for !== expDate) {
      notify_7d.push({ ...sub, expDate, meta })
    }
  }

  async function pushUser(userId: string, title: string, body: string): Promise<{ ok: boolean; status?: number; errBody?: string }> {
    const r = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LEGACY_ANON_JWT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        player_ids: [userId],
        title,
        body,
        type: 'pro_expiring',
      }),
    })
    if (!r.ok) {
      const errBody = await r.text()
      console.error('[notify-expiring-pro] push falhou', userId, r.status, errBody)
      return { ok: false, status: r.status, errBody }
    }
    return { ok: true }
  }

  let sent_7d = 0, sent_1d = 0, errors = 0
  let lastErr: any = null

  for (const sub of notify_7d) {
    const r = await pushUser(
      sub.user_id,
      '⏰ Seu Pro vence em 7 dias',
      'Renove pra continuar com tudo desbloqueado no Meu Rachão.'
    )
    if (r.ok) {
      const newMeta = { ...sub.meta, notify_7d_for: sub.expDate, notify_7d_at: new Date().toISOString() }
      const { error } = await supabase
        .from('pro_subscriptions')
        .update({ metadata: newMeta })
        .eq('user_id', sub.user_id)
      if (error) { errors++; lastErr = error.message }
      else sent_7d++
    } else { errors++; lastErr = `push 7d ${r.status}: ${r.errBody}` }
  }

  for (const sub of notify_1d) {
    const r = await pushUser(
      sub.user_id,
      '⏰ Seu Pro vence amanhã',
      'Renove agora pra não perder o acesso.'
    )
    if (r.ok) {
      const newMeta = { ...sub.meta, notify_1d_for: sub.expDate, notify_1d_at: new Date().toISOString() }
      const { error } = await supabase
        .from('pro_subscriptions')
        .update({ metadata: newMeta })
        .eq('user_id', sub.user_id)
      if (error) { errors++; lastErr = error.message }
      else sent_1d++
    } else { errors++; lastErr = `push 1d ${r.status}: ${r.errBody}` }
  }

  return json({
    ok: true,
    candidates_7d: notify_7d.length,
    candidates_1d: notify_1d.length,
    sent_7d,
    sent_1d,
    errors,
    lastErr,
  })
})
