// Edge Function: Webhook do Mercado Pago para confirmação de pagamento PIX
// Recebe notificações IPN do Mercado Pago

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('Webhook received:', JSON.stringify(body))

    // Mercado Pago envia notificação tipo "payment" com action "payment.updated"
    if (body.type !== 'payment' && body.action !== 'payment.updated') {
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const paymentId = body.data?.id
    if (!paymentId) {
      return new Response(JSON.stringify({ error: 'Payment ID não encontrado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Consultar detalhes do pagamento no Mercado Pago
    const mpAccessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')
    if (!mpAccessToken) {
      return new Response(JSON.stringify({ error: 'Token não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${mpAccessToken}` },
    })

    const mpData = await mpResponse.json()
    console.log('MP Payment status:', mpData.status)

    // Só processar pagamentos aprovados
    if (mpData.status !== 'approved') {
      return new Response(JSON.stringify({ received: true, status: mpData.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Confirmar pagamento via RPC no Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase.rpc('confirm_pix_payment', {
      p_external_id: String(paymentId),
      p_webhook_data: mpData,
    })

    if (error) {
      console.error('Error confirming payment:', error)
      return new Response(JSON.stringify({ error: 'Erro ao confirmar pagamento' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    console.log('Payment confirmed:', data)

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
