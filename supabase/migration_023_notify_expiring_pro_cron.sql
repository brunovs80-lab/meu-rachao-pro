-- ============================================================
-- Migration 023: Cron diário pra avisar usuários com Pro perto de vencer
-- ============================================================
-- Roda 09:00 BRT (12:00 UTC), chama edge function notify-expiring-pro
-- via pg_net. Edge function se autentica via header x-cron-secret que
-- bate com o env CRON_NOTIFY_SECRET (mesmo valor armazenado no vault).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Cria o secret no vault se ainda não existir.
-- O VALOR é gerado pela aplicação da migration (a primeira vez). Para
-- mudar depois, faça UPDATE em vault.secrets ou DELETE+INSERT.
DO $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_notify_secret') THEN
    -- Gera UUID aleatório como secret inicial
    v_id := vault.create_secret(
      gen_random_uuid()::text,
      'cron_notify_secret',
      'Secret pra cron triggerar notify-expiring-pro edge function'
    );
  END IF;
END $$;

-- ============================================================
-- SQL function chamada pelo cron — usa pg_net pra POST na edge function
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_notify_expiring_pro()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_secret TEXT;
  v_request_id BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_notify_secret';

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'cron_notify_secret nao encontrado no vault';
  END IF;

  SELECT net.http_post(
    url := 'https://ajthlptdgpmbvfxifnon.supabase.co/functions/v1/notify-expiring-pro',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- ============================================================
-- Agenda cron diário às 12:00 UTC (09:00 BRT)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify_expiring_pro_daily') THEN
    PERFORM cron.unschedule('notify_expiring_pro_daily');
  END IF;
END $$;

SELECT cron.schedule(
  'notify_expiring_pro_daily',
  '0 12 * * *',
  $$ SELECT trigger_notify_expiring_pro(); $$
);
