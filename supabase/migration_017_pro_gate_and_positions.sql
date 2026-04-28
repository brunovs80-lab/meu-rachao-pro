-- ============================================================
-- MEU RACHÃO PRO - Migration 017: Gating Pro de avulsos + posições necessárias
-- 1. Coluna `needed_positions TEXT[]` em sessions
-- 2. Helper `is_user_pro(user_id)`
-- 3. `update_session_guest_config`: bloqueia se dono do rachão não for Pro
--    e aceita o array de posições necessárias
-- 4. `list_open_guest_sessions_nearby` passa a retornar `needed_positions`
-- ============================================================

-- 1. Coluna nova
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS needed_positions TEXT[];

-- 2. Helper Pro
CREATE OR REPLACE FUNCTION is_user_pro(p_user_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT (s.is_lifetime OR (s.expires_at IS NOT NULL AND s.expires_at > NOW()))
       FROM pro_subscriptions s WHERE s.user_id = p_user_id),
    FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION is_user_pro(TEXT) TO anon, authenticated;

-- 3. update_session_guest_config — gate Pro + posições necessárias
DROP FUNCTION IF EXISTS update_session_guest_config(TEXT, BOOLEAN, NUMERIC, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION update_session_guest_config(
  p_session_id TEXT,
  p_allow_guests BOOLEAN,
  p_guest_fee NUMERIC,
  p_guest_slots INTEGER,
  p_caller_id TEXT,
  p_needed_positions TEXT[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_rachao_id TEXT;
  v_owner TEXT;
  v_can BOOLEAN := FALSE;
  v_existing_guests INTEGER;
  v_owner_pro BOOLEAN;
  v_valid_positions TEXT[] := ARRAY['Goleiro','Zagueiro','Lateral','Volante','Meia','Atacante'];
  v_clean_positions TEXT[] := NULL;
BEGIN
  SELECT s.rachao_id, r.created_by
    INTO v_rachao_id, v_owner
    FROM sessions s JOIN rachaos r ON r.id = s.rachao_id
   WHERE s.id = p_session_id;

  IF v_rachao_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SESSAO_INVALIDA');
  END IF;

  IF v_owner = p_caller_id THEN
    v_can := TRUE;
  ELSE
    v_can := check_rachao_permission(v_rachao_id, p_caller_id, 'manage_session');
  END IF;

  IF NOT v_can THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SEM_PERMISSAO');
  END IF;

  IF p_allow_guests THEN
    -- Gate Pro: dono do rachão precisa ser Pro pra liberar avulsos.
    -- Avaliamos no dono (não no caller) pra co-admins não driblarem o gate.
    SELECT is_user_pro(v_owner) INTO v_owner_pro;
    IF NOT v_owner_pro THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PRO_REQUERIDO');
    END IF;

    IF COALESCE(p_guest_fee, 0) <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'VALOR_INVALIDO');
    END IF;
    IF COALESCE(p_guest_slots, 0) <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'VAGAS_INVALIDAS');
    END IF;

    SELECT COUNT(*) INTO v_existing_guests
      FROM session_guests
     WHERE session_id = p_session_id AND status = 'paid';
    IF p_guest_slots < v_existing_guests THEN
      RETURN jsonb_build_object('ok', false, 'error', 'VAGAS_MENOR_QUE_PAGOS', 'pagos', v_existing_guests);
    END IF;

    -- Filtra silenciosamente posições inválidas; mantém ordem de aparição
    IF p_needed_positions IS NOT NULL AND array_length(p_needed_positions, 1) > 0 THEN
      SELECT ARRAY(
        SELECT DISTINCT pos
          FROM unnest(p_needed_positions) AS pos
         WHERE pos = ANY(v_valid_positions)
      ) INTO v_clean_positions;
      IF v_clean_positions IS NOT NULL AND array_length(v_clean_positions, 1) = 0 THEN
        v_clean_positions := NULL;
      END IF;
    END IF;
  END IF;

  UPDATE sessions
     SET allow_guests     = p_allow_guests,
         guest_fee        = CASE WHEN p_allow_guests THEN p_guest_fee   ELSE NULL END,
         guest_slots      = CASE WHEN p_allow_guests THEN p_guest_slots ELSE NULL END,
         needed_positions = CASE WHEN p_allow_guests THEN v_clean_positions ELSE NULL END
   WHERE id = p_session_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION update_session_guest_config(TEXT, BOOLEAN, NUMERIC, INTEGER, TEXT, TEXT[]) TO anon, authenticated;

-- 4. list_open_guest_sessions_nearby — retorna posições necessárias
DROP FUNCTION IF EXISTS list_open_guest_sessions_nearby(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT);

CREATE OR REPLACE FUNCTION list_open_guest_sessions_nearby(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 25,
  p_player_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  session_id TEXT,
  session_date TEXT,
  rachao_id TEXT,
  rachao_name TEXT,
  rachao_location TEXT,
  rachao_day_of_week INTEGER,
  rachao_time TEXT,
  guest_fee NUMERIC,
  guest_slots INTEGER,
  guests_paid INTEGER,
  confirmed_count INTEGER,
  needed_positions TEXT[],
  distance_km NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      s.id      AS session_id,
      s.date    AS session_date,
      r.id      AS rachao_id,
      r.name    AS rachao_name,
      r.location AS rachao_location,
      r.day_of_week AS rachao_day_of_week,
      r.time    AS rachao_time,
      s.guest_fee,
      s.guest_slots,
      s.needed_positions,
      r.latitude,
      r.longitude,
      (SELECT COUNT(*)::INT FROM session_guests g
        WHERE g.session_id = s.id AND g.status = 'paid') AS guests_paid,
      (SELECT COUNT(*)::INT FROM session_confirmations c
        WHERE c.session_id = s.id AND c.type = 'confirmed') AS confirmed_count
    FROM sessions s
    JOIN rachaos r ON r.id = s.rachao_id
    WHERE s.allow_guests = TRUE
      AND s.status = 'open'
      AND r.status = 'active'
      AND r.latitude IS NOT NULL
      AND r.longitude IS NOT NULL
      AND (
        p_player_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM rachao_participants rp
           WHERE rp.rachao_id = r.id AND rp.player_id = p_player_id
        )
      )
  )
  SELECT
    b.session_id,
    b.session_date,
    b.rachao_id,
    b.rachao_name,
    b.rachao_location,
    b.rachao_day_of_week,
    b.rachao_time,
    b.guest_fee,
    b.guest_slots,
    b.guests_paid,
    b.confirmed_count,
    b.needed_positions,
    ROUND(
      (6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(b.latitude - p_lat) / 2), 2) +
        COS(RADIANS(p_lat)) * COS(RADIANS(b.latitude)) *
        POWER(SIN(RADIANS(b.longitude - p_lng) / 2), 2)
      )))::NUMERIC, 1
    ) AS distance_km
  FROM base b
  WHERE (6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(b.latitude - p_lat) / 2), 2) +
        COS(RADIANS(p_lat)) * COS(RADIANS(b.latitude)) *
        POWER(SIN(RADIANS(b.longitude - p_lng) / 2), 2)
      ))) <= p_radius_km
  ORDER BY distance_km;
$$;

GRANT EXECUTE ON FUNCTION list_open_guest_sessions_nearby(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT)
  TO anon, authenticated;
