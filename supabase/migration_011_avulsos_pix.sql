-- ============================================================
-- MEU RACHÃO PRO - Migration 011: PIX automático para avulsos
-- Reaproveita pix_transactions adicionando purpose='guest_fee' e session_id.
-- ============================================================

-- ===== Estende pix_transactions =====
ALTER TABLE pix_transactions ALTER COLUMN billing_id DROP NOT NULL;

ALTER TABLE pix_transactions ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'mensalidade';
ALTER TABLE pix_transactions ADD COLUMN IF NOT EXISTS session_id TEXT;

-- Recria a CHECK do purpose de forma idempotente
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
     WHERE table_name='pix_transactions' AND constraint_name='pix_transactions_purpose_check'
  ) THEN
    ALTER TABLE pix_transactions DROP CONSTRAINT pix_transactions_purpose_check;
  END IF;
END $$;
ALTER TABLE pix_transactions
  ADD CONSTRAINT pix_transactions_purpose_check
  CHECK (purpose IN ('mensalidade', 'guest_fee'));

-- FK opcional para sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_name='pix_transactions' AND constraint_name='pix_transactions_session_fk'
  ) THEN
    ALTER TABLE pix_transactions
      ADD CONSTRAINT pix_transactions_session_fk
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pix_transactions_session ON pix_transactions(session_id);

-- Garante consistência: guest_fee precisa de session_id e billing_id NULL
ALTER TABLE pix_transactions DROP CONSTRAINT IF EXISTS pix_transactions_purpose_consistency;
ALTER TABLE pix_transactions
  ADD CONSTRAINT pix_transactions_purpose_consistency CHECK (
    (purpose = 'mensalidade' AND billing_id IS NOT NULL)
    OR
    (purpose = 'guest_fee' AND session_id IS NOT NULL)
  );

-- ============================================================
-- RPC: reserve_guest_slot(session_id, player_id) → pendura vaga "pending"
-- Usado pelo create-pix-charge antes de gerar a cobrança.
-- ============================================================
CREATE OR REPLACE FUNCTION reserve_guest_slot(
  p_session_id TEXT,
  p_player_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_session   RECORD;
  v_used      INT;
  v_existing  RECORD;
BEGIN
  -- Lock da sessão evita corrida com outros pagantes
  SELECT id, allow_guests, guest_fee, guest_slots, status, rachao_id
    INTO v_session
    FROM sessions
   WHERE id = p_session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SESSAO_INVALIDA');
  END IF;
  IF v_session.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SESSAO_FECHADA');
  END IF;
  IF NOT v_session.allow_guests THEN
    RETURN jsonb_build_object('ok', false, 'error', 'AVULSOS_DESABILITADOS');
  END IF;

  -- Já existe registro deste jogador?
  SELECT * INTO v_existing FROM session_guests
   WHERE session_id = p_session_id AND player_id = p_player_id;

  IF FOUND THEN
    IF v_existing.status = 'paid' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'JA_PAGO');
    END IF;
    -- pending/refunded/cancelled: reutiliza
    UPDATE session_guests
       SET status = 'pending', fee_paid = v_session.guest_fee,
           transaction_id = NULL, paid_at = NULL, created_at = NOW()
     WHERE session_id = p_session_id AND player_id = p_player_id;
    RETURN jsonb_build_object(
      'ok', true, 'reused', true,
      'fee', v_session.guest_fee, 'rachao_id', v_session.rachao_id
    );
  END IF;

  -- Vagas (pendentes contam, pra evitar overbook)
  SELECT COUNT(*) INTO v_used FROM session_guests
   WHERE session_id = p_session_id AND status IN ('pending','paid');

  IF v_used >= COALESCE(v_session.guest_slots, 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VAGAS_ESGOTADAS');
  END IF;

  INSERT INTO session_guests (session_id, player_id, fee_paid, status, created_at)
  VALUES (p_session_id, p_player_id, v_session.guest_fee, 'pending', NOW());

  RETURN jsonb_build_object(
    'ok', true, 'fee', v_session.guest_fee,
    'rachao_id', v_session.rachao_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION reserve_guest_slot(TEXT, TEXT) TO anon, authenticated, service_role;

-- ============================================================
-- RPC: confirm_pix_payment — agora roteia por purpose
-- ============================================================
CREATE OR REPLACE FUNCTION confirm_pix_payment(
  p_external_id TEXT,
  p_webhook_data JSONB DEFAULT '{}'
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx pix_transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_tx FROM pix_transactions WHERE external_id = p_external_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transação não encontrada');
  END IF;

  IF v_tx.status = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Já confirmado anteriormente');
  END IF;

  UPDATE pix_transactions
     SET status = 'paid', paid_at = NOW(), webhook_data = p_webhook_data
   WHERE id = v_tx.id;

  IF v_tx.purpose = 'guest_fee' THEN
    UPDATE session_guests
       SET status = 'paid', transaction_id = v_tx.id, paid_at = NOW()
     WHERE session_id = v_tx.session_id
       AND player_id  = v_tx.player_id
       AND status IN ('pending','refunded','cancelled');

    INSERT INTO notifications (type, icon, title, text)
    VALUES ('green', 'fa-user-check', 'Avulso confirmado',
      COALESCE((SELECT name FROM players WHERE id = v_tx.player_id), 'Jogador')
        || ' pagou e entrou na lista');
  ELSE
    UPDATE billing_payments
       SET status = 'paid', paid_at = NOW()
     WHERE billing_id = v_tx.billing_id
       AND player_id  = v_tx.player_id;

    INSERT INTO notifications (type, icon, title, text)
    VALUES ('green', 'fa-check-circle', 'Pagamento PIX confirmado',
      COALESCE((SELECT name FROM players WHERE id = v_tx.player_id), 'Jogador')
        || ' pagou via PIX');
  END IF;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx.id);
END;
$$;

-- ============================================================
-- RPC opcional: limpar reservas pendentes vencidas
-- Pode ser chamado por um cron ou manualmente; libera vagas presas.
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_expired_guest_reservations()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE v_count INT;
BEGIN
  WITH expired AS (
    SELECT g.session_id, g.player_id
      FROM session_guests g
      LEFT JOIN pix_transactions t
        ON t.session_id = g.session_id
       AND t.player_id  = g.player_id
       AND t.purpose    = 'guest_fee'
     WHERE g.status = 'pending'
       AND (
         (t.id IS NOT NULL AND t.status <> 'paid' AND t.expires_at < NOW())
         OR
         (t.id IS NULL AND g.created_at < NOW() - INTERVAL '1 hour')
       )
  )
  DELETE FROM session_guests sg
   USING expired e
   WHERE sg.session_id = e.session_id
     AND sg.player_id  = e.player_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_expired_guest_reservations() TO service_role;
