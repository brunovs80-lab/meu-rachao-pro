-- ============================================================
-- MEU RACHÃO PRO - Migration 019: Assinatura Pro via Mercado Pago (web/PWA)
-- Adiciona suporte ao source 'mp_web' em pro_subscriptions e
-- colunas para correlacionar com Preapproval/Payment do Mercado Pago.
-- ============================================================

-- 1) Permitir source = 'mp_web' (recorrência cartão pelo PWA)
ALTER TABLE pro_subscriptions
  DROP CONSTRAINT IF EXISTS pro_subscriptions_source_check;

ALTER TABLE pro_subscriptions
  ADD CONSTRAINT pro_subscriptions_source_check
  CHECK (source IN ('iap', 'coupon', 'admin', 'mp_web'));

-- 2) Correlação com objetos do Mercado Pago.
-- mp_preapproval_id : id da assinatura recorrente (mensal/anual)
-- mp_payment_id     : id do pagamento avulso (vitalício)
ALTER TABLE pro_subscriptions
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_payment_id     TEXT;

CREATE INDEX IF NOT EXISTS idx_pro_subs_mp_preapproval
  ON pro_subscriptions(mp_preapproval_id)
  WHERE mp_preapproval_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pro_subs_mp_payment
  ON pro_subscriptions(mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;
