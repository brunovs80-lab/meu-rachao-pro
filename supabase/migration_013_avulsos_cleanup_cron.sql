-- ============================================================
-- MEU RACHÃO PRO - Migration 013: Cron pra limpar reservas avulsas vencidas
-- Habilita pg_cron e agenda cleanup_expired_guest_reservations a cada 15min.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove agendamento antigo se existir (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_guest_reservations_15min') THEN
    PERFORM cron.unschedule('cleanup_guest_reservations_15min');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup_guest_reservations_15min',
  '*/15 * * * *',
  $$ SELECT cleanup_expired_guest_reservations(); $$
);
