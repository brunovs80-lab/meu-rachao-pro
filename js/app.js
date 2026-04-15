// ========== MEU RACHÃO PRO - MAIN APP (API VERSION) ==========
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

// ===== NAVIGATION =====
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); onPageLoad(page); }
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

// ===== PHONE INPUT =====
function initPhoneInput() {
  const input = document.getElementById('phone-input');
  input.addEventListener('input', e => {
    let d = e.target.value.replace(/\D/g, '');
    if (d.length > 11) d = d.slice(0, 11);
    e.target.value = formatPhone(d);
  });
  document.getElementById('btn-login').addEventListener('click', handleLogin);
  input.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
}

async function handleLogin() {
  const phone = document.getElementById('phone-input').value.replace(/\D/g, '');
  if (phone.length < 10) { showToast('Digite um número válido'); return; }
  document.getElementById('password-phone').textContent = formatPhone(phone);
  try {
    const existing = await apiLogin(phone);
    if (existing) {
      document.getElementById('password-title').textContent = 'Digite sua senha';
      document.getElementById('btn-password').textContent = 'ENTRAR';
      document.getElementById('btn-password').onclick = handlePasswordLogin;
    } else {
      navigateTo('register');
      return;
    }
  } catch (err) {
    console.error('Erro ao verificar telefone:', err);
    showToast('Erro de conexão. Tente novamente.');
    return;
  }
  navigateTo('password');
  setTimeout(() => document.querySelector('#page-password .code-digit')?.focus(), 100);
}

// ===== PASSWORD INPUT =====
function initPasswordInputs() {
  // Configurar navegação de dígitos para cada grupo separadamente
  document.querySelectorAll('.code-inputs').forEach(group => {
    const digits = group.querySelectorAll('.code-digit');
    digits.forEach((inp, i) => {
      inp.addEventListener('input', e => { if (e.target.value && i < digits.length - 1) digits[i+1].focus(); });
      inp.addEventListener('keydown', e => { if (e.key === 'Backspace' && !e.target.value && i > 0) digits[i-1].focus(); });
    });
  });
  document.getElementById('btn-password').addEventListener('click', handlePasswordLogin);
}

function getPasswordFromInputs(container) {
  return Array.from(container.querySelectorAll('.code-digit')).map(d => d.value).join('');
}

async function handlePasswordLogin() {
  const password = getPasswordFromInputs(document.getElementById('page-password'));
  if (password.length < 6) { showToast('Digite a senha de 6 dígitos'); return; }
  const phone = document.getElementById('phone-input').value.replace(/\D/g, '');
  try {
    const existing = await apiLogin(phone);
    if (!existing) { showToast('Usuário não encontrado'); return; }
    if (existing.password !== password) { showToast('Senha incorreta'); return; }
    apiSetCurrentUser(existing);
    navigateTo('dashboard');
    showToast('Bem-vindo de volta, ' + existing.name + '!');
  } catch (err) {
    console.error('Erro no login:', err);
    showToast('Erro de conexão. Tente novamente.');
  }
}

// ===== REGISTER =====
document.getElementById('btn-register').addEventListener('click', async () => {
  const name = document.getElementById('register-name').value.trim().substring(0, 50);
  const position = document.getElementById('register-position').value;
  if (!name) { showToast('Digite seu nome'); return; }
  const password = getPasswordFromInputs(document.getElementById('page-register'));
  if (password.length < 6) { showToast('Crie uma senha de 6 dígitos'); return; }
  const phone = document.getElementById('phone-input').value.replace(/\D/g, '');

  const allPlayers = await apiGetPlayers();
  const newUser = await apiCreatePlayer({
    name, phone, position: position || 'Meia',
    isAdmin: allPlayers.length === 0,
    password
  });

  apiSetCurrentUser(newUser);
  navigateTo('dashboard');
  showToast('Conta criada!');
  await apiAddNotification({ type:'purple', icon:'fa-user-plus', title:'Bem-vindo!', text:'Sua conta foi criada.' });
});

// ===== DASHBOARD =====
async function loadDashboard() {
  const user = apiGetCurrentUser();
  if (!user) return;
  document.getElementById('dash-username').textContent = escapeHtml(user.name);

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

  const session = await apiGetSessionById(currentSessionId);
  const isConf = session.confirmed.includes(user.id);

  if (isConf) {
    await apiTogglePresence(currentSessionId, user.id, 'cancel');
    showToast('Presença cancelada');
  } else {
    await apiTogglePresence(currentSessionId, user.id, 'confirm');
    showToast('Presença confirmada!');
  }
}

async function endSession() {
  await apiUpdateSession(currentSessionId, { status: 'done' });
  showToast('Jogo encerrado');
  await loadRachaoDetail();
}

// ===== DRAW TEAMS =====
async function drawTeams() {
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
  // Todos jogam — distribuir em times iguais
  const numTeams = Math.max(2, Math.round(shuffled.length / teamSize));
  const teams = [];

  for (let t = 0; t < numTeams; t++) {
    const gk = gks[t] || null;
    const teamPlayers = [];
    teams.push({ goalkeeper: gk, players: teamPlayers, name: getTeamName(t) });
  }

  // Distribuir goleiros que não foram alocados como goleiro nas vagas de campo
  const extraGks = gks.slice(numTeams);
  const allField = [...field, ...extraGks];

  // Distribuir jogadores de campo nos times via round-robin
  allField.forEach((p, i) => {
    const teamIdx = i % numTeams;
    teams[teamIdx].players.push(p);
  });

  await apiUpdateSession(currentSessionId, {
    teams, leftover: [],
    confirmed: session.confirmed, waiting: session.waiting
  });

  document.getElementById('teams-result').style.display = 'block';
  renderAllTeams(teams);
  await apiAddNotification({ type:'orange', icon:'fa-shuffle', title:'Times sorteados!', text: `${numTeams} times formados` });
  showToast(`${numTeams} times sorteados!`);
  await loadRachaoDetail();
}

function getTeamName(idx) { return 'Time ' + (idx + 1); }
function getTeamClass(idx) { return ['team-a','team-b','team-c','team-d'][idx % 4]; }

function renderAllTeams(teams) {
  const container = document.getElementById('teams-container');
  container.innerHTML = teams.map((t, i) => {
    let html = '';
    if (t.goalkeeper) html += `<div class="team-player"><span class="jersey">🧤</span> ${escapeHtml(t.goalkeeper.name)}</div>`;
    t.players.forEach(p => { html += `<div class="team-player"><span class="jersey">👕</span> ${escapeHtml(p.name)}</div>`; });
    return `<div class="team-card ${getTeamClass(i)}"><h3><i class="fas fa-shirt"></i> ${t.name}</h3>${html}</div>`;
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

// ===== ADMIN PAYMENTS =====
async function loadAdminPayments() {
  const user = apiGetCurrentUser();
  const rachaos = (await apiGetRachaos()).filter(r => r.createdBy === user.id && r.monthlyVenueCost > 0);
  const list = document.getElementById('admin-payment-list');
  if (rachaos.length === 0) { list.innerHTML = '<p class="text-muted" style="padding:16px;text-align:center">Nenhum rachão com cobrança</p>'; return; }

  const month = getCurrentMonth();
  let html = '';
  for (const r of rachaos) {
    const perPerson = r.participants.length > 0 ? Math.ceil(r.monthlyVenueCost / r.participants.length * 100) / 100 : 0;
    let billing = await apiGetBilling(r.id, month);
    if (!billing) {
      await apiCreateBilling({ rachaoId: r.id, month, totalCost: r.monthlyVenueCost, participantCount: r.participants.length, perPerson, payments: r.participants.map(pid => ({ playerId: pid, status: 'pending' })) });
      billing = await apiGetBilling(r.id, month);
    }
    if (!billing || !billing.payments) continue;

    const paid = billing.payments.filter(p => p.status === 'paid').length;
    const total = billing.payments.length;

    const payHtmls = await Promise.all(billing.payments.map(async pay => {
      const pid = pay.player_id || pay.playerId;
      const p = await apiGetPlayerById(pid).catch(() => null);
      if (!p) return '';
      const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
      const statusLabel = pay.status === 'paid' ? 'Pago' : pay.status === 'awaiting_confirmation' ? 'Aguardando' : 'Pendente';
      return `<div class="admin-pay-item">
        <div class="player-avatar">${ini}</div>
        <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${formatCurrency(perPerson)} • ${statusLabel}</div></div>
        <div class="admin-pay-actions">
          ${pay.status !== 'paid' ? `<button class="btn-success" onclick="confirmBillingPayment('${billing.id}','${pid}')">✓ Pago</button>` : ''}
          ${!p.blocked ? `<button class="btn-danger" onclick="blockPlayer('${p.id}')">Bloquear</button>` : `<button class="btn-success" onclick="unblockPlayer('${p.id}')">Liberar</button>`}
        </div>
      </div>`;
    }));

    html += `<div class="card" style="margin-bottom:12px">
      <h3>${escapeHtml(r.name)}</h3>
      <p class="text-muted" style="font-size:12px">${paid}/${total} pagos • ${formatCurrency(perPerson)}/pessoa</p>
      <div style="margin-top:8px">${payHtmls.join('')}</div>
    </div>`;
  }
  list.innerHTML = html;
}

// ===== BLOCK/UNBLOCK =====
async function blockPlayer(pid) {
  await apiBlockPlayer(pid);
  const p = await apiGetPlayerById(pid);
  await apiAddNotification({ type:'red', icon:'fa-ban', title:'Jogador bloqueado', text: p.name + ' bloqueado por inadimplência' });
  showToast('Jogador bloqueado');
  await loadAdminPayments();
}

async function unblockPlayer(pid) {
  await apiUnblockPlayer(pid);
  showToast('Jogador desbloqueado');
  if (document.getElementById('page-admin-blocked').classList.contains('active')) await loadAdminBlocked();
}

// ===== BLOCKED / RELEASE =====
async function loadAdminBlocked() {
  const blocked = await apiGetBlockedPlayers();
  const releases = await apiGetReleaseRequests();
  const reqCard = document.getElementById('release-requests-card');

  if (releases.length > 0) {
    reqCard.style.display = 'block';
    const relHtml = await Promise.all(releases.map(async r => {
      const p = await apiGetPlayerById(r.playerId).catch(() => null);
      if (!p) return '';
      const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
      return `<div class="release-item">
        <div class="player-avatar" style="background:var(--orange)">${ini}</div>
        <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${escapeHtml(r.message || 'Sem mensagem')}</div></div>
        <div class="admin-pay-actions">
          <button class="btn-success" onclick="approveRelease('${r.id}','${r.playerId}')">Liberar</button>
          <button class="btn-danger" onclick="denyRelease('${r.id}')">Negar</button>
        </div>
      </div>`;
    }));
    document.getElementById('release-requests-list').innerHTML = relHtml.join('');
  } else reqCard.style.display = 'none';

  const list = document.getElementById('blocked-players-list');
  const empty = document.getElementById('blocked-empty');
  if (blocked.length === 0) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  const blockedHtml = await Promise.all(blocked.map(async pid => {
    const p = await apiGetPlayerById(pid).catch(() => null);
    if (!p) return '';
    const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
    return `<div class="blocked-item">
      <div class="player-avatar" style="background:var(--red)">${ini}</div>
      <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${escapeHtml(p.position)} • Bloqueado</div></div>
      <button class="btn-success" onclick="unblockPlayer('${pid}');loadAdminBlocked()">Desbloquear</button>
    </div>`;
  }));
  list.innerHTML = blockedHtml.join('');
}

async function requestRelease() {
  const user = apiGetCurrentUser();
  if (!user) return;
  const msg = document.getElementById('release-message').value.trim();
  try {
    await apiCreateReleaseRequest(user.id, msg);
    await apiAddNotification({ type:'orange', icon:'fa-hand', title:'Pedido de liberação', text: user.name + ' solicita liberação' });
    showToast('Pedido enviado ao admin!');
  } catch { showToast('Pedido já enviado'); }
  closeModal('request-release');
}

async function approveRelease(reqId, playerId) {
  await unblockPlayer(playerId);
  await apiDeleteReleaseRequest(reqId);
  showToast('Jogador liberado!');
  await loadAdminBlocked();
}

async function denyRelease(reqId) {
  await apiDeleteReleaseRequest(reqId);
  showToast('Pedido negado');
  await loadAdminBlocked();
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
}

// ===== ADMIN STATS VALIDATION =====
async function loadAdminStats() {
  const pending = await apiGetPendingStats();
  const list = document.getElementById('pending-stats-list');
  const empty = document.getElementById('pending-stats-empty');
  if (pending.length === 0) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  const html = await Promise.all(pending.map(async s => {
    const p = await apiGetPlayerById(s.playerId).catch(() => null);
    const rachao = s.rachaoId ? await apiGetRachaoById(s.rachaoId).catch(() => null) : null;
    if (!p) return '';
    let chips = '';
    if (s.isGoalkeeper) {
      if (s.saves) chips += `<span class="stat-chip positive"><i class="fas fa-hand"></i> ${s.saves} defesas</span>`;
      if (s.goalsConceded) chips += `<span class="stat-chip negative"><i class="fas fa-futbol"></i> ${s.goalsConceded} gols sofr.</span>`;
      if (s.cleanSheet) chips += `<span class="stat-chip positive"><i class="fas fa-shield"></i> Clean Sheet</span>`;
    } else {
      if (s.goals) chips += `<span class="stat-chip positive"><i class="fas fa-futbol"></i> ${s.goals} gol(s)</span>`;
      if (s.assists) chips += `<span class="stat-chip positive"><i class="fas fa-handshake"></i> ${s.assists} assist.</span>`;
      if (s.tackles) chips += `<span class="stat-chip positive"><i class="fas fa-shoe-prints"></i> ${s.tackles} desarmes</span>`;
      if (s.fouls) chips += `<span class="stat-chip negative"><i class="fas fa-triangle-exclamation"></i> ${s.fouls} faltas</span>`;
      if (s.yellows) chips += `<span class="stat-chip negative" style="background:rgba(255,214,0,0.15);color:var(--yellow)"><i class="fas fa-square"></i> ${s.yellows} amarelo</span>`;
      if (s.reds) chips += `<span class="stat-chip negative"><i class="fas fa-square"></i> ${s.reds} vermelho</span>`;
    }
    return `<div class="stat-validation-card">
      <div class="stat-validation-header"><h4>${escapeHtml(p.name)}</h4><span class="match-label">${rachao ? escapeHtml(rachao.name) : ''}</span></div>
      <div class="stat-validation-details">${chips}</div>
      <div class="stat-val-actions">
        <button class="btn-success" onclick="validateStat('${s.id}',true)"><i class="fas fa-check"></i> Aprovar</button>
        <button class="btn-danger" onclick="validateStat('${s.id}',false)"><i class="fas fa-xmark"></i> Rejeitar</button>
      </div>
    </div>`;
  }));
  list.innerHTML = html.join('');
}

async function validateStat(statId, approved) {
  await apiValidateStat(statId, approved);
  showToast(approved ? 'Estatística aprovada!' : 'Estatística rejeitada');
  await loadAdminStats();
}

async function loadAdminBadges() {
  const pending = await apiGetPendingStats();
  const releases = await apiGetReleaseRequests();
  document.getElementById('admin-pending-count').textContent = pending.length > 0 ? pending.length : '';
  document.getElementById('admin-release-count').textContent = releases.length > 0 ? releases.length : '';
}

// ===== PLAYERS =====
async function loadPlayers() { renderPlayerList(await apiGetPlayers()); }

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

async function filterPlayers() {
  const q = document.getElementById('search-players').value.toLowerCase();
  const players = await apiGetPlayers();
  renderPlayerList(players.filter(p => p.name.toLowerCase().includes(q)));
}

async function addPlayer() {
  const name = document.getElementById('player-add-name').value.trim();
  const phone = document.getElementById('player-add-phone').value.replace(/\D/g, '');
  const position = document.getElementById('player-add-position').value;
  if (!name) { showToast('Digite o nome'); return; }
  await apiCreatePlayer({ name, phone, position });
  showToast('Jogador adicionado!');
  navigateTo('players');
}

// ===== PROFILE =====
async function loadProfile() {
  const user = apiGetCurrentUser();
  if (!user) return;
  const fresh = await apiGetPlayerById(user.id).catch(() => user);
  document.getElementById('profile-name').textContent = fresh.name;
  document.getElementById('profile-phone').textContent = formatPhone(fresh.phone);
  document.getElementById('profile-position').textContent = fresh.position;
  document.getElementById('profile-matches').textContent = fresh.matches || 0;
  document.getElementById('profile-goals').textContent = fresh.goals || 0;
  document.getElementById('profile-assists').textContent = fresh.assists || 0;
  document.getElementById('profile-desarmes').textContent = fresh.tackles || 0;
}

function logout() { apiLogout(); navigateTo('login'); showToast('Até a próxima!'); }

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

// ===== ROTATION SYSTEM =====
async function loadRotation() {
  const state = await apiGetRotationState();
  const active = document.getElementById('rotation-active');
  const empty = document.getElementById('rotation-empty');
  const historyCard = document.getElementById('rotation-history-card');

  if (state && state.active) {
    active.style.display = 'block';
    empty.style.display = 'none';
    renderRotationState(state);
  } else {
    active.style.display = 'none';
    empty.style.display = 'flex';
  }

  if (state && state.rounds && state.rounds.length > 0) {
    historyCard.style.display = 'block';
    renderRotationHistory(state.rounds);
  } else {
    historyCard.style.display = 'none';
  }
}

async function startRotation() {
  const session = await apiGetSessionById(currentSessionId);
  const rachao = await apiGetRachaoById(currentRachaoId);
  if (!session || !rachao || !session.teams || session.teams.length < 2) {
    showToast('Sorteie os times primeiro');
    return;
  }

  const state = {
    active: true, sessionId: session.id, rachaoId: rachao.id,
    matchName: rachao.name, tieRule: rachao.tieRule || 'playing_leaves',
    playersPerTeam: rachao.playersPerTeam, round: 1, scoreA: 0, scoreB: 0,
    teamA: { name: session.teams[0].name, goalkeeper: session.teams[0].goalkeeper, players: session.teams[0].players },
    teamB: { name: session.teams[1].name, goalkeeper: session.teams[1].goalkeeper, players: session.teams[1].players },
    queue: [], rounds: []
  };

  for (let i = 2; i < session.teams.length; i++) {
    const t = session.teams[i];
    const teamPlayers = [];
    if (t.goalkeeper) teamPlayers.push(t.goalkeeper);
    teamPlayers.push(...t.players);
    state.queue.push({ name: t.name, players: teamPlayers });
  }

  await apiSaveRotationState(state);
  showToast('Rotação iniciada!');
  navigateTo('rotation');
}

function renderRotationState(state) {
  document.getElementById('rotation-match-name').textContent = state.matchName;
  document.getElementById('rotation-round-info').textContent = `Rodada ${state.round}`;
  document.getElementById('rot-score-a').textContent = state.scoreA;
  document.getElementById('rot-score-b').textContent = state.scoreB;
  document.querySelector('#rot-team-a h4').textContent = state.teamA.name;
  document.querySelector('#rot-team-b h4').textContent = state.teamB.name;

  const nextCard = document.getElementById('rot-next-team-card');
  if (state.queue.length > 0) {
    nextCard.style.display = 'block';
    const next = state.queue[0];
    document.getElementById('rot-next-team-list').innerHTML = next.players.map(p => {
      const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
      return `<div class="player-item"><div class="player-avatar" style="background:var(--orange)">${ini}</div><div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${escapeHtml(p.position)}</div></div></div>`;
    }).join('');
  } else { nextCard.style.display = 'none'; }

  const queueEl = document.getElementById('rot-queue');
  if (state.queue.length > 1) {
    queueEl.innerHTML = state.queue.slice(1).map((team, i) =>
      `<div class="player-item"><div class="player-avatar">${i + 2}</div><div class="player-info"><div class="player-name">${team.name}</div><div class="player-detail">${team.players.length} jogadores</div></div></div>`
    ).join('');
  } else {
    queueEl.innerHTML = '<p class="text-muted" style="padding:8px;font-size:13px">Sem times na espera</p>';
  }
}

async function addGoalRotation(team) {
  const state = await apiGetRotationState();
  if (!state || !state.active) return;
  if (team === 'a') state.scoreA++; else state.scoreB++;
  await apiSaveRotationState(state);
  document.getElementById('rot-score-' + team).textContent = team === 'a' ? state.scoreA : state.scoreB;
}

async function finishRound() {
  const state = await apiGetRotationState();
  if (!state || !state.active) return;

  state.rounds.push({ round: state.round, teamA: state.teamA.name, teamB: state.teamB.name, scoreA: state.scoreA, scoreB: state.scoreB });

  let winner, loser;
  if (state.scoreA > state.scoreB) { winner = 'a'; loser = 'b'; }
  else if (state.scoreB > state.scoreA) { winner = 'b'; loser = 'a'; }
  else { winner = null; loser = 'both'; }

  if (state.queue.length === 0) {
    state.round++; state.scoreA = 0; state.scoreB = 0;
    await apiSaveRotationState(state);
    showToast(`Rodada ${state.round - 1} encerrada!`);
    renderRotationState(state);
    renderRotationHistory(state.rounds);
    document.getElementById('rotation-history-card').style.display = 'block';
    return;
  }

  const nextTeamData = state.queue.shift();

  if (loser === 'both') {
    const losingPlayers = [];
    if (state.teamA.goalkeeper) losingPlayers.push(state.teamA.goalkeeper);
    losingPlayers.push(...state.teamA.players);
    if (state.teamB.goalkeeper) losingPlayers.push(state.teamB.goalkeeper);
    losingPlayers.push(...state.teamB.players);
    state.queue.push({ name: state.teamA.name, players: losingPlayers.slice(0, Math.ceil(losingPlayers.length / 2)) });
    state.queue.push({ name: state.teamB.name, players: losingPlayers.slice(Math.ceil(losingPlayers.length / 2)) });
    state.teamA = buildRotationTeam(nextTeamData);
    if (state.queue.length > 0) { state.teamB = buildRotationTeam(state.queue.shift()); }
  } else {
    const loserTeam = loser === 'a' ? state.teamA : state.teamB;
    const loserPlayers = [];
    if (loserTeam.goalkeeper) loserPlayers.push(loserTeam.goalkeeper);
    loserPlayers.push(...loserTeam.players);
    state.queue.push({ name: loserTeam.name, players: loserPlayers });
    const newTeam = buildRotationTeam(nextTeamData);
    if (loser === 'a') state.teamA = newTeam; else state.teamB = newTeam;
  }

  state.round++; state.scoreA = 0; state.scoreB = 0;
  await apiSaveRotationState(state);
  renderRotationState(state);
  renderRotationHistory(state.rounds);
  document.getElementById('rotation-history-card').style.display = 'block';
  showToast(`Rodada ${state.round - 1} encerrada!`);
}

function buildRotationTeam(teamData) {
  const gk = teamData.players.find(p => p.position === 'Goleiro') || null;
  const field = teamData.players.filter(p => p !== gk);
  return { name: teamData.name, goalkeeper: gk, players: field };
}

async function endRotation() {
  const state = await apiGetRotationState();
  if (!state) return;
  state.active = false;
  await apiSaveRotationState(state);
  await apiAddNotification({ type: 'purple', icon: 'fa-flag-checkered', title: 'Rachão encerrado!', text: `${state.rounds.length} rodadas jogadas` });
  showToast('Rachão encerrado!');
  await loadRotation();
}

function renderRotationHistory(rounds) {
  document.getElementById('rotation-history').innerHTML = rounds.map(r => {
    const resultText = r.scoreA > r.scoreB ? `${r.teamA} venceu` : r.scoreB > r.scoreA ? `${r.teamB} venceu` : 'Empate';
    return `<div class="rotation-round-item">
      <div class="round-number">${r.round}</div>
      <div class="round-result">${r.teamA} vs ${r.teamB} — <span class="round-score">${r.scoreA} x ${r.scoreB}</span> • ${resultText}</div>
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

// ===== TIMER (cronômetro regressivo) =====
function startTimer() {
  const minutes = parseInt(document.getElementById('timer-minutes').value) || 10;
  timerTotalSeconds = minutes * 60;
  timerSeconds = timerTotalSeconds;
  timerPaused = false;
  document.getElementById('timer-setup').style.display = 'none';
  document.getElementById('timer-running').style.display = 'block';
  document.getElementById('timer-finished').style.display = 'none';
  document.getElementById('btn-pause-timer').innerHTML = '<i class="fas fa-pause"></i> PAUSAR';
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    if (!timerPaused) {
      timerSeconds--;
      updateTimerDisplay();
      if (timerSeconds <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        document.getElementById('timer-running').style.display = 'none';
        document.getElementById('timer-finished').style.display = 'block';
        showToast('Tempo esgotado!');
      }
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(timerSeconds / 60);
  const s = timerSeconds % 60;
  document.getElementById('timer-display').textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  const pct = timerTotalSeconds > 0 ? (timerSeconds / timerTotalSeconds) * 100 : 0;
  document.getElementById('timer-progress').style.width = pct + '%';
  if (pct < 20) document.getElementById('timer-progress').style.background = 'var(--red)';
  else if (pct < 50) document.getElementById('timer-progress').style.background = 'var(--yellow)';
  else document.getElementById('timer-progress').style.background = 'var(--orange)';
}

function pauseTimer() {
  timerPaused = !timerPaused;
  const btn = document.getElementById('btn-pause-timer');
  btn.innerHTML = timerPaused ? '<i class="fas fa-play"></i> RETOMAR' : '<i class="fas fa-pause"></i> PAUSAR';
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  resetTimer();
}

function resetTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  timerSeconds = 0;
  timerPaused = false;
  document.getElementById('timer-setup').style.display = 'block';
  document.getElementById('timer-running').style.display = 'none';
  document.getElementById('timer-finished').style.display = 'none';
}

// ===== RACHÃO STATS (dentro do rachão) =====
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

// ===== UTILITIES =====
function show(id) { document.getElementById(id).style.display = 'block'; }
function hide(id) { document.getElementById(id).style.display = 'none'; }
function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
function closeModal(name) { document.getElementById('modal-' + name).style.display = 'none'; }
