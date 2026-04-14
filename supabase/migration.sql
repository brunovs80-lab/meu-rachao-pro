-- ============================================================
-- MEU RACHÃO PRO - Supabase Migration
-- Execute este SQL no SQL Editor do Supabase Dashboard
-- ============================================================

-- ===== JOGADORES =====
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  position TEXT DEFAULT 'Meia',
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  tackles INTEGER DEFAULT 0,
  fouls INTEGER DEFAULT 0,
  yellows INTEGER DEFAULT 0,
  reds INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  clean_sheets INTEGER DEFAULT 0,
  matches INTEGER DEFAULT 0,
  blocked BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===== RACHÕES (grupos permanentes) =====
CREATE TABLE IF NOT EXISTS rachaos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  day_of_week INTEGER CHECK(day_of_week BETWEEN 0 AND 6),
  time TEXT,
  players_per_team INTEGER DEFAULT 5,
  tie_rule TEXT DEFAULT 'playing_leaves',
  monthly_venue_cost REAL DEFAULT 0,
  pix_key TEXT DEFAULT '',
  created_by TEXT REFERENCES players(id),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===== PARTICIPANTES DO RACHÃO (N:N) =====
CREATE TABLE IF NOT EXISTS rachao_participants (
  rachao_id TEXT NOT NULL REFERENCES rachaos(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (rachao_id, player_id)
);

-- ===== SESSÕES (dias de jogo) =====
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  rachao_id TEXT NOT NULL REFERENCES rachaos(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  teams JSONB,
  leftover JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===== CONFIRMAÇÕES DE PRESENÇA =====
CREATE TABLE IF NOT EXISTS session_confirmations (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  type TEXT CHECK(type IN ('confirmed', 'waiting')) DEFAULT 'confirmed',
  position INTEGER DEFAULT 0,
  confirmed_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (session_id, player_id)
);

-- ===== COBRANÇA MENSAL =====
CREATE TABLE IF NOT EXISTS monthly_billing (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  rachao_id TEXT NOT NULL REFERENCES rachaos(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  total_cost REAL DEFAULT 0,
  participant_count INTEGER DEFAULT 0,
  per_person REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(rachao_id, month)
);

-- ===== PAGAMENTOS =====
CREATE TABLE IF NOT EXISTS billing_payments (
  billing_id TEXT NOT NULL REFERENCES monthly_billing(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  PRIMARY KEY (billing_id, player_id)
);

-- ===== STATS PENDENTES (anti-fraude) =====
CREATE TABLE IF NOT EXISTS pending_stats (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id TEXT REFERENCES sessions(id),
  rachao_id TEXT REFERENCES rachaos(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  is_goalkeeper BOOLEAN DEFAULT FALSE,
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  tackles INTEGER DEFAULT 0,
  fouls INTEGER DEFAULT 0,
  yellows INTEGER DEFAULT 0,
  reds INTEGER DEFAULT 0,
  saves_count INTEGER DEFAULT 0,
  goals_conceded INTEGER DEFAULT 0,
  clean_sheet INTEGER DEFAULT 0,
  validated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===== STATS VALIDADAS =====
CREATE TABLE IF NOT EXISTS validated_stats (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id TEXT REFERENCES sessions(id),
  rachao_id TEXT REFERENCES rachaos(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  is_goalkeeper BOOLEAN DEFAULT FALSE,
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  tackles INTEGER DEFAULT 0,
  fouls INTEGER DEFAULT 0,
  yellows INTEGER DEFAULT 0,
  reds INTEGER DEFAULT 0,
  saves_count INTEGER DEFAULT 0,
  goals_conceded INTEGER DEFAULT 0,
  clean_sheet INTEGER DEFAULT 0,
  validated_at TIMESTAMPTZ DEFAULT now()
);

-- ===== FANTASY TEAMS =====
CREATE TABLE IF NOT EXISTS fantasy_teams (
  user_id TEXT NOT NULL REFERENCES players(id),
  rachao_id TEXT NOT NULL REFERENCES rachaos(id),
  name TEXT,
  slots JSONB DEFAULT '{}'::jsonb,
  saved_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, rachao_id)
);

-- ===== FANTASY SCORES =====
CREATE TABLE IF NOT EXISTS fantasy_scores (
  user_id TEXT NOT NULL REFERENCES players(id),
  rachao_id TEXT NOT NULL REFERENCES rachaos(id),
  name TEXT,
  points REAL DEFAULT 0,
  monthly REAL DEFAULT 0,
  daily REAL DEFAULT 0,
  PRIMARY KEY (user_id, rachao_id)
);

-- ===== ESTADO DE ROTAÇÃO =====
CREATE TABLE IF NOT EXISTS rotation_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  state JSONB
);
INSERT INTO rotation_state (id, state) VALUES (1, NULL) ON CONFLICT DO NOTHING;

-- ===== JOGADORES BLOQUEADOS =====
CREATE TABLE IF NOT EXISTS blocked_players (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  blocked_at TIMESTAMPTZ DEFAULT now()
);

-- ===== PEDIDOS DE LIBERAÇÃO =====
CREATE TABLE IF NOT EXISTS release_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  player_id TEXT NOT NULL REFERENCES players(id),
  message TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===== PRÊMIOS =====
CREATE TABLE IF NOT EXISTS prizes (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  first TEXT DEFAULT 'Isenção de mensalidade',
  second TEXT DEFAULT '50% de desconto na próxima',
  third TEXT DEFAULT 'Escolhe o time no sorteio',
  type TEXT DEFAULT 'exemption'
);
INSERT INTO prizes (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ===== NOTIFICAÇÕES =====
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  player_id TEXT REFERENCES players(id),
  type TEXT,
  icon TEXT,
  title TEXT,
  text TEXT,
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_rachao_participants_player ON rachao_participants(player_id);
CREATE INDEX IF NOT EXISTS idx_sessions_rachao ON sessions(rachao_id);
CREATE INDEX IF NOT EXISTS idx_session_conf_session ON session_confirmations(session_id);
CREATE INDEX IF NOT EXISTS idx_session_conf_type ON session_confirmations(session_id, type);
CREATE INDEX IF NOT EXISTS idx_billing_rachao_month ON monthly_billing(rachao_id, month);
CREATE INDEX IF NOT EXISTS idx_billing_payments_billing ON billing_payments(billing_id);
CREATE INDEX IF NOT EXISTS idx_pending_stats_player ON pending_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_pending_stats_validated ON pending_stats(validated);
CREATE INDEX IF NOT EXISTS idx_notifications_ts ON notifications(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_player ON notifications(player_id);
CREATE INDEX IF NOT EXISTS idx_players_phone ON players(phone);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Permitir acesso público (o app não usa auth do Supabase)
-- ============================================================
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rachaos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rachao_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE validated_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE rotation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies: permitir tudo via anon key (app público)
CREATE POLICY "allow_all" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON rachaos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON rachao_participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON session_confirmations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON monthly_billing FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON billing_payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON pending_stats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON validated_stats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON fantasy_teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON fantasy_scores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON rotation_state FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON blocked_players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON release_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON prizes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON notifications FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- FUNÇÃO: Upsert Fantasy Score (increment)
-- ============================================================
CREATE OR REPLACE FUNCTION upsert_fantasy_score(
  p_user_id TEXT,
  p_rachao_id TEXT,
  p_name TEXT,
  p_points REAL,
  p_monthly REAL,
  p_daily REAL
) RETURNS void AS $$
BEGIN
  INSERT INTO fantasy_scores (user_id, rachao_id, name, points, monthly, daily)
  VALUES (p_user_id, p_rachao_id, p_name, p_points, p_monthly, p_daily)
  ON CONFLICT (user_id, rachao_id)
  DO UPDATE SET
    points = fantasy_scores.points + EXCLUDED.points,
    monthly = fantasy_scores.monthly + EXCLUDED.monthly,
    daily = fantasy_scores.daily + EXCLUDED.daily;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNÇÃO: Validar stat e atualizar jogador
-- ============================================================
CREATE OR REPLACE FUNCTION validate_stat(p_stat_id TEXT, p_approved BOOLEAN)
RETURNS void AS $$
DECLARE
  v_stat pending_stats%ROWTYPE;
BEGIN
  SELECT * INTO v_stat FROM pending_stats WHERE id = p_stat_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_approved THEN
    IF v_stat.is_goalkeeper THEN
      UPDATE players SET
        saves = saves + v_stat.saves_count,
        clean_sheets = clean_sheets + v_stat.clean_sheet
      WHERE id = v_stat.player_id;
    ELSE
      UPDATE players SET
        goals = goals + v_stat.goals,
        assists = assists + v_stat.assists,
        tackles = tackles + v_stat.tackles,
        fouls = fouls + v_stat.fouls,
        yellows = yellows + v_stat.yellows,
        reds = reds + v_stat.reds
      WHERE id = v_stat.player_id;
    END IF;

    INSERT INTO validated_stats (id, session_id, rachao_id, player_id, is_goalkeeper, goals, assists, tackles, fouls, yellows, reds, saves_count, goals_conceded, clean_sheet)
    VALUES (v_stat.id, v_stat.session_id, v_stat.rachao_id, v_stat.player_id, v_stat.is_goalkeeper, v_stat.goals, v_stat.assists, v_stat.tackles, v_stat.fouls, v_stat.yellows, v_stat.reds, v_stat.saves_count, v_stat.goals_conceded, v_stat.clean_sheet);
  END IF;

  DELETE FROM pending_stats WHERE id = p_stat_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- SEED DATA (dados demo - opcional)
-- Execute separadamente se quiser dados de exemplo
-- ============================================================
-- Veja arquivo supabase/seed.sql
