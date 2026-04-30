-- ============================================================
-- MEU RACHAO PRO - Catalogo de queries de administracao
--
-- Use estas queries no SQL Editor do Supabase Dashboard pra
-- gerenciamento manual: consultar, limpar, deletar dados.
--
-- ATENCAO: comandos DELETE/UPDATE sao irreversiveis no Supabase.
-- Sempre rode primeiro o SELECT correspondente pra ver o que
-- vai ser afetado, e use BEGIN/COMMIT pra ter chance de ROLLBACK.
-- ============================================================


-- ============================================================
-- CONSULTAS (read-only, sempre seguras)
-- ============================================================

-- Listar todos os usuarios (incluindo soft-deleted)
SELECT id, name, phone, position, is_admin, blocked, deleted_at, created_at
FROM players
ORDER BY created_at DESC;

-- Listar so usuarios ativos (nao deletados)
SELECT id, name, phone, position, is_admin
FROM players
WHERE deleted_at IS NULL
ORDER BY created_at DESC;

-- Listar contas soft-deleted
SELECT id, name, phone, deleted_at,
       AGE(NOW(), deleted_at) AS tempo_desde_exclusao
FROM players
WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC;

-- Buscar usuario por telefone
SELECT * FROM players WHERE phone = '11999990000';

-- Listar rachoes com contagem de participantes
SELECT r.id, r.code, r.name, r.day_of_week, r.time, r.status,
       p.name AS criador,
       COUNT(rp.player_id) AS participantes
FROM rachaos r
LEFT JOIN players p ON p.id = r.created_by
LEFT JOIN rachao_participants rp ON rp.rachao_id = r.id
GROUP BY r.id, p.name
ORDER BY r.created_at DESC;

-- Sessoes em aberto
SELECT s.id, s.date, s.status, r.name AS rachao
FROM sessions s
JOIN rachaos r ON r.id = s.rachao_id
WHERE s.status IN ('open', 'team_drawn', 'in_progress')
ORDER BY s.date DESC;

-- Top 10 jogadores por gols
SELECT name, position, goals, assists, matches
FROM players
WHERE deleted_at IS NULL AND matches > 0
ORDER BY goals DESC
LIMIT 10;

-- Assinaturas Pro ativas
SELECT s.user_id, p.name, p.phone, s.plan_type, s.expires_at, s.is_lifetime, s.platform
FROM pro_subscriptions s
JOIN players p ON p.id = s.user_id
WHERE s.is_lifetime OR s.expires_at > NOW()
ORDER BY s.expires_at DESC NULLS LAST;


-- ============================================================
-- EXCLUIR USUARIO
-- ============================================================

-- Soft-delete por telefone (recomendado, anonimiza e mantem integridade do ranking)
-- Substitua TELEFONE_AQUI e SENHA_DO_USUARIO
SELECT delete_user_account(
  (SELECT id FROM players WHERE phone = 'TELEFONE_AQUI' AND deleted_at IS NULL),
  'SENHA_DO_USUARIO'
);

-- Soft-delete admin (sem precisar da senha — voce executa direto no SQL Editor)
UPDATE players SET
  name = 'Jogador removido',
  phone = NULL,
  password = NULL,
  blocked = TRUE,
  is_admin = FALSE,
  deleted_at = NOW()
WHERE phone = 'TELEFONE_AQUI';

-- Apos o UPDATE acima, limpar dados sensiveis associados:
-- (substitua USER_ID pelo id retornado)
DELETE FROM device_tokens   WHERE player_id = 'USER_ID';
DELETE FROM notifications   WHERE player_id = 'USER_ID';
DELETE FROM rachao_admins   WHERE player_id = 'USER_ID';
DELETE FROM pro_subscriptions WHERE user_id = 'USER_ID';

-- Hard-delete (IRREVERSIVEL, use so pra contas de teste/spam)
-- Falha se for criador de rachoes. Apaga rachoes primeiro:
BEGIN;
  DELETE FROM rachaos WHERE created_by = 'USER_ID';
  DELETE FROM players WHERE id = 'USER_ID';
COMMIT;


-- ============================================================
-- EXCLUIR RACHAO
-- ============================================================

-- Por codigo (CASCADE leva rachao_participants, sessions, rachao_admins)
DELETE FROM rachaos WHERE code = 'DEMOQUINTA';

-- Rachoes inativos ha mais de 90 dias
DELETE FROM rachaos
WHERE status != 'active'
  AND created_at < NOW() - INTERVAL '90 days';

-- Remover um participante especifico
DELETE FROM rachao_participants
WHERE rachao_id = 'RACHAO_ID' AND player_id = 'PLAYER_ID';


-- ============================================================
-- LIMPEZA PERIODICA (housekeeping)
-- ============================================================

-- Notificacoes antigas (> 30 dias)
DELETE FROM notifications
WHERE created_at < NOW() - INTERVAL '30 days';

-- Push tokens orfaos (sem player valido)
DELETE FROM device_tokens
WHERE player_id NOT IN (SELECT id FROM players);

-- PIX transactions antigas e finalizadas (apos 5 anos = retencao fiscal CTN art. 174)
-- LISTAR ANTES DE APAGAR:
SELECT id, billing_id, status, created_at, value
FROM pix_transactions
WHERE created_at < NOW() - INTERVAL '5 years'
  AND status IN ('paid', 'cancelled', 'expired');

-- Pra apagar de fato:
DELETE FROM pix_transactions
WHERE created_at < NOW() - INTERVAL '5 years'
  AND status IN ('paid', 'cancelled', 'expired');

-- Soft-deleted players ha > 6 meses (hard delete completo, libera espaco)
DELETE FROM players
WHERE deleted_at IS NOT NULL
  AND deleted_at < NOW() - INTERVAL '6 months';

-- Sessoes antigas finalizadas (> 1 ano)
DELETE FROM sessions
WHERE status = 'ended'
  AND created_at < NOW() - INTERVAL '1 year';


-- ============================================================
-- LIMPAR DADOS DEMO (a seed que foi criada em 2026-04-30 pra
-- popular a Conta Teste Google que o revisor do Play Console usa)
-- ============================================================

-- Use isso quando substituir as screenshots placeholder por reais
-- e nao precisar mais dos dados demo:

BEGIN;
  -- Rachao demo (CASCADE leva participants, sessions, etc)
  DELETE FROM rachaos WHERE id = 'demorachao_quinta';

  -- Jogadores demo
  DELETE FROM players WHERE id LIKE 'demoplayer_%';

  -- (Opcional) Resetar conta de teste pro estado original
  -- UPDATE players SET name = 'teste', position = 'Atacante' WHERE id = 'bab82c4fa114ce3a';
COMMIT;


-- ============================================================
-- RESET DE STATS DE UM JOGADOR
-- ============================================================

UPDATE players SET
  goals = 0, assists = 0, tackles = 0, fouls = 0,
  yellows = 0, reds = 0, saves = 0, clean_sheets = 0, matches = 0
WHERE id = 'PLAYER_ID';


-- ============================================================
-- PADRAO SEGURO PRA QUALQUER DELETE
-- ============================================================
--
-- Sempre faca em transacao pra poder reverter:
--
-- BEGIN;
--   -- Roda o SELECT primeiro pra confirmar:
--   SELECT count(*) FROM tabela WHERE condicao;
--
--   -- Se ok, o DELETE:
--   DELETE FROM tabela WHERE condicao;
--
--   -- Confere o resultado:
--   SELECT count(*) FROM tabela WHERE condicao;
--
-- -- Se algo errado:
-- -- ROLLBACK;
--
-- -- Se tudo certo:
-- COMMIT;
