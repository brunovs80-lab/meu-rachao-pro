-- ============================================================
-- MEU RACHÃO PRO - Migration 005: Payment Config per Rachão
-- Cada admin configura seu próprio token Mercado Pago
-- ============================================================

CREATE TABLE IF NOT EXISTS rachao_payment_config (
  rachao_id TEXT PRIMARY KEY REFERENCES rachaos(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mercado_pago',
  mp_access_token TEXT,
  mp_enabled BOOLEAN NOT NULL DEFAULT false,
  mp_user_info JSONB,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT REFERENCES players(id)
);

ALTER TABLE rachao_payment_config ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy = cliente anon não lê/escreve; só service_role (bypassa RLS).

-- View pública APENAS com flag (sem expor token)
CREATE OR REPLACE VIEW rachao_payment_status AS
SELECT rachao_id, provider, mp_enabled, updated_at
FROM rachao_payment_config;

ALTER VIEW rachao_payment_status SET (security_invoker = false);
GRANT SELECT ON rachao_payment_status TO anon, authenticated;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_payment_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_config_updated_at ON rachao_payment_config;
CREATE TRIGGER payment_config_updated_at
  BEFORE UPDATE ON rachao_payment_config
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_config_updated_at();
