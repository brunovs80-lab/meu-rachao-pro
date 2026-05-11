// Edge Function: Webhook do Mercado Pago para ativação de Pro (PWA/web).
//
// Todos os planos são one-shot (Preference). Diferença é só na duração:
//   - monthly  -> 30 dias
//   - yearly   -> 365 dias
//   - lifetime -> vitalício (is_lifetime=true)
//
// Variáveis de ambiente:
//   - MP_APP_ACCESS_TOKEN
//   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//
// Setup no painel MP:
//   Webhooks -> URL: https://<project>.supabase.co/functions/v1/mp-subscription-webhook
//   Eventos: "Pagamentos" (payment)

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

const PLAN_DAYS: Record<Plan, number | null> = {
  monthly: 30,
  yearly: 365,
  lifetime: null, // vitalício
}

function planFromExternalRef(ref: string | null | undefined): { userId: string | null; plan: Plan | null } {
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

  const url = new URL(req.url)
  const type: string = payload?.type || payload?.topic || url.searchParams.get('type') || url.searchParams.get('topic') || ''
  const dataId: string = String(payload?.data?.id || url.searchParams.get('id') || payload?.id || '')

  console.log('[mp-subscription-webhook] type=', type, 'id=', dataId)

  if (!type || !dataId) {
    return json({ received: true, skipped: 'sem type/id' })
  }

  try {
    if (type !== 'payment') {
      // merchant_order, preapproval e outros são ignorados — todos os planos
      // agora são one-shot via payment.
      return json({ received: true, action: 'ignored', type })
    }

    const pay = await mpFetch(`/v1/payments/${dataId}`, mpToken)
    const status: string = pay.status
    const externalRef: string = pay.external_reference || ''
    const { userId, plan } = planFromExternalRef(externalRef)

    if (!userId || !plan) {
      return json({ received: true, skipped: 'não é payment de Pro' })
    }

    if (status !== 'approved') {
      return json({ received: true, action: 'ignored', status })
    }

    // Carrega assinatura atual (se houver) pra estender o prazo em vez de resetar
    const { data: existing } = await supabase
      .from('pro_subscriptions')
      .select('expires_at, is_lifetime')
      .eq('user_id', userId)
      .maybeSingle()

    if (existing?.is_lifetime) {
      // Já é vitalício; novo pagamento de monthly/yearly é redundante
      // (lifetime sobrescrevemos abaixo se a compra atual for lifetime).
      if (plan !== 'lifetime') {
        return json({ received: true, skipped: 'já é vitalício' })
      }
    }

    const upsert: any = {
      user_id: userId,
      source: 'mp_web',
      platform: 'web',
      mp_payment_id: String(pay.id),
      external_id: String(pay.id),
      metadata: { last_event: 'payment.approved', plan, amount: pay.transaction_amount },
    }

    if (plan === 'lifetime') {
      upsert.product_id = 'mp_lifetime'
      upsert.plan_type = 'lifetime'
      upsert.is_lifetime = true
      upsert.expires_at = null
    } else {
      const days = PLAN_DAYS[plan]!
      // Estende a partir do maior entre NOW() e expires_at atual
      const now = Date.now()
      const currentExpiryMs = existing?.expires_at ? new Date(existing.expires_at).getTime() : 0
      const baseMs = currentExpiryMs > now ? currentExpiryMs : now
      const newExpiry = new Date(baseMs + days * 24 * 60 * 60 * 1000)

      upsert.product_id = `mp_${plan}`
      upsert.plan_type = plan
      upsert.is_lifetime = false
      upsert.expires_at = newExpiry.toISOString()
    }

    const { error } = await supabase
      .from('pro_subscriptions')
      .upsert(upsert, { onConflict: 'user_id' })
    if (error) throw error

    return json({
      received: true,
      action: 'activated',
      plan,
      expires_at: upsert.expires_at,
      is_lifetime: upsert.is_lifetime,
    })
  } catch (err) {
    console.error('[mp-subscription-webhook] erro:', err)
    // Sempre 200 pra MP não martelar; logamos pra investigar.
    return json({ received: true, error: String((err as Error)?.message || err) })
  }
})
