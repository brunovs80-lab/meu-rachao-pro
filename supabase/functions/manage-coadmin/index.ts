// Edge Function: Gerencia co-admins de um rachão.
// POST action=upsert { rachao_id, player_id, user_id, permissions }
// POST action=remove { rachao_id, player_id, user_id }
// Valida que user_id é o dono do rachão antes de modificar.

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
    const { action, rachao_id, player_id, user_id, permissions } = await req.json()

    if (!action || !rachao_id || !player_id || !user_id) {
      return json({ error: 'Campos obrigatórios: action, rachao_id, player_id, user_id' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verificar que user_id é o dono do rachão
    const { data: rachao } = await supabase
      .from('rachaos')
      .select('created_by, name')
      .eq('id', rachao_id)
      .maybeSingle()

    if (!rachao) return json({ error: 'Rachão não encontrado' }, 404)
    if (rachao.created_by !== user_id) return json({ error: 'Apenas o dono do rachão pode gerenciar co-admins' }, 403)

    if (action === 'upsert') {
      if (typeof permissions !== 'object' || permissions === null) {
        return json({ error: 'permissions deve ser um objeto' }, 400)
      }

      // Detecta se é convite novo (insert) ou só atualização de permissões
      const { data: existing } = await supabase
        .from('rachao_admins')
        .select('player_id')
        .eq('rachao_id', rachao_id)
        .eq('player_id', player_id)
        .maybeSingle()
      const isNewInvite = !existing

      const { error } = await supabase.rpc('upsert_rachao_admin', {
        p_rachao_id: rachao_id,
        p_player_id: player_id,
        p_permissions: permissions,
        p_granted_by: user_id,
      })
      if (error) {
        console.error('upsert error:', error)
        return json({ error: error.message || 'Erro ao salvar co-admin' }, 500)
      }

      // Push pro convidado (fire-and-forget)
      try {
        const title = isNewInvite ? 'Você é co-admin!' : 'Permissões atualizadas'
        const body = isNewInvite
          ? `Foi convidado(a) como co-admin de ${rachao.name || 'um rachão'}.`
          : `Suas permissões em ${rachao.name || 'um rachão'} foram atualizadas.`
        await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            player_ids: [player_id],
            title,
            body,
            type: 'coadmin_updated',
            data: { rachao_id, is_new: String(isNewInvite) },
          }),
        }).catch((e) => console.error('send-push fetch failed:', e))
      } catch (e) {
        console.error('coadmin push skipped:', e)
      }

      return json({ success: true })
    }

    if (action === 'remove') {
      const { error } = await supabase.rpc('remove_rachao_admin', {
        p_rachao_id: rachao_id,
        p_player_id: player_id,
      })
      if (error) {
        console.error('remove error:', error)
        return json({ error: error.message || 'Erro ao remover co-admin' }, 500)
      }
      return json({ success: true })
    }

    return json({ error: 'Ação inválida' }, 400)
  } catch (err) {
    console.error('Unexpected error:', err)
    return json({ error: 'Erro interno' }, 500)
  }
})
