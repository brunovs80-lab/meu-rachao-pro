// Edge Function: Criar checkout Mercado Pago para assinatura Pro (PWA/web)
//
// Mensal/Anual -> Preapproval (assinatura recorrente em cartão)
// Vitalício    -> Preference (Checkout Pro one-shot, aceita cartão e PIX)
//
// POST { plan: 'monthly'|'yearly'|'lifetime', user_id, payer_email }
// Resposta: { ok: true, init_point: string, kind: 'preapproval'|'preference', external_id }
//
// Variáveis de ambiente:
//   - MP_APP_ACCESS_TOKEN  (access token MP da conta do app — secret)
//   - SUPABASE_URL         (já existe)
//   - SUPABASE_SERVICE_ROLE_KEY (já existe)
//   - APP_BASE_URL         (opcional, default: https://meurachaopro.com.br/app)

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

const PLAN_CONFIG = {
  monthly:  { amount: 14.90,  frequency: 1,  frequency_type: 'months', label: 'Pro Mensal'    },
  yearly:   { amount: 99.90,  frequency: 12, frequency_type: 'months', label: 'Pro Anual'     },
  lifetime: { amount: 199.90, label: 'Pro Vitalício' },
} as const

type Plan = keyof typeof PLAN_CONFIG

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json()
    const plan: Plan = body.plan
    const userId: string = body.user_id
    const payerEmail: string = body.payer_email || ''

    if (!plan || !PLAN_CONFIG[plan]) return json({ error: 'plan inválido' }, 400)
    if (!userId)                     return json({ error: 'user_id obrigatório' }, 400)
    if (!payerEmail)                 return json({ error: 'payer_email obrigatório' }, 400)

    const mpToken = Deno.env.get('MP_APP_ACCESS_TOKEN')
    if (!mpToken) return json({ error: 'MP_APP_ACCESS_TOKEN não configurado' }, 500)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Garante que o player existe (evita criar assinatura órfã)
    const { data: player } = await supabase
      .from('players').select('id, name').eq('id', userId).maybeSingle()
    if (!player) return json({ error: 'Usuário não encontrado' }, 404)

    const baseUrl = Deno.env.get('APP_BASE_URL') || 'https://meurachaopro.com.br/app'
    const successUrl = `${baseUrl}/?paywall=success`
    const failureUrl = `${baseUrl}/?paywall=fail`
    const pendingUrl = `${baseUrl}/?paywall=pending`
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-subscription-webhook`

    // external_reference: usado pelo webhook pra correlacionar usuário/plano
    const externalRef = `pro:${userId}:${plan}`

    if (plan === 'lifetime') {
      // ===== PAGAMENTO ÚNICO via Checkout Pro =====
      const cfg = PLAN_CONFIG.lifetime
      const prefPayload = {
        items: [{
          title: cfg.label,
          quantity: 1,
          unit_price: cfg.amount,
          currency_id: 'BRL',
        }],
        payer: { email: payerEmail },
        back_urls: { success: successUrl, failure: failureUrl, pending: pendingUrl },
        auto_return: 'approved',
        external_reference: externalRef,
        notification_url: webhookUrl,
        metadata: { user_id: userId, plan },
        statement_descriptor: 'Meu Rachao Pro',
      }

      const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mpToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(prefPayload),
      })
      const data = await resp.json()
      if (!resp.ok) {
        console.error('[create-mp-checkout] preference error:', data)
        return json({ error: 'Falha ao criar checkout', details: data.message }, 500)
      }
      return json({
        ok: true,
        kind: 'preference',
        init_point: data.init_point,
        external_id: String(data.id),
      })
    }

    // ===== ASSINATURA RECORRENTE via Preapproval =====
    const cfg = PLAN_CONFIG[plan]
    const preapprovalPayload = {
      reason: cfg.label,
      external_reference: externalRef,
      payer_email: payerEmail,
      back_url: successUrl,
      status: 'pending', // usuário escolhe cartão e MP ativa após aprovar
      auto_recurring: {
        frequency: cfg.frequency,
        frequency_type: cfg.frequency_type,
        transaction_amount: cfg.amount,
        currency_id: 'BRL',
      },
      notification_url: webhookUrl,
    }

    const resp = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mpToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preapprovalPayload),
    })
    const data = await resp.json()
    if (!resp.ok) {
      console.error('[create-mp-checkout] preapproval error:', data)
      return json({ error: 'Falha ao criar assinatura', details: data.message }, 500)
    }

    return json({
      ok: true,
      kind: 'preapproval',
      init_point: data.init_point,
      external_id: String(data.id),
    })
  } catch (err) {
    console.error('[create-mp-checkout] erro:', err)
    return json({ error: String((err as Error)?.message || err) }, 500)
  }
})
