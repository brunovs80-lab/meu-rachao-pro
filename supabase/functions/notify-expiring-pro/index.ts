// Edge Function: notify-expiring-pro
//
// Avisa usuários por push quando assinatura Pro está perto de vencer:
//   - 7 dias antes
//   - 1 dia antes (último aviso)
//
// Chamada por cron (pg_cron + pg_net) diariamente. Cron passa header
// `x-cron-secret` que deve bater com env var CRON_NOTIFY_SECRET.
// Verify_jwt=false porque autenticação é via header próprio.
//
// Tracking de "já avisado" via pro_subscriptions.metadata:
//   - notify_7d_for: ISO date do expires_at quando 7d-warn foi enviado
//   - notify_1d_for: ISO date do expires_at quando 1d-warn foi enviado
// Se o usuário renova (expires_at muda), o "for" não bate mais e re-notifica
// no próximo ciclo.
//
// Variáveis de ambiente:
//   - CRON_NOTIFY_SECRET (secret pra autenticar a cron)
//   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const cronSecret = Deno.env.get('CRON_NOTIFY_SECRET')
  const reqSecret = req.headers.get('x-cron-secret')
  if (!cronSecret) return json({ error: 'CRON_NOTIFY_SECRET não configurado' }, 500)
  if (reqSecret !== cronSecret) return json({ error: 'unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const now = Date.now()
  const in8d = new Date(now + 8 * 24 * 3600 * 1000).toISOString()
  const nowIso = new Date(now).toISOString()

  // Pull assinaturas não-vitalício expirando em até 8 dias
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
    const expDate = sub.expires_at.split('T')[0] // "YYYY-MM-DD"
    const meta = (sub.metadata as Record<string, any>) || {}

    if (daysUntil < 2 && meta.notify_1d_for !== expDate) {
      notify_1d.push({ ...sub, expDate, meta })
    } else if (daysUntil >= 6 && daysUntil < 8 && meta.notify_7d_for !== expDate) {
      notify_7d.push({ ...sub, expDate, meta })
    }
  }

  async function pushUser(userId: string, title: string, body: string): Promise<boolean> {
    const r = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
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
      console.error('[notify-expiring-pro] push falhou', userId, r.status, await r.text())
      return false
    }
    return true
  }

  let sent_7d = 0, sent_1d = 0, errors = 0

  for (const sub of notify_7d) {
    const ok = await pushUser(
      sub.user_id,
      '⏰ Seu Pro vence em 7 dias',
      'Renove pra continuar com tudo desbloqueado no Meu Rachão.'
    )
    if (ok) {
      const newMeta = { ...sub.meta, notify_7d_for: sub.expDate, notify_7d_at: new Date().toISOString() }
      const { error } = await supabase
        .from('pro_subscriptions')
        .update({ metadata: newMeta })
        .eq('user_id', sub.user_id)
      if (error) { errors++; console.error('[notify-expiring-pro] update meta 7d:', error) }
      else sent_7d++
    } else errors++
  }

  for (const sub of notify_1d) {
    const ok = await pushUser(
      sub.user_id,
      '⏰ Seu Pro vence amanhã',
      'Renove agora pra não perder o acesso.'
    )
    if (ok) {
      const newMeta = { ...sub.meta, notify_1d_for: sub.expDate, notify_1d_at: new Date().toISOString() }
      const { error } = await supabase
        .from('pro_subscriptions')
        .update({ metadata: newMeta })
        .eq('user_id', sub.user_id)
      if (error) { errors++; console.error('[notify-expiring-pro] update meta 1d:', error) }
      else sent_1d++
    } else errors++
  }

  return json({
    ok: true,
    candidates_7d: notify_7d.length,
    candidates_1d: notify_1d.length,
    sent_7d,
    sent_1d,
    errors,
  })
})
