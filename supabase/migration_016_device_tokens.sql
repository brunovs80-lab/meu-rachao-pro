-- ============================================================
-- MEU RACHÃO PRO - Migration 016: Device tokens p/ push notifications
-- - Cada (player_id, fcm_token) é uma "instalação" do app.
-- - Edge function send-push consulta esta tabela pra descobrir alvos.
-- - Tokens inválidos retornados pelo FCM são removidos via RPC.
-- ============================================================

CREATE TABLE IF NOT EXISTS device_tokens (
  id          BIGSERIAL PRIMARY KEY,
  player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  fcm_token   TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  app_version TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_player ON device_tokens(player_id);

-- ============================================================
-- register_device_token: upsert por fcm_token. Se o token já existe
-- e o player mudou (ex: re-login no mesmo aparelho), reassocia.
-- ============================================================
CREATE OR REPLACE FUNCTION register_device_token(
  p_player_id   TEXT,
  p_fcm_token   TEXT,
  p_platform    TEXT,
  p_app_version TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_player_id IS NULL OR p_fcm_token IS NULL OR p_fcm_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PARAMS_INVALIDOS');
  END IF;
  IF p_platform NOT IN ('android', 'ios', 'web') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PLATFORM_INVALIDA');
  END IF;

  INSERT INTO device_tokens (player_id, fcm_token, platform, app_version)
  VALUES (p_player_id, p_fcm_token, p_platform, p_app_version)
  ON CONFLICT (fcm_token) DO UPDATE
    SET player_id   = EXCLUDED.player_id,
        platform    = EXCLUDED.platform,
        app_version = EXCLUDED.app_version,
        updated_at  = NOW();

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION register_device_token(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- ============================================================
-- unregister_device_token: chamado no logout ou quando o FCM diz que
-- o token não é mais válido. Remove sem erro se não existir.
-- ============================================================
CREATE OR REPLACE FUNCTION unregister_device_token(p_fcm_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM device_tokens WHERE fcm_token = p_fcm_token;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION unregister_device_token(TEXT) TO anon, authenticated, service_role;

-- ============================================================
-- get_device_tokens_for_players: usado pelo edge function send-push.
-- ============================================================
CREATE OR REPLACE FUNCTION get_device_tokens_for_players(p_player_ids TEXT[])
RETURNS TABLE (player_id TEXT, fcm_token TEXT, platform TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT player_id, fcm_token, platform
    FROM device_tokens
   WHERE player_id = ANY(p_player_ids);
$$;

GRANT EXECUTE ON FUNCTION get_device_tokens_for_players(TEXT[]) TO service_role;
