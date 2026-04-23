// Edge Function: Criar cobrança PIX via Mercado Pago
// POST { billing_id, player_id, rachao_id, amount, description, payer_email }
// Lê o access token do Mercado Pago da tabela rachao_payment_config (por rachão).

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { billing_id, player_id, rachao_id, amount, description, payer_email } = await req.json()

    if (!billing_id || !player_id || !rachao_id || !amount) {
      return json({ error: 'Campos obrigatórios: billing_id, player_id, rachao_id, amount' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Buscar token e flag do rachão
    const { data: cfg } = await supabase
      .from('rachao_payment_config')
      .select('mp_access_token, mp_enabled')
      .eq('rachao_id', rachao_id)
      .maybeSingle()

    if (!cfg || !cfg.mp_enabled || !cfg.mp_access_token) {
      return json({ error: 'PIX automático não configurado para este rachão. Admin precisa configurar o Mercado Pago nas configurações.' }, 400)
    }

    const mpAccessToken = cfg.mp_access_token

    const expirationDate = new Date(Date.now() + 30 * 60 * 1000)
    const idempotencyKey = `${billing_id}-${player_id}-${Date.now()}`

    const notificationUrl = `${supabaseUrl}/functions/v1/pix-webhook`

    const mpPayload = {
      transaction_amount: Number(amount),
      description: description || 'Mensalidade Rachão',
      payment_method_id: 'pix',
      payer: {
        email: payer_email || 'pagador@email.com',
      },
      date_of_expiration: expirationDate.toISOString(),
      notification_url: notificationUrl,
      external_reference: `${rachao_id}:${billing_id}:${player_id}`,
    }

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mpAccessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(mpPayload),
    })

    const mpData = await mpResponse.json()

    if (!mpResponse.ok) {
      console.error('Mercado Pago error:', mpData)
      return json({ error: 'Erro ao criar cobrança PIX', details: mpData.message }, 500)
    }

    const pixData = mpData.point_of_interaction?.transaction_data
    const qrCode = pixData?.qr_code || ''
    const qrCodeBase64 = pixData?.qr_code_base64 || ''
    const externalId = String(mpData.id)

    const { data: tx, error: txError } = await supabase.from('pix_transactions').insert({
      billing_id,
      player_id,
      rachao_id,
      amount: Number(amount),
      status: 'pending',
      external_id: externalId,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      description: description || 'Mensalidade Rachão',
      expires_at: expirationDate.toISOString(),
    }).select().single()

    if (txError) {
      console.error('Supabase insert error:', txError)
      return json({ error: 'Erro ao salvar transação' }, 500)
    }

    await supabase.from('billing_payments').update({
      status: 'awaiting_confirmation',
    }).eq('billing_id', billing_id).eq('player_id', player_id)

    return json({
      success: true,
      transaction_id: tx.id,
      external_id: externalId,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      amount: Number(amount),
      expires_at: expirationDate.toISOString(),
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return json({ error: 'Erro interno' }, 500)
  }
})
