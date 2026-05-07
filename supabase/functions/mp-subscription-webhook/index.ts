// Edge Function: Webhook do Mercado Pago para assinatura Pro (PWA/web).
//
// O Mercado Pago envia POST com payload no formato:
//   { type: 'preapproval'|'subscription_authorized_payment'|'payment', data: { id }, ... }
// (alguns endpoints antigos usam `topic` em vez de `type` e/ou enviam id via query string)
//
// Para cada notificação, buscamos o objeto na API MP e atualizamos pro_subscriptions.
//
// Variáveis de ambiente:
//   - MP_APP_ACCESS_TOKEN
//   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//
// Setup no painel Mercado Pago:
//   Sua integração -> Notificações webhooks -> URL de produção:
//   https://<project>.supabase.co/functions/v1/mp-subscription-webhook
//   Eventos: "Pagamentos", "Assinaturas (preapproval)", "Pagamentos de assinatura"

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

const MP_BASE = 'https://api.mercadopago.com'

type Plan = 'monthly' | 'yearly' | 'lifetime'

function planFromExternalRef(ref: string | null | undefined): { userId: string | null; plan: Plan | null } {
  // formato: pro:<userId>:<plan>
  if (!ref || !ref.startsWith('pro:')) return { userId: null, plan: null }
  const parts = ref.split(':')
  if (parts.length < 3) return { userId: null, plan: null }
  const plan = parts[2] as Plan
  if (!['monthly', 'yearly', 'lifetime'].includes(plan)) return { userId: parts[1], plan: null }
  return { userId: parts[1], plan }
}

async function mpFetch(path: string, token: string) {
  const r = await fetch(`${MP_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`MP ${path} -> ${r.status}: ${text}`)
  }
  return r.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405)

  const mpToken = Deno.env.get('MP_APP_ACCESS_TOKEN')
  if (!mpToken) return json({ error: 'MP_APP_ACCESS_TOKEN não configurado' }, 500)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let payload: any = {}
  try { payload = await req.json() } catch { /* MP às vezes manda corpo vazio */ }

  // MP envia type/topic dependendo do tipo de notificação
  const url = new URL(req.url)
  const type: string = payload?.type || payload?.topic || url.searchParams.get('type') || url.searchParams.get('topic') || ''
  const dataId: string = String(payload?.data?.id || url.searchParams.get('id') || payload?.id || '')

  console.log('[mp-subscription-webhook] type=', type, 'id=', dataId)

  if (!type || !dataId) {
    // Sempre responder 200 pra MP não ficar reentrando
    return json({ received: true, skipped: 'sem type/id' })
  }

  try {
    if (type === 'preapproval') {
      // Cria/atualiza a assinatura recorrente
      const pre = await mpFetch(`/preapproval/${dataId}`, mpToken)
      const { userId, plan } = planFromExternalRef(pre.external_reference)
      if (!userId || !plan || plan === 'lifetime') {
        console.warn('[mp-subscription-webhook] external_ref inválido:', pre.external_reference)
        return json({ received: true, skipped: 'external_ref inválido' })
      }

      // status MP: pending | authorized | paused | cancelled
      const status: string = pre.status
      const nextPayment: string | null = pre.next_payment_date || null
      // Margem de 2 dias após próximo pagamento esperado, pra cobrir atraso de webhook de renovação
      const expiresAt = nextPayment
        ? new Date(new Date(nextPayment).getTime() + 2 * 24 * 60 * 60 * 1000).toISOString()
        : null

      if (status === 'authorized') {
        const upsert = {
          user_id: userId,
          source: 'mp_web',
          product_id: `mp_${plan}`,
          plan_type: plan,
          is_lifetime: false,
          expires_at: expiresAt,
          platform: 'web',
          mp_preapproval_id: String(pre.id),
          external_id: String(pre.id),
          metadata: { last_event: 'preapproval.' + status, raw: pre },
        }
        const { error } = await supabase
          .from('pro_subscriptions')
          .upsert(upsert, { onConflict: 'user_id' })
        if (error) throw error
        return json({ received: true, action: 'activated', plan })
      }

      if (status === 'cancelled' || status === 'paused') {
        // Mantém Pro até a data atual de expires_at; só registra evento.
        const { error } = await supabase
          .from('pro_subscriptions')
          .update({ metadata: { last_event: 'preapproval.' + status, raw: pre } })
          .eq('user_id', userId)
          .eq('mp_preapproval_id', String(pre.id))
        if (error) throw error
        return json({ received: true, action: 'noted', status })
      }

      // pending / outros: só log
      return json({ received: true, action: 'ignored', status })
    }

    if (type === 'subscription_authorized_payment') {
      // Pagamento recorrente paga -> estende expires_at conforme próximo vencimento
      const pay = await mpFetch(`/authorized_payments/${dataId}`, mpToken)
      const preapprovalId = String(pay.preapproval_id || '')
      const status: string = pay.status

      if (!preapprovalId) {
        return json({ received: true, skipped: 'sem preapproval_id' })
      }

      if (status !== 'approved') {
        return json({ received: true, action: 'ignored', status })
      }

      // Busca o preapproval pra pegar próximo vencimento
      const pre = await mpFetch(`/preapproval/${preapprovalId}`, mpToken)
      const nextPayment: string | null = pre.next_payment_date || null
      const expiresAt = nextPayment
        ? new Date(new Date(nextPayment).getTime() + 2 * 24 * 60 * 60 * 1000).toISOString()
        : null

      const { error } = await supabase
        .from('pro_subscriptions')
        .update({
          expires_at: expiresAt,
          metadata: { last_event: 'authorized_payment.approved', payment_id: pay.id },
        })
        .eq('mp_preapproval_id', preapprovalId)
      if (error) throw error
      return json({ received: true, action: 'renewed', expires_at: expiresAt })
    }

    if (type === 'payment') {
      // Pagamento avulso (vitalício via Checkout Pro)
      const pay = await mpFetch(`/v1/payments/${dataId}`, mpToken)
      const status: string = pay.status
      const externalRef: string = pay.external_reference || ''
      const { userId, plan } = planFromExternalRef(externalRef)

      if (!userId || plan !== 'lifetime') {
        // Pagamento que não é da assinatura Pro -> ignora silenciosamente
        return json({ received: true, skipped: 'não é payment de Pro lifetime' })
      }

      if (status !== 'approved') {
        return json({ received: true, action: 'ignored', status })
      }

      const upsert = {
        user_id: userId,
        source: 'mp_web',
        product_id: 'mp_lifetime',
        plan_type: 'lifetime',
        is_lifetime: true,
        expires_at: null,
        platform: 'web',
        mp_payment_id: String(pay.id),
        external_id: String(pay.id),
        metadata: { last_event: 'payment.approved', raw: pay },
      }
      const { error } = await supabase
        .from('pro_subscriptions')
        .upsert(upsert, { onConflict: 'user_id' })
      if (error) throw error
      return json({ received: true, action: 'lifetime_activated' })
    }

    return json({ received: true, action: 'ignored', type })
  } catch (err) {
    console.error('[mp-subscription-webhook] erro:', err)
    // Retorna 200 mesmo em erro pra MP não martelar; logamos pra investigar.
    return json({ received: true, error: String((err as Error)?.message || err) })
  }
})
