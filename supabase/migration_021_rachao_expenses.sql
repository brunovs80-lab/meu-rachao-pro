-- ============================================================
-- Migration 021: Despesas avulsas do caixa do rachão
-- ============================================================
-- Permite admin (owner ou co-admin com 'mark_venue_paid') lançar
-- despesas (ex: bola nova R$100) que debitam do acumulado.
-- Lista visível pra todos os participantes do rachão.
-- ============================================================

CREATE TABLE IF NOT EXISTS rachao_expenses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  rachao_id TEXT NOT NULL REFERENCES rachaos(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  created_by TEXT REFERENCES players(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rachao_expenses_rachao ON rachao_expenses(rachao_id, created_at DESC);

ALTER TABLE rachao_expenses ENABLE ROW LEVEL SECURITY;

-- Leitura aberta — qualquer um do rachão pode ver as despesas
DROP POLICY IF EXISTS "rachao_expenses_select_all" ON rachao_expenses;
CREATE POLICY "rachao_expenses_select_all" ON rachao_expenses
  FOR SELECT USING (true);

-- INSERT/DELETE só via RPCs SECURITY DEFINER (que validam permissão)

-- ============================================================
-- RPC: add_rachao_expense
-- ============================================================
CREATE OR REPLACE FUNCTION add_rachao_expense(
  p_rachao_id TEXT,
  p_caller_id TEXT,
  p_description TEXT,
  p_amount NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_can BOOLEAN;
  v_desc TEXT;
  v_id TEXT;
BEGIN
  IF p_rachao_id IS NULL OR p_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PARAMS_INVALIDOS');
  END IF;
  v_desc := COALESCE(NULLIF(TRIM(p_description), ''), NULL);
  IF v_desc IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DESCRICAO_OBRIGATORIA');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VALOR_INVALIDO');
  END IF;

  v_can := check_rachao_permission(p_rachao_id, p_caller_id, 'mark_venue_paid');
  IF NOT v_can THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SEM_PERMISSAO');
  END IF;

  INSERT INTO rachao_expenses (rachao_id, description, amount, created_by)
  VALUES (p_rachao_id, substring(v_desc from 1 for 100), p_amount, p_caller_id)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- ============================================================
-- RPC: delete_rachao_expense
-- ============================================================
CREATE OR REPLACE FUNCTION delete_rachao_expense(
  p_expense_id TEXT,
  p_caller_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_rachao_id TEXT;
  v_can BOOLEAN;
BEGIN
  IF p_expense_id IS NULL OR p_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PARAMS_INVALIDOS');
  END IF;

  SELECT rachao_id INTO v_rachao_id FROM rachao_expenses WHERE id = p_expense_id;
  IF v_rachao_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DESPESA_NAO_ENCONTRADA');
  END IF;

  v_can := check_rachao_permission(v_rachao_id, p_caller_id, 'mark_venue_paid');
  IF NOT v_can THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SEM_PERMISSAO');
  END IF;

  DELETE FROM rachao_expenses WHERE id = p_expense_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION add_rachao_expense(TEXT, TEXT, TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_rachao_expense(TEXT, TEXT) TO anon, authenticated;
