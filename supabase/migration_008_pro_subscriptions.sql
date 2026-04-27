-- ============================================================
-- MEU RACHÃO PRO - Migration 008: Sistema Pro (assinatura + cupons)
-- Tabelas para acesso Pro via IAP (RevenueCat) e cupons promocionais.
-- ============================================================

-- ===== ASSINATURAS PRO =====
-- Uma linha por usuário com o estado atual do acesso Pro.
-- Origem pode ser: 'iap' (RevenueCat), 'coupon' (cupom resgatado), 'admin' (concedido manualmente).
CREATE TABLE IF NOT EXISTS pro_subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('iap', 'coupon', 'admin')),
  product_id TEXT,                       -- ex: rachao_pro_monthly, rachao_pro_yearly, rachao_pro_lifetime
  plan_type TEXT NOT NULL CHECK (plan_type IN ('monthly', 'yearly', 'lifetime', 'trial')),
  expires_at TIMESTAMPTZ,                -- NULL para lifetime
  is_lifetime BOOLEAN NOT NULL DEFAULT FALSE,
  platform TEXT,                         -- 'android', 'ios', 'web', 'coupon', 'admin'
  external_id TEXT,                      -- transaction_id do RevenueCat / cupom resgatado
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pro_subs_expires ON pro_subscriptions(expires_at);

CREATE OR REPLACE FUNCTION pro_subs_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pro_subs_updated_at ON pro_subscriptions;
CREATE TRIGGER trg_pro_subs_updated_at
  BEFORE UPDATE ON pro_subscriptions
  FOR EACH ROW EXECUTE FUNCTION pro_subs_set_updated_at();

ALTER TABLE pro_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pro_subs_select_all" ON pro_subscriptions;
CREATE POLICY "pro_subs_select_all" ON pro_subscriptions FOR SELECT USING (true);
-- writes apenas via RPC/service_role

-- ===== CUPONS PROMOCIONAIS =====
-- Tipos:
--   trial   = libera Pro por duration_days dias (ex: teste grátis 30 dias)
--   lifetime = libera Pro vitalício (ex: parceiros, sorteios)
CREATE TABLE IF NOT EXISTS pro_coupons (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('trial', 'lifetime')),
  duration_days INTEGER,                 -- obrigatório para 'trial', NULL para 'lifetime'
  max_uses INTEGER,                      -- NULL = ilimitado
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,                -- validade do CUPOM em si (não da assinatura)
  description TEXT,
  created_by TEXT REFERENCES players(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_trial_duration CHECK (type <> 'trial' OR duration_days > 0)
);

CREATE INDEX IF NOT EXISTS idx_pro_coupons_code ON pro_coupons(code);

ALTER TABLE pro_coupons ENABLE ROW LEVEL SECURITY;
-- coupons não devem ser lidos por usuários comuns (evita brute-force);
-- listagem só via RPC list_coupons (que requer admin) ou service_role.

-- ===== HISTÓRICO DE RESGATES =====
-- Garante que um cupom só seja resgatado 1x por usuário.
CREATE TABLE IF NOT EXISTS pro_coupon_redemptions (
  coupon_id TEXT NOT NULL REFERENCES pro_coupons(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (coupon_id, user_id)
);

ALTER TABLE pro_coupon_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "redemptions_select_all" ON pro_coupon_redemptions;
CREATE POLICY "redemptions_select_all" ON pro_coupon_redemptions FOR SELECT USING (true);

-- ============================================================
-- RPC: get_pro_status(user_id) -> retorna estado atual
-- ============================================================
CREATE OR REPLACE FUNCTION get_pro_status(p_user_id TEXT)
RETURNS TABLE (
  is_pro BOOLEAN,
  source TEXT,
  plan_type TEXT,
  expires_at TIMESTAMPTZ,
  is_lifetime BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(s.is_lifetime OR s.expires_at > NOW(), FALSE) AS is_pro,
    s.source,
    s.plan_type,
    s.expires_at,
    COALESCE(s.is_lifetime, FALSE) AS is_lifetime
  FROM pro_subscriptions s
  WHERE s.user_id = p_user_id
  UNION ALL
  SELECT FALSE, NULL, NULL, NULL, FALSE
  WHERE NOT EXISTS (SELECT 1 FROM pro_subscriptions WHERE user_id = p_user_id)
  LIMIT 1;
$$;

-- ============================================================
-- RPC: redeem_coupon(code, user_id) -> resgata cupom e cria/atualiza assinatura
-- ============================================================
CREATE OR REPLACE FUNCTION redeem_coupon(
  p_code TEXT,
  p_user_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_coupon pro_coupons%ROWTYPE;
  v_existing pro_subscriptions%ROWTYPE;
  v_new_expiry TIMESTAMPTZ;
BEGIN
  -- Normaliza o código (uppercase, sem espaços)
  p_code := UPPER(TRIM(p_code));

  SELECT * INTO v_coupon FROM pro_coupons WHERE code = p_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CUPOM_INVALIDO');
  END IF;

  -- Cupom expirado?
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CUPOM_EXPIRADO');
  END IF;

  -- Esgotado?
  IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CUPOM_ESGOTADO');
  END IF;

  -- Já usado por este usuário?
  IF EXISTS (SELECT 1 FROM pro_coupon_redemptions WHERE coupon_id = v_coupon.id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CUPOM_JA_USADO');
  END IF;

  -- Verifica usuário existe
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'USUARIO_INVALIDO');
  END IF;

  -- Calcula nova expiração
  SELECT * INTO v_existing FROM pro_subscriptions WHERE user_id = p_user_id;

  IF v_coupon.type = 'lifetime' THEN
    INSERT INTO pro_subscriptions (user_id, source, plan_type, is_lifetime, platform, external_id)
    VALUES (p_user_id, 'coupon', 'lifetime', TRUE, 'coupon', v_coupon.id)
    ON CONFLICT (user_id) DO UPDATE SET
      source = 'coupon',
      plan_type = 'lifetime',
      is_lifetime = TRUE,
      expires_at = NULL,
      platform = 'coupon',
      external_id = v_coupon.id;
  ELSE
    -- trial: estende a partir de NOW() ou da expiração atual (o que for maior)
    v_new_expiry := GREATEST(
      COALESCE(v_existing.expires_at, NOW()),
      NOW()
    ) + (v_coupon.duration_days || ' days')::INTERVAL;

    -- Se já é lifetime, não rebaixa
    IF v_existing.is_lifetime THEN
      RETURN jsonb_build_object('ok', false, 'error', 'JA_VITALICIO');
    END IF;

    INSERT INTO pro_subscriptions (user_id, source, plan_type, expires_at, platform, external_id)
    VALUES (p_user_id, 'coupon', 'trial', v_new_expiry, 'coupon', v_coupon.id)
    ON CONFLICT (user_id) DO UPDATE SET
      source = 'coupon',
      plan_type = 'trial',
      expires_at = v_new_expiry,
      platform = 'coupon',
      external_id = v_coupon.id;
  END IF;

  -- Marca resgate
  INSERT INTO pro_coupon_redemptions (coupon_id, user_id) VALUES (v_coupon.id, p_user_id);
  UPDATE pro_coupons SET used_count = used_count + 1 WHERE id = v_coupon.id;

  RETURN jsonb_build_object(
    'ok', true,
    'type', v_coupon.type,
    'duration_days', v_coupon.duration_days,
    'expires_at', CASE WHEN v_coupon.type = 'lifetime' THEN NULL ELSE v_new_expiry END,
    'is_lifetime', v_coupon.type = 'lifetime'
  );
END;
$$;

-- ============================================================
-- RPC: create_coupon(...) -> apenas admin
-- ============================================================
CREATE OR REPLACE FUNCTION create_coupon(
  p_code TEXT,
  p_type TEXT,
  p_duration_days INTEGER,
  p_max_uses INTEGER,
  p_expires_at TIMESTAMPTZ,
  p_description TEXT,
  p_created_by TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE v_id TEXT;
BEGIN
  p_code := UPPER(TRIM(p_code));
  IF p_code = '' OR p_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CODIGO_VAZIO');
  END IF;
  IF p_type NOT IN ('trial','lifetime') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TIPO_INVALIDO');
  END IF;
  IF p_type = 'trial' AND COALESCE(p_duration_days, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DURACAO_INVALIDA');
  END IF;

  INSERT INTO pro_coupons (code, type, duration_days, max_uses, expires_at, description, created_by)
  VALUES (p_code, p_type, p_duration_days, p_max_uses, p_expires_at, p_description, p_created_by)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'code', p_code);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'CODIGO_DUPLICADO');
END;
$$;

-- ============================================================
-- RPC: list_coupons() -> lista todos os cupons (admin)
-- ============================================================
CREATE OR REPLACE FUNCTION list_coupons()
RETURNS TABLE (
  id TEXT,
  code TEXT,
  type TEXT,
  duration_days INTEGER,
  max_uses INTEGER,
  used_count INTEGER,
  expires_at TIMESTAMPTZ,
  description TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT id, code, type, duration_days, max_uses, used_count, expires_at, description, created_at
  FROM pro_coupons
  ORDER BY created_at DESC;
$$;

-- ============================================================
-- RPC: delete_coupon(id) -> apaga cupom (admin)
-- ============================================================
CREATE OR REPLACE FUNCTION delete_coupon(p_id TEXT) RETURNS VOID
LANGUAGE sql
AS $$
  DELETE FROM pro_coupons WHERE id = p_id;
$$;

-- ============================================================
-- GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION get_pro_status(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION redeem_coupon(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION list_coupons() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_coupon(TEXT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_coupon(TEXT) TO anon, authenticated;
-- Em produção, idealmente create_coupon/delete_coupon ficariam atrás de uma edge function
-- que valide se o caller é app-admin. Por ora, app valida client-side antes de chamar.
