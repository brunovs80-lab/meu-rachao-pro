const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'rachao.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    -- Jogadores
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
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
      blocked INTEGER DEFAULT 0,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Rachoes (grupos permanentes)
    CREATE TABLE IF NOT EXISTS rachaos (
      id TEXT PRIMARY KEY,
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
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Participantes do rachao (N:N)
    CREATE TABLE IF NOT EXISTS rachao_participants (
      rachao_id TEXT NOT NULL REFERENCES rachaos(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (rachao_id, player_id)
    );

    -- Sessoes (dias de jogo)
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      rachao_id TEXT NOT NULL REFERENCES rachaos(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      teams TEXT,
      leftover TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Confirmacoes de presenca
    CREATE TABLE IF NOT EXISTS session_confirmations (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      type TEXT CHECK(type IN ('confirmed', 'waiting')) DEFAULT 'confirmed',
      position INTEGER DEFAULT 0,
      confirmed_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (session_id, player_id)
    );

    -- Cobranca mensal
    CREATE TABLE IF NOT EXISTS monthly_billing (
      id TEXT PRIMARY KEY,
      rachao_id TEXT NOT NULL REFERENCES rachaos(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      total_cost REAL DEFAULT 0,
      participant_count INTEGER DEFAULT 0,
      per_person REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(rachao_id, month)
    );

    -- Pagamentos
    CREATE TABLE IF NOT EXISTS billing_payments (
      billing_id TEXT NOT NULL REFERENCES monthly_billing(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending',
      paid_at TEXT,
      PRIMARY KEY (billing_id, player_id)
    );

    -- Stats pendentes (anti-fraude)
    CREATE TABLE IF NOT EXISTS pending_stats (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES sessions(id),
      rachao_id TEXT REFERENCES rachaos(id),
      player_id TEXT NOT NULL REFERENCES players(id),
      is_goalkeeper INTEGER DEFAULT 0,
      goals INTEGER DEFAULT 0,
      assists INTEGER DEFAULT 0,
      tackles INTEGER DEFAULT 0,
      fouls INTEGER DEFAULT 0,
      yellows INTEGER DEFAULT 0,
      reds INTEGER DEFAULT 0,
      saves_count INTEGER DEFAULT 0,
      goals_conceded INTEGER DEFAULT 0,
      clean_sheet INTEGER DEFAULT 0,
      validated INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Stats validadas
    CREATE TABLE IF NOT EXISTS validated_stats (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES sessions(id),
      rachao_id TEXT REFERENCES rachaos(id),
      player_id TEXT NOT NULL REFERENCES players(id),
      is_goalkeeper INTEGER DEFAULT 0,
      goals INTEGER DEFAULT 0,
      assists INTEGER DEFAULT 0,
      tackles INTEGER DEFAULT 0,
      fouls INTEGER DEFAULT 0,
      yellows INTEGER DEFAULT 0,
      reds INTEGER DEFAULT 0,
      saves_count INTEGER DEFAULT 0,
      goals_conceded INTEGER DEFAULT 0,
      clean_sheet INTEGER DEFAULT 0,
      validated_at TEXT DEFAULT (datetime('now'))
    );

    -- Fantasy teams
    CREATE TABLE IF NOT EXISTS fantasy_teams (
      user_id TEXT NOT NULL REFERENCES players(id),
      rachao_id TEXT NOT NULL REFERENCES rachaos(id),
      name TEXT,
      slots TEXT,
      saved_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, rachao_id)
    );

    -- Fantasy scores
    CREATE TABLE IF NOT EXISTS fantasy_scores (
      user_id TEXT NOT NULL REFERENCES players(id),
      rachao_id TEXT NOT NULL REFERENCES rachaos(id),
      name TEXT,
      points REAL DEFAULT 0,
      monthly REAL DEFAULT 0,
      daily REAL DEFAULT 0,
      PRIMARY KEY (user_id, rachao_id)
    );

    -- Estado de rotacao (JSON complexo, 1 registro)
    CREATE TABLE IF NOT EXISTS rotation_state (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      state TEXT
    );

    -- Jogadores bloqueados
    CREATE TABLE IF NOT EXISTS blocked_players (
      player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      blocked_at TEXT DEFAULT (datetime('now'))
    );

    -- Pedidos de liberacao
    CREATE TABLE IF NOT EXISTS release_requests (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id),
      message TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Premios
    CREATE TABLE IF NOT EXISTS prizes (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      first TEXT DEFAULT 'Isencao de mensalidade',
      second TEXT DEFAULT '50% de desconto na proxima',
      third TEXT DEFAULT 'Escolhe o time no sorteio',
      type TEXT DEFAULT 'exemption'
    );

    -- Notificacoes
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT,
      icon TEXT,
      title TEXT,
      text TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    -- Indices para performance
    CREATE INDEX IF NOT EXISTS idx_rachao_participants_player ON rachao_participants(player_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_rachao ON sessions(rachao_id);
    CREATE INDEX IF NOT EXISTS idx_session_conf_session ON session_confirmations(session_id);
    CREATE INDEX IF NOT EXISTS idx_billing_rachao_month ON monthly_billing(rachao_id, month);
    CREATE INDEX IF NOT EXISTS idx_pending_stats_player ON pending_stats(player_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_ts ON notifications(timestamp DESC);
  `);

  // Garantir registro de premios e rotacao existem
  db.prepare(`INSERT OR IGNORE INTO prizes (id, first, second, third) VALUES (1, 'Isencao de mensalidade', '50% de desconto na proxima', 'Escolhe o time no sorteio')`).run();
  db.prepare(`INSERT OR IGNORE INTO rotation_state (id, state) VALUES (1, NULL)`).run();
}

function closeDb() {
  if (db) { db.close(); db = null; }
}

module.exports = { getDb, closeDb, DB_PATH };
