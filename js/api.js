// ========== SUPABASE API LAYER ==========
// Usa @supabase/supabase-js via CDN (carregado no index.html)

let _supabaseClient;

function initSupabase() {
  if (!_supabaseClient) {
    // CDN UMD expõe window.supabase com createClient dentro
    const lib = window.supabase;
    if (!lib) { console.error('Supabase SDK não carregou'); return null; }
    const createFn = lib.createClient || (lib.supabase && lib.supabase.createClient);
    if (!createFn) { console.error('createClient não encontrado no SDK'); return null; }
    _supabaseClient = createFn(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabaseClient;
}

// ===== PLAYERS =====
async function apiGetPlayers() {
  const { data, error } = await initSupabase().from('players').select('*').order('name');
  if (error) throw error;
  return data.map(p => ({ ...p, isAdmin: p.is_admin, cleanSheets: p.clean_sheets }));
}

async function apiGetPlayerById(id) {
  const { data, error } = await initSupabase().from('players').select('*').eq('id', id).single();
  if (error) throw error;
  return { ...data, isAdmin: data.is_admin, cleanSheets: data.clean_sheets, password: data.password };
}

async function apiCreatePlayer(player) {
  const id = player.id || generateId();
  const { data, error } = await initSupabase().from('players').insert({
    id, name: player.name, phone: player.phone,
    position: player.position || 'Meia',
    is_admin: player.isAdmin || false,
    password: player.password || null
  }).select().single();
  if (error) throw error;
  return { ...data, isAdmin: data.is_admin, cleanSheets: data.clean_sheets, password: data.password };
}

async function apiUpdatePlayer(id, fields) {
  const mapped = {};
  if (fields.name !== undefined) mapped.name = fields.name;
  if (fields.phone !== undefined) mapped.phone = fields.phone;
  if (fields.position !== undefined) mapped.position = fields.position;
  if (fields.goals !== undefined) mapped.goals = fields.goals;
  if (fields.assists !== undefined) mapped.assists = fields.assists;
  if (fields.tackles !== undefined) mapped.tackles = fields.tackles;
  if (fields.fouls !== undefined) mapped.fouls = fields.fouls;
  if (fields.yellows !== undefined) mapped.yellows = fields.yellows;
  if (fields.reds !== undefined) mapped.reds = fields.reds;
  if (fields.saves !== undefined) mapped.saves = fields.saves;
  if (fields.cleanSheets !== undefined) mapped.clean_sheets = fields.cleanSheets;
  if (fields.matches !== undefined) mapped.matches = fields.matches;
  if (fields.blocked !== undefined) mapped.blocked = fields.blocked;
  if (fields.isAdmin !== undefined) mapped.is_admin = fields.isAdmin;
  if (fields.password !== undefined) mapped.password = fields.password;

  const { data, error } = await initSupabase().from('players').update(mapped).eq('id', id).select().single();
  if (error) throw error;
  return { ...data, isAdmin: data.is_admin, cleanSheets: data.clean_sheets };
}

async function apiGetPlayerByPhone(phone) {
  const { data } = await initSupabase().from('players').select('*').eq('phone', phone).maybeSingle();
  if (!data) return null;
  return { ...data, isAdmin: data.is_admin, cleanSheets: data.clean_sheets, password: data.password };
}

async function apiLogin(phone) {
  return apiGetPlayerByPhone(phone);
}

// ===== RACHAOS =====
async function apiGetRachaos() {
  const { data, error } = await initSupabase().from('rachaos').select('*').eq('status', 'active').order('name');
  if (error) throw error;

  const { data: parts } = await initSupabase().from('rachao_participants').select('rachao_id, player_id');
  const partMap = {};
  (parts || []).forEach(p => {
    if (!partMap[p.rachao_id]) partMap[p.rachao_id] = [];
    partMap[p.rachao_id].push(p.player_id);
  });

  return data.map(r => ({
    ...r,
    dayOfWeek: r.day_of_week,
    playersPerTeam: r.players_per_team,
    tieRule: r.tie_rule,
    monthlyVenueCost: r.monthly_venue_cost,
    pixKey: r.pix_key,
    createdBy: r.created_by,
    participants: partMap[r.id] || []
  }));
}

async function apiGetRachaoById(id) {
  const { data, error } = await initSupabase().from('rachaos').select('*').eq('id', id).single();
  if (error) throw error;
  const { data: parts } = await initSupabase().from('rachao_participants').select('player_id').eq('rachao_id', id);
  return {
    ...data,
    dayOfWeek: data.day_of_week,
    playersPerTeam: data.players_per_team,
    tieRule: data.tie_rule,
    monthlyVenueCost: data.monthly_venue_cost,
    pixKey: data.pix_key,
    createdBy: data.created_by,
    participants: (parts || []).map(p => p.player_id)
  };
}

async function apiGetRachaoByCode(code) {
  const { data } = await initSupabase().from('rachaos').select('*').eq('code', code.toUpperCase()).maybeSingle();
  if (!data) return null;
  const { data: parts } = await initSupabase().from('rachao_participants').select('player_id').eq('rachao_id', data.id);
  return {
    ...data,
    dayOfWeek: data.day_of_week,
    playersPerTeam: data.players_per_team,
    tieRule: data.tie_rule,
    monthlyVenueCost: data.monthly_venue_cost,
    pixKey: data.pix_key,
    createdBy: data.created_by,
    participants: (parts || []).map(p => p.player_id)
  };
}

async function apiCreateRachao(rachao) {
  const id = rachao.id || generateId();
  const { data, error } = await initSupabase().from('rachaos').insert({
    id, code: rachao.code, name: rachao.name, location: rachao.location,
    day_of_week: rachao.dayOfWeek, time: rachao.time,
    players_per_team: rachao.playersPerTeam || 5,
    tie_rule: rachao.tieRule || 'playing_leaves',
    monthly_venue_cost: rachao.monthlyVenueCost || 0,
    pix_key: rachao.pixKey || '',
    created_by: rachao.createdBy, status: 'active'
  }).select().single();
  if (error) throw error;

  // Add participants
  if (rachao.participants && rachao.participants.length > 0) {
    const rows = rachao.participants.map(pid => ({ rachao_id: id, player_id: pid }));
    await initSupabase().from('rachao_participants').upsert(rows);
  }

  return { id: data.id, code: data.code };
}

async function apiUpdateRachao(id, fields) {
  const mapped = {};
  if (fields.name !== undefined) mapped.name = fields.name;
  if (fields.location !== undefined) mapped.location = fields.location;
  if (fields.dayOfWeek !== undefined) mapped.day_of_week = fields.dayOfWeek;
  if (fields.time !== undefined) mapped.time = fields.time;
  if (fields.playersPerTeam !== undefined) mapped.players_per_team = fields.playersPerTeam;
  if (fields.tieRule !== undefined) mapped.tie_rule = fields.tieRule;
  if (fields.monthlyVenueCost !== undefined) mapped.monthly_venue_cost = fields.monthlyVenueCost;
  if (fields.pixKey !== undefined) mapped.pix_key = fields.pixKey;
  if (fields.status !== undefined) mapped.status = fields.status;

  if (Object.keys(mapped).length > 0) {
    await initSupabase().from('rachaos').update(mapped).eq('id', id);
  }
  if (fields.participants) {
    await initSupabase().from('rachao_participants').delete().eq('rachao_id', id);
    const rows = fields.participants.map(pid => ({ rachao_id: id, player_id: pid }));
    await initSupabase().from('rachao_participants').upsert(rows);
  }
}

async function apiJoinRachao(rachaoId, playerId) {
  await initSupabase().from('rachao_participants').upsert({ rachao_id: rachaoId, player_id: playerId });
}

// ===== SESSIONS =====
async function apiGetSessions(rachaoId) {
  let query = initSupabase().from('sessions').select('*').order('date', { ascending: false });
  if (rachaoId) query = query.eq('rachao_id', rachaoId);
  const { data, error } = await query;
  if (error) throw error;

  const sessionIds = data.map(s => s.id);
  const { data: confs } = await initSupabase().from('session_confirmations').select('*').in('session_id', sessionIds).order('position');

  return data.map(s => {
    const sConfs = (confs || []).filter(c => c.session_id === s.id);
    return {
      id: s.id, rachaoId: s.rachao_id, date: s.date, status: s.status,
      confirmed: sConfs.filter(c => c.type === 'confirmed').map(c => c.player_id),
      waiting: sConfs.filter(c => c.type === 'waiting').map(c => c.player_id),
      teams: s.teams, leftover: s.leftover || []
    };
  });
}

async function apiGetSessionById(id) {
  const { data, error } = await initSupabase().from('sessions').select('*').eq('id', id).single();
  if (error) throw error;
  const { data: confs } = await initSupabase().from('session_confirmations').select('*').eq('session_id', id).order('position');
  return {
    id: data.id, rachaoId: data.rachao_id, date: data.date, status: data.status,
    confirmed: (confs || []).filter(c => c.type === 'confirmed').map(c => c.player_id),
    waiting: (confs || []).filter(c => c.type === 'waiting').map(c => c.player_id),
    teams: data.teams, leftover: data.leftover || []
  };
}

async function apiCreateSession(session) {
  const id = session.id || generateId();
  const { data, error } = await initSupabase().from('sessions').insert({
    id, rachao_id: session.rachaoId, date: session.date, status: 'open'
  }).select().single();
  if (error) throw error;
  return { id: data.id };
}

async function apiUpdateSession(id, fields) {
  const mapped = {};
  if (fields.status) mapped.status = fields.status;
  if (fields.teams !== undefined) mapped.teams = fields.teams;
  if (fields.leftover !== undefined) mapped.leftover = fields.leftover;

  if (Object.keys(mapped).length > 0) {
    await initSupabase().from('sessions').update(mapped).eq('id', id);
  }

  if (fields.confirmed !== undefined || fields.waiting !== undefined) {
    await initSupabase().from('session_confirmations').delete().eq('session_id', id);
    const rows = [];
    if (fields.confirmed) fields.confirmed.forEach((pid, i) => rows.push({ session_id: id, player_id: pid, type: 'confirmed', position: i }));
    if (fields.waiting) fields.waiting.forEach((pid, i) => rows.push({ session_id: id, player_id: pid, type: 'waiting', position: i }));
    if (rows.length > 0) await initSupabase().from('session_confirmations').insert(rows);
  }
}

async function apiTogglePresence(sessionId, playerId, action) {
  if (action === 'confirm') {
    const { data: maxPos } = await initSupabase().from('session_confirmations')
      .select('position').eq('session_id', sessionId).eq('type', 'confirmed')
      .order('position', { ascending: false }).limit(1);
    const pos = (maxPos && maxPos.length > 0) ? maxPos[0].position + 1 : 0;
    await initSupabase().from('session_confirmations').upsert({
      session_id: sessionId, player_id: playerId, type: 'confirmed', position: pos
    });
  } else if (action === 'cancel') {
    await initSupabase().from('session_confirmations').delete()
      .eq('session_id', sessionId).eq('player_id', playerId);

    // Promote from waiting list (non-blocked player)
    const { data: waiting } = await initSupabase().from('session_confirmations')
      .select('player_id').eq('session_id', sessionId).eq('type', 'waiting')
      .order('position').limit(10);

    if (waiting && waiting.length > 0) {
      for (const w of waiting) {
        const { data: player } = await initSupabase().from('players')
          .select('blocked').eq('id', w.player_id).single();
        if (!player || !player.blocked) {
          await initSupabase().from('session_confirmations')
            .update({ type: 'confirmed' })
            .eq('session_id', sessionId).eq('player_id', w.player_id);
          break;
        }
      }
    }
  } else if (action === 'wait') {
    const { data: maxPos } = await initSupabase().from('session_confirmations')
      .select('position').eq('session_id', sessionId).eq('type', 'waiting')
      .order('position', { ascending: false }).limit(1);
    const pos = (maxPos && maxPos.length > 0) ? maxPos[0].position + 1 : 0;
    await initSupabase().from('session_confirmations').upsert({
      session_id: sessionId, player_id: playerId, type: 'waiting', position: pos
    });
  }
}

// ===== BILLING =====
async function apiGetBilling(rachaoId, month) {
  const { data } = await initSupabase().from('monthly_billing').select('*')
    .eq('rachao_id', rachaoId).eq('month', month).maybeSingle();
  if (!data) return null;
  const { data: payments } = await initSupabase().from('billing_payments').select('*').eq('billing_id', data.id);
  return { ...data, rachaoId: data.rachao_id, perPerson: data.per_person, totalCost: data.total_cost, payments: payments || [] };
}

async function apiCreateBilling(billing) {
  const id = billing.id || generateId();
  const { error } = await initSupabase().from('monthly_billing').insert({
    id, rachao_id: billing.rachaoId, month: billing.month,
    total_cost: billing.totalCost, participant_count: billing.participantCount,
    per_person: billing.perPerson
  });
  if (error && error.code !== '23505') throw error; // ignore duplicate

  if (billing.payments && billing.payments.length > 0) {
    const rows = billing.payments.map(p => ({
      billing_id: id, player_id: p.playerId, status: p.status || 'pending', paid_at: p.paidAt || null
    }));
    await initSupabase().from('billing_payments').upsert(rows);
  }
  return { id };
}

async function apiConfirmPayment(billingId, playerId, status) {
  await initSupabase().from('billing_payments').update({
    status: status || 'paid',
    paid_at: status === 'paid' ? new Date().toISOString() : null
  }).eq('billing_id', billingId).eq('player_id', playerId);
}

// ===== STATS =====
async function apiGetPendingStats() {
  const { data } = await initSupabase().from('pending_stats').select('*')
    .eq('validated', false).order('created_at', { ascending: false });
  return (data || []).map(s => ({
    ...s, isGoalkeeper: s.is_goalkeeper, sessionId: s.session_id,
    rachaoId: s.rachao_id, playerId: s.player_id,
    saves: s.saves_count, goalsConceded: s.goals_conceded, cleanSheet: s.clean_sheet
  }));
}

async function apiGetValidatedStats() {
  const { data } = await initSupabase().from('validated_stats').select('*').order('validated_at', { ascending: false });
  return (data || []).map(s => ({
    ...s, isGoalkeeper: s.is_goalkeeper, sessionId: s.session_id,
    rachaoId: s.rachao_id, playerId: s.player_id,
    saves: s.saves_count, goalsConceded: s.goals_conceded, cleanSheet: s.clean_sheet
  }));
}

async function apiSubmitStats(stats) {
  const arr = Array.isArray(stats) ? stats : [stats];
  const rows = arr.map(s => ({
    id: s.id || generateId(),
    session_id: s.sessionId, rachao_id: s.rachaoId, player_id: s.playerId,
    is_goalkeeper: s.isGoalkeeper || false,
    goals: s.goals || 0, assists: s.assists || 0, tackles: s.tackles || 0,
    fouls: s.fouls || 0, yellows: s.yellows || 0, reds: s.reds || 0,
    saves_count: s.saves || 0, goals_conceded: s.goalsConceded || 0,
    clean_sheet: s.cleanSheet || 0
  }));
  await initSupabase().from('pending_stats').insert(rows);
  return { count: rows.length };
}

async function apiValidateStat(statId, approved) {
  await initSupabase().rpc('validate_stat', { p_stat_id: statId, p_approved: approved });
}

// ===== FANTASY =====
async function apiGetFantasyTeams(rachaoId, userId) {
  let query = initSupabase().from('fantasy_teams').select('*');
  if (rachaoId) query = query.eq('rachao_id', rachaoId);
  if (userId) query = query.eq('user_id', userId);
  const { data } = await query;
  return (data || []).map(t => ({ ...t, rachaoId: t.rachao_id, userId: t.user_id, slots: t.slots || {} }));
}

async function apiSaveFantasyTeam(team) {
  await initSupabase().from('fantasy_teams').upsert({
    user_id: team.userId, rachao_id: team.rachaoId,
    name: team.name, slots: team.slots, saved_at: new Date().toISOString()
  });
}

async function apiGetFantasyScores(rachaoId) {
  let query = initSupabase().from('fantasy_scores').select('*');
  if (rachaoId) query = query.eq('rachao_id', rachaoId);
  const { data } = await query;
  return (data || []).map(s => ({ ...s, rachaoId: s.rachao_id, userId: s.user_id }));
}

async function apiUpdateFantasyScore(score) {
  await initSupabase().rpc('upsert_fantasy_score', {
    p_user_id: score.userId, p_rachao_id: score.rachaoId,
    p_name: score.name, p_points: score.points,
    p_monthly: score.monthly, p_daily: score.daily
  });
}

// ===== ROTATION =====
async function apiGetRotationState() {
  const { data } = await initSupabase().from('rotation_state').select('state').eq('id', 1).single();
  return data ? data.state : null;
}

async function apiSaveRotationState(state) {
  await initSupabase().from('rotation_state').update({ state }).eq('id', 1);
}

// ===== BLOCKED / RELEASE =====
async function apiGetBlockedPlayers() {
  const { data } = await initSupabase().from('blocked_players').select('player_id');
  return (data || []).map(b => b.player_id);
}

async function apiBlockPlayer(playerId) {
  await initSupabase().from('blocked_players').upsert({ player_id: playerId });
  await initSupabase().from('players').update({ blocked: true }).eq('id', playerId);
}

async function apiUnblockPlayer(playerId) {
  await initSupabase().from('blocked_players').delete().eq('player_id', playerId);
  await initSupabase().from('players').update({ blocked: false }).eq('id', playerId);
}

async function apiGetReleaseRequests() {
  const { data } = await initSupabase().from('release_requests').select('*').order('created_at', { ascending: false });
  return (data || []).map(r => ({ ...r, playerId: r.player_id, timestamp: r.created_at }));
}

async function apiCreateReleaseRequest(playerId, message) {
  const existing = await initSupabase().from('release_requests').select('id').eq('player_id', playerId).maybeSingle();
  if (existing.data) throw new Error('Pedido já enviado');
  await initSupabase().from('release_requests').insert({ player_id: playerId, message: message || '' });
}

async function apiDeleteReleaseRequest(id) {
  await initSupabase().from('release_requests').delete().eq('id', id);
}

// ===== PRIZES =====
async function apiGetPrizes() {
  const { data } = await initSupabase().from('prizes').select('*').eq('id', 1).single();
  return data || { first: 'Isenção de mensalidade', second: '50% de desconto', third: 'Escolhe o time' };
}

async function apiSavePrizes(prizes) {
  await initSupabase().from('prizes').update({ first: prizes.first, second: prizes.second, third: prizes.third }).eq('id', 1);
}

// ===== NOTIFICATIONS =====
async function apiGetNotifications() {
  const { data } = await initSupabase().from('notifications').select('*').order('timestamp', { ascending: false }).limit(50);
  return data || [];
}

async function apiAddNotification(notif) {
  await initSupabase().from('notifications').insert({
    type: notif.type, icon: notif.icon, title: notif.title, text: notif.text
  });
}

// ===== CURRENT USER (sessão local) =====
function apiGetCurrentUser() {
  try { return JSON.parse(localStorage.getItem('rachao_currentUser')); } catch { return null; }
}

function apiSetCurrentUser(user) {
  localStorage.setItem('rachao_currentUser', JSON.stringify(user));
}

function apiLogout() {
  localStorage.removeItem('rachao_currentUser');
}

// ===== SEED (via Supabase, verificar se tem dados) =====
async function apiSeedDemo() {
  const { count } = await initSupabase().from('players').select('*', { count: 'exact', head: true });
  if (count > 0) return { message: 'Banco já possui dados' };
  // Seed é feito via SQL no Supabase Dashboard
  return { message: 'Execute supabase/seed.sql no SQL Editor do Supabase' };
}
