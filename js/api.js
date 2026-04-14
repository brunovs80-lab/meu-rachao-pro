// ========== API LAYER ==========
// Substitui localStorage por chamadas REST ao backend
// Todas as funções retornam Promises

const API_BASE = window.location.origin + '/api';

async function apiFetch(path, options = {}) {
  const url = API_BASE + path;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options
  };
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }
  const res = await fetch(url, config);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Erro na API');
  }
  return res.json();
}

// ===== PLAYERS =====
async function apiGetPlayers() {
  return apiFetch('/players');
}

async function apiGetPlayerById(id) {
  return apiFetch('/players/' + id);
}

async function apiCreatePlayer(player) {
  return apiFetch('/players', { method: 'POST', body: player });
}

async function apiUpdatePlayer(id, data) {
  return apiFetch('/players/' + id, { method: 'PUT', body: data });
}

async function apiGetPlayerByPhone(phone) {
  return apiFetch('/players/phone/' + phone).catch(() => null);
}

// ===== RACHAOS =====
async function apiGetRachaos() {
  return apiFetch('/rachaos');
}

async function apiGetRachaoById(id) {
  return apiFetch('/rachaos/' + id);
}

async function apiGetRachaoByCode(code) {
  return apiFetch('/rachaos/code/' + code).catch(() => null);
}

async function apiCreateRachao(rachao) {
  return apiFetch('/rachaos', { method: 'POST', body: rachao });
}

async function apiUpdateRachao(id, data) {
  return apiFetch('/rachaos/' + id, { method: 'PUT', body: data });
}

async function apiJoinRachao(rachaoId, playerId) {
  return apiFetch('/rachaos/' + rachaoId + '/join', { method: 'POST', body: { playerId } });
}

// ===== SESSIONS =====
async function apiGetSessions(rachaoId) {
  const query = rachaoId ? '?rachaoId=' + rachaoId : '';
  return apiFetch('/sessions' + query);
}

async function apiGetSessionById(id) {
  return apiFetch('/sessions/' + id);
}

async function apiCreateSession(session) {
  return apiFetch('/sessions', { method: 'POST', body: session });
}

async function apiUpdateSession(id, data) {
  return apiFetch('/sessions/' + id, { method: 'PUT', body: data });
}

async function apiTogglePresence(sessionId, playerId, action) {
  return apiFetch('/sessions/' + sessionId + '/presence', {
    method: 'POST', body: { playerId, action }
  });
}

// ===== BILLING =====
async function apiGetBilling(rachaoId, month) {
  let query = '';
  if (rachaoId && month) query = '?rachaoId=' + rachaoId + '&month=' + month;
  return apiFetch('/billing' + query);
}

async function apiCreateBilling(billing) {
  return apiFetch('/billing', { method: 'POST', body: billing });
}

async function apiConfirmPayment(billingId, playerId, status) {
  return apiFetch('/billing/' + billingId + '/pay', {
    method: 'PUT', body: { playerId, status: status || 'paid' }
  });
}

// ===== STATS =====
async function apiGetPendingStats() {
  return apiFetch('/stats/pending');
}

async function apiGetValidatedStats() {
  return apiFetch('/stats/validated');
}

async function apiSubmitStats(stats) {
  return apiFetch('/stats/pending', { method: 'POST', body: stats });
}

async function apiValidateStat(statId, approved) {
  return apiFetch('/stats/' + statId + '/validate', {
    method: 'POST', body: { approved }
  });
}

// ===== FANTASY =====
async function apiGetFantasyTeams(rachaoId, userId) {
  let query = '';
  if (rachaoId) query += '?rachaoId=' + rachaoId;
  if (userId) query += (query ? '&' : '?') + 'userId=' + userId;
  return apiFetch('/fantasy/teams' + query);
}

async function apiSaveFantasyTeam(team) {
  return apiFetch('/fantasy/teams', { method: 'POST', body: team });
}

async function apiGetFantasyScores(rachaoId) {
  const query = rachaoId ? '?rachaoId=' + rachaoId : '';
  return apiFetch('/fantasy/scores' + query);
}

async function apiUpdateFantasyScore(score) {
  return apiFetch('/fantasy/scores', { method: 'POST', body: score });
}

// ===== ROTATION =====
async function apiGetRotationState() {
  return apiFetch('/rotation');
}

async function apiSaveRotationState(state) {
  return apiFetch('/rotation', { method: 'PUT', body: state });
}

// ===== BLOCKED / RELEASE =====
async function apiGetBlockedPlayers() {
  return apiFetch('/blocked');
}

async function apiBlockPlayer(playerId) {
  return apiFetch('/blocked/' + playerId, { method: 'POST' });
}

async function apiUnblockPlayer(playerId) {
  return apiFetch('/blocked/' + playerId, { method: 'DELETE' });
}

async function apiGetReleaseRequests() {
  return apiFetch('/release-requests');
}

async function apiCreateReleaseRequest(playerId, message) {
  return apiFetch('/release-requests', { method: 'POST', body: { playerId, message } });
}

async function apiDeleteReleaseRequest(id) {
  return apiFetch('/release-requests/' + id, { method: 'DELETE' });
}

// ===== PRIZES =====
async function apiGetPrizes() {
  return apiFetch('/prizes');
}

async function apiSavePrizes(prizes) {
  return apiFetch('/prizes', { method: 'PUT', body: prizes });
}

// ===== NOTIFICATIONS =====
async function apiGetNotifications() {
  return apiFetch('/notifications');
}

async function apiAddNotification(notif) {
  return apiFetch('/notifications', { method: 'POST', body: notif });
}

// ===== AUTH =====
async function apiLogin(phone) {
  return apiFetch('/auth/login', { method: 'POST', body: { phone } }).catch(() => null);
}

// ===== MIGRATION =====
async function apiMigrateFromLocalStorage() {
  const DB = {
    get(key) { try { return JSON.parse(localStorage.getItem('rachao_' + key)); } catch { return null; } }
  };

  const data = {
    players: DB.get('players') || [],
    rachaos: DB.get('rachaos') || [],
    sessions: DB.get('sessions') || [],
    monthlyBilling: DB.get('monthlyBilling') || [],
    pendingStats: DB.get('pendingStats') || [],
    validatedStats: DB.get('validatedStats') || [],
    fantasyTeams: DB.get('fantasyTeams') || [],
    fantasyScores: DB.get('fantasyScores') || [],
    rotationState: DB.get('rotationState') || null,
    blockedPlayers: DB.get('blockedPlayers') || [],
    releaseRequests: DB.get('releaseRequests') || [],
    prizes: DB.get('prizes') || null,
    notifications: DB.get('notifications') || []
  };

  const hasData = data.players.length > 0 || data.rachaos.length > 0;
  if (!hasData) return { migrated: false, message: 'Nenhum dado no localStorage' };

  await apiFetch('/migrate', { method: 'POST', body: data });
  return { migrated: true, message: 'Dados migrados com sucesso' };
}

async function apiSeedDemo() {
  return apiFetch('/seed', { method: 'POST' });
}

// ===== CURRENT USER (mantém em localStorage como sessão) =====
function apiGetCurrentUser() {
  try { return JSON.parse(localStorage.getItem('rachao_currentUser')); } catch { return null; }
}

function apiSetCurrentUser(user) {
  localStorage.setItem('rachao_currentUser', JSON.stringify(user));
}

function apiLogout() {
  localStorage.removeItem('rachao_currentUser');
}
