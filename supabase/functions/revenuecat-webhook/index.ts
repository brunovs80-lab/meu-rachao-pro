// Edge Function: webhook do RevenueCat
// Recebe eventos de assinatura e atualiza pro_subscriptions.
//
// Setup no RevenueCat (Project → Integrations → Webhooks):
//   URL:  https://<project>.supabase.co/functions/v1/revenuecat-webhook
//   Authorization header: Bearer <REVENUECAT_WEBHOOK_SECRET>
//
// Variáveis de ambiente esperadas (definir via `supabase secrets set`):
//   - SUPABASE_URL              (já existe)
//   - SUPABASE_SERVICE_ROLE_KEY (já existe)
//   - REVENUECAT_WEBHOOK_SECRET (você define ao criar o webhook)
//
// Eventos do RevenueCat: https://www.revenuecat.com/docs/webhooks

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

// Inferir plan_type a partir do product_id ou period_type do RevenueCat
function inferPlanType(productId: string | undefined, periodType: string | undefined): string {
  if (!productId) return 'monthly'
  const id = productId.toLowerCase()
  if (id.includes('lifetime')) return 'lifetime'
  if (id.includes('annual') || id.includes('yearly')) return 'yearly'
  if (id.includes('monthly')) return 'monthly'
  if (periodType === 'TRIAL') return 'trial'
  return 'monthly'
}

// Mapear plataforma do RevenueCat (APPLE/PLAY_STORE/AMAZON/STRIPE) para a nossa
function inferPlatform(store: string | undefined): string {
  if (!store) return 'unknown'
  const s = store.toLowerCase()
  if (s.includes('app_store') || s === 'apple' || s === 'app store') return 'ios'
  if (s.includes('play') || s === 'google') return 'android'
  return s
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Verifica o segredo do webhook
  const expectedSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')
  if (expectedSecret) {
    const auth = req.headers.get('authorization') || ''
    const provided = auth.replace(/^Bearer\s+/i, '').trim()
    if (provided !== expectedSecret) {
      console.warn('[revenuecat-webhook] segredo inválido')
      return json({ error: 'Unauthorized' }, 401)
    }
  }

  try {
    const payload = await req.json()
    const event = payload?.event
    if (!event) return json({ error: 'Payload sem event' }, 400)

    const type: string = event.type
    const userId: string = event.app_user_id
    const productId: string | undefined = event.product_id
    const periodType: string | undefined = event.period_type
    const store: string | undefined = event.store
    const transactionId: string | undefined = event.transaction_id || event.original_transaction_id
    const expirationMs: number | undefined = event.expiration_at_ms

    if (!userId) {
      console.warn('[revenuecat-webhook] sem app_user_id, ignorando')
      return json({ received: true, skipped: 'no app_user_id' })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verifica se o usuário existe (RevenueCat pode enviar app_user_ids anônimos $RCAnonymousID:..)
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (!player) {
      console.warn('[revenuecat-webhook] player não encontrado:', userId)
      return json({ received: true, skipped: 'player not found' })
    }

    const planType = inferPlanType(productId, periodType)
    const isLifetime = planType === 'lifetime'
    const platform = inferPlatform(store)
    const expiresAt = !isLifetime && expirationMs ? new Date(expirationMs).toISOString() : null

    console.log('[revenuecat-webhook]', { type, userId, planType, isLifetime, expiresAt })

    // Eventos que ATIVAM/RENOVAM a assinatura
    const activateTypes = new Set([
      'INITIAL_PURCHASE',
      'RENEWAL',
      'PRODUCT_CHANGE',
      'UNCANCELLATION',
      'NON_RENEWING_PURCHASE',
      'TRANSFER',
    ])

    // Eventos que ENCERRAM
    const deactivateTypes = new Set([
      'EXPIRATION',
      'CANCELLATION',  // (cancelamento ainda pode ter tempo restante; tratamos como ativo até expirar)
      'SUBSCRIPTION_PAUSED',
    ])

    if (activateTypes.has(type)) {
      const upsert = {
        user_id: userId,
        source: 'iap',
        product_id: productId || null,
        plan_type: planType,
        is_lifetime: isLifetime,
        expires_at: expiresAt,
        platform,
        external_id: transactionId || null,
        metadata: { last_event: type, raw: event },
      }
      const { error } = await supabase
        .from('pro_subscriptions')
        .upsert(upsert, { onConflict: 'user_id' })
      if (error) throw error
      return json({ received: true, action: 'activated', plan: planType })
    }

    if (type === 'EXPIRATION') {
      // Apenas atualiza expires_at e força reavaliação no get_pro_status
      const { error } = await supabase
        .from('pro_subscriptions')
        .update({
          expires_at: expiresAt || new Date().toISOString(),
          metadata: { last_event: type, raw: event },
        })
        .eq('user_id', userId)
      if (error) throw error
      return json({ received: true, action: 'expired' })
    }

    if (type === 'CANCELLATION' || type === 'SUBSCRIPTION_PAUSED') {
      // Mantém assinatura até expirar (loja já parou de cobrar). Só registra no metadata.
      const { error } = await supabase
        .from('pro_subscriptions')
        .update({ metadata: { last_event: type, raw: event } })
        .eq('user_id', userId)
      if (error) throw error
      return json({ received: true, action: 'noted' })
    }

    // Outros tipos (BILLING_ISSUE, REFUND, etc): apenas log
    console.log('[revenuecat-webhook] evento sem ação:', type)
    return json({ received: true, action: 'ignored', type })
  } catch (err) {
    console.error('[revenuecat-webhook] erro:', err)
    return json({ error: String(err?.message || err) }, 500)
  }
})
