-- ============================================================
-- Migration 020: SECURITY DEFINER em redeem_coupon
-- ============================================================
-- pro_coupons tem RLS ligado sem policy de SELECT. Sem SECURITY DEFINER,
-- a RPC roda como o caller (anon/authenticated) e o SELECT dentro da função
-- não encontra a linha → retorna CUPOM_INVALIDO. Fix: rodar como o owner.
--
-- create_coupon / list_coupons / delete_coupon: idem (efetivamente quebradas
-- para anon, mas o painel admin usa service_role direto na tabela, então
-- não causa problema na prática). Marcadas mesmo assim pra consistência e
-- caso o admin in-app legado seja reativado no futuro.
-- ============================================================

ALTER FUNCTION redeem_coupon(TEXT, TEXT)                                              SECURITY DEFINER SET search_path = public, pg_catalog;
ALTER FUNCTION create_coupon(TEXT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT)   SECURITY DEFINER SET search_path = public, pg_catalog;
ALTER FUNCTION list_coupons()                                                          SECURITY DEFINER SET search_path = public, pg_catalog;
ALTER FUNCTION delete_coupon(TEXT)                                                     SECURITY DEFINER SET search_path = public, pg_catalog;
