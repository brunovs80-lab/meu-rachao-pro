// Edge Function: Cancelar assinatura Pro recorrente no Mercado Pago.
//
// POST { user_id }
// - Busca o mp_preapproval_id em pro_subscriptions
// - Chama PUT /preapproval/{id} com { status: 'cancelled' }
// - Mantém o registro local: o webhook processa o evento e o usuário continua
//   Pro até o expires_at atual (já pagou esse ciclo).
//
// Lifetime e cupom não podem ser cancelados aqui (sem recorrência).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS restritivo (allowlist) em vez de '*'.
const ALLOWED_ORIGINS = new Set([
  'https://meurachaopro.com.br',
  'https://www.meurachaopro.com.br',
  'capacitor://localhost',
  'http://localhost',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])
function cors(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://meurachaopro.com.br'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

Deno.serve(async (req) => {
  const corsHeaders = cors(req)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405)

  try {
    const { user_id: userId } = await req.json()
    if (!userId) return json({ error: 'user_id obrigatório' }, 400)

    const mpToken = Deno.env.get('MP_APP_ACCESS_TOKEN')
    if (!mpToken) return json({ error: 'MP_APP_ACCESS_TOKEN não configurado' }, 500)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: sub } = await supabase
      .from('pro_subscriptions')
      .select('source, plan_type, mp_preapproval_id, is_lifetime, expires_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (!sub) return json({ error: 'Sem assinatura ativa' }, 404)
    if (sub.source !== 'mp_web') return json({ error: 'Assinatura não é via web. Cancele na loja correspondente.' }, 400)
    if (sub.is_lifetime) return json({ error: 'Acesso vitalício não tem recorrência para cancelar.' }, 400)
    if (!sub.mp_preapproval_id) return json({ error: 'mp_preapproval_id ausente, contate o suporte' }, 500)

    const r = await fetch(`https://api.mercadopago.com/preapproval/${sub.mp_preapproval_id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${mpToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    const data = await r.json()
    if (!r.ok) {
      console.error('[cancel-mp-subscription] erro MP:', data)
      return json({ error: 'Falha ao cancelar no Mercado Pago', details: data.message }, 500)
    }

    return json({
      ok: true,
      cancelled_at: new Date().toISOString(),
      pro_until: sub.expires_at,
    })
  } catch (err) {
    console.error('[cancel-mp-subscription] erro:', err)
    return json({ error: String((err as Error)?.message || err) }, 500)
  }
})
