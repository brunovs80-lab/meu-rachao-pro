-- ============================================================
-- Migration 002: Adicionar campo password na tabela players
-- Execute no SQL Editor do Supabase Dashboard
-- ============================================================

ALTER TABLE players ADD COLUMN IF NOT EXISTS password TEXT;

-- Atualizar senha dos jogadores demo (senha padrão: 123456)
UPDATE players SET password = '123456' WHERE password IS NULL;
