-- ============================================================
-- MEU RACHÃO PRO - Migration 006: Venue Paid Tracking
-- Admin marca quando quitou a quadra; usado para calcular caixa.
-- ============================================================

ALTER TABLE monthly_billing
  ADD COLUMN IF NOT EXISTS venue_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS venue_paid_by TEXT REFERENCES players(id);

CREATE INDEX IF NOT EXISTS idx_monthly_billing_rachao_month ON monthly_billing(rachao_id, month);
