// Edge Function: Salvar configuração de pagamento PIX por rachão
// POST { rachao_id, user_id, mp_access_token, mp_enabled }
// Valida que user_id é o admin do rachão; testa o token no MP antes de salvar.

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
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  try {
    const { rachao_id, user_id, mp_access_token, mp_enabled } = await req.json()
    if (!rachao_id || !user_id) return json({ error: 'rachao_id e user_id obrigatórios' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Validar que user_id é o admin do rachão
    const { data: rachao, error: rachaoErr } = await supabase
      .from('rachaos')
      .select('id, created_by')
      .eq('id', rachao_id)
      .single()

    if (rachaoErr || !rachao) return json({ error: 'Rachão não encontrado' }, 404)
    if (rachao.created_by !== user_id) return json({ error: 'Apenas o admin pode alterar configurações' }, 403)

    // Se token for enviado, validar contra o Mercado Pago
    let mp_user_info: unknown = null
    if (mp_access_token) {
      const mpResp = await fetch('https://api.mercadopago.com/users/me', {
        headers: { 'Authorization': `Bearer ${mp_access_token}` },
      })
      if (!mpResp.ok) {
        const err = await mpResp.json().catch(() => ({}))
        return json({ error: 'Token Mercado Pago inválido', details: err.message || mpResp.statusText }, 400)
      }
      const me = await mpResp.json()
      mp_user_info = {
        id: me.id,
        nickname: me.nickname,
        email: me.email,
        site_id: me.site_id,
      }
    }

    // Upsert config
    const payload: Record<string, unknown> = {
      rachao_id,
      provider: 'mercado_pago',
      mp_enabled: !!mp_enabled,
      updated_by: user_id,
    }
    if (mp_access_token) {
      payload.mp_access_token = mp_access_token
      payload.mp_user_info = mp_user_info
    }

    const { error: upErr } = await supabase
      .from('rachao_payment_config')
      .upsert(payload, { onConflict: 'rachao_id' })

    if (upErr) {
      console.error('Upsert error:', upErr)
      return json({ error: 'Erro ao salvar configuração' }, 500)
    }

    return json({
      success: true,
      mp_enabled: !!mp_enabled,
      mp_user_info,
    })
  } catch (err) {
    console.error('save-payment-config error:', err)
    return json({ error: 'Erro interno' }, 500)
  }
})
