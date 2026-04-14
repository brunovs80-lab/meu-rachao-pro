const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb, closeDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// Helper: gerar ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ===================== PLAYERS =====================

app.get('/api/players', (req, res) => {
  const db = getDb();
  const players = db.prepare('SELECT * FROM players ORDER BY name').all();
  res.json(players.map(p => ({ ...p, blocked: !!p.blocked, isAdmin: !!p.is_admin })));
});

app.get('/api/players/:id', (req, res) => {
  const db = getDb();
  const p = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Jogador nao encontrado' });
  res.json({ ...p, blocked: !!p.blocked, isAdmin: !!p.is_admin });
});

app.post('/api/players', (req, res) => {
  const db = getDb();
  const { id, name, phone, position, isAdmin } = req.body;
  const playerId = id || generateId();
  db.prepare(`INSERT INTO players (id, name, phone, position, is_admin) VALUES (?, ?, ?, ?, ?)`)
    .run(playerId, name, phone, position || 'Meia', isAdmin ? 1 : 0);
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
  res.status(201).json({ ...player, blocked: !!player.blocked, isAdmin: !!player.is_admin });
});

app.put('/api/players/:id', (req, res) => {
  const db = getDb();
  const fields = req.body;
  const sets = [];
  const vals = [];
  const fieldMap = {
    name: 'name', phone: 'phone', position: 'position',
    goals: 'goals', assists: 'assists', tackles: 'tackles',
    fouls: 'fouls', yellows: 'yellows', reds: 'reds',
    saves: 'saves', cleanSheets: 'clean_sheets', matches: 'matches',
    blocked: 'blocked', isAdmin: 'is_admin'
  };
  for (const [key, col] of Object.entries(fieldMap)) {
    if (fields[key] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(key === 'blocked' || key === 'isAdmin' ? (fields[key] ? 1 : 0) : fields[key]);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
  vals.push(req.params.id);
  db.prepare(`UPDATE players SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const p = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  res.json({ ...p, blocked: !!p.blocked, isAdmin: !!p.is_admin });
});

app.get('/api/players/phone/:phone', (req, res) => {
  const db = getDb();
  const p = db.prepare('SELECT * FROM players WHERE phone = ?').get(req.params.phone);
  if (!p) return res.status(404).json({ error: 'Nao encontrado' });
  res.json({ ...p, blocked: !!p.blocked, isAdmin: !!p.is_admin });
});

// ===================== RACHAOS =====================

app.get('/api/rachaos', (req, res) => {
  const db = getDb();
  const rachaos = db.prepare('SELECT * FROM rachaos WHERE status = ? ORDER BY name').all('active');
  const result = rachaos.map(r => {
    const participants = db.prepare('SELECT player_id FROM rachao_participants WHERE rachao_id = ?').all(r.id).map(p => p.player_id);
    return {
      ...r,
      dayOfWeek: r.day_of_week,
      playersPerTeam: r.players_per_team,
      tieRule: r.tie_rule,
      monthlyVenueCost: r.monthly_venue_cost,
      pixKey: r.pix_key,
      createdBy: r.created_by,
      participants
    };
  });
  res.json(result);
});

app.get('/api/rachaos/:id', (req, res) => {
  const db = getDb();
  const r = db.prepare('SELECT * FROM rachaos WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rachao nao encontrado' });
  const participants = db.prepare('SELECT player_id FROM rachao_participants WHERE rachao_id = ?').all(r.id).map(p => p.player_id);
  res.json({
    ...r,
    dayOfWeek: r.day_of_week,
    playersPerTeam: r.players_per_team,
    tieRule: r.tie_rule,
    monthlyVenueCost: r.monthly_venue_cost,
    pixKey: r.pix_key,
    createdBy: r.created_by,
    participants
  });
});

app.get('/api/rachaos/code/:code', (req, res) => {
  const db = getDb();
  const r = db.prepare('SELECT * FROM rachaos WHERE code = ?').get(req.params.code.toUpperCase());
  if (!r) return res.status(404).json({ error: 'Codigo nao encontrado' });
  const participants = db.prepare('SELECT player_id FROM rachao_participants WHERE rachao_id = ?').all(r.id).map(p => p.player_id);
  res.json({
    ...r,
    dayOfWeek: r.day_of_week,
    playersPerTeam: r.players_per_team,
    tieRule: r.tie_rule,
    monthlyVenueCost: r.monthly_venue_cost,
    pixKey: r.pix_key,
    createdBy: r.created_by,
    participants
  });
});

app.post('/api/rachaos', (req, res) => {
  const db = getDb();
  const { id, code, name, location, dayOfWeek, time, playersPerTeam, tieRule, monthlyVenueCost, pixKey, createdBy, participants } = req.body;
  const rachaoId = id || generateId();

  db.prepare(`INSERT INTO rachaos (id, code, name, location, day_of_week, time, players_per_team, tie_rule, monthly_venue_cost, pix_key, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(rachaoId, code, name, location, dayOfWeek, time, playersPerTeam || 5, tieRule || 'playing_leaves', monthlyVenueCost || 0, pixKey || '', createdBy);

  const addParticipant = db.prepare('INSERT OR IGNORE INTO rachao_participants (rachao_id, player_id) VALUES (?, ?)');
  if (participants && participants.length > 0) {
    for (const pid of participants) addParticipant.run(rachaoId, pid);
  } else if (createdBy) {
    addParticipant.run(rachaoId, createdBy);
  }

  res.status(201).json({ id: rachaoId, code });
});

app.put('/api/rachaos/:id', (req, res) => {
  const db = getDb();
  const fields = req.body;
  const fieldMap = {
    name: 'name', location: 'location', dayOfWeek: 'day_of_week',
    time: 'time', playersPerTeam: 'players_per_team', tieRule: 'tie_rule',
    monthlyVenueCost: 'monthly_venue_cost', pixKey: 'pix_key', status: 'status'
  };
  const sets = [];
  const vals = [];
  for (const [key, col] of Object.entries(fieldMap)) {
    if (fields[key] !== undefined) { sets.push(`${col} = ?`); vals.push(fields[key]); }
  }
  if (sets.length > 0) {
    vals.push(req.params.id);
    db.prepare(`UPDATE rachaos SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  // Update participants
  if (fields.participants) {
    db.prepare('DELETE FROM rachao_participants WHERE rachao_id = ?').run(req.params.id);
    const ins = db.prepare('INSERT INTO rachao_participants (rachao_id, player_id) VALUES (?, ?)');
    for (const pid of fields.participants) ins.run(req.params.id, pid);
  }

  res.json({ ok: true });
});

// Join rachao
app.post('/api/rachaos/:id/join', (req, res) => {
  const db = getDb();
  const { playerId } = req.body;
  db.prepare('INSERT OR IGNORE INTO rachao_participants (rachao_id, player_id) VALUES (?, ?)').run(req.params.id, playerId);
  res.json({ ok: true });
});

// ===================== SESSIONS =====================

app.get('/api/sessions', (req, res) => {
  const db = getDb();
  const { rachaoId } = req.query;
  let sessions;
  if (rachaoId) {
    sessions = db.prepare('SELECT * FROM sessions WHERE rachao_id = ? ORDER BY date DESC').all(rachaoId);
  } else {
    sessions = db.prepare('SELECT * FROM sessions ORDER BY date DESC').all();
  }

  const result = sessions.map(s => {
    const confs = db.prepare("SELECT player_id FROM session_confirmations WHERE session_id = ? AND type = 'confirmed' ORDER BY position").all(s.id);
    const waits = db.prepare("SELECT player_id FROM session_confirmations WHERE session_id = ? AND type = 'waiting' ORDER BY position").all(s.id);
    return {
      id: s.id,
      rachaoId: s.rachao_id,
      date: s.date,
      status: s.status,
      confirmed: confs.map(c => c.player_id),
      waiting: waits.map(w => w.player_id),
      teams: s.teams ? JSON.parse(s.teams) : null,
      leftover: s.leftover ? JSON.parse(s.leftover) : []
    };
  });
  res.json(result);
});

app.get('/api/sessions/:id', (req, res) => {
  const db = getDb();
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Sessao nao encontrada' });
  const confs = db.prepare("SELECT player_id FROM session_confirmations WHERE session_id = ? AND type = 'confirmed' ORDER BY position").all(s.id);
  const waits = db.prepare("SELECT player_id FROM session_confirmations WHERE session_id = ? AND type = 'waiting' ORDER BY position").all(s.id);
  res.json({
    id: s.id, rachaoId: s.rachao_id, date: s.date, status: s.status,
    confirmed: confs.map(c => c.player_id),
    waiting: waits.map(w => w.player_id),
    teams: s.teams ? JSON.parse(s.teams) : null,
    leftover: s.leftover ? JSON.parse(s.leftover) : []
  });
});

app.post('/api/sessions', (req, res) => {
  const db = getDb();
  const { id, rachaoId, date } = req.body;
  const sessionId = id || generateId();
  db.prepare('INSERT INTO sessions (id, rachao_id, date) VALUES (?, ?, ?)').run(sessionId, rachaoId, date);
  res.status(201).json({ id: sessionId });
});

app.put('/api/sessions/:id', (req, res) => {
  const db = getDb();
  const { status, teams, leftover, confirmed, waiting } = req.body;

  if (status) db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, req.params.id);
  if (teams !== undefined) db.prepare('UPDATE sessions SET teams = ? WHERE id = ?').run(teams ? JSON.stringify(teams) : null, req.params.id);
  if (leftover !== undefined) db.prepare('UPDATE sessions SET leftover = ? WHERE id = ?').run(JSON.stringify(leftover), req.params.id);

  // Sync confirmations
  if (confirmed !== undefined || waiting !== undefined) {
    db.prepare('DELETE FROM session_confirmations WHERE session_id = ?').run(req.params.id);
    const ins = db.prepare('INSERT INTO session_confirmations (session_id, player_id, type, position) VALUES (?, ?, ?, ?)');
    if (confirmed) confirmed.forEach((pid, i) => ins.run(req.params.id, pid, 'confirmed', i));
    if (waiting) waiting.forEach((pid, i) => ins.run(req.params.id, pid, 'waiting', i));
  }

  res.json({ ok: true });
});

// Confirm/cancel presence
app.post('/api/sessions/:id/presence', (req, res) => {
  const db = getDb();
  const { playerId, action } = req.body; // action: 'confirm' | 'cancel'
  const sessionId = req.params.id;

  if (action === 'confirm') {
    const maxPos = db.prepare("SELECT MAX(position) as m FROM session_confirmations WHERE session_id = ? AND type = 'confirmed'").get(sessionId);
    db.prepare('INSERT OR REPLACE INTO session_confirmations (session_id, player_id, type, position) VALUES (?, ?, ?, ?)')
      .run(sessionId, playerId, 'confirmed', (maxPos?.m ?? -1) + 1);
  } else if (action === 'cancel') {
    db.prepare('DELETE FROM session_confirmations WHERE session_id = ? AND player_id = ?').run(sessionId, playerId);
    // Promote from waiting
    const next = db.prepare(`
      SELECT sc.player_id FROM session_confirmations sc
      LEFT JOIN players p ON p.id = sc.player_id
      WHERE sc.session_id = ? AND sc.type = 'waiting' AND (p.blocked = 0 OR p.blocked IS NULL)
      ORDER BY sc.position LIMIT 1
    `).get(sessionId);
    if (next) {
      db.prepare("UPDATE session_confirmations SET type = 'confirmed' WHERE session_id = ? AND player_id = ?")
        .run(sessionId, next.player_id);
    }
  } else if (action === 'wait') {
    const maxPos = db.prepare("SELECT MAX(position) as m FROM session_confirmations WHERE session_id = ? AND type = 'waiting'").get(sessionId);
    db.prepare('INSERT OR REPLACE INTO session_confirmations (session_id, player_id, type, position) VALUES (?, ?, ?, ?)')
      .run(sessionId, playerId, 'waiting', (maxPos?.m ?? -1) + 1);
  }

  // Return updated state
  const confs = db.prepare("SELECT player_id FROM session_confirmations WHERE session_id = ? AND type = 'confirmed' ORDER BY position").all(sessionId);
  const waits = db.prepare("SELECT player_id FROM session_confirmations WHERE session_id = ? AND type = 'waiting' ORDER BY position").all(sessionId);
  res.json({ confirmed: confs.map(c => c.player_id), waiting: waits.map(w => w.player_id) });
});

// ===================== MONTHLY BILLING =====================

app.get('/api/billing', (req, res) => {
  const db = getDb();
  const { rachaoId, month } = req.query;
  let billing;
  if (rachaoId && month) {
    billing = db.prepare('SELECT * FROM monthly_billing WHERE rachao_id = ? AND month = ?').get(rachaoId, month);
    if (!billing) return res.json(null);
    billing.payments = db.prepare('SELECT * FROM billing_payments WHERE billing_id = ?').all(billing.id);
  } else {
    const rows = db.prepare('SELECT * FROM monthly_billing ORDER BY month DESC').all();
    billing = rows.map(b => {
      b.payments = db.prepare('SELECT * FROM billing_payments WHERE billing_id = ?').all(b.id);
      return b;
    });
  }
  res.json(billing);
});

app.post('/api/billing', (req, res) => {
  const db = getDb();
  const { id, rachaoId, month, totalCost, participantCount, perPerson, payments } = req.body;
  const billingId = id || generateId();

  db.prepare(`INSERT OR IGNORE INTO monthly_billing (id, rachao_id, month, total_cost, participant_count, per_person)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(billingId, rachaoId, month, totalCost, participantCount, perPerson);

  if (payments && payments.length > 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO billing_payments (billing_id, player_id, status, paid_at) VALUES (?, ?, ?, ?)');
    for (const p of payments) ins.run(billingId, p.playerId, p.status || 'pending', p.paidAt || null);
  }

  res.status(201).json({ id: billingId });
});

app.put('/api/billing/:id/pay', (req, res) => {
  const db = getDb();
  const { playerId, status } = req.body;
  const paidAt = status === 'paid' ? new Date().toISOString() : null;
  db.prepare('UPDATE billing_payments SET status = ?, paid_at = ? WHERE billing_id = ? AND player_id = ?')
    .run(status, paidAt, req.params.id, playerId);
  res.json({ ok: true });
});

// ===================== STATS =====================

app.get('/api/stats/pending', (req, res) => {
  const db = getDb();
  const stats = db.prepare('SELECT * FROM pending_stats WHERE validated = 0 ORDER BY created_at DESC').all();
  res.json(stats.map(s => ({
    ...s,
    isGoalkeeper: !!s.is_goalkeeper,
    sessionId: s.session_id,
    rachaoId: s.rachao_id,
    playerId: s.player_id,
    saves: s.saves_count,
    goalsConceded: s.goals_conceded,
    cleanSheet: s.clean_sheet
  })));
});

app.get('/api/stats/validated', (req, res) => {
  const db = getDb();
  const stats = db.prepare('SELECT * FROM validated_stats ORDER BY validated_at DESC').all();
  res.json(stats.map(s => ({
    ...s,
    isGoalkeeper: !!s.is_goalkeeper,
    sessionId: s.session_id,
    rachaoId: s.rachao_id,
    playerId: s.player_id,
    saves: s.saves_count,
    goalsConceded: s.goals_conceded,
    cleanSheet: s.clean_sheet
  })));
});

app.post('/api/stats/pending', (req, res) => {
  const db = getDb();
  const stats = Array.isArray(req.body) ? req.body : [req.body];
  const ins = db.prepare(`INSERT INTO pending_stats (id, session_id, rachao_id, player_id, is_goalkeeper, goals, assists, tackles, fouls, yellows, reds, saves_count, goals_conceded, clean_sheet)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let count = 0;
  for (const s of stats) {
    const statId = s.id || generateId();
    ins.run(statId, s.sessionId, s.rachaoId, s.playerId, s.isGoalkeeper ? 1 : 0, s.goals || 0, s.assists || 0, s.tackles || 0, s.fouls || 0, s.yellows || 0, s.reds || 0, s.saves || 0, s.goalsConceded || 0, s.cleanSheet || 0);
    count++;
  }
  res.status(201).json({ count });
});

app.post('/api/stats/:id/validate', (req, res) => {
  const db = getDb();
  const { approved } = req.body;
  const stat = db.prepare('SELECT * FROM pending_stats WHERE id = ?').get(req.params.id);
  if (!stat) return res.status(404).json({ error: 'Stat nao encontrada' });

  if (approved) {
    // Update player cumulative stats
    if (stat.is_goalkeeper) {
      db.prepare('UPDATE players SET saves = saves + ?, clean_sheets = clean_sheets + ? WHERE id = ?')
        .run(stat.saves_count, stat.clean_sheet, stat.player_id);
    } else {
      db.prepare('UPDATE players SET goals = goals + ?, assists = assists + ?, tackles = tackles + ?, fouls = fouls + ?, yellows = yellows + ?, reds = reds + ? WHERE id = ?')
        .run(stat.goals, stat.assists, stat.tackles, stat.fouls, stat.yellows, stat.reds, stat.player_id);
    }

    // Move to validated
    db.prepare(`INSERT INTO validated_stats (id, session_id, rachao_id, player_id, is_goalkeeper, goals, assists, tackles, fouls, yellows, reds, saves_count, goals_conceded, clean_sheet)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(stat.id, stat.session_id, stat.rachao_id, stat.player_id, stat.is_goalkeeper, stat.goals, stat.assists, stat.tackles, stat.fouls, stat.yellows, stat.reds, stat.saves_count, stat.goals_conceded, stat.clean_sheet);
  }

  db.prepare('DELETE FROM pending_stats WHERE id = ?').run(req.params.id);
  res.json({ ok: true, approved });
});

// ===================== FANTASY =====================

app.get('/api/fantasy/teams', (req, res) => {
  const db = getDb();
  const { rachaoId, userId } = req.query;
  let teams;
  if (rachaoId && userId) {
    const t = db.prepare('SELECT * FROM fantasy_teams WHERE rachao_id = ? AND user_id = ?').get(rachaoId, userId);
    teams = t ? [{ ...t, slots: JSON.parse(t.slots || '{}'), rachaoId: t.rachao_id, userId: t.user_id }] : [];
  } else if (rachaoId) {
    teams = db.prepare('SELECT * FROM fantasy_teams WHERE rachao_id = ?').all(rachaoId);
    teams = teams.map(t => ({ ...t, slots: JSON.parse(t.slots || '{}'), rachaoId: t.rachao_id, userId: t.user_id }));
  } else {
    teams = db.prepare('SELECT * FROM fantasy_teams').all();
    teams = teams.map(t => ({ ...t, slots: JSON.parse(t.slots || '{}'), rachaoId: t.rachao_id, userId: t.user_id }));
  }
  res.json(teams);
});

app.post('/api/fantasy/teams', (req, res) => {
  const db = getDb();
  const { userId, rachaoId, name, slots } = req.body;
  db.prepare(`INSERT OR REPLACE INTO fantasy_teams (user_id, rachao_id, name, slots, saved_at) VALUES (?, ?, ?, ?, datetime('now'))`)
    .run(userId, rachaoId, name, JSON.stringify(slots));
  res.status(201).json({ ok: true });
});

app.get('/api/fantasy/scores', (req, res) => {
  const db = getDb();
  const { rachaoId } = req.query;
  let scores;
  if (rachaoId) {
    scores = db.prepare('SELECT * FROM fantasy_scores WHERE rachao_id = ?').all(rachaoId);
  } else {
    scores = db.prepare('SELECT * FROM fantasy_scores').all();
  }
  res.json(scores.map(s => ({ ...s, rachaoId: s.rachao_id, userId: s.user_id })));
});

app.post('/api/fantasy/scores', (req, res) => {
  const db = getDb();
  const { userId, rachaoId, name, points, monthly, daily } = req.body;
  db.prepare(`INSERT INTO fantasy_scores (user_id, rachao_id, name, points, monthly, daily) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, rachao_id) DO UPDATE SET points = points + ?, monthly = monthly + ?, daily = daily + ?`)
    .run(userId, rachaoId, name, points, monthly, daily, points, monthly, daily);
  res.json({ ok: true });
});

// ===================== ROTATION =====================

app.get('/api/rotation', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT state FROM rotation_state WHERE id = 1').get();
  res.json(row && row.state ? JSON.parse(row.state) : null);
});

app.put('/api/rotation', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE rotation_state SET state = ? WHERE id = 1').run(JSON.stringify(req.body));
  res.json({ ok: true });
});

// ===================== BLOCKED / RELEASE =====================

app.get('/api/blocked', (req, res) => {
  const db = getDb();
  const blocked = db.prepare('SELECT player_id FROM blocked_players').all();
  res.json(blocked.map(b => b.player_id));
});

app.post('/api/blocked/:playerId', (req, res) => {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO blocked_players (player_id) VALUES (?)').run(req.params.playerId);
  db.prepare('UPDATE players SET blocked = 1 WHERE id = ?').run(req.params.playerId);
  res.json({ ok: true });
});

app.delete('/api/blocked/:playerId', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM blocked_players WHERE player_id = ?').run(req.params.playerId);
  db.prepare('UPDATE players SET blocked = 0 WHERE id = ?').run(req.params.playerId);
  res.json({ ok: true });
});

app.get('/api/release-requests', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM release_requests ORDER BY created_at DESC').all()
    .map(r => ({ ...r, playerId: r.player_id, timestamp: r.created_at })));
});

app.post('/api/release-requests', (req, res) => {
  const db = getDb();
  const { playerId, message } = req.body;
  const existing = db.prepare('SELECT id FROM release_requests WHERE player_id = ?').get(playerId);
  if (existing) return res.status(409).json({ error: 'Pedido ja enviado' });
  const id = generateId();
  db.prepare('INSERT INTO release_requests (id, player_id, message) VALUES (?, ?, ?)').run(id, playerId, message || '');
  res.status(201).json({ id });
});

app.delete('/api/release-requests/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM release_requests WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===================== PRIZES =====================

app.get('/api/prizes', (req, res) => {
  const db = getDb();
  const p = db.prepare('SELECT * FROM prizes WHERE id = 1').get();
  res.json(p || { first: 'Isencao de mensalidade', second: '50% de desconto', third: 'Escolhe o time' });
});

app.put('/api/prizes', (req, res) => {
  const db = getDb();
  const { first, second, third } = req.body;
  db.prepare('UPDATE prizes SET first = ?, second = ?, third = ? WHERE id = 1').run(first, second, third);
  res.json({ ok: true });
});

// ===================== NOTIFICATIONS =====================

app.get('/api/notifications', (req, res) => {
  const db = getDb();
  const ns = db.prepare('SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 50').all();
  res.json(ns);
});

app.post('/api/notifications', (req, res) => {
  const db = getDb();
  const { type, icon, title, text } = req.body;
  const id = generateId();
  db.prepare('INSERT INTO notifications (id, type, icon, title, text) VALUES (?, ?, ?, ?, ?)').run(id, type, icon, title, text);

  // Keep only 50
  db.prepare(`DELETE FROM notifications WHERE id NOT IN (SELECT id FROM notifications ORDER BY timestamp DESC LIMIT 50)`).run();
  res.status(201).json({ id });
});

// ===================== AUTH (simple) =====================

app.post('/api/auth/login', (req, res) => {
  const db = getDb();
  const { phone } = req.body;
  const player = db.prepare('SELECT * FROM players WHERE phone = ?').get(phone);
  if (!player) return res.status(404).json({ error: 'Nao encontrado' });
  res.json({ ...player, blocked: !!player.blocked, isAdmin: !!player.is_admin });
});

// ===================== MIGRATION (import from localStorage) =====================

app.post('/api/migrate', (req, res) => {
  const db = getDb();
  const { players, rachaos, sessions, monthlyBilling, pendingStats, validatedStats, fantasyTeams, fantasyScores, rotationState, blockedPlayers, releaseRequests, prizes, notifications } = req.body;

  const run = db.transaction(() => {
    // Players
    if (players && players.length) {
      const ins = db.prepare(`INSERT OR REPLACE INTO players (id, name, phone, position, goals, assists, tackles, fouls, yellows, reds, saves, clean_sheets, matches, blocked, is_admin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const p of players) {
        ins.run(p.id, p.name, p.phone, p.position, p.goals||0, p.assists||0, p.tackles||0, p.fouls||0, p.yellows||0, p.reds||0, p.saves||0, p.cleanSheets||0, p.matches||0, p.blocked?1:0, p.isAdmin?1:0);
      }
    }

    // Rachaos + participants
    if (rachaos && rachaos.length) {
      const insR = db.prepare(`INSERT OR REPLACE INTO rachaos (id, code, name, location, day_of_week, time, players_per_team, tie_rule, monthly_venue_cost, pix_key, created_by, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const insP = db.prepare('INSERT OR IGNORE INTO rachao_participants (rachao_id, player_id) VALUES (?, ?)');
      for (const r of rachaos) {
        insR.run(r.id, r.code, r.name, r.location, r.dayOfWeek, r.time, r.playersPerTeam, r.tieRule, r.monthlyVenueCost, r.pixKey||'', r.createdBy, r.status||'active');
        if (r.participants) for (const pid of r.participants) insP.run(r.id, pid);
      }
    }

    // Sessions + confirmations
    if (sessions && sessions.length) {
      const insS = db.prepare('INSERT OR REPLACE INTO sessions (id, rachao_id, date, status, teams, leftover) VALUES (?, ?, ?, ?, ?, ?)');
      const insC = db.prepare('INSERT OR IGNORE INTO session_confirmations (session_id, player_id, type, position) VALUES (?, ?, ?, ?)');
      for (const s of sessions) {
        insS.run(s.id, s.rachaoId, s.date, s.status||'open', s.teams ? JSON.stringify(s.teams) : null, s.leftover ? JSON.stringify(s.leftover) : '[]');
        if (s.confirmed) s.confirmed.forEach((pid, i) => insC.run(s.id, pid, 'confirmed', i));
        if (s.waiting) s.waiting.forEach((pid, i) => insC.run(s.id, pid, 'waiting', i));
      }
    }

    // Monthly billing
    if (monthlyBilling && monthlyBilling.length) {
      const insB = db.prepare('INSERT OR REPLACE INTO monthly_billing (id, rachao_id, month, total_cost, participant_count, per_person) VALUES (?, ?, ?, ?, ?, ?)');
      const insPay = db.prepare('INSERT OR IGNORE INTO billing_payments (billing_id, player_id, status, paid_at) VALUES (?, ?, ?, ?)');
      for (const b of monthlyBilling) {
        insB.run(b.id, b.rachaoId, b.month, b.totalCost, b.participantCount, b.perPerson);
        if (b.payments) for (const p of b.payments) insPay.run(b.id, p.playerId, p.status||'pending', p.paidAt||null);
      }
    }

    // Stats
    if (pendingStats && pendingStats.length) {
      const ins = db.prepare(`INSERT OR REPLACE INTO pending_stats (id, session_id, rachao_id, player_id, is_goalkeeper, goals, assists, tackles, fouls, yellows, reds, saves_count, goals_conceded, clean_sheet)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const s of pendingStats) ins.run(s.id, s.sessionId, s.rachaoId, s.playerId, s.isGoalkeeper?1:0, s.goals||0, s.assists||0, s.tackles||0, s.fouls||0, s.yellows||0, s.reds||0, s.saves||0, s.goalsConceded||0, s.cleanSheet||0);
    }
    if (validatedStats && validatedStats.length) {
      const ins = db.prepare(`INSERT OR REPLACE INTO validated_stats (id, session_id, rachao_id, player_id, is_goalkeeper, goals, assists, tackles, fouls, yellows, reds, saves_count, goals_conceded, clean_sheet)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const s of validatedStats) ins.run(s.id, s.sessionId, s.rachaoId, s.playerId, s.isGoalkeeper?1:0, s.goals||0, s.assists||0, s.tackles||0, s.fouls||0, s.yellows||0, s.reds||0, s.saves||0, s.goalsConceded||0, s.cleanSheet||0);
    }

    // Fantasy
    if (fantasyTeams && fantasyTeams.length) {
      const ins = db.prepare(`INSERT OR REPLACE INTO fantasy_teams (user_id, rachao_id, name, slots) VALUES (?, ?, ?, ?)`);
      for (const t of fantasyTeams) ins.run(t.userId, t.rachaoId, t.name, JSON.stringify(t.slots));
    }
    if (fantasyScores && fantasyScores.length) {
      const ins = db.prepare(`INSERT OR REPLACE INTO fantasy_scores (user_id, rachao_id, name, points, monthly, daily) VALUES (?, ?, ?, ?, ?, ?)`);
      for (const s of fantasyScores) ins.run(s.userId, s.rachaoId, s.name, s.points||0, s.monthly||0, s.daily||0);
    }

    // Rotation
    if (rotationState) {
      db.prepare('UPDATE rotation_state SET state = ? WHERE id = 1').run(JSON.stringify(rotationState));
    }

    // Blocked
    if (blockedPlayers && blockedPlayers.length) {
      const ins = db.prepare('INSERT OR IGNORE INTO blocked_players (player_id) VALUES (?)');
      for (const pid of blockedPlayers) ins.run(pid);
    }

    // Release requests
    if (releaseRequests && releaseRequests.length) {
      const ins = db.prepare('INSERT OR REPLACE INTO release_requests (id, player_id, message) VALUES (?, ?, ?)');
      for (const r of releaseRequests) ins.run(r.id, r.playerId, r.message||'');
    }

    // Prizes
    if (prizes) {
      db.prepare('UPDATE prizes SET first = ?, second = ?, third = ? WHERE id = 1').run(prizes.first, prizes.second, prizes.third);
    }

    // Notifications
    if (notifications && notifications.length) {
      const ins = db.prepare('INSERT OR REPLACE INTO notifications (id, type, icon, title, text, timestamp) VALUES (?, ?, ?, ?, ?, ?)');
      for (const n of notifications) ins.run(n.id, n.type, n.icon, n.title, n.text, n.timestamp);
    }
  });

  run();
  res.json({ ok: true, message: 'Migracao concluida' });
});

// ===================== SEED DEMO DATA =====================

app.post('/api/seed', (req, res) => {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM players').get();
  if (count.c > 0) return res.json({ message: 'Banco ja possui dados' });

  const run = db.transaction(() => {
    const demoPlayers = [
      ['p1','Carlos Silva','11999990001','Atacante',12,5,3,2,1,0,0,0,8],
      ['p2','Rafael Santos','11999990002','Meia',8,10,6,1,0,0,0,0,10],
      ['p3','Bruno Costa','11999990003','Zagueiro',2,1,15,4,2,0,0,0,9],
      ['p4','Lucas Oliveira','11999990004','Goleiro',0,0,0,0,0,0,35,4,10],
      ['p5','Thiago Almeida','11999990005','Atacante',15,3,2,3,1,0,0,0,10],
      ['p6','Diego Ferreira','11999990006','Volante',3,7,18,2,1,0,0,0,7],
      ['p7','Pedro Souza','11999990007','Meia',6,8,5,1,0,0,0,0,9],
      ['p8','Andre Lima','11999990008','Lateral',1,4,10,2,1,0,0,0,8],
      ['p9','Marcos Pereira','11999990009','Atacante',9,2,1,5,2,1,0,0,6],
      ['p10','Felipe Rocha','11999990010','Goleiro',0,1,0,0,0,0,28,3,10],
      ['p11','Joao Mendes','11999990011','Zagueiro',1,0,12,3,1,0,0,0,5],
      ['p12','Gustavo Nunes','11999990012','Meia',4,6,4,1,0,0,0,0,7],
      ['p13','Leandro Ramos','11999990013','Atacante',7,4,2,2,0,0,0,0,6],
      ['p14','Fabio Martins','11999990014','Volante',2,3,14,3,2,0,0,0,8],
      ['p15','Rodrigo Neves','11999990015','Lateral',0,5,8,1,0,0,0,0,7],
      ['p16','Vinicius Souza','11999990016','Meia',5,9,3,0,0,0,0,0,9],
      ['p17','Henrique Dias','11999990017','Zagueiro',1,0,16,4,3,0,0,0,8],
      ['p18','Matheus Lopes','11999990018','Goleiro',0,0,0,0,0,0,22,2,5],
    ];
    const insP = db.prepare('INSERT INTO players (id, name, phone, position, goals, assists, tackles, fouls, yellows, reds, saves, clean_sheets, matches) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const p of demoPlayers) insP.run(...p);

    // Rachao
    db.prepare(`INSERT INTO rachaos (id, code, name, location, day_of_week, time, players_per_team, tie_rule, monthly_venue_cost, pix_key, created_by)
      VALUES ('r1', 'R4CH40', 'Rachao de Domingo', 'Quadra Society Central', 0, '20:00', 5, 'playing_leaves', 800, '11999990001', 'p1')`).run();

    // Participants
    const insRP = db.prepare('INSERT INTO rachao_participants (rachao_id, player_id) VALUES (?, ?)');
    for (let i = 1; i <= 18; i++) insRP.run('r1', 'p' + i);

    // Session
    const today = new Date();
    const todayDay = today.getDay();
    let diff = 0 - todayDay;
    if (diff <= 0) diff += 7;
    const next = new Date(today);
    next.setDate(today.getDate() + diff);
    const nextSunday = next.toISOString().split('T')[0];

    db.prepare('INSERT INTO sessions (id, rachao_id, date) VALUES (?, ?, ?)').run('s1', 'r1', nextSunday);
    const insC = db.prepare('INSERT INTO session_confirmations (session_id, player_id, type, position) VALUES (?, ?, ?, ?)');
    for (let i = 1; i <= 12; i++) insC.run('s1', 'p' + i, 'confirmed', i - 1);

    // Billing
    const month = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    const perPerson = Math.round(800 / 18 * 100) / 100;
    db.prepare('INSERT INTO monthly_billing (id, rachao_id, month, total_cost, participant_count, per_person) VALUES (?, ?, ?, ?, ?, ?)')
      .run('bill1', 'r1', month, 800, 18, perPerson);
    const insBP = db.prepare('INSERT INTO billing_payments (billing_id, player_id, status, paid_at) VALUES (?, ?, ?, ?)');
    for (let i = 1; i <= 18; i++) {
      insBP.run('bill1', 'p' + i, i <= 10 ? 'paid' : 'pending', i <= 10 ? new Date().toISOString() : null);
    }

    // Fantasy scores
    const insFS = db.prepare('INSERT INTO fantasy_scores (user_id, rachao_id, name, points, monthly, daily) VALUES (?, ?, ?, ?, ?, ?)');
    insFS.run('p1','r1','Carlos Silva',145,85,22);
    insFS.run('p2','r1','Rafael Santos',132,78,18);
    insFS.run('p5','r1','Thiago Almeida',128,90,25);
    insFS.run('p7','r1','Pedro Souza',115,65,15);
    insFS.run('p6','r1','Diego Ferreira',98,55,12);
  });

  run();
  res.json({ ok: true, message: 'Dados demo criados' });
});

// ===================== START =====================

app.listen(PORT, () => {
  getDb(); // Initialize DB on startup
  console.log(`Meu Rachao Pro API rodando em http://localhost:${PORT}`);
  console.log(`Banco de dados: ${require('./db').DB_PATH}`);
});

process.on('SIGINT', () => { closeDb(); process.exit(0); });
process.on('SIGTERM', () => { closeDb(); process.exit(0); });
