-- ============================================================
-- MEU RACHÃO PRO - Migration 014: Cancelar sessão com refund de avulsos
-- - Permite admin marcar sessão como cancelled
-- - Avulsos pagos viram 'refunded' (admin estorna manual via MP por enquanto)
-- - Avulsos pendentes viram 'cancelled' (libera vagas presas)
-- ============================================================

CREATE OR REPLACE FUNCTION cancel_session(
  p_session_id TEXT,
  p_caller_id  TEXT
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

  -- Permissão: dono ou co-admin com manage_session
  IF v_owner = p_caller_id THEN
    v_can := TRUE;
  ELSE
    v_can := check_rachao_permission(v_rachao_id, p_caller_id, 'manage_session');
  END IF;

  IF NOT v_can THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SEM_PERMISSAO');
  END IF;

  -- Marca a sessão como cancelada
  UPDATE sessions SET status = 'cancelled' WHERE id = p_session_id;

  -- Avulsos pagos → refunded (admin precisa estornar manualmente no MP)
  WITH upd AS (
    UPDATE session_guests
       SET status = 'refunded'
     WHERE session_id = p_session_id AND status = 'paid'
    RETURNING fee_paid
  )
  SELECT COUNT(*), COALESCE(SUM(fee_paid), 0)
    INTO v_refund_count, v_refund_total
    FROM upd;

  -- Avulsos pendentes → cancelled (libera vagas presas; ninguém pagou ainda)
  WITH upd2 AS (
    UPDATE session_guests
       SET status = 'cancelled'
     WHERE session_id = p_session_id AND status = 'pending'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_pending_count FROM upd2;

  -- Notificação geral
  IF v_refund_count > 0 THEN
    INSERT INTO notifications (type, icon, title, text)
    VALUES ('orange', 'fa-triangle-exclamation', 'Estorno pendente',
      'Sessão cancelada com ' || v_refund_count || ' avulso(s) pago(s). Estorne via painel do Mercado Pago: R$ ' || REPLACE(v_refund_total::TEXT, '.', ','));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'refund_count', v_refund_count,
    'refund_total', v_refund_total,
    'pending_cancelled', v_pending_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_session(TEXT, TEXT) TO anon, authenticated, service_role;

-- ============================================================
-- list_session_guests agora retorna todos (não só paid) pra admin ver refunded
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
     AND g.status IN ('paid', 'refunded', 'pending')
   ORDER BY
     CASE g.status WHEN 'paid' THEN 1 WHEN 'pending' THEN 2 WHEN 'refunded' THEN 3 ELSE 4 END,
     g.created_at;
$$;
