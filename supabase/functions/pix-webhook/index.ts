// Edge Function: Webhook do Mercado Pago para confirmação de pagamento PIX
// Recebe notificações IPN do Mercado Pago.
// Multi-tenant: busca o token do rachão dono da transação pelo external_id.

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
    const body = await req.json()
    console.log('Webhook received:', JSON.stringify(body))

    if (body.type !== 'payment' && body.action !== 'payment.updated' && body.action !== 'payment.created') {
      return json({ received: true, skipped: 'not a payment event' })
    }

    const paymentId = body.data?.id
    if (!paymentId) return json({ error: 'Payment ID não encontrado' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1) Achar a transação pelo external_id para descobrir o rachão dono
    const { data: tx, error: txError } = await supabase
      .from('pix_transactions')
      .select('rachao_id')
      .eq('external_id', String(paymentId))
      .maybeSingle()

    if (txError) {
      console.error('Lookup error:', txError)
      return json({ error: 'Erro ao consultar transação' }, 500)
    }

    if (!tx) {
      // Pagamento não é nosso (ou ainda não persistiu). Ignorar silenciosamente.
      console.log('Payment not found in pix_transactions:', paymentId)
      return json({ received: true, skipped: 'unknown payment' })
    }

    // 2) Buscar o access token do rachão correspondente
    const { data: cfg, error: cfgError } = await supabase
      .from('rachao_payment_config')
      .select('mp_access_token')
      .eq('rachao_id', tx.rachao_id)
      .maybeSingle()

    if (cfgError || !cfg?.mp_access_token) {
      console.error('Config not found for rachao:', tx.rachao_id, cfgError)
      return json({ error: 'Configuração de pagamento não encontrada' }, 500)
    }

    // 3) Consultar detalhes do pagamento com o token correto
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${cfg.mp_access_token}` },
    })

    const mpData = await mpResponse.json()
    console.log('MP Payment status:', mpData.status, 'for payment:', paymentId)

    if (mpData.status !== 'approved') {
      return json({ received: true, status: mpData.status })
    }

    // 4) Confirmar pagamento via RPC
    const { data, error } = await supabase.rpc('confirm_pix_payment', {
      p_external_id: String(paymentId),
      p_webhook_data: mpData,
    })

    if (error) {
      console.error('Error confirming payment:', error)
      return json({ error: 'Erro ao confirmar pagamento' }, 500)
    }

    console.log('Payment confirmed:', data)
    return json({ success: true, data })
  } catch (err) {
    console.error('Webhook error:', err)
    return json({ error: 'Erro interno' }, 500)
  }
})
