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
  if (apiGetCurrentUser()) navigateTo('dashboard');
}

// ===== NAVIGATION WITH HISTORY API =====
function navigateTo(page, pushState) {
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
    'register-stats': loadRegisterStats,
    'notifications': loadNotifications,
    'admin': loadAdminBadges,
  };
  if (handlers[page]) handlers[page]();
}

// ===== DASHBOARD =====
async function loadDashboard() {
  const user = apiGetCurrentUser();
  if (!user) return;
  document.getElementById('dash-username').textContent = escapeHtml(user.name);

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
  try {
    setLoading(btn, true);
    const user = apiGetCurrentUser();
    const code = generateRachaoCode();
    const result = await apiCreateRachao({
      code, name, location, dayOfWeek, time,
      playersPerTeam: players, tieRule,
      monthlyVenueCost: venueCost, pixKey: pix,
      createdBy: user.id, participants: [user.id]
    });

    await apiAddNotification({ type:'green', icon:'fa-calendar-plus', title:'Novo rachão!', text: name + ' - ' + getDayName(dayOfWeek) });
    showToast('Rachão criado! Código: ' + code);
    currentRachaoId = result.id;
    navigateTo('match-detail');
  } catch (err) {
    console.error('Erro ao criar rachão:', err);
    showToast('Erro ao criar rachão. Tente novamente.');
  } finally {
    setLoading(btn, false);
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

  const createBtn = document.getElementById('btn-create-session');
  const activeArea = document.getElementById('session-active-area');

  if (openSession) {
    currentSessionId = openSession.id;
    document.getElementById('session-date-display').textContent = formatDateBR(openSession.date);
    document.getElementById('session-badge').textContent = 'PRÓXIMO JOGO';
    document.getElementById('session-info').textContent = openSession.confirmed.length + ' confirmados';
    createBtn.style.display = 'none';
    activeArea.style.display = 'block';
    await loadSessionPresence(openSession, rachao, user);
    loadSessionTeams(openSession);
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
}

async function loadSessionTeams(session) {
  if (session.teams) {
    document.getElementById('teams-result').style.display = 'block';
    renderAllTeams(session.teams);
    const rotBtn = document.getElementById('btn-start-rotation');
    const rotState = await apiGetRotationState();
    if (rotState && rotState.active && rotState.sessionId === session.id) {
      rotBtn.innerHTML = '<i class="fas fa-play"></i> CONTINUAR PARTIDA';
      rotBtn.onclick = () => navigateTo('rotation');
    } else if (session.status !== 'done') {
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
  document.getElementById('members-total').textContent = rachao.participants.length + ' participantes';
  const players = (await Promise.all(rachao.participants.map(pid => apiGetPlayerById(pid).catch(() => null)))).filter(Boolean);
  document.getElementById('rachao-members-list').innerHTML = players.map(p => {
    const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
    const isCreator = p.id === rachao.createdBy;
    return `<div class="player-item">
      <div class="player-avatar">${ini}</div>
      <div class="player-info"><div class="player-name">${escapeHtml(p.name)} ${isCreator ? '<span style="color:var(--orange);font-size:10px">ADMIN</span>' : ''}</div><div class="player-detail">${escapeHtml(p.position)} • ${p.goals}G ${p.assists}A</div></div>
    </div>`;
  }).join('');
}

async function loadRachaoFinanceTab(rachao, user) {
  const cost = rachao.monthlyVenueCost || 0;
  const members = rachao.participants.length;
  const perPerson = members > 0 ? Math.ceil(cost / members * 100) / 100 : 0;

  document.getElementById('finance-total-cost').textContent = formatCurrency(cost);
  document.getElementById('finance-members').textContent = members;
  document.getElementById('finance-per-person').textContent = formatCurrency(perPerson);

  const month = getCurrentMonth();
  const monthNames = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const [y, m] = month.split('-');
  document.getElementById('finance-month').textContent = monthNames[parseInt(m)] + ' ' + y;

  let billing = await apiGetBilling(rachao.id, month);
  if (!billing) {
    await apiCreateBilling({
      rachaoId: rachao.id, month, totalCost: cost,
      participantCount: members, perPerson,
      payments: rachao.participants.map(pid => ({ playerId: pid, status: 'pending' }))
    });
    billing = await apiGetBilling(rachao.id, month);
  }
  if (!billing || !billing.payments) { billing = { payments: [] }; }

  const paid = billing.payments.filter(p => p.status === 'paid').length;
  const pending = billing.payments.filter(p => p.status !== 'paid').length;
  document.getElementById('finance-paid-count').textContent = paid;
  document.getElementById('finance-pending-count').textContent = pending;

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
    const isAdmin = rachao.createdBy === user.id;
    const pid = pay.player_id || pay.playerId;
    const adminBtn = isAdmin && pay.status !== 'paid'
      ? `<button class="btn-success btn-sm" onclick="confirmBillingPayment('${billingId}','${pid}')">✓</button>` : '';
    return `<div class="player-item">
      <div class="player-avatar">${ini}</div>
      <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${formatCurrency(perPerson)}</div></div>
      <span class="payment-badge ${statusClass}">${statusLabel}</span>
      ${adminBtn}
    </div>`;
  }).join('');

  document.getElementById('finance-pix-amount').textContent = 'Valor: ' + formatCurrency(perPerson);
  document.getElementById('finance-pix-key').value = rachao.pixKey || '';
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

// ===== DRAW TEAMS =====
async function drawTeams() {
  const btn = document.getElementById('btn-draw-teams');
  try {
  setLoading(btn, true);
  const session = await apiGetSessionById(currentSessionId);
  const rachao = await apiGetRachaoById(currentRachaoId);
  if (!session || !rachao) return;

  const teamSize = rachao.playersPerTeam + 1;
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

  const numFullTeams = Math.floor(shuffled.length / teamSize);
  const leftoverCount = shuffled.length - (numFullTeams * teamSize);
  const totalTeams = numFullTeams + (leftoverCount > 0 ? 1 : 0);
  const teams = [];
  const usedGks = [];

  for (let t = 0; t < numFullTeams; t++) {
    const gk = gks[t] || null;
    if (gk) usedGks.push(gk);
    teams.push({ goalkeeper: gk, players: [], name: getTeamName(t) });
  }

  const extraGks = gks.filter(g => !usedGks.includes(g));
  const allField = [...field, ...extraGks];
  let fieldIdx = 0;
  for (let t = 0; t < numFullTeams; t++) {
    const needed = teams[t].goalkeeper ? rachao.playersPerTeam : teamSize;
    for (let i = 0; i < needed && fieldIdx < allField.length; i++) {
      teams[t].players.push(allField[fieldIdx++]);
    }
  }

  if (fieldIdx < allField.length) {
    const remainingPlayers = allField.slice(fieldIdx);
    const remainGk = remainingPlayers.find(p => p.position === 'Goleiro') || null;
    const remainField = remainingPlayers.filter(p => p !== remainGk);
    teams.push({ goalkeeper: remainGk, players: remainField, name: getTeamName(numFullTeams) });
  }

  const numTeams = teams.length;
  await apiUpdateSession(currentSessionId, {
    teams, leftover: [],
    confirmed: session.confirmed, waiting: session.waiting
  });

  document.getElementById('teams-result').style.display = 'block';
  renderAllTeams(teams);
  await apiAddNotification({ type:'orange', icon:'fa-shuffle', title:'Times sorteados!', text: `${numTeams} times formados` });
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
  const players = (await Promise.all(session.confirmed.map(pid => apiGetPlayerById(pid).catch(() => null)))).filter(Boolean);
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
  const stats = [];
  for (const pid of session.confirmed) {
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

// ===== TABS =====
function initTabs() {
  document.addEventListener('click', e => {
    if (e.target.classList.contains('tab')) {
      const parent = e.target.closest('.tabs');
      parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      const tab = e.target.dataset.tab;
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
