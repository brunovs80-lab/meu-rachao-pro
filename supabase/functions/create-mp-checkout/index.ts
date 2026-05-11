// Edge Function: Criar checkout Mercado Pago para assinatura Pro (PWA/web)
//
// Todos os planos (mensal, anual, vitalício) usam Checkout Pro one-shot.
// Mensal/Anual NÃO são assinaturas recorrentes — são compras avulsas que
// liberam Pro por 30/365 dias. Renovação é manual (usuário paga de novo).
// Vantagem: aceita PIX + cartão, não exige permissão de "Assinaturas" na conta MP.
//
// POST { plan: 'monthly'|'yearly'|'lifetime', user_id, payer_email }
// Resposta: { ok: true, init_point: string, external_id }
//
// Variáveis de ambiente:
//   - MP_APP_ACCESS_TOKEN
//   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//   - APP_BASE_URL (opcional, default: https://meurachaopro.com.br/app)

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
  monthly:  { amount: 14.90,  label: 'Pro - 30 dias'    },
  yearly:   { amount: 99.90,  label: 'Pro - 1 ano'      },
  lifetime: { amount: 199.90, label: 'Pro - Vitalício'  },
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

    const { data: player } = await supabase
      .from('players').select('id, name').eq('id', userId).maybeSingle()
    if (!player) return json({ error: 'Usuário não encontrado' }, 404)

    const baseUrl = Deno.env.get('APP_BASE_URL') || 'https://meurachaopro.com.br/app'
    const successUrl = `${baseUrl}/?paywall=success`
    const failureUrl = `${baseUrl}/?paywall=fail`
    const pendingUrl = `${baseUrl}/?paywall=pending`
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-subscription-webhook`

    const cfg = PLAN_CONFIG[plan]
    const externalRef = `pro:${userId}:${plan}`

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
  } catch (err) {
    console.error('[create-mp-checkout] erro:', err)
    return json({ error: String((err as Error)?.message || err) }, 500)
  }
})
