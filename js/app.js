// ========== MEU RACHÃO PRO - MAIN APP ==========
// Modules: auth.js, rotation.js, admin.js, fantasy.js

let currentRachaoId = null;
let currentSessionId = null;
let timerInterval = null;
let timerSeconds = 0;
let timerTotalSeconds = 0;
let timerPaused = false;

document.addEventListener('DOMContentLoaded', async () => {
  initPhoneInput();
  initPasswordInputs();
  initTabs();
  initRachaoForm();
  initHistory();
  registerSW();
  initOfflineDetection();
  await checkAuth();
});

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function initOfflineDetection() {
  const update = () => {
    const badge = document.getElementById('offline-badge');
    if (badge) badge.style.display = navigator.onLine ? 'none' : 'inline-flex';
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

async function checkAuth() {
  const user = apiGetCurrentUser();
  if (user) {
    ProManager.syncFromServer(user.id).catch(() => {});
    ProManager.updateProBadgeUI();
    if (window.Billing) Billing.init(user.id).catch(err => console.warn('[Billing] init falhou:', err));
    navigateTo('dashboard');
  } else {
    ProManager.updateProBadgeUI();
  }
}

// Páginas que exigem Pro: page → feature key
const PRO_GATED_PAGES = {
  'fantasy':  'fantasy',
  'payments': 'pagamentos',
  'stats':    'historico-stats',
};

// ===== NAVIGATION WITH HISTORY API =====
function navigateTo(page, pushState) {
  // Gate Pro: redireciona pra paywall se a página for premium e o usuário não tiver Pro
  if (PRO_GATED_PAGES[page] && typeof ProManager !== 'undefined' && !ProManager.isPro()) {
    ProManager.requirePro(PRO_GATED_PAGES[page]);
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) {
    el.classList.add('active');
    window.scrollTo(0, 0);
    if (pushState !== false) {
      history.pushState({ page, rachaoId: currentRachaoId, sessionId: currentSessionId }, '', '#' + page);
    }
    onPageLoad(page);
  }
}

function goBackFrom(page) {
  const user = apiGetCurrentUser();
  if (history.state && history.state.page && history.state.page !== page) {
    history.back();
  } else {
    navigateTo(user ? 'settings' : 'login');
  }
}

function initHistory() {
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.page) {
      currentRachaoId = e.state.rachaoId || null;
      currentSessionId = e.state.sessionId || null;
      navigateTo(e.state.page, false);
    }
  });
  // Set initial state
  const hash = location.hash.replace('#', '');
  if (hash && document.getElementById('page-' + hash)) {
    history.replaceState({ page: hash }, '', '#' + hash);
  }
}

function onPageLoad(page) {
  const handlers = {
    'dashboard': loadDashboard,
    'matches': loadRachaos,
    'match-detail': loadRachaoDetail,
    'payments': loadPayments,
    'stats': loadStats,
    'players': loadPlayers,
    'profile': loadProfile,
    'fantasy': loadFantasy,
    'rotation': loadRotation,
    'admin-stats': loadAdminStats,
    'admin-payments': loadAdminPayments,
    'admin-blocked': loadAdminBlocked,
    'admin-coupons': loadAdminCoupons,
    'register-stats': loadRegisterStats,
    'notifications': loadNotifications,
    'admin': loadAdminBadges,
    'paywall': loadPaywall,
  };
  if (handlers[page]) handlers[page]();
}

// ===== DASHBOARD =====
async function loadDashboard() {
  const user = apiGetCurrentUser();
  if (!user) return;
  document.getElementById('dash-username').textContent = escapeHtml(user.name);

  // Atualiza badges/CTAs Pro (esconde "Torne-se Pro" se já for Pro)
  ProManager.updateProBadgeUI();

  showAdminDashboardAlert();

  showListSkeleton('dash-rachaos-list', 2);
  const rachaos = (await apiGetRachaos()).filter(r => r.status === 'active' && r.participants.includes(user.id));
  const listEl = document.getElementById('dash-rachaos-list');
  const emptyEl = document.getElementById('dash-no-rachao');

  if (rachaos.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
  } else {
    emptyEl.style.display = 'none';
    const sessionsAll = await Promise.all(rachaos.map(r => apiGetSessions(r.id)));
    listEl.innerHTML = rachaos.map((r, idx) => {
      const sessions = sessionsAll[idx].filter(s => s.status === 'open');
      const nextSession = sessions.sort((a,b) => a.date.localeCompare(b.date))[0];
      const nextInfo = nextSession ? `Próximo: ${formatDateBR(nextSession.date)} • ${nextSession.confirmed.length} confirmados` : `Todo ${getDayName(r.dayOfWeek)}`;
      return `<div class="card card-highlight" style="cursor:pointer;margin-bottom:12px" onclick="openRachao('${escapeHtml(r.id)}')">
        <div class="card-badge">${getDayNameShort(r.dayOfWeek)} • ${escapeHtml(r.time)}</div>
        <h3>${escapeHtml(r.name)}</h3>
        <p class="text-muted">${escapeHtml(r.location)} • ${r.participants.length} jogadores</p>
        <p style="font-size:12px;color:var(--orange);margin-top:4px"><i class="fas fa-futbol"></i> ${escapeHtml(nextInfo)}</p>
      </div>`;
    }).join('');
  }
}

function calcPlayerPoints(p) {
  if (p.position === 'Goleiro') {
    return Math.round(((p.saves || 0) * POINTS.goalkeeper.save + (p.cleanSheets || 0) * POINTS.goalkeeper.cleanSheet + (p.matches || 0) * POINTS.goalkeeper.presence) * POINTS.goalkeeper.multiplier);
  }
  return (p.goals || 0) * POINTS.field.goal + (p.assists || 0) * POINTS.field.assist + (p.tackles || 0) * POINTS.field.tackle + (p.matches || 0) * POINTS.field.presence - (p.fouls || 0) * Math.abs(POINTS.field.foul) - (p.yellows || 0) * Math.abs(POINTS.field.yellow) - (p.reds || 0) * Math.abs(POINTS.field.red);
}

// ===== RACHÕES LIST =====
async function loadRachaos() {
  const user = apiGetCurrentUser();
  showListSkeleton('matches-list', 3);
  const rachaos = (await apiGetRachaos()).filter(r => r.participants.includes(user.id) || r.createdBy === user.id);
  const list = document.getElementById('matches-list');
  const empty = document.getElementById('matches-empty');

  if (rachaos.length === 0) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  const sessionsAll = await Promise.all(rachaos.map(r => apiGetSessions(r.id)));
  list.innerHTML = rachaos.map((r, idx) => {
    const memberCount = r.participants.length;
    const openSessions = sessionsAll[idx].filter(s => s.status === 'open').length;
    return `<div class="match-list-item" onclick="openRachao('${escapeHtml(r.id)}')">
      <div class="match-date-box"><span class="day">${getDayNameShort(r.dayOfWeek)}</span><span class="month">${escapeHtml(r.time)}</span></div>
      <div class="match-list-info">
        <h4>${escapeHtml(r.name)}</h4>
        <p>${escapeHtml(r.location)}</p>
        <p>${memberCount} jogadores • <span style="color:var(--orange)">🔑 ${escapeHtml(r.code)}</span></p>
      </div>
      <span class="match-status status-open">${openSessions > 0 ? 'Jogo aberto' : 'Ativo'}</span>
    </div>`;
  }).join('');
}

function openRachao(id) {
  currentRachaoId = id;
  navigateTo('match-detail');
}

// ===== CREATE RACHÃO =====
function generateRachaoCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function initRachaoForm() {
  const playersInput = document.getElementById('rachao-players');
  if (playersInput) playersInput.addEventListener('change', updateTotalPerTeam);
  const btn = document.getElementById('btn-create-rachao');
  if (btn) btn.addEventListener('click', createRachao);
}

function updateTotalPerTeam() {
  const n = parseInt(document.getElementById('rachao-players').value) || 5;
  document.getElementById('total-per-team').textContent = n + 1;
}

// ===== GEOLOCALIZAÇÃO =====
async function getCurrentCoords() {
  const Geo = window.Capacitor?.Plugins?.Geolocation;
  if (Geo) {
    try {
      const perm = await Geo.checkPermissions();
      if (perm.location !== 'granted') {
        const req = await Geo.requestPermissions();
        if (req.location !== 'granted') throw new Error('Permissão de localização negada');
      }
      const pos = await Geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch (err) {
      console.warn('[Geo] Capacitor falhou, tentando navigator:', err.message);
    }
  }
  // Fallback para Web (testes no navegador)
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocalização não disponível neste dispositivo'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => reject(new Error(err.message || 'Erro ao obter localização')),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

async function captureRachaoLocation() {
  const btn = document.getElementById('btn-capture-location');
  const label = document.getElementById('capture-location-label');
  const display = document.getElementById('captured-coords-display');
  try {
    setLoading(btn, true);
    if (label) label.textContent = 'OBTENDO LOCALIZAÇÃO...';
    const { latitude, longitude } = await getCurrentCoords();
    document.getElementById('rachao-lat').value = latitude;
    document.getElementById('rachao-lng').value = longitude;
    if (display) {
      display.textContent = `📍 ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      display.style.display = 'block';
    }
    if (label) label.textContent = 'ATUALIZAR LOCALIZAÇÃO';
    showToast('✅ Localização capturada');
  } catch (err) {
    console.error('[Geo] erro:', err);
    showToast('Não foi possível obter a localização: ' + err.message);
    if (label) label.textContent = 'USAR MINHA LOCALIZAÇÃO ATUAL';
  } finally {
    setLoading(btn, false);
  }
}

async function geocodeRachaoLocation() {
  const btn = document.getElementById('btn-geocode-location');
  const label = document.getElementById('geocode-location-label');
  const display = document.getElementById('captured-coords-display');
  const address = (document.getElementById('rachao-location').value || '').trim();
  if (!address) { showToast('Digite o endereço primeiro'); return; }

  try {
    setLoading(btn, true);
    if (label) label.textContent = 'BUSCANDO...';
    // Nominatim — política de uso: 1 req/seg, sem header User-Agent o navegador adiciona o seu próprio
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(address)}`;
    const resp = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
    if (!resp.ok) throw new Error('Falha na busca (' + resp.status + ')');
    const data = await resp.json();
    if (!data || !data.length) {
      showToast('Endereço não encontrado. Tente algo mais específico (rua, nº, cidade).');
      if (label) label.textContent = 'BUSCAR ENDEREÇO DIGITADO';
      return;
    }
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    document.getElementById('rachao-lat').value = lat;
    document.getElementById('rachao-lng').value = lng;
    if (display) {
      display.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)} (via OSM)`;
      display.style.display = 'block';
    }
    if (label) label.textContent = 'BUSCAR OUTRO ENDEREÇO';
    showToast('✅ Endereço localizado');
  } catch (err) {
    console.error('[Geocode] erro:', err);
    showToast('Erro ao buscar endereço: ' + err.message);
    if (label) label.textContent = 'BUSCAR ENDEREÇO DIGITADO';
  } finally {
    setLoading(btn, false);
  }
}

// Estado do form: null = criando; ID = editando rachão existente
let _editingRachaoId = null;

async function createRachao() {
  const name = document.getElementById('rachao-name').value.trim().substring(0, 60);
  const dayOfWeek = parseInt(document.getElementById('rachao-day').value);
  const time = document.getElementById('rachao-time').value;
  const location = document.getElementById('rachao-location').value.trim().substring(0, 100);
  const players = parseInt(document.getElementById('rachao-players').value);
  const tieRule = document.getElementById('rachao-tie-rule').value;
  const venueCost = parseFloat(document.getElementById('rachao-venue-cost').value) || 0;
  const pix = document.getElementById('rachao-pix').value.trim();

  if (!name || !time || !location) { showToast('Preencha todos os campos'); return; }

  const btn = document.getElementById('btn-create-rachao');
  const lat = parseFloat(document.getElementById('rachao-lat').value || '');
  const lng = parseFloat(document.getElementById('rachao-lng').value || '');
  const latVal = Number.isFinite(lat) ? lat : null;
  const lngVal = Number.isFinite(lng) ? lng : null;

  try {
    setLoading(btn, true);
    const user = apiGetCurrentUser();

    // ===== Modo EDIÇÃO =====
    if (_editingRachaoId) {
      await apiUpdateRachao(_editingRachaoId, {
        name, location, dayOfWeek, time,
        playersPerTeam: players, tieRule,
        monthlyVenueCost: venueCost, pixKey: pix,
        latitude: latVal, longitude: lngVal,
      });
      const editedId = _editingRachaoId;
      _editingRachaoId = null;
      showToast('✅ Rachão atualizado!');
      currentRachaoId = editedId;
      navigateTo('match-detail');
      return;
    }

    // ===== Modo CRIAÇÃO =====
    if (!ProManager.isPro()) {
      const meusAtivos = (await apiGetRachaos()).filter(r => r.createdBy === user.id && r.status === 'active');
      if (meusAtivos.length >= 1) {
        setLoading(btn, false);
        ProManager.requirePro('multi-rachao');
        return;
      }
    }

    const code = generateRachaoCode();
    const result = await apiCreateRachao({
      code, name, location, dayOfWeek, time,
      playersPerTeam: players, tieRule,
      monthlyVenueCost: venueCost, pixKey: pix,
      latitude: latVal, longitude: lngVal,
      createdBy: user.id, participants: [user.id]
    });

    await apiAddNotification({ type:'green', icon:'fa-calendar-plus', title:'Novo rachão!', text: name + ' - ' + getDayName(dayOfWeek) });
    showToast('Rachão criado! Código: ' + code);
    currentRachaoId = result.id;
    navigateTo('match-detail');
  } catch (err) {
    console.error('Erro ao salvar rachão:', err);
    showToast('Erro ao salvar. Tente novamente.');
  } finally {
    setLoading(btn, false);
  }
}

// ===== EDITAR RACHÃO =====
async function abrirEditarRachao() {
  if (!currentRachaoId) return;
  const rachao = await apiGetRachaoById(currentRachaoId);
  if (!rachao) { showToast('Rachão não encontrado'); return; }

  _editingRachaoId = rachao.id;

  // Popula o form
  document.getElementById('rachao-name').value = rachao.name || '';
  document.getElementById('rachao-day').value = rachao.dayOfWeek ?? 0;
  document.getElementById('rachao-time').value = rachao.time || '';
  document.getElementById('rachao-location').value = rachao.location || '';
  document.getElementById('rachao-players').value = rachao.playersPerTeam || 5;
  document.getElementById('rachao-tie-rule').value = rachao.tieRule || 'playing_leaves';
  document.getElementById('rachao-venue-cost').value = rachao.monthlyVenueCost || '';
  document.getElementById('rachao-pix').value = rachao.pixKey || '';
  document.getElementById('rachao-lat').value = rachao.latitude ?? '';
  document.getElementById('rachao-lng').value = rachao.longitude ?? '';
  updateTotalPerTeam();

  // Atualiza UI da tela em modo edição
  document.getElementById('match-create-title').textContent = 'Editar Rachão';
  document.getElementById('btn-create-rachao').textContent = 'SALVAR ALTERAÇÕES';
  document.getElementById('btn-delete-rachao').style.display = 'block';

  const display = document.getElementById('captured-coords-display');
  const label = document.getElementById('capture-location-label');
  if (rachao.latitude != null && rachao.longitude != null) {
    if (display) {
      display.textContent = `📍 ${Number(rachao.latitude).toFixed(5)}, ${Number(rachao.longitude).toFixed(5)}`;
      display.style.display = 'block';
    }
    if (label) label.textContent = 'ATUALIZAR LOCALIZAÇÃO';
  } else {
    if (display) display.style.display = 'none';
    if (label) label.textContent = 'USAR MINHA LOCALIZAÇÃO ATUAL';
  }

  navigateTo('match-create');
}

function resetRachaoFormToCreateMode() {
  _editingRachaoId = null;
  document.getElementById('match-create-title').textContent = 'Novo Rachão';
  document.getElementById('btn-create-rachao').textContent = 'CRIAR RACHÃO';
  document.getElementById('btn-delete-rachao').style.display = 'none';
  ['rachao-name','rachao-time','rachao-location','rachao-venue-cost','rachao-pix','rachao-lat','rachao-lng']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('rachao-players').value = 5;
  document.getElementById('rachao-day').value = 0;
  document.getElementById('rachao-tie-rule').value = 'playing_leaves';
  const display = document.getElementById('captured-coords-display');
  if (display) display.style.display = 'none';
  const label = document.getElementById('capture-location-label');
  if (label) label.textContent = 'USAR MINHA LOCALIZAÇÃO ATUAL';
  updateTotalPerTeam();
}

function iniciarCriarRachao() {
  resetRachaoFormToCreateMode();
  navigateTo('match-create');
}

function cancelEditRachao() {
  if (_editingRachaoId) {
    const id = _editingRachaoId;
    resetRachaoFormToCreateMode();
    currentRachaoId = id;
    navigateTo('match-detail');
  } else {
    navigateTo('matches');
  }
}

async function confirmDeleteRachao() {
  if (!_editingRachaoId) return;
  if (!confirm('Excluir este rachão? Todos os jogos, presenças e estatísticas serão perdidos. Essa ação NÃO pode ser desfeita.')) return;
  try {
    await apiUpdateRachao(_editingRachaoId, { status: 'archived' });
    showToast('Rachão arquivado');
    _editingRachaoId = null;
    navigateTo('dashboard');
  } catch (err) {
    console.error('Erro ao arquivar rachão:', err);
    showToast('Erro ao excluir');
  }
}

function adjustNumber(id, delta) {
  const inp = document.getElementById(id);
  let v = parseInt(inp.value) + delta;
  v = Math.max(parseInt(inp.min), Math.min(parseInt(inp.max), v));
  inp.value = v;
  updateTotalPerTeam();
}

// ===== JOIN RACHÃO =====
async function joinRachaoByCode() {
  const codeInput = document.getElementById('join-code');
  const code = codeInput.value.trim().toUpperCase();
  if (code.length !== 6) { showToast('Digite o código de 6 dígitos'); return; }

  try {
    const rachao = await apiGetRachaoByCode(code);
    if (!rachao) { showToast('Código não encontrado'); return; }
    const user = apiGetCurrentUser();
    if (!user) { showToast('Faça login primeiro'); return; }
    if (rachao.participants.includes(user.id)) {
      showToast('Você já está neste rachão');
      currentRachaoId = rachao.id;
      navigateTo('match-detail');
      return;
    }
    await apiJoinRachao(rachao.id, user.id);
    await apiAddNotification({ type:'green', icon:'fa-right-to-bracket', title:'Entrou no rachão!', text: user.name + ' entrou em ' + rachao.name });
    showToast('Você entrou no rachão!');
    codeInput.value = '';
    currentRachaoId = rachao.id;
    navigateTo('match-detail');
  } catch (err) {
    console.error('Erro ao entrar no rachão:', err);
    showToast('Erro ao entrar no rachão');
  }
}

async function shareRachaoCode() {
  const rachao = await apiGetRachaoById(currentRachaoId);
  if (!rachao) return;
  const text = `⚽ ${rachao.name}\n📅 ${getDayName(rachao.dayOfWeek)} às ${rachao.time}\n📍 ${rachao.location}\n\n🔑 Código: ${rachao.code}\n\nEntre no app Meu Rachão Pro e use o código acima para participar!`;
  if (navigator.share) {
    navigator.share({ title: rachao.name, text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('Código copiado!')).catch(() => showToast('Código: ' + rachao.code));
  }
}

// ===== RACHÃO DETAIL =====
async function loadRachaoDetail() {
  const rachao = await apiGetRachaoById(currentRachaoId);
  if (!rachao) return;
  const user = apiGetCurrentUser();

  document.getElementById('detail-rachao-title').textContent = rachao.name;
  const editBtn = document.getElementById('btn-edit-rachao');
  if (editBtn) editBtn.style.display = (user && rachao.createdBy === user.id) ? '' : 'none';
  document.getElementById('detail-day').textContent = getDayName(rachao.dayOfWeek);
  document.getElementById('detail-time').textContent = rachao.time;
  document.getElementById('detail-location').textContent = rachao.location;
  document.getElementById('detail-members-count').textContent = rachao.participants.length + ' jogadores';
  document.getElementById('detail-rachao-code').textContent = rachao.code;

  await Promise.all([
    loadRachaoGameTab(rachao, user),
    loadRachaoMembersTab(rachao),
    loadRachaoFinanceTab(rachao, user)
  ]);
}

async function loadRachaoGameTab(rachao, user) {
  const sessions = await apiGetSessions(rachao.id);
  const openSession = sessions.filter(s => s.status === 'open').sort((a,b) => a.date.localeCompare(b.date))[0];
  const doneSessions = sessions.filter(s => s.status === 'done').sort((a,b) => b.date.localeCompare(a.date));
  const today = new Date().toISOString().slice(0, 10);
  const recentDone = doneSessions.find(s => s.date === today);
  const currentSession = openSession || recentDone;

  const createBtn = document.getElementById('btn-create-session');
  const activeArea = document.getElementById('session-active-area');

  if (currentSession) {
    currentSessionId = currentSession.id;
    document.getElementById('session-date-display').textContent = formatDateBR(currentSession.date);
    document.getElementById('session-badge').textContent = currentSession.status === 'done' ? 'ENCERRADO' : 'PRÓXIMO JOGO';
    document.getElementById('session-info').textContent = currentSession.confirmed.length + ' confirmados';
    createBtn.style.display = 'none';
    activeArea.style.display = 'block';
    await loadSessionPresence(currentSession, rachao, user);
    loadSessionTeams(currentSession);
  } else {
    currentSessionId = null;
    document.getElementById('session-date-display').textContent = 'Nenhum jogo agendado';
    document.getElementById('session-badge').textContent = getDayNameShort(rachao.dayOfWeek);
    document.getElementById('session-info').textContent = 'Crie um jogo para o próximo ' + getDayName(rachao.dayOfWeek);
    createBtn.style.display = 'block';
    activeArea.style.display = 'none';
  }

  const historyList = document.getElementById('sessions-history-list');
  const historyEmpty = document.getElementById('sessions-history-empty');
  if (doneSessions.length > 0) {
    historyEmpty.style.display = 'none';
    historyList.innerHTML = doneSessions.slice(0, 10).map(s => {
      return `<div class="player-item" style="cursor:default">
        <div class="player-avatar" style="background:var(--text-muted);font-size:11px">${formatDateBR(s.date).substring(0,5)}</div>
        <div class="player-info"><div class="player-name">${formatDateBR(s.date)}</div><div class="player-detail">${s.confirmed.length} jogadores • ${s.teams ? s.teams.length + ' times' : 'Sem sorteio'}</div></div>
        <span class="match-status status-done">Encerrado</span>
      </div>`;
    }).join('');
  } else {
    historyEmpty.style.display = 'block';
    historyList.innerHTML = '';
  }
}

async function loadSessionPresence(session, rachao, user) {
  const teamSize = rachao.playersPerTeam + 1;
  const maxDisplay = rachao.participants.length;
  document.getElementById('confirmed-count').textContent = session.confirmed.length;
  document.getElementById('max-players').textContent = maxDisplay;
  const pct = Math.min(100, (session.confirmed.length / maxDisplay) * 100);
  document.getElementById('confirmed-progress').style.width = pct + '%';

  const playerPromises = session.confirmed.map(pid => apiGetPlayerById(pid).catch(() => null));
  const confirmedPlayers = (await Promise.all(playerPromises)).filter(Boolean);

  document.getElementById('confirmed-list').innerHTML = confirmedPlayers.map(p => {
    const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
    return `<div class="player-item">
      <div class="player-avatar">${ini}</div>
      <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${escapeHtml(p.position)}</div></div>
      <span class="confirmed-badge"><i class="fas fa-check-circle"></i></span>
    </div>`;
  }).join('');

  const waitCard = document.getElementById('waiting-list-card');
  if (session.waiting && session.waiting.length > 0) {
    waitCard.style.display = 'block';
    const waitPlayers = (await Promise.all(session.waiting.map(pid => apiGetPlayerById(pid).catch(() => null)))).filter(Boolean);
    document.getElementById('waiting-list').innerHTML = waitPlayers.map((p, i) => {
      return `<div class="player-item"><div class="player-avatar" style="background:var(--orange)">${i+1}</div>
        <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${escapeHtml(p.position)}</div></div></div>`;
    }).join('');
  } else { waitCard.style.display = 'none'; }

  const btn = document.getElementById('btn-toggle-presence');
  const isParticipant = rachao.participants.includes(user.id);
  const isConf = session.confirmed.includes(user.id);
  const isWait = (session.waiting || []).includes(user.id);

  if (!isParticipant) {
    btn.style.display = 'none';
  } else {
    btn.style.display = 'block';
    if (isConf) {
      btn.textContent = 'CANCELAR PRESENÇA'; btn.className = 'btn-outline';
      btn.style.borderColor = 'var(--red)'; btn.style.color = 'var(--red)';
    } else if (isWait) {
      btn.textContent = 'SAIR DA ESPERA'; btn.className = 'btn-outline';
      btn.style.borderColor = 'var(--orange)'; btn.style.color = 'var(--orange)';
    } else {
      btn.textContent = 'CONFIRMAR PRESENÇA'; btn.className = 'btn-primary';
      btn.style.borderColor = ''; btn.style.color = '';
    }
    btn.onclick = async () => { await togglePresence(); await loadRachaoDetail(); };
  }

  // Avulsos: render config + lista
  await loadGuestsArea(session, rachao, user);
}

// ===== AVULSOS (config admin + lista) =====
async function loadGuestsArea(session, rachao, user) {
  const cfgBtn   = document.getElementById('btn-config-guests');
  const cfgLabel = document.getElementById('btn-config-guests-label');
  const card     = document.getElementById('guests-card');

  const isOwner = user && rachao.createdBy === user.id;
  const canManage = isOwner || await hasRachaoPermission(rachao, user, 'manage_session');

  // Botão admin
  if (cfgBtn) {
    cfgBtn.style.display = canManage ? '' : 'none';
    if (cfgLabel) cfgLabel.textContent = session.allow_guests ? 'EDITAR AVULSOS' : 'LIBERAR AVULSOS';
  }
  // Botão "CANCELAR JOGO" — só admin/co-admin e enquanto sessão estiver aberta
  const cancelBtn = document.getElementById('btn-cancel-session');
  if (cancelBtn) {
    cancelBtn.style.display = (canManage && session.status === 'open') ? '' : 'none';
  }

  // Card de lista
  if (!session.allow_guests) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = 'block';

  const guests = await apiListSessionGuests(session.id).catch(() => []);
  const paid     = guests.filter(g => g.status === 'paid');
  const pending  = guests.filter(g => g.status === 'pending');
  const refunded = guests.filter(g => g.status === 'refunded');

  document.getElementById('guests-paid-count').textContent = paid.length;
  document.getElementById('guests-slots').textContent = session.guest_slots || 0;
  const fee = Number(session.guest_fee || 0);
  document.getElementById('guests-fee-label').textContent = fee > 0 ? `R$ ${fee.toFixed(2).replace('.', ',')} / vaga` : '';

  const renderRow = (g, kind) => {
    const ini = escapeHtml((g.player_name || '?').split(' ').map(w => w[0]).join('').substring(0, 2));
    const valor = `R$ ${Number(g.fee_paid).toFixed(2).replace('.',',')}`;
    let avatarColor = 'var(--orange)';
    let badge = '';
    let detailExtra = '';
    if (kind === 'paid')     badge = '<span class="confirmed-badge"><i class="fas fa-check-circle"></i></span>';
    if (kind === 'pending') {
      avatarColor = 'var(--text-muted)';
      badge = '<span class="text-muted" style="font-size:11px"><i class="fas fa-hourglass-half"></i> Aguardando</span>';
    }
    if (kind === 'refunded') {
      avatarColor = 'var(--red)';
      badge = '<span style="color:var(--red);font-size:11px;font-weight:700"><i class="fas fa-rotate-left"></i> Estorno</span>';
      detailExtra = ' • <span style="color:var(--red)">estornar via MP</span>';
    }
    return `<div class="player-item">
      <div class="player-avatar" style="background:${avatarColor}">${ini}</div>
      <div class="player-info"><div class="player-name">${escapeHtml(g.player_name)}</div>
        <div class="player-detail">${escapeHtml(g.player_position || 'Avulso')} • ${valor}${detailExtra}</div></div>
      ${badge}
    </div>`;
  };

  const sections = [];
  if (paid.length)     sections.push(paid.map(g => renderRow(g, 'paid')).join(''));
  if (pending.length)  sections.push(pending.map(g => renderRow(g, 'pending')).join(''));
  if (refunded.length) sections.push(refunded.map(g => renderRow(g, 'refunded')).join(''));

  document.getElementById('guests-list').innerHTML = sections.length
    ? sections.join('')
    : '<p class="text-muted" style="font-size:12px;padding:8px;text-align:center">Ninguém pagou ainda</p>';
}

async function abrirConfigGuests() {
  if (!ProManager.requirePro('avulsos')) return;
  if (!currentSessionId) { showToast('Crie uma sessão primeiro'); return; }
  const cfg = await apiGetSessionGuestConfig(currentSessionId);
  document.getElementById('guests-allow').checked = !!cfg?.allow_guests;
  document.getElementById('guests-fee').value = cfg?.guest_fee || '';
  document.getElementById('guests-slots-input').value = cfg?.guest_slots || '';

  // Mostra info de quantos já pagaram (não pode reduzir abaixo)
  const guests = await apiListSessionGuests(currentSessionId).catch(() => []);
  const paidCount = guests.filter(g => g.status === 'paid').length;
  const paidInfo = document.getElementById('guests-paid-info');
  if (paidCount > 0) {
    paidInfo.textContent = `${paidCount} avulso(s) já pagou — vagas não podem ser menores que isso.`;
    paidInfo.style.display = 'block';
  } else {
    paidInfo.style.display = 'none';
  }

  document.getElementById('modal-config-guests').style.display = 'flex';
}

function fecharConfigGuests() {
  document.getElementById('modal-config-guests').style.display = 'none';
}

async function salvarConfigGuests() {
  const allow = document.getElementById('guests-allow').checked;
  const fee   = parseFloat(document.getElementById('guests-fee').value || '0');
  const slots = parseInt(document.getElementById('guests-slots-input').value || '0', 10);
  const btn = document.getElementById('btn-save-guests');

  if (allow) {
    if (!(fee > 0)) { showToast('Informe um valor válido'); return; }
    if (!(slots > 0)) { showToast('Informe a quantidade de vagas'); return; }
  }

  try {
    setLoading(btn, true);
    const result = await apiUpdateSessionGuestConfig(currentSessionId, allow, fee, slots);
    if (!result.ok) {
      const msgs = {
        SESSAO_INVALIDA:        'Sessão inválida',
        SEM_PERMISSAO:          'Sem permissão para gerenciar avulsos',
        VALOR_INVALIDO:         'Valor da diária inválido',
        VAGAS_INVALIDAS:        'Quantidade de vagas inválida',
        VAGAS_MENOR_QUE_PAGOS:  `Já há ${result.pagos} avulsos pagos — não pode reduzir vagas abaixo disso.`,
      };
      showToast(msgs[result.error] || result.error || 'Erro ao salvar');
      return;
    }
    showToast(allow ? '✅ Avulsos liberados!' : 'Avulsos desativados');
    fecharConfigGuests();
    await loadRachaoDetail();
  } catch (err) {
    console.error('[Avulsos] salvar falhou:', err);
    showToast('Erro ao salvar');
  } finally {
    setLoading(btn, false);
  }
}

async function loadSessionTeams(session) {
  const regBtn = document.getElementById('btn-register-stats');
  const endBtn = document.getElementById('btn-end-session');
  const sessionDone = session.status === 'done';
  if (regBtn) regBtn.style.display = sessionDone ? '' : 'none';
  if (endBtn) endBtn.style.display = sessionDone ? 'none' : '';

  if (session.teams) {
    document.getElementById('teams-result').style.display = 'block';
    renderAllTeams(session.teams);
    const rotBtn = document.getElementById('btn-start-rotation');
    const rotState = await apiGetRotationState();
    if (rotState && rotState.active && rotState.sessionId === session.id) {
      rotBtn.innerHTML = '<i class="fas fa-play"></i> CONTINUAR PARTIDA';
      rotBtn.onclick = () => navigateTo('rotation');
    } else if (!sessionDone) {
      rotBtn.innerHTML = '<i class="fas fa-play"></i> INICIAR PARTIDA';
      rotBtn.onclick = () => startRotation();
    } else {
      rotBtn.style.display = 'none';
    }
  } else {
    document.getElementById('teams-result').style.display = 'none';
  }
}

async function loadRachaoMembersTab(rachao) {
  const user = apiGetCurrentUser();
  const isOwner = user && rachao.createdBy === user.id;
  document.getElementById('members-total').textContent = rachao.participants.length + ' participantes';

  const [players, coAdmins] = await Promise.all([
    Promise.all(rachao.participants.map(pid => apiGetPlayerById(pid).catch(() => null))).then(arr => arr.filter(Boolean)),
    apiListRachaoAdmins(rachao.id).catch(() => []),
  ]);
  const coAdminMap = Object.fromEntries(coAdmins.map(c => [c.playerId, c]));

  document.getElementById('rachao-members-list').innerHTML = players.map(p => {
    const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
    const isCreator = p.id === rachao.createdBy;
    const isCoAdmin = !!coAdminMap[p.id];
    let badge = '';
    if (isCreator) badge = '<span class="member-badge admin">ADMIN</span>';
    else if (isCoAdmin) badge = '<span class="member-badge coadmin">CO-ADMIN</span>';

    const manageBtn = (isOwner && !isCreator)
      ? `<button class="btn-outline btn-sm" onclick="abrirModalCoAdmin('${p.id}','${escapeHtml(p.name)}')"><i class="fas fa-user-shield"></i> ${isCoAdmin ? 'Gerenciar' : 'Admin'}</button>`
      : '';

    return `<div class="player-item">
      <div class="player-avatar">${ini}</div>
      <div class="player-info">
        <div class="player-name">${escapeHtml(p.name)} ${badge}</div>
        <div class="player-detail">${escapeHtml(p.position)} • ${p.goals}G ${p.assists}A</div>
      </div>
      ${manageBtn}
    </div>`;
  }).join('');
}

// ===== MODAL CO-ADMIN =====
let _coAdminContext = { rachaoId: null, playerId: null, isExisting: false };

async function abrirModalCoAdmin(playerId, playerName) {
  if (!ProManager.requirePro('co-admin')) return;
  const rachao = await apiGetRachaoById(currentRachaoId);
  if (!rachao) return;
  _coAdminContext = { rachaoId: rachao.id, playerId, isExisting: false };

  const existing = (await apiListRachaoAdmins(rachao.id)).find(c => c.playerId === playerId);
  _coAdminContext.isExisting = !!existing;
  const currentPerms = existing ? existing.permissions : {};

  document.getElementById('coadmin-modal-title').textContent = playerName;

  const listHtml = COADMIN_PERMISSIONS.map(p => `
    <label class="perm-row">
      <input type="checkbox" class="perm-check" data-perm="${p.key}" ${currentPerms[p.key] ? 'checked' : ''}>
      <i class="fas ${p.icon}"></i>
      <span>${p.label}</span>
    </label>
  `).join('');
  document.getElementById('coadmin-permissions-list').innerHTML = listHtml;

  document.getElementById('btn-remove-coadmin').style.display = existing ? 'block' : 'none';
  document.getElementById('modal-manage-coadmin').style.display = 'flex';
}

function fecharModalCoAdmin() {
  document.getElementById('modal-manage-coadmin').style.display = 'none';
}

async function salvarCoAdmin() {
  const user = apiGetCurrentUser();
  if (!user || !_coAdminContext.rachaoId || !_coAdminContext.playerId) return;
  const perms = {};
  document.querySelectorAll('.perm-check').forEach(el => { perms[el.dataset.perm] = el.checked; });
  const hasAny = Object.values(perms).some(Boolean);
  const btn = document.getElementById('btn-save-coadmin');
  try {
    setLoading(btn, true);
    if (!hasAny && _coAdminContext.isExisting) {
      await apiManageCoAdmin('remove', { rachaoId: _coAdminContext.rachaoId, playerId: _coAdminContext.playerId, userId: user.id });
      showToast('Co-admin removido');
    } else if (hasAny) {
      await apiManageCoAdmin('upsert', { rachaoId: _coAdminContext.rachaoId, playerId: _coAdminContext.playerId, userId: user.id, permissions: perms });
      showToast(_coAdminContext.isExisting ? 'Permissões atualizadas' : 'Co-admin adicionado');
    } else {
      showToast('Selecione ao menos uma permissão');
      return;
    }
    fecharModalCoAdmin();
    await loadRachaoDetail();
  } catch (err) {
    showToast(err.message || 'Erro ao salvar');
  } finally {
    setLoading(btn, false);
  }
}

async function removerCoAdmin() {
  const user = apiGetCurrentUser();
  if (!user || !_coAdminContext.rachaoId || !_coAdminContext.playerId) return;
  if (!confirm('Remover este jogador como co-admin?')) return;
  try {
    await apiManageCoAdmin('remove', { rachaoId: _coAdminContext.rachaoId, playerId: _coAdminContext.playerId, userId: user.id });
    showToast('Co-admin removido');
    fecharModalCoAdmin();
    await loadRachaoDetail();
  } catch (err) {
    showToast(err.message || 'Erro ao remover');
  }
}

let _currentBillingId = null;
let _currentBillingValues = { totalCost: 0, perPerson: 0, venuePaidAt: null };

async function loadRachaoFinanceTab(rachao, user) {
  const isOwner = rachao.createdBy === user.id;
  const canEditValues = isOwner || await hasRachaoPermission(rachao, user, 'edit_values');
  const canMarkPaid = isOwner || await hasRachaoPermission(rachao, user, 'mark_venue_paid');
  const canManagePayments = isOwner || await hasRachaoPermission(rachao, user, 'manage_payments');
  const defaultCost = rachao.monthlyVenueCost || 0;
  const members = rachao.participants.length;

  const month = getCurrentMonth();
  const monthNames = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const [y, m] = month.split('-');
  document.getElementById('finance-month').textContent = monthNames[parseInt(m)] + ' ' + y;

  let billing = await apiGetBilling(rachao.id, month);
  if (!billing) {
    const defaultPerPerson = members > 0 ? Math.ceil(defaultCost / members * 100) / 100 : 0;
    await apiCreateBilling({
      rachaoId: rachao.id, month, totalCost: defaultCost,
      participantCount: members, perPerson: defaultPerPerson,
      payments: rachao.participants.map(pid => ({ playerId: pid, status: 'pending' }))
    });
    billing = await apiGetBilling(rachao.id, month);
  }
  if (!billing || !billing.payments) { billing = { payments: [], totalCost: 0, perPerson: 0 }; }

  _currentBillingId = billing.id;
  _currentBillingValues = {
    totalCost: billing.totalCost || 0,
    perPerson: billing.perPerson || 0,
    venuePaidAt: billing.venuePaidAt || null,
  };

  document.getElementById('finance-total-cost').textContent = formatCurrency(billing.totalCost || 0);
  document.getElementById('finance-per-person').textContent = formatCurrency(billing.perPerson || 0);
  document.getElementById('finance-members').textContent = members;
  document.getElementById('btn-edit-finance-values').style.display = canEditValues ? 'flex' : 'none';

  const paid = billing.payments.filter(p => p.status === 'paid').length;
  const pending = billing.payments.filter(p => p.status !== 'paid').length;
  document.getElementById('finance-paid-count').textContent = paid;
  document.getElementById('finance-pending-count').textContent = pending;

  // Caixa: arrecadado, saldo do mês, acumulado
  const collected = paid * (billing.perPerson || 0);
  const venuePaid = !!billing.venuePaidAt;
  document.getElementById('finance-collected').textContent = formatCurrency(collected);

  const netEl = document.getElementById('finance-net');
  const netLabel = document.getElementById('finance-net-label');
  if (venuePaid) {
    const net = collected - (billing.totalCost || 0);
    netEl.textContent = formatCurrency(net);
    netEl.style.color = net >= 0 ? 'var(--green)' : 'var(--red)';
    netLabel.textContent = 'Caixa do mês';
  } else {
    netEl.textContent = '—';
    netEl.style.color = 'var(--text-muted)';
    netLabel.textContent = 'Quadra não paga';
  }

  const cashFlow = await apiGetCashFlow(rachao.id).catch(() => ({ accumulated: 0 }));
  const accEl = document.getElementById('finance-accumulated');
  accEl.textContent = formatCurrency(cashFlow.accumulated || 0);
  accEl.style.color = (cashFlow.accumulated || 0) >= 0 ? 'var(--green)' : 'var(--red)';

  // Botão "marcar quadra paga" só pra admin
  const btnVenue = document.getElementById('btn-toggle-venue-paid');
  if (canMarkPaid) {
    btnVenue.style.display = 'block';
    if (venuePaid) {
      btnVenue.innerHTML = '<i class="fas fa-undo"></i> DESMARCAR QUADRA PAGA';
      btnVenue.className = 'btn-secondary';
      btnVenue.style.width = '100%';
      btnVenue.style.marginTop = '12px';
    } else {
      btnVenue.innerHTML = '<i class="fas fa-check-circle"></i> MARCAR QUADRA COMO PAGA';
      btnVenue.className = 'btn-primary';
      btnVenue.style.width = '100%';
      btnVenue.style.marginTop = '12px';
    }
  } else {
    btnVenue.style.display = 'none';
  }

  const billingId = billing.id;
  const playerPromises = billing.payments.map(async pay => {
    const p = await apiGetPlayerById(pay.player_id || pay.playerId).catch(() => null);
    return { pay, p };
  });
  const paymentData = await Promise.all(playerPromises);

  document.getElementById('finance-payments-list').innerHTML = paymentData.map(({ pay, p }) => {
    if (!p) return '';
    const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
    const statusLabel = pay.status === 'paid' ? 'Pago' : pay.status === 'awaiting_confirmation' ? 'Aguardando' : 'Pendente';
    const statusClass = pay.status === 'paid' ? 'badge-paid' : 'badge-pending';
    const pid = pay.player_id || pay.playerId;
    const adminBtn = canManagePayments && pay.status !== 'paid'
      ? `<button class="btn-success btn-sm" onclick="confirmBillingPayment('${billingId}','${pid}')">✓</button>` : '';
    return `<div class="player-item">
      <div class="player-avatar">${ini}</div>
      <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${formatCurrency(billing.perPerson || 0)}</div></div>
      <span class="payment-badge ${statusClass}">${statusLabel}</span>
      ${adminBtn}
    </div>`;
  }).join('');

  document.getElementById('finance-pix-amount').textContent = 'Valor: ' + formatCurrency(billing.perPerson || 0);
  document.getElementById('finance-pix-key').value = rachao.pixKey || '';

  await loadFinancePixStatus(rachao, user);
}

// ===== ADMIN: editar valores do mês =====
function abrirEditarValores() {
  document.getElementById('edit-total-cost').value = _currentBillingValues.totalCost || '';
  document.getElementById('edit-per-person').value = _currentBillingValues.perPerson || '';
  document.getElementById('modal-edit-values').style.display = 'flex';
}

function fecharEditarValores() {
  document.getElementById('modal-edit-values').style.display = 'none';
}

async function salvarValores() {
  if (!_currentBillingId) { showToast('Billing não inicializado'); return; }
  const totalCost = parseFloat(document.getElementById('edit-total-cost').value);
  const perPerson = parseFloat(document.getElementById('edit-per-person').value);
  if (isNaN(totalCost) || totalCost < 0) { showToast('Valor da quadra inválido'); return; }
  if (isNaN(perPerson) || perPerson < 0) { showToast('Mensalidade inválida'); return; }

  const btn = document.getElementById('btn-save-values');
  try {
    setLoading(btn, true);
    await apiUpdateBillingValues(_currentBillingId, { totalCost, perPerson });
    showToast('Valores atualizados!');
    fecharEditarValores();
    await loadRachaoDetail();
  } catch (err) {
    showToast(err.message || 'Erro ao salvar');
  } finally {
    setLoading(btn, false);
  }
}

async function toggleQuadraPaga() {
  const user = apiGetCurrentUser();
  if (!user || !_currentBillingId) return;
  const btn = document.getElementById('btn-toggle-venue-paid');
  const currentlyPaid = !!_currentBillingValues.venuePaidAt;
  const confirmMsg = currentlyPaid
    ? 'Desmarcar quadra como paga?'
    : 'Confirmar que a quadra foi paga? Isso calcula o caixa do mês.';
  if (!confirm(confirmMsg)) return;
  try {
    setLoading(btn, true);
    await apiMarkVenuePaid(_currentBillingId, user.id, !currentlyPaid);
    showToast(currentlyPaid ? 'Quadra desmarcada' : 'Quadra paga!');
    await loadRachaoDetail();
  } catch (err) {
    showToast(err.message || 'Erro');
  } finally {
    setLoading(btn, false);
  }
}

async function loadFinancePixStatus(rachao, user) {
  const isOwner = rachao.createdBy === user.id;
  const canConfigPix = isOwner || await hasRachaoPermission(rachao, user, 'config_pix');
  const btnConfig = document.getElementById('btn-config-pix-admin');
  const btnPay = document.getElementById('btn-pagar-pix');
  const statusArea = document.getElementById('finance-pix-status-area');

  let status = { mp_enabled: false };
  try { status = await apiGetPaymentStatus(rachao.id); } catch (e) { console.error(e); }

  if (btnConfig) btnConfig.style.display = canConfigPix ? 'block' : 'none';
  if (btnPay) btnPay.style.display = status.mp_enabled ? 'block' : 'none';

  const manualGroup = document.getElementById('finance-pix-manual-group');
  if (manualGroup) manualGroup.style.display = status.mp_enabled ? 'none' : 'flex';

  if (statusArea) {
    if (status.mp_enabled) {
      statusArea.innerHTML = '<div style="background:rgba(50,188,173,0.1);border:1px solid #32BCAD;color:#32BCAD;padding:8px 12px;border-radius:var(--radius);font-size:12px;margin-bottom:8px;text-align:center"><i class="fas fa-check-circle"></i> PIX automático ativo</div>';
    } else if (canConfigPix) {
      statusArea.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border);color:var(--text-muted);padding:8px 12px;border-radius:var(--radius);font-size:12px;margin-bottom:8px;text-align:center"><i class="fas fa-info-circle"></i> PIX automático não configurado</div>';
    } else {
      statusArea.innerHTML = '';
    }
  }
}

async function confirmBillingPayment(billingId, playerId) {
  await apiConfirmPayment(billingId, playerId, 'paid');
  showToast('Pagamento confirmado!');
  await loadRachaoDetail();
}

function copyFinancePix() {
  const text = document.getElementById('finance-pix-key').value;
  navigator.clipboard.writeText(text).then(() => showToast('Chave Pix copiada!')).catch(() => showToast('Copie manualmente'));
}

async function notifyPayment() {
  const user = apiGetCurrentUser();
  const rachao = await apiGetRachaoById(currentRachaoId);
  if (!rachao || !user) return;
  const month = getCurrentMonth();
  const billing = await apiGetBilling(rachao.id, month);
  if (!billing) return;
  await apiConfirmPayment(billing.id, user.id, 'awaiting_confirmation');
  await apiAddNotification({ type:'green', icon:'fa-money-bill-wave', title:'Pagamento informado', text: user.name + ' informou pagamento' });
  showToast('Pagamento informado! Admin será notificado.');
  await loadRachaoDetail();
}

// ===== PIX AUTOMATIC PAYMENT =====
let _pixTimerInterval = null;
let _pixExpiresAt = null;
let _pixCurrentTxId = null;
let _pixRetryFn = null;

function showPixState(state) {
  ['loading', 'ready', 'paid', 'error', 'expired'].forEach(s => {
    const el = document.getElementById('pix-state-' + s);
    if (el) el.style.display = s === state ? 'flex' : 'none';
  });
}

function pixRetry() {
  const fn = _pixRetryFn || iniciarPagamentoPix;
  fn();
}

function fecharModalPix() {
  document.getElementById('modal-pix-payment').style.display = 'none';
  if (_pixTimerInterval) {
    clearInterval(_pixTimerInterval);
    _pixTimerInterval = null;
  }
  if (typeof apiUnsubscribePixUpdates === 'function') apiUnsubscribePixUpdates();
  _pixExpiresAt = null;
  _pixCurrentTxId = null;
  _pixRetryFn = null;
  if (currentRachaoId) loadRachaoDetail();
}

function startPixTimer(expiresAt) {
  _pixExpiresAt = new Date(expiresAt).getTime();
  const el = document.getElementById('pix-timer-countdown');
  const timerBox = document.getElementById('pix-timer');
  const update = () => {
    const remaining = _pixExpiresAt - Date.now();
    if (remaining <= 0) {
      clearInterval(_pixTimerInterval);
      _pixTimerInterval = null;
      showPixState('expired');
      return;
    }
    const min = Math.floor(remaining / 60000);
    const sec = Math.floor((remaining % 60000) / 1000);
    el.textContent = String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    if (timerBox) timerBox.classList.toggle('expiring', remaining < 5 * 60000);
  };
  update();
  if (_pixTimerInterval) clearInterval(_pixTimerInterval);
  _pixTimerInterval = setInterval(update, 1000);
}

async function iniciarPagamentoPix() {
  if (!ProManager.requirePro('pagamentos')) return;
  const user = apiGetCurrentUser();
  const rachao = await apiGetRachaoById(currentRachaoId);
  if (!rachao || !user) return;

  _pixRetryFn = iniciarPagamentoPix;
  const modal = document.getElementById('modal-pix-payment');
  modal.style.display = 'flex';
  showPixState('loading');

  try {
    const month = getCurrentMonth();
    const billing = await apiGetBilling(rachao.id, month);
    if (!billing) throw new Error('Cobrança mensal não encontrada');

    const perPerson = billing.perPerson || 0;
    if (!perPerson || perPerson <= 0) throw new Error('Valor inválido');

    const description = `Mensalidade ${rachao.name} - ${month}`;
    const result = await apiCreatePixCharge(billing.id, user.id, rachao.id, perPerson, description);

    _pixCurrentTxId = result.transaction_id;

    document.getElementById('pix-modal-amount').textContent = 'Valor: ' + formatCurrency(result.amount);
    document.getElementById('pix-modal-code').value = result.qr_code || '';
    const imgEl = document.getElementById('pix-qr-image');
    if (result.qr_code_base64) {
      imgEl.src = 'data:image/png;base64,' + result.qr_code_base64;
      imgEl.style.display = 'block';
    } else {
      imgEl.style.display = 'none';
    }

    showPixState('ready');
    startPixTimer(result.expires_at);

    apiSubscribePixUpdates((evt) => {
      if (evt.type === 'pix_transaction' && evt.data.id === _pixCurrentTxId && evt.data.status === 'paid') {
        if (_pixTimerInterval) { clearInterval(_pixTimerInterval); _pixTimerInterval = null; }
        document.getElementById('pix-paid-amount').textContent = formatCurrency(evt.data.amount);
        showPixState('paid');
      }
    });
  } catch (err) {
    console.error('PIX error:', err);
    document.getElementById('pix-error-msg').textContent = err.message || 'Erro desconhecido';
    showPixState('error');
  }
}

function copyPixCode() {
  const text = document.getElementById('pix-modal-code').value;
  if (!text) { showToast('Código indisponível'); return; }
  navigator.clipboard.writeText(text)
    .then(() => showToast('Código PIX copiado!'))
    .catch(() => showToast('Copie manualmente'));
}

// ===== ADMIN: CONFIGURAR PIX AUTOMÁTICO =====
async function abrirConfigPix() {
  const modal = document.getElementById('modal-config-pix');
  modal.style.display = 'flex';
  document.getElementById('config-pix-token').value = '';
  const status = await apiGetPaymentStatus(currentRachaoId).catch(() => null);
  document.getElementById('config-pix-enabled').checked = !!(status && status.mp_enabled);
  const current = document.getElementById('config-pix-current');
  if (status && status.mp_enabled) {
    current.style.display = 'block';
    document.getElementById('config-pix-nickname').textContent = 'Configurado (token preservado)';
    document.getElementById('config-pix-email').textContent = 'Deixe o campo de token em branco para manter o atual';
  } else {
    current.style.display = 'none';
  }
}

function fecharConfigPix() {
  document.getElementById('modal-config-pix').style.display = 'none';
}

async function salvarConfigPix() {
  const user = apiGetCurrentUser();
  if (!user) { showToast('Sessão expirada'); return; }
  const token = document.getElementById('config-pix-token').value.trim();
  const enabled = document.getElementById('config-pix-enabled').checked;
  const btn = document.getElementById('btn-salvar-config-pix');

  if (enabled && !token) {
    const status = await apiGetPaymentStatus(currentRachaoId).catch(() => null);
    if (!status || !status.mp_enabled) {
      showToast('Cole o access token do Mercado Pago');
      return;
    }
  }

  try {
    setLoading(btn, true);
    const result = await apiSavePaymentConfig(currentRachaoId, user.id, {
      mpAccessToken: token || null,
      mpEnabled: enabled,
    });
    if (result.mp_user_info) {
      document.getElementById('config-pix-nickname').textContent = result.mp_user_info.nickname || '—';
      document.getElementById('config-pix-email').textContent = result.mp_user_info.email || '';
      document.getElementById('config-pix-current').style.display = 'block';
    }
    showToast('Configuração salva!');
    fecharConfigPix();
    await loadRachaoDetail();
  } catch (err) {
    showToast(err.message || 'Erro ao salvar');
  } finally {
    setLoading(btn, false);
  }
}

// ===== SESSIONS =====
async function createSession() {
  const rachao = await apiGetRachaoById(currentRachaoId);
  if (!rachao) return;
  const nextDate = getNextDayOfWeek(rachao.dayOfWeek);
  const result = await apiCreateSession({ rachaoId: rachao.id, date: nextDate });
  currentSessionId = result.id;
  showToast('Jogo criado para ' + formatDateBR(nextDate));
  await loadRachaoDetail();
}

async function togglePresence() {
  const user = apiGetCurrentUser();
  if (!user || !currentSessionId) return;

  if (user.blocked) {
    document.getElementById('modal-request-release').style.display = 'flex';
    return;
  }

  const btn = document.getElementById('btn-toggle-presence');
  try {
    setLoading(btn, true);
    const session = await apiGetSessionById(currentSessionId);
    const isConf = session.confirmed.includes(user.id);

    if (isConf) {
      await apiTogglePresence(currentSessionId, user.id, 'cancel');
      showToast('Presença cancelada');
    } else {
      await apiTogglePresence(currentSessionId, user.id, 'confirm');
      showToast('Presença confirmada!');
    }
  } catch (err) {
    console.error('Erro ao alterar presença:', err);
    showToast('Erro ao alterar presença');
  } finally {
    setLoading(btn, false);
  }
}

async function endSession() {
  await apiUpdateSession(currentSessionId, { status: 'done' });
  showToast('Jogo encerrado');
  await loadRachaoDetail();
}

async function cancelarJogo() {
  if (!currentSessionId) return;
  // Verifica se há avulsos pagos para alertar sobre estorno
  let warning = 'Tem certeza que quer cancelar este jogo?';
  try {
    const guests = await apiListSessionGuests(currentSessionId);
    const paid = guests.filter(g => g.status === 'paid');
    if (paid.length > 0) {
      const total = paid.reduce((s, g) => s + Number(g.fee_paid || 0), 0);
      warning = `⚠️ Este jogo tem ${paid.length} avulso(s) pago(s) — total R$ ${total.toFixed(2).replace('.', ',')}.\n\n` +
        `Você precisará ESTORNAR MANUALMENTE no painel do Mercado Pago. ` +
        `O sistema vai marcar todos como "estorno pendente".\n\nProsseguir?`;
    }
  } catch (_) { /* segue mesmo se falhar */ }

  if (!confirm(warning)) return;

  try {
    const result = await apiCancelSession(currentSessionId);
    if (!result.ok) {
      const msgs = {
        SESSAO_INVALIDA: 'Sessão inválida',
        SEM_PERMISSAO:   'Sem permissão para cancelar',
        JA_CANCELADA:    'Sessão já cancelada',
        JA_ENCERRADA:    'Sessão já encerrada — use o histórico',
      };
      showToast(msgs[result.error] || result.error || 'Erro ao cancelar');
      return;
    }
    if (result.refund_count > 0) {
      const total = Number(result.refund_total || 0).toFixed(2).replace('.', ',');
      showToast(`Jogo cancelado. ${result.refund_count} estorno(s) pendente(s): R$ ${total}`);
    } else {
      showToast('Jogo cancelado');
    }
    await loadRachaoDetail();
  } catch (err) {
    console.error('cancelarJogo error:', err);
    showToast('Erro ao cancelar: ' + (err.message || ''));
  }
}

// ===== DRAW TEAMS =====
// Conta quantas vezes o usuário Free já usou o sorteio (1 grátis)
function _drawCountKey() {
  const u = apiGetCurrentUser();
  return 'rachao_drawCount_' + (u?.id || 'anon');
}
function _getDrawCount() { return parseInt(localStorage.getItem(_drawCountKey()) || '0', 10); }
function _incDrawCount() { localStorage.setItem(_drawCountKey(), String(_getDrawCount() + 1)); }

async function drawTeams() {
  const btn = document.getElementById('btn-draw-teams');
  // Gate Pro: usuário Free pode sortear apenas 1 vez (lifetime, por conta)
  if (!ProManager.isPro() && _getDrawCount() >= 1) {
    ProManager.requirePro('sortear-times');
    return;
  }
  try {
  setLoading(btn, true);
  const session = await apiGetSessionById(currentSessionId);
  const rachao = await apiGetRachaoById(currentRachaoId);
  if (!session || !rachao) return;

  const teamSize = rachao.playersPerTeam + 1; // jogadores de linha + 1 goleiro
  if (session.confirmed.length < 4) {
    showToast('Precisa de pelo menos 4 jogadores');
    return;
  }

  const playerPromises = session.confirmed.map(id => apiGetPlayerById(id).catch(() => null));
  const players = (await Promise.all(playerPromises)).filter(Boolean);

  // Fisher-Yates shuffle
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }

  const gks = shuffled.filter(p => p.position === 'Goleiro');
  const field = shuffled.filter(p => p.position !== 'Goleiro');

  // Calcular times: cada time completo tem exatamente teamSize jogadores
  const numFullTeams = Math.floor(shuffled.length / teamSize);
  const leftoverCount = shuffled.length - (numFullTeams * teamSize);
  const totalTeams = numFullTeams + (leftoverCount > 0 ? 1 : 0);
  const teams = [];

  // Criar todos os times (completos + incompleto se houver sobra)
  for (let t = 0; t < totalTeams; t++) {
    teams.push({ goalkeeper: null, players: [], name: getTeamName(t) });
  }

  // Distribuir goleiros (1 por time, priorizando times completos)
  let gkIdx = 0;
  for (let t = 0; t < totalTeams && gkIdx < gks.length; t++) {
    teams[t].goalkeeper = gks[gkIdx++];
  }

  // Goleiros extras entram como jogadores de linha
  const extraGks = gks.slice(gkIdx);
  const allField = [...field, ...extraGks];

  // Preencher cada time até o limite exato
  let fieldIdx = 0;
  for (let t = 0; t < totalTeams; t++) {
    const isFullTeam = t < numFullTeams;
    const maxPlayers = isFullTeam ? teamSize : leftoverCount;
    const hasGk = teams[t].goalkeeper !== null;
    const needed = hasGk ? maxPlayers - 1 : maxPlayers;
    for (let i = 0; i < needed && fieldIdx < allField.length; i++) {
      teams[t].players.push(allField[fieldIdx++]);
    }
  }

  const numTeams = teams.length;
  await apiUpdateSession(currentSessionId, {
    teams, leftover: [],
    confirmed: session.confirmed, waiting: session.waiting
  });

  document.getElementById('teams-result').style.display = 'block';
  renderAllTeams(teams);
  await apiAddNotification({ type:'orange', icon:'fa-shuffle', title:'Times sorteados!', text: `${numTeams} times formados` });
  if (!ProManager.isPro()) _incDrawCount();
  showToast(`${numTeams} times sorteados!`);
  await loadRachaoDetail();
  } catch (err) {
    console.error('Erro ao sortear times:', err);
    showToast('Erro ao sortear. Tente novamente.');
  } finally {
    setLoading(btn, false);
  }
}

function getTeamName(idx) { return 'Time ' + (idx + 1); }
function getTeamClass(idx) { return ['team-a','team-b','team-c','team-d'][idx % 4]; }

function renderAllTeams(teams) {
  const container = document.getElementById('teams-container');
  const maxSize = Math.max(...teams.map(t => (t.goalkeeper ? 1 : 0) + t.players.length));
  container.innerHTML = teams.map((t, i) => {
    const size = (t.goalkeeper ? 1 : 0) + t.players.length;
    const isIncomplete = size < maxSize;
    let html = '';
    if (t.goalkeeper) html += `<div class="team-player"><span class="jersey">🧤</span> ${escapeHtml(t.goalkeeper.name)}</div>`;
    t.players.forEach(p => { html += `<div class="team-player"><span class="jersey">👕</span> ${escapeHtml(p.name)}</div>`; });
    const note = isIncomplete ? `<p class="text-muted" style="font-size:11px;margin-top:8px">Completa com perdedores (faltam ${maxSize - size})</p>` : '';
    return `<div class="team-card ${getTeamClass(i)}"><h3><i class="fas fa-shirt"></i> ${t.name} <span style="font-size:12px;font-weight:400;color:var(--text-muted)">(${size})</span></h3>${html}${note}</div>`;
  }).join('');
}

function showMatchMenu() { document.getElementById('modal-match-menu').style.display = 'flex'; }

// ===== PAYMENTS PAGE =====
async function loadPayments() {
  const user = apiGetCurrentUser();
  const rachaos = (await apiGetRachaos()).filter(r => r.participants.includes(user.id) && r.monthlyVenueCost > 0);
  const listEl = document.getElementById('payments-rachao-list');
  const emptyEl = document.getElementById('payments-empty');

  if (rachaos.length === 0) { listEl.innerHTML = ''; emptyEl.style.display = 'flex'; return; }
  emptyEl.style.display = 'none';

  const month = getCurrentMonth();
  const billingAll = await Promise.all(rachaos.map(r => apiGetBilling(r.id, month)));

  listEl.innerHTML = rachaos.map((r, idx) => {
    const perPerson = r.participants.length > 0 ? Math.ceil(r.monthlyVenueCost / r.participants.length * 100) / 100 : 0;
    const billing = billingAll[idx];
    const myPay = billing && billing.payments ? billing.payments.find(p => (p.player_id || p.playerId) === user.id) : null;
    const myStatus = myPay ? myPay.status : 'pending';
    const statusLabel = myStatus === 'paid' ? '✓ Pago' : myStatus === 'awaiting_confirmation' ? '⏳ Aguardando' : '⚠ Pendente';
    const statusColor = myStatus === 'paid' ? 'var(--green)' : 'var(--orange)';
    return `<div class="card" style="margin-bottom:12px;cursor:pointer" onclick="currentRachaoId='${r.id}';navigateTo('match-detail')">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <h3 style="font-size:15px">${escapeHtml(r.name)}</h3>
          <p class="text-muted" style="font-size:12px">${formatCurrency(perPerson)}/mês por pessoa</p>
        </div>
        <span style="color:${statusColor};font-weight:700;font-size:13px">${statusLabel}</span>
      </div>
    </div>`;
  }).join('');
}

// ===== STATS =====
async function loadStats() { await renderStatsTab('ranking'); }

async function renderStatsTab(tab) {
  const players = await apiGetPlayers();
  const container = document.getElementById('stats-content');
  let sorted, valueLabel;
  if (tab === 'ranking') {
    sorted = [...players].map(p => ({...p, pts: calcPlayerPoints(p)})).sort((a,b) => b.pts - a.pts);
    valueLabel = p => p.pts + 'pts';
  } else if (tab === 'artilharia') {
    sorted = [...players].sort((a,b) => b.goals - a.goals);
    valueLabel = p => p.goals + ' gols';
  } else if (tab === 'assists') {
    sorted = [...players].sort((a,b) => b.assists - a.assists);
    valueLabel = p => p.assists + ' assist.';
  } else {
    sorted = [...players].sort((a,b) => (b.tackles||0) - (a.tackles||0));
    valueLabel = p => (p.tackles||0) + ' desarmes';
  }
  container.innerHTML = sorted.map((p, i) => {
    const cls = i===0?'gold':i===1?'silver':i===2?'bronze':'';
    return `<div class="ranking-item">
      <div class="ranking-pos ${cls}">${i+1}</div>
      <div class="ranking-info"><div class="ranking-name">${escapeHtml(p.name)}</div><div class="ranking-detail">${escapeHtml(p.position)} • ${p.matches} jogos</div></div>
      <div class="ranking-value">${valueLabel(p)}</div>
    </div>`;
  }).join('');
}

// ===== REGISTER STATS =====
async function loadRegisterStats() {
  const session = await apiGetSessionById(currentSessionId);
  if (!session) return;
  const listEl = document.getElementById('stats-register-list');
  const saveBtn = document.querySelector('#page-register-stats .btn-primary');

  if (session.status !== 'done') {
    if (listEl) listEl.innerHTML = '<div class="empty-state" style="padding:20px"><i class="fas fa-hourglass-half"></i><p>Aguarde o admin encerrar o rachão para registrar estatísticas.</p></div>';
    if (saveBtn) saveBtn.style.display = 'none';
    return;
  }
  if (saveBtn) saveBtn.style.display = '';

  const currentUser = apiGetCurrentUser();
  const isAdmin = currentUser && currentUser.isAdmin;
  const allPlayers = (await Promise.all(session.confirmed.map(pid => apiGetPlayerById(pid).catch(() => null)))).filter(Boolean);
  // Jogador comum: só registra o próprio. Admin: registra de todos.
  const players = isAdmin ? allPlayers : allPlayers.filter(p => p.id === currentUser.id);

  if (players.length === 0) {
    listEl.innerHTML = '<div class="empty-state" style="padding:20px"><i class="fas fa-ban"></i><p>Você não está na lista de confirmados deste jogo</p></div>';
    if (saveBtn) saveBtn.style.display = 'none';
    return;
  }

  document.getElementById('stats-register-list').innerHTML = players.map(p => {
    const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
    const isGK = p.position === 'Goleiro';
    return `<div class="stat-register-item">
      <div class="stat-player-header">
        <div class="player-avatar">${ini}</div>
        <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${escapeHtml(p.position)}</div></div>
      </div>
      <div class="stat-grid">
        ${isGK ? `
          <div class="stat-input-group"><label>Defesas</label><input type="number" min="0" value="0" id="saves-${p.id}"></div>
          <div class="stat-input-group"><label>Gols Sofr.</label><input type="number" min="0" value="0" id="conceded-${p.id}"></div>
          <div class="stat-input-group"><label>Clean Sheet</label><input type="number" min="0" value="0" max="1" id="cs-${p.id}"></div>
        ` : `
          <div class="stat-input-group"><label>Gols</label><input type="number" min="0" value="0" id="goals-${p.id}"></div>
          <div class="stat-input-group"><label>Assist.</label><input type="number" min="0" value="0" id="assists-${p.id}"></div>
          <div class="stat-input-group"><label>Desarmes</label><input type="number" min="0" value="0" id="tackles-${p.id}"></div>
          <div class="stat-input-group"><label>Faltas</label><input type="number" min="0" value="0" id="fouls-${p.id}"></div>
          <div class="stat-input-group"><label>Amarelo</label><input type="number" min="0" value="0" id="yellows-${p.id}"></div>
          <div class="stat-input-group"><label>Vermelho</label><input type="number" min="0" value="0" id="reds-${p.id}"></div>
        `}
      </div>
    </div>`;
  }).join('');
}

async function saveMatchStats() {
  const btn = document.querySelector('#page-register-stats .btn-primary');
  try {
  setLoading(btn, true);
  const session = await apiGetSessionById(currentSessionId);
  if (!session) return;
  if (session.status !== 'done') {
    showToast('Aguarde o admin encerrar o rachão para registrar estatísticas.');
    return;
  }
  const currentUser = apiGetCurrentUser();
  const isAdmin = currentUser && currentUser.isAdmin;
  const playerIds = isAdmin ? session.confirmed : session.confirmed.filter(pid => pid === currentUser.id);
  const stats = [];
  for (const pid of playerIds) {
    const p = await apiGetPlayerById(pid).catch(() => null);
    if (!p) continue;
    const isGK = p.position === 'Goleiro';
    const stat = { sessionId: currentSessionId, rachaoId: currentRachaoId, playerId: pid };
    if (isGK) {
      stat.saves = parseInt(document.getElementById('saves-'+pid)?.value) || 0;
      stat.goalsConceded = parseInt(document.getElementById('conceded-'+pid)?.value) || 0;
      stat.cleanSheet = parseInt(document.getElementById('cs-'+pid)?.value) || 0;
      stat.isGoalkeeper = true;
      if (stat.saves > 0 || stat.goalsConceded > 0 || stat.cleanSheet > 0) stats.push(stat);
    } else {
      stat.goals = parseInt(document.getElementById('goals-'+pid)?.value) || 0;
      stat.assists = parseInt(document.getElementById('assists-'+pid)?.value) || 0;
      stat.tackles = parseInt(document.getElementById('tackles-'+pid)?.value) || 0;
      stat.fouls = parseInt(document.getElementById('fouls-'+pid)?.value) || 0;
      stat.yellows = parseInt(document.getElementById('yellows-'+pid)?.value) || 0;
      stat.reds = parseInt(document.getElementById('reds-'+pid)?.value) || 0;
      stat.isGoalkeeper = false;
      if (stat.goals > 0 || stat.assists > 0 || stat.tackles > 0 || stat.fouls > 0 || stat.yellows > 0 || stat.reds > 0) stats.push(stat);
    }
  }
  if (stats.length > 0) await apiSubmitStats(stats);
  showToast(`${stats.length} estatísticas enviadas para validação!`);
  await apiAddNotification({ type:'purple', icon:'fa-shield-halved', title:'Anti-fraude', text:`${stats.length} stats pendentes de validação` });
  navigateTo('match-detail');
  } catch (err) {
    console.error('Erro ao enviar stats:', err);
    showToast('Erro ao enviar estatísticas');
  } finally {
    setLoading(btn, false);
  }
}

// ===== PLAYERS =====
async function loadPlayers() { showListSkeleton('players-list', 5); renderPlayerList(await apiGetPlayers()); }

function renderPlayerList(players) {
  document.getElementById('players-list').innerHTML = players.map(p => {
    const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0,2));
    const blocked = p.blocked ? '<span class="payment-badge badge-blocked">Bloqueado</span>' : '';
    return `<div class="player-item">
      <div class="player-avatar">${ini}</div>
      <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${escapeHtml(p.position)} • ${p.goals}G ${p.assists}A ${p.tackles||0}D</div></div>
      ${blocked}
    </div>`;
  }).join('');
}

const filterPlayers = debounce(async function() {
  const q = document.getElementById('search-players').value.toLowerCase();
  const players = await apiGetPlayers();
  renderPlayerList(players.filter(p => p.name.toLowerCase().includes(q)));
}, 300);

async function addPlayer() {
  const name = document.getElementById('player-add-name').value.trim();
  const phone = document.getElementById('player-add-phone').value.replace(/\D/g, '');
  const position = document.getElementById('player-add-position').value;
  if (!name) { showToast('Digite o nome'); return; }

  // Gate Pro: máximo 15 jogadores no plano Free
  if (!ProManager.isPro()) {
    const total = (await apiGetPlayers()).length;
    if (total >= 15) {
      ProManager.requirePro('jogadores-ilimitados');
      return;
    }
  }

  await apiCreatePlayer({ name, phone, position });
  showToast('Jogador adicionado!');
  navigateTo('players');
}

// ===== NOTIFICATIONS =====
async function loadNotifications() {
  const ns = await apiGetNotifications();
  const list = document.getElementById('notifications-list');
  const empty = document.getElementById('notifications-empty');
  if (ns.length === 0) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  list.innerHTML = ns.map(n => {
    const t = new Date(n.timestamp);
    const ts = t.toLocaleDateString('pt-BR') + ' ' + t.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    return `<div class="notif-item">
      <div class="notif-icon ${escapeHtml(n.type)}"><i class="fas ${escapeHtml(n.icon)}"></i></div>
      <div class="notif-content"><h4>${escapeHtml(n.title)}</h4><p>${escapeHtml(n.text)}</p><span class="notif-time">${ts}</span></div>
    </div>`;
  }).join('');
}

// ===== RACHÃO STATS =====
async function loadRachaoStats(tab) {
  const rachao = await apiGetRachaoById(currentRachaoId);
  if (!rachao) return;
  const playerPromises = rachao.participants.map(pid => apiGetPlayerById(pid).catch(() => null));
  const players = (await Promise.all(playerPromises)).filter(Boolean);
  let sorted, valueLabel;
  if (tab === 'r-ranking') {
    sorted = players.map(p => ({...p, pts: calcPlayerPoints(p)})).sort((a,b) => b.pts - a.pts);
    valueLabel = p => p.pts + 'pts';
  } else if (tab === 'r-artilharia') {
    sorted = [...players].sort((a,b) => b.goals - a.goals);
    valueLabel = p => p.goals + ' gols';
  } else if (tab === 'r-assists') {
    sorted = [...players].sort((a,b) => b.assists - a.assists);
    valueLabel = p => p.assists + ' assist.';
  } else {
    sorted = [...players].sort((a,b) => (b.tackles||0) - (a.tackles||0));
    valueLabel = p => (p.tackles||0) + ' desarmes';
  }
  document.getElementById('rachao-stats-list').innerHTML = sorted.map((p, i) => {
    const cls = i===0?'gold':i===1?'silver':i===2?'bronze':'';
    return `<div class="ranking-item">
      <div class="ranking-pos ${cls}">${i+1}</div>
      <div class="ranking-info"><div class="ranking-name">${escapeHtml(p.name)}</div><div class="ranking-detail">${escapeHtml(p.position)} • ${p.matches} jogos</div></div>
      <div class="ranking-value">${valueLabel(p)}</div>
    </div>`;
  }).join('');
}

async function loadRachaoFantasyRanking(period) {
  const scores = await apiGetFantasyScores();
  const filtered = scores.filter(s => s.rachao_id === currentRachaoId || s.rachaoId === currentRachaoId);
  let sorted;
  if (period === 'daily') sorted = filtered.sort((a,b) => (b.daily||0) - (a.daily||0));
  else if (period === 'monthly') sorted = filtered.sort((a,b) => (b.monthly||0) - (a.monthly||0));
  else sorted = filtered.sort((a,b) => (b.points||0) - (a.points||0));
  document.getElementById('rachao-fantasy-list').innerHTML = sorted.map((s, i) => {
    const cls = i===0?'gold':i===1?'silver':i===2?'bronze':'';
    const val = period === 'daily' ? s.daily : period === 'monthly' ? s.monthly : s.points;
    return `<div class="ranking-item">
      <div class="ranking-pos ${cls}">${i+1}</div>
      <div class="ranking-info"><div class="ranking-name">${escapeHtml(s.name)}</div></div>
      <div class="ranking-value">${val||0}pts</div>
    </div>`;
  }).join('');
}

// Tabs do match-detail que são Pro: tab → feature
const PRO_GATED_TABS = {
  'rachao-finance': 'caixa',
  'rachao-ranking': 'fantasy',
  'rachao-stats':   'historico-stats',
};

// ===== TABS =====
function initTabs() {
  document.addEventListener('click', e => {
    if (e.target.classList.contains('tab')) {
      const tab = e.target.dataset.tab;
      // Gate Pro de tabs premium
      if (PRO_GATED_TABS[tab] && !ProManager.isPro()) {
        ProManager.requirePro(PRO_GATED_TABS[tab]);
        return;
      }
      const parent = e.target.closest('.tabs');
      parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      if (['ranking','artilharia','assists','desarmes'].includes(tab)) renderStatsTab(tab);
      if (tab === 'fantasy-ranking') { show('fantasy-ranking-content'); hide('fantasy-team-content'); hide('fantasy-scoring-content'); hide('fantasy-prizes-content'); }
      if (tab === 'fantasy-team') { hide('fantasy-ranking-content'); show('fantasy-team-content'); hide('fantasy-scoring-content'); hide('fantasy-prizes-content'); }
      if (tab === 'fantasy-scoring') { hide('fantasy-ranking-content'); hide('fantasy-team-content'); show('fantasy-scoring-content'); hide('fantasy-prizes-content'); }
      if (tab === 'fantasy-prizes') { hide('fantasy-ranking-content'); hide('fantasy-team-content'); hide('fantasy-scoring-content'); show('fantasy-prizes-content'); loadPrizes(); }
      if (tab === 'rachao-game') { show('rachao-game-content'); hide('rachao-members-content'); hide('rachao-finance-content'); hide('rachao-stats-content'); hide('rachao-ranking-content'); }
      if (tab === 'rachao-members') { hide('rachao-game-content'); show('rachao-members-content'); hide('rachao-finance-content'); hide('rachao-stats-content'); hide('rachao-ranking-content'); }
      if (tab === 'rachao-finance') { hide('rachao-game-content'); hide('rachao-members-content'); show('rachao-finance-content'); hide('rachao-stats-content'); hide('rachao-ranking-content'); }
      if (tab === 'rachao-stats') { hide('rachao-game-content'); hide('rachao-members-content'); hide('rachao-finance-content'); show('rachao-stats-content'); hide('rachao-ranking-content'); loadRachaoStats('r-ranking'); }
      if (tab === 'rachao-ranking') { hide('rachao-game-content'); hide('rachao-members-content'); hide('rachao-finance-content'); hide('rachao-stats-content'); show('rachao-ranking-content'); loadRachaoFantasyRanking('daily'); }
      if (['r-ranking','r-artilharia','r-assists','r-desarmes'].includes(tab)) loadRachaoStats(tab);
      if (tab === 'join-code')   { show('join-code-content');  hide('join-nearby-content'); }
      if (tab === 'join-nearby') { hide('join-code-content');  show('join-nearby-content'); }
    }
    if (e.target.classList.contains('pill')) {
      e.target.closest('.fantasy-period-toggle').querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      renderFantasyRanking(e.target.dataset.period);
    }
  });
}

// ===== UTILITIES =====
function show(id) { document.getElementById(id).style.display = 'block'; }
function hide(id) { document.getElementById(id).style.display = 'none'; }
function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
function closeModal(name) { document.getElementById('modal-' + name).style.display = 'none'; }
