// Edge Function: Cancela uma sessão e estorna avulsos pagos via API do Mercado Pago.
//
// POST { session_id, caller_id }
//
// Fluxo:
//   1. Chama cancel_session(p_auto_refund=true) — sessão vira 'cancelled',
//      pendentes viram 'cancelled', mas pagos PERMANECEM 'paid' até o estorno.
//   2. Lê paid guests via get_session_paid_guests_with_tx (precisa do
//      external_id do MP).
//   3. Lê o token MP do dono do rachão (rachao_payment_config).
//   4. Pra cada paid guest, chama POST /v1/payments/{external_id}/refunds
//      e registra resultado via apply_auto_refund_result.
//
// Retorno: { ok, cancelled, refund_count, refund_success, refund_failed,
//            pending_cancelled, refund_total, errors? }

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

interface PaidGuestRow {
  player_id: string
  fee_paid: number
  pix_transaction_id: string | null
  pix_external_id: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const session_id: string | undefined = body.session_id
    const caller_id: string | undefined = body.caller_id

    if (!session_id || !caller_id) {
      return json({ ok: false, error: 'Campos obrigatórios: session_id, caller_id' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1) Descobre o rachao_id da sessão pra buscar o token MP do dono
    const { data: sessRow, error: sessErr } = await supabase
      .from('sessions')
      .select('rachao_id, date')
      .eq('id', session_id)
      .maybeSingle()

    if (sessErr) {
      console.error('session lookup error:', sessErr)
      return json({ ok: false, error: 'Erro consultando sessão' }, 500)
    }
    if (!sessRow) {
      return json({ ok: false, error: 'SESSAO_INVALIDA' }, 404)
    }

    // 2) Cancela a sessão (autoRefund=true preserva paid p/ a gente estornar)
    const { data: cancelData, error: cancelErr } = await supabase.rpc('cancel_session', {
      p_session_id: session_id,
      p_caller_id: caller_id,
      p_auto_refund: true,
    })

    if (cancelErr) {
      console.error('cancel_session error:', cancelErr)
      return json({ ok: false, error: 'Erro ao cancelar sessão' }, 500)
    }
    if (!cancelData?.ok) {
      return json({ ok: false, error: cancelData?.error || 'CANCEL_FAILED' }, 409)
    }

    const refundCount = Number(cancelData.refund_count || 0)
    const pendingCancelled = Number(cancelData.pending_cancelled || 0)
    const refundTotal = Number(cancelData.refund_total || 0)

    // Sem pagos a estornar — encerra com sucesso direto
    if (refundCount === 0) {
      return json({
        ok: true,
        cancelled: true,
        refund_count: 0,
        refund_success: 0,
        refund_failed: 0,
        pending_cancelled: pendingCancelled,
        refund_total: 0,
      })
    }

    // 3) Busca token MP do dono do rachão
    const { data: cfg, error: cfgErr } = await supabase
      .from('rachao_payment_config')
      .select('mp_access_token, mp_enabled')
      .eq('rachao_id', sessRow.rachao_id)
      .maybeSingle()

    if (cfgErr || !cfg?.mp_access_token) {
      console.error('payment config missing for rachao', sessRow.rachao_id, cfgErr)
      // Sessão já foi cancelada. Os pagos seguem 'paid' até admin agir.
      return json({
        ok: false,
        cancelled: true,
        refund_count: refundCount,
        refund_success: 0,
        refund_failed: 0,
        pending_cancelled: pendingCancelled,
        refund_total: refundTotal,
        error: 'PAYMENT_CONFIG_MISSING',
        message: 'Sessão cancelada, mas o token do Mercado Pago não está configurado. Estorne manualmente no painel do MP.',
      }, 502)
    }

    // 4) Pega lista de pagos com external_id
    const { data: paidGuests, error: paidErr } = await supabase
      .rpc('get_session_paid_guests_with_tx', { p_session_id: session_id })

    if (paidErr) {
      console.error('get_session_paid_guests_with_tx error:', paidErr)
      return json({ ok: false, cancelled: true, error: 'Erro buscando avulsos pagos' }, 500)
    }

    // 5) Itera e tenta refund na MP
    let success = 0
    let failed = 0
    const errors: Array<{ player_id: string; error: string }> = []

    for (const g of (paidGuests || []) as PaidGuestRow[]) {
      if (!g.pix_external_id) {
        await supabase.rpc('apply_auto_refund_result', {
          p_session_id: session_id,
          p_player_id: g.player_id,
          p_success: false,
          p_mp_refund_id: null,
          p_error_msg: 'Pagamento sem external_id do Mercado Pago',
        })
        failed++
        errors.push({ player_id: g.player_id, error: 'sem external_id' })
        continue
      }

      try {
        const idempotencyKey = `refund-${session_id}-${g.player_id}`
        const refundResp = await fetch(
          `https://api.mercadopago.com/v1/payments/${g.pix_external_id}/refunds`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${cfg.mp_access_token}`,
              'Content-Type': 'application/json',
              'X-Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify({}), // refund total
          },
        )

        const refundJson = await refundResp.json().catch(() => ({}))

        if (!refundResp.ok) {
          const errMsg = refundJson?.message || refundJson?.error || `HTTP ${refundResp.status}`
          console.error('MP refund failed for', g.player_id, errMsg, refundJson)
          await supabase.rpc('apply_auto_refund_result', {
            p_session_id: session_id,
            p_player_id: g.player_id,
            p_success: false,
            p_mp_refund_id: null,
            p_error_msg: String(errMsg),
          })
          failed++
          errors.push({ player_id: g.player_id, error: String(errMsg) })
          continue
        }

        const mpRefundId = refundJson?.id ? String(refundJson.id) : null
        await supabase.rpc('apply_auto_refund_result', {
          p_session_id: session_id,
          p_player_id: g.player_id,
          p_success: true,
          p_mp_refund_id: mpRefundId,
          p_error_msg: null,
        })
        success++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('refund call exception for', g.player_id, msg)
        await supabase.rpc('apply_auto_refund_result', {
          p_session_id: session_id,
          p_player_id: g.player_id,
          p_success: false,
          p_mp_refund_id: null,
          p_error_msg: msg,
        })
        failed++
        errors.push({ player_id: g.player_id, error: msg })
      }
    }

    // 6) Notificação resumida pro admin
    if (failed > 0) {
      await supabase.from('notifications').insert({
        type: 'orange',
        icon: 'fa-triangle-exclamation',
        title: 'Estornos com falha',
        text: `Sessão cancelada. ${success} estorno(s) ok, ${failed} com falha — verifique no painel.`,
      })
    } else if (success > 0) {
      await supabase.from('notifications').insert({
        type: 'green',
        icon: 'fa-check',
        title: 'Estornos automáticos',
        text: `Sessão cancelada e ${success} avulso(s) estornado(s) com sucesso.`,
      })
    }

    // 7) Push pro admin se houve falha (fire-and-forget)
    try {
      if (failed > 0) {
        const { data: rachao } = await supabase
          .from('rachaos')
          .select('created_by, name')
          .eq('id', sessRow.rachao_id)
          .maybeSingle()
        if (rachao?.created_by) {
          await fetch(`${supabaseUrl}/functions/v1/send-push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              player_ids: [rachao.created_by],
              title: 'Estornos com falha',
              body: `Sessão de ${rachao.name || 'rachão'} cancelada — ${failed} estorno(s) falharam. Verifique no app.`,
              type: 'refund_failed',
              data: { rachao_id: sessRow.rachao_id, session_id },
            }),
          }).catch((e) => console.error('send-push fetch failed:', e))
        }
      }
    } catch (e) {
      console.error('push notification skipped:', e)
    }

    return json({
      ok: failed === 0,
      cancelled: true,
      refund_count: refundCount,
      refund_success: success,
      refund_failed: failed,
      pending_cancelled: pendingCancelled,
      refund_total: refundTotal,
      errors: errors.length ? errors : undefined,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return json({ ok: false, error: 'Erro interno' }, 500)
  }
})
