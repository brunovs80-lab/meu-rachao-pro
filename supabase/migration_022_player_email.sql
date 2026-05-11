-- ============================================================
-- Migration 022: Email do jogador
-- ============================================================
-- Coletado no cadastro pra usar no checkout Mercado Pago (Preapproval
-- exige que o email do payer bata com o email da conta MP).
-- Nullable porque usuários antigos não têm email; eles preenchem
-- depois pelo perfil ou no momento do checkout.
-- ============================================================

ALTER TABLE players ADD COLUMN IF NOT EXISTS email TEXT;

-- Drop versão antiga (4 args) pra evitar overload ambíguo com a nova
DROP FUNCTION IF EXISTS register_user(TEXT, TEXT, TEXT, TEXT);

-- ============================================================
-- RPCs: register_user agora aceita email, login_with_password
-- e check_phone retornam o email.
-- ============================================================

CREATE OR REPLACE FUNCTION register_user(
  p_phone TEXT,
  p_password TEXT,
  p_name TEXT,
  p_position TEXT DEFAULT 'Meia',
  p_email TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_existing RECORD;
  v_count INTEGER;
  v_id TEXT;
  v_is_first BOOLEAN;
  v_player RECORD;
  v_email TEXT;
BEGIN
  IF p_phone IS NULL OR length(p_phone) < 10 THEN
    RETURN json_build_object('success', false, 'error', 'Telefone invalido');
  END IF;
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RETURN json_build_object('success', false, 'error', 'Senha deve ter pelo menos 6 digitos');
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Nome obrigatorio');
  END IF;

  v_email := NULLIF(LOWER(TRIM(COALESCE(p_email, ''))), '');
  IF v_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN json_build_object('success', false, 'error', 'Email invalido');
  END IF;

  SELECT id INTO v_existing FROM players WHERE phone = p_phone LIMIT 1;
  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Telefone ja cadastrado');
  END IF;

  SELECT count(*) INTO v_count FROM players;
  v_is_first := v_count = 0;

  v_id := encode(gen_random_bytes(8), 'hex');

  INSERT INTO players (id, name, phone, position, is_admin, password, email)
  VALUES (v_id, substring(p_name from 1 for 50), p_phone, COALESCE(p_position, 'Meia'),
          v_is_first, crypt(p_password, gen_salt('bf', 10)), v_email)
  RETURNING * INTO v_player;

  RETURN json_build_object(
    'success', true,
    'user', json_build_object(
      'id', v_player.id, 'name', v_player.name, 'phone', v_player.phone,
      'email', v_player.email,
      'position', v_player.position,
      'goals', v_player.goals, 'assists', v_player.assists, 'tackles', v_player.tackles,
      'fouls', v_player.fouls, 'yellows', v_player.yellows, 'reds', v_player.reds,
      'saves', v_player.saves, 'clean_sheets', v_player.clean_sheets,
      'matches', v_player.matches, 'blocked', v_player.blocked,
      'is_admin', v_player.is_admin, 'isAdmin', v_player.is_admin,
      'cleanSheets', v_player.clean_sheets
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION login_with_password(p_phone TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_player RECORD;
  v_valid BOOLEAN := false;
BEGIN
  SELECT * INTO v_player FROM players WHERE phone = p_phone LIMIT 1;
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
      'id', v_player.id, 'name', v_player.name, 'phone', v_player.phone,
      'email', v_player.email,
      'position', v_player.position,
      'goals', v_player.goals, 'assists', v_player.assists, 'tackles', v_player.tackles,
      'fouls', v_player.fouls, 'yellows', v_player.yellows, 'reds', v_player.reds,
      'saves', v_player.saves, 'clean_sheets', v_player.clean_sheets,
      'matches', v_player.matches, 'blocked', v_player.blocked,
      'is_admin', v_player.is_admin, 'isAdmin', v_player.is_admin,
      'cleanSheets', v_player.clean_sheets
    )
  );
END;
$$;

-- ============================================================
-- RPC: update_player_email — usuário existente atualiza o próprio email
-- ============================================================
CREATE OR REPLACE FUNCTION update_player_email(p_user_id TEXT, p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'user_id obrigatorio');
  END IF;
  v_email := NULLIF(LOWER(TRIM(COALESCE(p_email, ''))), '');
  IF v_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN json_build_object('success', false, 'error', 'Email invalido');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Usuario nao encontrado');
  END IF;
  UPDATE players SET email = v_email WHERE id = p_user_id;
  RETURN json_build_object('success', true, 'email', v_email);
END;
$$;

GRANT EXECUTE ON FUNCTION update_player_email(TEXT, TEXT) TO anon, authenticated;
