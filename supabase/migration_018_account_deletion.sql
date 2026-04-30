-- ============================================================
-- MEU RACHÃO PRO - Migration 018: Exclusão de conta in-app (Google Play policy)
--
-- 1. Coluna `deleted_at` em players (soft-delete)
-- 2. Atualiza `check_phone` e `login_with_password` para ignorar contas deletadas
-- 3. RPC `delete_user_account(user_id, password)`:
--    - Verifica senha (segurança contra celular destravado)
--    - Anonimiza a linha em players (vira "Jogador removido")
--    - Apaga dados sensíveis: device_tokens, notifications, rachao_admins,
--      rachao_participants, session_guests pendentes
--    - Cancela pro_subscription (se houver) — Google Play subscription NÃO é
--      cancelada automaticamente; usuário deve cancelar pelo Play Store
--    - Estatísticas (pending_stats, validated_stats, fantasy_scores) preservadas
--      pra integridade de ranking dos outros jogadores
-- ============================================================

-- 1. Coluna deleted_at
ALTER TABLE players ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_players_deleted_at ON players(deleted_at) WHERE deleted_at IS NOT NULL;

-- 2. check_phone — ignora deletados
CREATE OR REPLACE FUNCTION check_phone(p_phone TEXT)
RETURNS JSON AS $$
DECLARE
  v_player RECORD;
BEGIN
  SELECT id, name, position, is_admin INTO v_player
  FROM players
  WHERE phone = p_phone AND deleted_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('exists', true, 'id', v_player.id, 'name', v_player.name);
  ELSE
    RETURN json_build_object('exists', false);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. login_with_password — ignora deletados
CREATE OR REPLACE FUNCTION login_with_password(p_phone TEXT, p_password TEXT)
RETURNS JSON AS $$
DECLARE
  v_player RECORD;
  v_valid BOOLEAN := false;
BEGIN
  SELECT * INTO v_player FROM players
   WHERE phone = p_phone AND deleted_at IS NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Usuario nao encontrado');
  END IF;

  IF v_player.password IS NOT NULL AND v_player.password LIKE '$2%' THEN
    v_valid := v_player.password = crypt(p_password, v_player.password);
  ELSE
    v_valid := v_player.password = p_password;
    IF v_valid THEN
      UPDATE players SET password = crypt(p_password, gen_salt('bf', 10)) WHERE id = v_player.id;
    END IF;
  END IF;

  IF NOT v_valid THEN
    RETURN json_build_object('success', false, 'error', 'Senha incorreta');
  END IF;

  RETURN json_build_object(
    'success', true,
    'user', json_build_object(
      'id', v_player.id,
      'name', v_player.name,
      'phone', v_player.phone,
      'position', v_player.position,
      'goals', v_player.goals,
      'assists', v_player.assists,
      'tackles', v_player.tackles,
      'fouls', v_player.fouls,
      'yellows', v_player.yellows,
      'reds', v_player.reds,
      'saves', v_player.saves,
      'clean_sheets', v_player.clean_sheets,
      'matches', v_player.matches,
      'blocked', v_player.blocked,
      'is_admin', v_player.is_admin,
      'isAdmin', v_player.is_admin,
      'cleanSheets', v_player.clean_sheets
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. delete_user_account — soft delete + cleanup de dados sensíveis
CREATE OR REPLACE FUNCTION delete_user_account(
  p_user_id TEXT,
  p_password TEXT
) RETURNS JSON AS $$
DECLARE
  v_player RECORD;
  v_valid BOOLEAN := false;
BEGIN
  IF p_user_id IS NULL OR p_password IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Parametros invalidos');
  END IF;

  SELECT * INTO v_player FROM players WHERE id = p_user_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Usuario nao encontrado');
  END IF;

  IF v_player.deleted_at IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Conta ja foi excluida');
  END IF;

  IF v_player.password IS NOT NULL AND v_player.password LIKE '$2%' THEN
    v_valid := v_player.password = crypt(p_password, v_player.password);
  ELSE
    v_valid := v_player.password = p_password;
  END IF;

  IF NOT v_valid THEN
    RETURN json_build_object('success', false, 'error', 'Senha incorreta');
  END IF;

  -- Anonimiza a linha em players
  UPDATE players SET
    name = 'Jogador removido',
    phone = NULL,
    password = NULL,
    blocked = TRUE,
    is_admin = FALSE,
    deleted_at = NOW()
  WHERE id = p_user_id;

  -- Limpa dados sensíveis / sessões ativas
  DELETE FROM device_tokens WHERE player_id = p_user_id;
  DELETE FROM notifications WHERE player_id = p_user_id;
  DELETE FROM rachao_admins WHERE player_id = p_user_id;
  DELETE FROM rachao_participants WHERE player_id = p_user_id;
  DELETE FROM session_guests WHERE player_id = p_user_id AND status = 'pending';

  -- Apaga assinatura Pro local (Google Play NÃO cancela automaticamente —
  -- usuário precisa cancelar manualmente em play.google.com/store/account/subscriptions)
  DELETE FROM pro_subscriptions WHERE user_id = p_user_id;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION delete_user_account(TEXT, TEXT) TO anon, authenticated;
