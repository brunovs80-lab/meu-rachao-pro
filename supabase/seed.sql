-- ============================================================
-- SEED DATA - Dados demo para Meu Rachão Pro
-- Execute após o migration.sql
-- ============================================================

-- Jogadores
INSERT INTO players (id, name, phone, position, goals, assists, tackles, fouls, yellows, reds, saves, clean_sheets, matches, password) VALUES
  ('p1','Carlos Silva','11999990001','Atacante',12,5,3,2,1,0,0,0,8,'123456'),
  ('p2','Rafael Santos','11999990002','Meia',8,10,6,1,0,0,0,0,10,'123456'),
  ('p3','Bruno Costa','11999990003','Zagueiro',2,1,15,4,2,0,0,0,9,'123456'),
  ('p4','Lucas Oliveira','11999990004','Goleiro',0,0,0,0,0,0,35,4,10,'123456'),
  ('p5','Thiago Almeida','11999990005','Atacante',15,3,2,3,1,0,0,0,10,'123456'),
  ('p6','Diego Ferreira','11999990006','Volante',3,7,18,2,1,0,0,0,7,'123456'),
  ('p7','Pedro Souza','11999990007','Meia',6,8,5,1,0,0,0,0,9,'123456'),
  ('p8','André Lima','11999990008','Lateral',1,4,10,2,1,0,0,0,8,'123456'),
  ('p9','Marcos Pereira','11999990009','Atacante',9,2,1,5,2,1,0,0,6,'123456'),
  ('p10','Felipe Rocha','11999990010','Goleiro',0,1,0,0,0,0,28,3,10,'123456'),
  ('p11','João Mendes','11999990011','Zagueiro',1,0,12,3,1,0,0,0,5,'123456'),
  ('p12','Gustavo Nunes','11999990012','Meia',4,6,4,1,0,0,0,0,7,'123456'),
  ('p13','Leandro Ramos','11999990013','Atacante',7,4,2,2,0,0,0,0,6,'123456'),
  ('p14','Fábio Martins','11999990014','Volante',2,3,14,3,2,0,0,0,8,'123456'),
  ('p15','Rodrigo Neves','11999990015','Lateral',0,5,8,1,0,0,0,0,7,'123456'),
  ('p16','Vinícius Souza','11999990016','Meia',5,9,3,0,0,0,0,0,9,'123456'),
  ('p17','Henrique Dias','11999990017','Zagueiro',1,0,16,4,3,0,0,0,8,'123456'),
  ('p18','Matheus Lopes','11999990018','Goleiro',0,0,0,0,0,0,22,2,5,'123456')
ON CONFLICT (id) DO NOTHING;

-- Rachão
INSERT INTO rachaos (id, code, name, location, day_of_week, time, players_per_team, tie_rule, monthly_venue_cost, pix_key, created_by)
VALUES ('r1', 'R4CH40', 'Rachão de Domingo', 'Quadra Society Central', 0, '20:00', 5, 'playing_leaves', 800, '11999990001', 'p1')
ON CONFLICT (id) DO NOTHING;

-- Participantes
INSERT INTO rachao_participants (rachao_id, player_id) VALUES
  ('r1','p1'),('r1','p2'),('r1','p3'),('r1','p4'),('r1','p5'),('r1','p6'),
  ('r1','p7'),('r1','p8'),('r1','p9'),('r1','p10'),('r1','p11'),('r1','p12'),
  ('r1','p13'),('r1','p14'),('r1','p15'),('r1','p16'),('r1','p17'),('r1','p18')
ON CONFLICT DO NOTHING;

-- Sessão (próximo domingo)
INSERT INTO sessions (id, rachao_id, date, status)
VALUES ('s1', 'r1', to_char(CURRENT_DATE + ((7 - EXTRACT(DOW FROM CURRENT_DATE)::int) % 7 + 7) % 7 * INTERVAL '1 day', 'YYYY-MM-DD'), 'open')
ON CONFLICT (id) DO NOTHING;

-- Confirmados
INSERT INTO session_confirmations (session_id, player_id, type, position) VALUES
  ('s1','p1','confirmed',0),('s1','p2','confirmed',1),('s1','p3','confirmed',2),
  ('s1','p4','confirmed',3),('s1','p5','confirmed',4),('s1','p6','confirmed',5),
  ('s1','p7','confirmed',6),('s1','p8','confirmed',7),('s1','p9','confirmed',8),
  ('s1','p10','confirmed',9),('s1','p11','confirmed',10),('s1','p12','confirmed',11)
ON CONFLICT DO NOTHING;

-- Billing
INSERT INTO monthly_billing (id, rachao_id, month, total_cost, participant_count, per_person)
VALUES ('bill1', 'r1', to_char(CURRENT_DATE, 'YYYY-MM'), 800, 18, ROUND(800.0/18, 2))
ON CONFLICT DO NOTHING;

INSERT INTO billing_payments (billing_id, player_id, status, paid_at)
SELECT 'bill1', 'p' || i, CASE WHEN i <= 10 THEN 'paid' ELSE 'pending' END, CASE WHEN i <= 10 THEN now() ELSE NULL END
FROM generate_series(1, 18) AS i
ON CONFLICT DO NOTHING;

-- Fantasy scores
INSERT INTO fantasy_scores (user_id, rachao_id, name, points, monthly, daily) VALUES
  ('p1','r1','Carlos Silva',145,85,22),
  ('p2','r1','Rafael Santos',132,78,18),
  ('p5','r1','Thiago Almeida',128,90,25),
  ('p7','r1','Pedro Souza',115,65,15),
  ('p6','r1','Diego Ferreira',98,55,12)
ON CONFLICT DO NOTHING;
