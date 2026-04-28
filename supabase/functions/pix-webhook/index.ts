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

    // 5) Push notification pro admin do rachão (fire-and-forget)
    try {
      if (data?.success && data?.transaction_id) {
        await firePaidPush(supabase, supabaseUrl, supabaseKey, String(paymentId))
      }
    } catch (e) {
      console.error('push notification skipped:', e)
    }

    return json({ success: true, data })
  } catch (err) {
    console.error('Webhook error:', err)
    return json({ error: 'Erro interno' }, 500)
  }
})

async function firePaidPush(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  externalId: string,
) {
  // Re-lê tx p/ pegar info atualizada (status=paid)
  const { data: tx } = await supabase
    .from('pix_transactions')
    .select('rachao_id, player_id, purpose, amount')
    .eq('external_id', externalId)
    .maybeSingle()
  if (!tx) return

  const { data: rachao } = await supabase
    .from('rachaos')
    .select('created_by, name')
    .eq('id', tx.rachao_id)
    .maybeSingle()
  if (!rachao?.created_by) return

  const { data: payer } = await supabase
    .from('players')
    .select('name')
    .eq('id', tx.player_id)
    .maybeSingle()

  const valor = `R$ ${Number(tx.amount).toFixed(2).replace('.', ',')}`
  const nome  = payer?.name || 'Jogador'
  const isGuest = tx.purpose === 'guest_fee'

  const title = isGuest ? 'Avulso confirmado' : 'Pagamento PIX confirmado'
  const body = isGuest
    ? `${nome} pagou ${valor} e entrou na lista de ${rachao.name || 'seu rachão'}`
    : `${nome} pagou ${valor} (mensalidade)`

  await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      player_ids: [rachao.created_by],
      title,
      body,
      type: isGuest ? 'guest_paid' : 'mensalidade_paid',
      data: { rachao_id: tx.rachao_id, player_id: tx.player_id },
    }),
  }).catch((e) => console.error('send-push fetch failed:', e))
}
