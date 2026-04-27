// Edge Function: Criar cobrança PIX via Mercado Pago
//
// Mensalidade:
//   POST { billing_id, player_id, rachao_id, amount, description, payer_email }
//
// Avulso (guest_fee):
//   POST { purpose: 'guest_fee', session_id, player_id, rachao_id, payer_email? }
//   - O valor vem de sessions.guest_fee (não confiamos em valor enviado pelo client)
//   - Reserva uma vaga "pending" antes de gerar o PIX (reserve_guest_slot RPC)
//
// O access token do Mercado Pago é o do dono do rachão (rachao_payment_config).

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

const GUEST_RESERVATION_ERRORS: Record<string, string> = {
  SESSAO_INVALIDA: 'Sessão inválida ou removida.',
  SESSAO_FECHADA: 'Esta sessão já foi encerrada.',
  AVULSOS_DESABILITADOS: 'Admin desabilitou avulsos para esta sessão.',
  VAGAS_ESGOTADAS: 'As vagas avulsas se esgotaram.',
  JA_PAGO: 'Você já está confirmado nesta sessão.',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const purpose: 'mensalidade' | 'guest_fee' = body.purpose === 'guest_fee' ? 'guest_fee' : 'mensalidade'

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // ========== Validação por purpose ==========
    let billing_id: string | null = null
    let session_id: string | null = null
    const player_id: string = body.player_id
    const rachao_id: string = body.rachao_id
    const payer_email: string = body.payer_email || 'pagador@email.com'
    let amount: number
    let description: string

    if (purpose === 'mensalidade') {
      billing_id = body.billing_id
      amount = Number(body.amount)
      description = body.description || 'Mensalidade Rachão'
      if (!billing_id || !player_id || !rachao_id || !amount) {
        return json({ error: 'Campos obrigatórios: billing_id, player_id, rachao_id, amount' }, 400)
      }
    } else {
      session_id = body.session_id
      if (!session_id || !player_id || !rachao_id) {
        return json({ error: 'Campos obrigatórios: session_id, player_id, rachao_id' }, 400)
      }
      // Reserva a vaga e descobre o valor real (server-side)
      const { data: reserveData, error: reserveErr } = await supabase
        .rpc('reserve_guest_slot', { p_session_id: session_id, p_player_id: player_id })
      if (reserveErr) {
        console.error('reserve_guest_slot error:', reserveErr)
        return json({ error: 'Erro ao reservar vaga' }, 500)
      }
      if (!reserveData?.ok) {
        const code = reserveData?.error || 'RESERVA_FALHOU'
        return json({ error: GUEST_RESERVATION_ERRORS[code] || code, code }, 409)
      }
      amount = Number(reserveData.fee)
      description = body.description || 'Vaga avulsa Rachão'
    }

    // ========== Token do dono do rachão ==========
    const { data: cfg } = await supabase
      .from('rachao_payment_config')
      .select('mp_access_token, mp_enabled')
      .eq('rachao_id', rachao_id)
      .maybeSingle()

    if (!cfg || !cfg.mp_enabled || !cfg.mp_access_token) {
      // Se a reserva foi feita, libera-a (rollback simples)
      if (purpose === 'guest_fee' && session_id) {
        await supabase.from('session_guests').delete()
          .eq('session_id', session_id).eq('player_id', player_id).eq('status', 'pending')
      }
      return json({ error: 'PIX automático não configurado para este rachão. Admin precisa configurar o Mercado Pago nas configurações.' }, 400)
    }

    const mpAccessToken = cfg.mp_access_token

    const expirationDate = new Date(Date.now() + 30 * 60 * 1000)
    const refKey = purpose === 'mensalidade' ? billing_id : session_id
    const idempotencyKey = `${refKey}-${player_id}-${Date.now()}`

    const notificationUrl = `${supabaseUrl}/functions/v1/pix-webhook`

    const externalRef = purpose === 'mensalidade'
      ? `${rachao_id}:${billing_id}:${player_id}`
      : `${rachao_id}:guest:${session_id}:${player_id}`

    const mpPayload = {
      transaction_amount: Number(amount),
      description,
      payment_method_id: 'pix',
      payer: { email: payer_email },
      date_of_expiration: expirationDate.toISOString(),
      notification_url: notificationUrl,
      external_reference: externalRef,
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
      // rollback da reserva, se houver
      if (purpose === 'guest_fee' && session_id) {
        await supabase.from('session_guests').delete()
          .eq('session_id', session_id).eq('player_id', player_id).eq('status', 'pending')
      }
      return json({ error: 'Erro ao criar cobrança PIX', details: mpData.message }, 500)
    }

    const pixData = mpData.point_of_interaction?.transaction_data
    const qrCode = pixData?.qr_code || ''
    const qrCodeBase64 = pixData?.qr_code_base64 || ''
    const externalId = String(mpData.id)

    const { data: tx, error: txError } = await supabase.from('pix_transactions').insert({
      billing_id,                // null para guest_fee
      session_id,                // null para mensalidade
      purpose,
      player_id,
      rachao_id,
      amount: Number(amount),
      status: 'pending',
      external_id: externalId,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      description,
      expires_at: expirationDate.toISOString(),
    }).select().single()

    if (txError) {
      console.error('Supabase insert error:', txError)
      if (purpose === 'guest_fee' && session_id) {
        await supabase.from('session_guests').delete()
          .eq('session_id', session_id).eq('player_id', player_id).eq('status', 'pending')
      }
      return json({ error: 'Erro ao salvar transação' }, 500)
    }

    // Mensalidade: marca billing_payments como awaiting_confirmation
    if (purpose === 'mensalidade' && billing_id) {
      await supabase.from('billing_payments').update({
        status: 'awaiting_confirmation',
      }).eq('billing_id', billing_id).eq('player_id', player_id)
    }

    return json({
      success: true,
      transaction_id: tx.id,
      external_id: externalId,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      amount: Number(amount),
      expires_at: expirationDate.toISOString(),
      purpose,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return json({ error: 'Erro interno' }, 500)
  }
})
