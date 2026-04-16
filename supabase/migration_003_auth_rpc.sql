-- ============================================================
-- Migration 003: Funções RPC para autenticação client-side
-- Permite login/registro direto do app Capacitor sem servidor
-- Execute no SQL Editor do Supabase Dashboard
-- ============================================================

-- Habilitar extensão pgcrypto para bcrypt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Função: verificar se telefone existe
CREATE OR REPLACE FUNCTION check_phone(p_phone TEXT)
RETURNS JSON AS $$
DECLARE
  v_player RECORD;
BEGIN
  SELECT id, name, position, is_admin INTO v_player
  FROM players
  WHERE phone = p_phone
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('exists', true, 'id', v_player.id, 'name', v_player.name);
  ELSE
    RETURN json_build_object('exists', false);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função: login com senha
CREATE OR REPLACE FUNCTION login_with_password(p_phone TEXT, p_password TEXT)
RETURNS JSON AS $$
DECLARE
  v_player RECORD;
  v_valid BOOLEAN := false;
BEGIN
  SELECT * INTO v_player FROM players WHERE phone = p_phone LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Usuario nao encontrado');
  END IF;

  -- Verificar senha: suporta bcrypt hash e plain text legado
  IF v_player.password IS NOT NULL AND v_player.password LIKE '$2%' THEN
    v_valid := v_player.password = crypt(p_password, v_player.password);
  ELSE
    v_valid := v_player.password = p_password;
    -- Migrar senha legada para bcrypt
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

-- Função: registrar novo usuário
CREATE OR REPLACE FUNCTION register_user(p_phone TEXT, p_password TEXT, p_name TEXT, p_position TEXT DEFAULT 'Meia')
RETURNS JSON AS $$
DECLARE
  v_existing RECORD;
  v_count INTEGER;
  v_id TEXT;
  v_is_first BOOLEAN;
  v_player RECORD;
BEGIN
  -- Validações
  IF p_phone IS NULL OR length(p_phone) < 10 THEN
    RETURN json_build_object('success', false, 'error', 'Telefone invalido');
  END IF;
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RETURN json_build_object('success', false, 'error', 'Senha deve ter pelo menos 6 digitos');
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Nome obrigatorio');
  END IF;

  -- Verificar se já existe
  SELECT id INTO v_existing FROM players WHERE phone = p_phone LIMIT 1;
  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Telefone ja cadastrado');
  END IF;

  -- Verificar se é o primeiro usuário (admin)
  SELECT count(*) INTO v_count FROM players;
  v_is_first := v_count = 0;

  -- Gerar ID
  v_id := encode(gen_random_bytes(8), 'hex');

  -- Inserir
  INSERT INTO players (id, name, phone, position, is_admin, password)
  VALUES (v_id, substring(p_name from 1 for 50), p_phone, COALESCE(p_position, 'Meia'), v_is_first, crypt(p_password, gen_salt('bf', 10)))
  RETURNING * INTO v_player;

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
