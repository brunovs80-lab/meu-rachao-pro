-- ============================================================
-- MEU RACHÃO PRO - Migration 015: Auto-refund via API do Mercado Pago
-- - Adiciona refund_external_id em session_guests (ID do refund no MP)
-- - Expande CHECK de status p/ aceitar 'refund_failed'
-- - cancel_session ganha p_auto_refund: quando true, paid permanece paid e
--   o edge function `cancel-session-with-refunds` processa os estornos.
-- - apply_auto_refund_result(player, session, success, mp_refund_id?, error?)
--   é chamado pelo edge function para registrar o resultado da chamada à MP.
-- ============================================================

ALTER TABLE session_guests ADD COLUMN IF NOT EXISTS refund_external_id TEXT;
ALTER TABLE session_guests ADD COLUMN IF NOT EXISTS refund_error TEXT;
ALTER TABLE session_guests ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

ALTER TABLE session_guests DROP CONSTRAINT IF EXISTS session_guests_status_check;
ALTER TABLE session_guests
  ADD CONSTRAINT session_guests_status_check
  CHECK (status IN ('pending', 'paid', 'refunded', 'refund_failed', 'cancelled'));

-- pix_transactions agora aceita 'refunded' p/ refletir estorno automático
ALTER TABLE pix_transactions DROP CONSTRAINT IF EXISTS pix_transactions_status_check;
ALTER TABLE pix_transactions
  ADD CONSTRAINT pix_transactions_status_check
  CHECK (status IN ('pending', 'paid', 'expired', 'error', 'refunded'));

-- ============================================================
-- list_session_guests passa a expor colunas de refund + inclui refund_failed
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
  created_at TIMESTAMPTZ,
  refund_external_id TEXT,
  refund_error TEXT,
  refunded_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT g.player_id, p.name AS player_name, p.position AS player_position,
         g.fee_paid, g.status, g.transaction_id, g.paid_at, g.created_at,
         g.refund_external_id, g.refund_error, g.refunded_at
    FROM session_guests g
    JOIN players p ON p.id = g.player_id
   WHERE g.session_id = p_session_id
     AND g.status IN ('paid', 'refunded', 'refund_failed', 'pending')
   ORDER BY
     CASE g.status
       WHEN 'paid' THEN 1
       WHEN 'pending' THEN 2
       WHEN 'refund_failed' THEN 3
       WHEN 'refunded' THEN 4
       ELSE 5
     END,
     g.created_at;
$$;

-- ============================================================
-- cancel_session: novo parâmetro p_auto_refund.
-- - false (padrão): comportamento legado — paid → refunded (admin estorna manual).
-- - true: paid permanece paid; edge function chamará apply_auto_refund_result.
-- Drop antigo p/ evitar ambiguidade na resolução por named args.
-- ============================================================
DROP FUNCTION IF EXISTS cancel_session(TEXT, TEXT);

CREATE OR REPLACE FUNCTION cancel_session(
  p_session_id TEXT,
  p_caller_id  TEXT,
  p_auto_refund BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_rachao_id TEXT;
  v_owner     TEXT;
  v_status    TEXT;
  v_can       BOOLEAN := FALSE;
  v_refund_count INT := 0;
  v_refund_total NUMERIC := 0;
  v_pending_count INT := 0;
BEGIN
  SELECT s.rachao_id, r.created_by, s.status
    INTO v_rachao_id, v_owner, v_status
    FROM sessions s
    JOIN rachaos r ON r.id = s.rachao_id
   WHERE s.id = p_session_id
   FOR UPDATE;

  IF v_rachao_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SESSAO_INVALIDA');
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'JA_CANCELADA');
  END IF;
  IF v_status = 'done' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'JA_ENCERRADA');
  END IF;

  IF v_owner = p_caller_id THEN
    v_can := TRUE;
  ELSE
    v_can := check_rachao_permission(v_rachao_id, p_caller_id, 'manage_session');
  END IF;

  IF NOT v_can THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SEM_PERMISSAO');
  END IF;

  -- Sempre marca como cancelada — bloqueia novos pagamentos.
  UPDATE sessions SET status = 'cancelled' WHERE id = p_session_id;

  -- Conta paid (sem alterar quando auto_refund) p/ retornar ao caller.
  SELECT COUNT(*), COALESCE(SUM(fee_paid), 0)
    INTO v_refund_count, v_refund_total
    FROM session_guests
   WHERE session_id = p_session_id AND status = 'paid';

  IF NOT p_auto_refund AND v_refund_count > 0 THEN
    UPDATE session_guests
       SET status = 'refunded'
     WHERE session_id = p_session_id AND status = 'paid';

    INSERT INTO notifications (type, icon, title, text)
    VALUES ('orange', 'fa-triangle-exclamation', 'Estorno pendente',
      'Sessão cancelada com ' || v_refund_count || ' avulso(s) pago(s). Estorne via painel do Mercado Pago: R$ ' || REPLACE(v_refund_total::TEXT, '.', ','));
  END IF;

  -- Pendentes sempre vão para cancelled (libera vagas).
  WITH upd2 AS (
    UPDATE session_guests
       SET status = 'cancelled'
     WHERE session_id = p_session_id AND status = 'pending'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_pending_count FROM upd2;

  RETURN jsonb_build_object(
    'ok', true,
    'refund_count', v_refund_count,
    'refund_total', v_refund_total,
    'pending_cancelled', v_pending_count,
    'auto_refund', p_auto_refund
  );
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_session(TEXT, TEXT, BOOLEAN) TO anon, authenticated, service_role;

-- ============================================================
-- get_session_paid_guests_with_tx: usado pelo edge function p/ obter o
-- external_id (payment id MP) de cada avulso pago.
-- ============================================================
CREATE OR REPLACE FUNCTION get_session_paid_guests_with_tx(p_session_id TEXT)
RETURNS TABLE (
  player_id TEXT,
  fee_paid NUMERIC,
  pix_transaction_id TEXT,
  pix_external_id TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT g.player_id, g.fee_paid,
         t.id AS pix_transaction_id,
         t.external_id AS pix_external_id
    FROM session_guests g
    LEFT JOIN pix_transactions t
      ON t.session_id = g.session_id
     AND t.player_id  = g.player_id
     AND t.purpose    = 'guest_fee'
     AND t.status     = 'paid'
   WHERE g.session_id = p_session_id
     AND g.status     = 'paid';
$$;

GRANT EXECUTE ON FUNCTION get_session_paid_guests_with_tx(TEXT) TO service_role;

-- ============================================================
-- apply_auto_refund_result — atualiza session_guests + pix_transactions
-- após a tentativa de refund na MP.
-- ============================================================
CREATE OR REPLACE FUNCTION apply_auto_refund_result(
  p_session_id TEXT,
  p_player_id  TEXT,
  p_success    BOOLEAN,
  p_mp_refund_id TEXT DEFAULT NULL,
  p_error_msg  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_success THEN
    UPDATE session_guests
       SET status = 'refunded',
           refund_external_id = p_mp_refund_id,
           refund_error = NULL,
           refunded_at = NOW()
     WHERE session_id = p_session_id AND player_id = p_player_id;

    UPDATE pix_transactions
       SET status = 'refunded'
     WHERE session_id = p_session_id
       AND player_id  = p_player_id
       AND purpose    = 'guest_fee'
       AND status     = 'paid';
  ELSE
    UPDATE session_guests
       SET status = 'refund_failed',
           refund_error = LEFT(COALESCE(p_error_msg, 'Erro desconhecido'), 500)
     WHERE session_id = p_session_id AND player_id = p_player_id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION apply_auto_refund_result(TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO service_role;
