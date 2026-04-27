-- ============================================================
-- MEU RACHÃO PRO - Migration 009: Jogadores avulsos por sessão
-- Permite ao admin liberar vagas pagas para avulsos numa sessão específica.
-- ============================================================

-- ===== Configuração de avulsos por sessão =====
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS allow_guests BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS guest_fee NUMERIC(10,2);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS guest_slots INTEGER;

-- ===== Avulsos confirmados (pagantes) =====
-- Cada linha = um avulso que pagou e foi confirmado naquela sessão.
-- Não usa session_confirmations pois precisamos rastrear pagamento e separar de membros fixos.
CREATE TABLE IF NOT EXISTS session_guests (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  fee_paid NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'refunded', 'cancelled')),
  transaction_id TEXT,                       -- referência à pix_transactions quando pago via Mercado Pago
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_session_guests_player ON session_guests(player_id);
CREATE INDEX IF NOT EXISTS idx_session_guests_status ON session_guests(status);

ALTER TABLE session_guests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "session_guests_select_all" ON session_guests;
CREATE POLICY "session_guests_select_all" ON session_guests FOR SELECT USING (true);
-- writes apenas via RPC/service_role

-- ============================================================
-- RPC: update_session_guest_config(session_id, allow, fee, slots, caller_id)
-- Valida que o caller é dono do rachão OU co-admin com permissão 'manage_session'
-- ============================================================
CREATE OR REPLACE FUNCTION update_session_guest_config(
  p_session_id TEXT,
  p_allow_guests BOOLEAN,
  p_guest_fee NUMERIC,
  p_guest_slots INTEGER,
  p_caller_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_rachao_id TEXT;
  v_owner TEXT;
  v_can BOOLEAN := FALSE;
  v_existing_guests INTEGER;
BEGIN
  -- Acha o rachão da sessão
  SELECT s.rachao_id, r.created_by
    INTO v_rachao_id, v_owner
    FROM sessions s JOIN rachaos r ON r.id = s.rachao_id
   WHERE s.id = p_session_id;

  IF v_rachao_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SESSAO_INVALIDA');
  END IF;

  -- Caller é dono do rachão?
  IF v_owner = p_caller_id THEN
    v_can := TRUE;
  ELSE
    -- Tem permissão de co-admin de gerenciar sessões?
    v_can := check_rachao_permission(v_rachao_id, p_caller_id, 'manage_session');
  END IF;

  IF NOT v_can THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SEM_PERMISSAO');
  END IF;

  -- Valida campos quando libera avulsos
  IF p_allow_guests THEN
    IF COALESCE(p_guest_fee, 0) <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'VALOR_INVALIDO');
    END IF;
    IF COALESCE(p_guest_slots, 0) <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'VAGAS_INVALIDAS');
    END IF;

    -- Não pode reduzir vagas abaixo do que já foi pago
    SELECT COUNT(*) INTO v_existing_guests
      FROM session_guests
     WHERE session_id = p_session_id AND status = 'paid';
    IF p_guest_slots < v_existing_guests THEN
      RETURN jsonb_build_object('ok', false, 'error', 'VAGAS_MENOR_QUE_PAGOS', 'pagos', v_existing_guests);
    END IF;
  END IF;

  UPDATE sessions
     SET allow_guests = p_allow_guests,
         guest_fee    = CASE WHEN p_allow_guests THEN p_guest_fee   ELSE NULL END,
         guest_slots  = CASE WHEN p_allow_guests THEN p_guest_slots ELSE NULL END
   WHERE id = p_session_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- RPC: list_session_guests(session_id) → lista avulsos com nome
-- ============================================================
CREATE OR REPLACE FUNCTION list_session_guests(p_session_id TEXT)
RETURNS TABLE (
  player_id TEXT,
  player_name TEXT,
  player_position TEXT,
  fee_paid NUMERIC,
  status TEXT,
  transaction_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT g.player_id, p.name AS player_name, p.position AS player_position,
         g.fee_paid, g.status, g.transaction_id, g.paid_at, g.created_at
    FROM session_guests g
    JOIN players p ON p.id = g.player_id
   WHERE g.session_id = p_session_id
   ORDER BY g.created_at;
$$;

-- ============================================================
-- RPC: list_open_guest_sessions() → sessões abertas para avulsos com info do rachão
-- Usado na futura tela de descoberta. Por ora retorna todas (filtro de raio virá no client)
-- ============================================================
CREATE OR REPLACE FUNCTION list_open_guest_sessions()
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
  confirmed_count INTEGER
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.id AS session_id,
    s.date AS session_date,
    r.id AS rachao_id,
    r.name AS rachao_name,
    r.location AS rachao_location,
    r.day_of_week AS rachao_day_of_week,
    r.time AS rachao_time,
    s.guest_fee,
    s.guest_slots,
    (SELECT COUNT(*)::INT FROM session_guests g WHERE g.session_id = s.id AND g.status = 'paid') AS guests_paid,
    (SELECT COUNT(*)::INT FROM session_confirmations c WHERE c.session_id = s.id AND c.type = 'confirmed') AS confirmed_count
  FROM sessions s
  JOIN rachaos r ON r.id = s.rachao_id
  WHERE s.allow_guests = TRUE
    AND s.status = 'open'
    AND r.status = 'active'
  ORDER BY s.date;
$$;

-- ============================================================
-- GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION update_session_guest_config(TEXT, BOOLEAN, NUMERIC, INTEGER, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION list_session_guests(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION list_open_guest_sessions() TO anon, authenticated;
