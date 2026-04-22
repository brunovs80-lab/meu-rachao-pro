-- ============================================================
-- MEU RACHÃO PRO - Migration 004: PIX Transactions
-- Sistema de pagamento automático via PIX
-- ============================================================

-- ===== TRANSAÇÕES PIX =====
CREATE TABLE IF NOT EXISTS pix_transactions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  billing_id TEXT NOT NULL REFERENCES monthly_billing(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rachao_id TEXT NOT NULL REFERENCES rachaos(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'expired', 'error')),
  external_id TEXT,                -- ID do pagamento no Mercado Pago
  qr_code TEXT,                    -- Código PIX copia-e-cola
  qr_code_base64 TEXT,             -- QR code em base64 para exibir
  description TEXT,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  webhook_data JSONB,              -- Dados brutos do webhook para auditoria
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pix_transactions_billing ON pix_transactions(billing_id);
CREATE INDEX IF NOT EXISTS idx_pix_transactions_player ON pix_transactions(player_id);
CREATE INDEX IF NOT EXISTS idx_pix_transactions_external ON pix_transactions(external_id);
CREATE INDEX IF NOT EXISTS idx_pix_transactions_status ON pix_transactions(status);

-- RLS
ALTER TABLE pix_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON pix_transactions FOR ALL USING (true) WITH CHECK (true);

-- Habilitar Realtime para billing_payments e pix_transactions (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'billing_payments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE billing_payments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'pix_transactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pix_transactions;
  END IF;
END $$;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_pix_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pix_transactions_updated_at
  BEFORE UPDATE ON pix_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_pix_updated_at();

-- Função RPC: quando PIX é confirmado, atualiza billing_payments automaticamente
CREATE OR REPLACE FUNCTION confirm_pix_payment(
  p_external_id TEXT,
  p_webhook_data JSONB DEFAULT '{}'
) RETURNS JSONB AS $$
DECLARE
  v_tx pix_transactions%ROWTYPE;
BEGIN
  -- Buscar transação pelo ID externo
  SELECT * INTO v_tx FROM pix_transactions WHERE external_id = p_external_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transação não encontrada');
  END IF;

  -- Já foi paga?
  IF v_tx.status = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Já confirmado anteriormente');
  END IF;

  -- Atualizar transação PIX
  UPDATE pix_transactions SET
    status = 'paid',
    paid_at = now(),
    webhook_data = p_webhook_data
  WHERE id = v_tx.id;

  -- Atualizar billing_payments automaticamente
  UPDATE billing_payments SET
    status = 'paid',
    paid_at = now()
  WHERE billing_id = v_tx.billing_id AND player_id = v_tx.player_id;

  -- Criar notificação
  INSERT INTO notifications (type, icon, title, text)
  VALUES ('green', 'fa-check-circle', 'Pagamento PIX confirmado',
    (SELECT name FROM players WHERE id = v_tx.player_id) || ' pagou via PIX');

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx.id);
END;
$$ LANGUAGE plpgsql;
