// ========== MEU RACHÃO PRO - MAIN APP ==========
let currentRachaoId = null;
let currentSessionId = null;

document.addEventListener('DOMContentLoaded', () => {
  migrateToRachaoModel();
  seedDemoData();
  initPhoneInput();
  initCodeInputs();
  initTabs();
  initRachaoForm();
  checkAuth();
  registerSW();
  initOfflineDetection();
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
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

function checkAuth() {
  if (getCurrentUser()) navigateTo('dashboard');
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

function handleLogin() {
  const phone = document.getElementById('phone-input').value.replace(/\D/g, '');
  if (phone.length < 10) { showToast('Digite um número válido'); return; }
  document.getElementById('verify-phone').textContent = formatPhone(phone);
  navigateTo('verify');
}

// ===== VERIFICATION =====
function initCodeInputs() {
  const digits = document.querySelectorAll('.code-digit');
  digits.forEach((inp, i) => {
    inp.addEventListener('input', e => { if (e.target.value && i < digits.length - 1) digits[i+1].focus(); });
    inp.addEventListener('keydown', e => { if (e.key === 'Backspace' && !e.target.value && i > 0) digits[i-1].focus(); });
  });
  document.getElementById('btn-verify').addEventListener('click', handleVerify);
  document.getElementById('resend-code').addEventListener('click', e => { e.preventDefault(); showToast('Código reenviado!'); });
}

function handleVerify() {
  const code = Array.from(document.querySelectorAll('.code-digit')).map(d => d.value).join('');
  if (code.length < 4) { showToast('Digite o código completo'); return; }
  const phone = document.getElementById('phone-input').value.replace(/\D/g, '');
  const existing = getPlayers().find(p => p.phone === phone);
  if (existing) { setCurrentUser(existing); navigateTo('dashboard'); showToast('Bem-vindo de volta, ' + existing.name + '!'); }
  else navigateTo('register');
}

// ===== REGISTER =====
document.getElementById('btn-register').addEventListener('click', () => {
  const name = document.getElementById('register-name').value.trim().substring(0, 50);
  const position = document.getElementById('register-position').value;
  if (!name) { showToast('Digite seu nome'); return; }
  const phone = document.getElementById('phone-input').value.replace(/\D/g, '');
  const newUser = {
    id: generateId(), name, phone, position: position || 'Meia',
    goals:0, assists:0, tackles:0, fouls:0, yellows:0, reds:0, saves:0, cleanSheets:0,
    matches:0, blocked:false, isAdmin: getPlayers().length === 0
  };
  const ps = getPlayers(); ps.push(newUser); savePlayers(ps);
  setCurrentUser(newUser);
  navigateTo('dashboard');
  showToast('Conta criada!');
  addNotification({ type:'purple', icon:'fa-user-plus', title:'Bem-vindo!', text:'Sua conta foi criada.' });
});

// ===== DASHBOARD =====
function loadDashboard() {
  const user = getCurrentUser();
  if (!user) return;
  document.getElementById('dash-username').textContent = escapeHtml(user.name);

  const rachaos = getRachaos().filter(r => r.status === 'active' && r.participants.includes(user.id));
  const listEl = document.getElementById('dash-rachaos-list');
  const emptyEl = document.getElementById('dash-no-rachao');

  if (rachaos.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
  } else {
    emptyEl.style.display = 'none';
    listEl.innerHTML = rachaos.map(r => {
      const sessions = getSessionsByRachao(r.id).filter(s => s.status === 'open');
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

  loadDashRanking();
}

function loadDashRanking() {
  const players = getPlayers().map(p => ({
    ...p, totalPts: calcPlayerPoints(p)
  })).sort((a,b) => b.totalPts - a.totalPts).slice(0, 5);

  document.getElementById('dash-ranking').innerHTML = players.map((p, i) => {
    const cls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    return `<div class="ranking-item">
      <div class="ranking-pos ${cls}">${i+1}</div>
      <div class="ranking-info"><div class="ranking-name">${escapeHtml(p.name)}</div><div class="ranking-detail">${escapeHtml(p.position)} • ${p.matches} jogos</div></div>
      <div class="ranking-value">${p.totalPts}pts</div>
    </div>`;
  }).join('');
}

function calcPlayerPoints(p) {
  if (p.position === 'Goleiro') {
    return Math.round(((p.saves || 0) * POINTS.goalkeeper.save + (p.cleanSheets || 0) * POINTS.goalkeeper.cleanSheet + (p.matches || 0) * POINTS.goalkeeper.presence) * POINTS.goalkeeper.multiplier);
  }
  return (p.goals || 0) * POINTS.field.goal + (p.assists || 0) * POINTS.field.assist + (p.tackles || 0) * POINTS.field.tackle + (p.matches || 0) * POINTS.field.presence - (p.fouls || 0) * Math.abs(POINTS.field.foul) - (p.yellows || 0) * Math.abs(POINTS.field.yellow) - (p.reds || 0) * Math.abs(POINTS.field.red);
}

// ===== RACHÕES LIST =====
function loadRachaos() {
  const user = getCurrentUser();
  const rachaos = getRachaos().filter(r => r.participants.includes(user.id) || r.createdBy === user.id);
  const list = document.getElementById('matches-list');
  const empty = document.getElementById('matches-empty');

  if (rachaos.length === 0) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  list.innerHTML = rachaos.map(r => {
    const memberCount = r.participants.length;
    const sessions = getSessionsByRachao(r.id);
    const openSessions = sessions.filter(s => s.status === 'open').length;
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
  const existing = new Set(getRachaos().map(r => r.code));
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if (!existing.has(code)) return code;
  }
  return Date.now().toString(36).toUpperCase().slice(-6);
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

function createRachao() {
  const name = document.getElementById('rachao-name').value.trim().substring(0, 60);
  const dayOfWeek = parseInt(document.getElementById('rachao-day').value);
  const time = document.getElementById('rachao-time').value;
  const location = document.getElementById('rachao-location').value.trim().substring(0, 100);
  const players = parseInt(document.getElementById('rachao-players').value);
  const tieRule = document.getElementById('rachao-tie-rule').value;
  const venueCost = parseFloat(document.getElementById('rachao-venue-cost').value) || 0;
  const pix = document.getElementById('rachao-pix').value.trim();

  if (!name || !time || !location) { showToast('Preencha todos os campos'); return; }

  const user = getCurrentUser();
  const code = generateRachaoCode();
  const rachao = {
    id: generateId(), code, name, location, dayOfWeek, time,
    playersPerTeam: players, tieRule,
    monthlyVenueCost: venueCost, pixKey: pix,
    participants: [user.id], createdBy: user.id, status: 'active'
  };

  const rs = getRachaos(); rs.push(rachao); saveRachaos(rs);
  addNotification({ type:'green', icon:'fa-calendar-plus', title:'Novo rachão!', text: name + ' - ' + getDayName(dayOfWeek) });
  showToast('Rachão criado! Código: ' + code);
  currentRachaoId = rachao.id;
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
function joinRachaoByCode() {
  const codeInput = document.getElementById('join-code');
  const code = codeInput.value.trim().toUpperCase();
  if (code.length !== 6) { showToast('Digite o código de 6 dígitos'); return; }
  const rachao = getRachaos().find(r => r.code === code);
  if (!rachao) { showToast('Código não encontrado'); return; }
  const user = getCurrentUser();
  if (!user) { showToast('Faça login primeiro'); return; }
  if (rachao.participants.includes(user.id)) {
    showToast('Você já está neste rachão');
    currentRachaoId = rachao.id;
    navigateTo('match-detail');
    return;
  }
  rachao.participants.push(user.id);
  updateRachao(rachao.id, { participants: rachao.participants });
  addNotification({ type:'green', icon:'fa-right-to-bracket', title:'Entrou no rachão!', text: user.name + ' entrou em ' + rachao.name });
  showToast('Você entrou no rachão!');
  codeInput.value = '';
  currentRachaoId = rachao.id;
  navigateTo('match-detail');
}

function shareRachaoCode() {
  const rachao = getRachaoById(currentRachaoId);
  if (!rachao) return;
  const text = `⚽ ${rachao.name}\n📅 ${getDayName(rachao.dayOfWeek)} às ${rachao.time}\n📍 ${rachao.location}\n\n🔑 Código: ${rachao.code}\n\nEntre no app Meu Rachão Pro e use o código acima para participar!`;
  if (navigator.share) {
    navigator.share({ title: rachao.name, text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('Código copiado!')).catch(() => showToast('Código: ' + rachao.code));
  }
}

// ===== RACHÃO DETAIL =====
function loadRachaoDetail() {
  const rachao = getRachaoById(currentRachaoId);
  if (!rachao) return;
  const user = getCurrentUser();

  document.getElementById('detail-rachao-title').textContent = rachao.name;
  document.getElementById('detail-day').textContent = getDayName(rachao.dayOfWeek);
  document.getElementById('detail-time').textContent = rachao.time;
  document.getElementById('detail-location').textContent = rachao.location;
  document.getElementById('detail-members-count').textContent = rachao.participants.length + ' jogadores';
  document.getElementById('detail-rachao-code').textContent = rachao.code;

  // Load session tab
  loadRachaoGameTab(rachao, user);
  // Load members tab
  loadRachaoMembersTab(rachao);
  // Load finance tab
  loadRachaoFinanceTab(rachao, user);
}

function loadRachaoGameTab(rachao, user) {
  const sessions = getSessionsByRachao(rachao.id);
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
    loadSessionPresence(openSession, rachao, user);
    loadSessionTeams(openSession);
  } else {
    currentSessionId = null;
    document.getElementById('session-date-display').textContent = 'Nenhum jogo agendado';
    document.getElementById('session-badge').textContent = getDayNameShort(rachao.dayOfWeek);
    document.getElementById('session-info').textContent = 'Crie um jogo para o próximo ' + getDayName(rachao.dayOfWeek);
    createBtn.style.display = 'block';
    activeArea.style.display = 'none';
  }

  // History
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

function loadSessionPresence(session, rachao, user) {
  const teamSize = rachao.playersPerTeam + 1;
  const maxDisplay = teamSize * 2;
  document.getElementById('confirmed-count').textContent = session.confirmed.length;
  document.getElementById('max-players').textContent = maxDisplay + '+';
  const pct = Math.min(100, (session.confirmed.length / maxDisplay) * 100);
  document.getElementById('confirmed-progress').style.width = pct + '%';

  document.getElementById('confirmed-list').innerHTML = session.confirmed.map(pid => {
    const p = getPlayerById(pid);
    if (!p) return '';
    const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
    return `<div class="player-item">
      <div class="player-avatar">${ini}</div>
      <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${escapeHtml(p.position)}</div></div>
      <span class="confirmed-badge"><i class="fas fa-check-circle"></i></span>
    </div>`;
  }).join('');

  // Waiting
  const waitCard = document.getElementById('waiting-list-card');
  if (session.waiting && session.waiting.length > 0) {
    waitCard.style.display = 'block';
    document.getElementById('waiting-list').innerHTML = session.waiting.map((pid, i) => {
      const p = getPlayerById(pid);
      if (!p) return '';
      return `<div class="player-item"><div class="player-avatar" style="background:var(--orange)">${i+1}</div>
        <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${escapeHtml(p.position)}</div></div></div>`;
    }).join('');
  } else { waitCard.style.display = 'none'; }

  // Presence button
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
    btn.onclick = () => { togglePresence(); loadRachaoDetail(); };
  }
}

function loadSessionTeams(session) {
  if (session.teams) {
    document.getElementById('teams-result').style.display = 'block';
    renderAllTeams(session.teams);
    const rotBtn = document.getElementById('btn-start-rotation');
    const rotState = getRotationState();
    if (rotState && rotState.active && rotState.sessionId === session.id) {
      rotBtn.innerHTML = '<i class="fas fa-rotate"></i> CONTINUAR ROTAÇÃO';
      rotBtn.onclick = () => navigateTo('rotation');
      rotBtn.style.display = 'block';
    } else if (session.status !== 'done') {
      rotBtn.innerHTML = '<i class="fas fa-rotate"></i> INICIAR ROTAÇÃO';
      rotBtn.onclick = () => startRotation();
      rotBtn.style.display = 'block';
    } else {
      rotBtn.style.display = 'none';
    }
  } else {
    document.getElementById('teams-result').style.display = 'none';
  }
}

function loadRachaoMembersTab(rachao) {
  document.getElementById('members-total').textContent = rachao.participants.length + ' participantes';
  document.getElementById('rachao-members-list').innerHTML = rachao.participants.map(pid => {
    const p = getPlayerById(pid);
    if (!p) return '';
    const ini = p.name.split(' ').map(w => w[0]).join('').substring(0, 2);
    const isCreator = pid === rachao.createdBy;
    return `<div class="player-item">
      <div class="player-avatar">${escapeHtml(ini)}</div>
      <div class="player-info"><div class="player-name">${escapeHtml(p.name)} ${isCreator ? '<span style="color:var(--orange);font-size:10px">ADMIN</span>' : ''}</div><div class="player-detail">${escapeHtml(p.position)} • ${p.goals}G ${p.assists}A</div></div>
    </div>`;
  }).join('');
}

function loadRachaoFinanceTab(rachao, user) {
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

  // Get or create billing
  let billing = getOrCreateBilling(rachao, month, perPerson);

  const paid = billing.payments.filter(p => p.status === 'paid').length;
  const pending = billing.payments.filter(p => p.status !== 'paid').length;
  document.getElementById('finance-paid-count').textContent = paid;
  document.getElementById('finance-pending-count').textContent = pending;

  document.getElementById('finance-payments-list').innerHTML = billing.payments.map(pay => {
    const p = getPlayerById(pay.playerId);
    if (!p) return '';
    const ini = p.name.split(' ').map(w => w[0]).join('').substring(0, 2);
    const statusLabel = pay.status === 'paid' ? 'Pago' : pay.status === 'awaiting_confirmation' ? 'Aguardando' : 'Pendente';
    const statusClass = pay.status === 'paid' ? 'badge-paid' : 'badge-pending';
    const isAdmin = rachao.createdBy === user.id;
    const adminBtn = isAdmin && pay.status !== 'paid'
      ? `<button class="btn-success btn-sm" onclick="confirmBillingPayment('${billing.id}','${pay.playerId}')">✓</button>` : '';
    return `<div class="player-item">
      <div class="player-avatar">${escapeHtml(ini)}</div>
      <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${formatCurrency(perPerson)}</div></div>
      <span class="payment-badge ${statusClass}">${statusLabel}</span>
      ${adminBtn}
    </div>`;
  }).join('');

  // Pix
  document.getElementById('finance-pix-amount').textContent = 'Valor: ' + formatCurrency(perPerson);
  document.getElementById('finance-pix-key').value = rachao.pixKey || '';
}

function getOrCreateBilling(rachao, month, perPerson) {
  let allBilling = getMonthlyBilling();
  let billing = allBilling.find(b => b.rachaoId === rachao.id && b.month === month);
  if (!billing) {
    billing = {
      id: generateId(), rachaoId: rachao.id, month,
      totalCost: rachao.monthlyVenueCost,
      participantCount: rachao.participants.length,
      perPerson,
      payments: rachao.participants.map(pid => ({ playerId: pid, status: 'pending', paidAt: null }))
    };
    allBilling.push(billing);
    saveMonthlyBilling(allBilling);
  }
  return billing;
}

function confirmBillingPayment(billingId, playerId) {
  const allBilling = getMonthlyBilling();
  const billing = allBilling.find(b => b.id === billingId);
  if (!billing) return;
  const pay = billing.payments.find(p => p.playerId === playerId);
  if (pay) { pay.status = 'paid'; pay.paidAt = new Date().toISOString(); }
  saveMonthlyBilling(allBilling);
  showToast('Pagamento confirmado!');
  loadRachaoDetail();
}

function copyFinancePix() {
  const text = document.getElementById('finance-pix-key').value;
  navigator.clipboard.writeText(text).then(() => showToast('Chave Pix copiada!')).catch(() => showToast('Copie manualmente'));
}

function notifyPayment() {
  const user = getCurrentUser();
  const rachao = getRachaoById(currentRachaoId);
  if (!rachao || !user) return;
  const month = getCurrentMonth();
  const allBilling = getMonthlyBilling();
  const billing = allBilling.find(b => b.rachaoId === rachao.id && b.month === month);
  if (!billing) return;
  const pay = billing.payments.find(p => p.playerId === user.id);
  if (pay) pay.status = 'awaiting_confirmation';
  saveMonthlyBilling(allBilling);
  addNotification({ type:'green', icon:'fa-money-bill-wave', title:'Pagamento informado', text: user.name + ' informou pagamento' });
  showToast('Pagamento informado! Admin será notificado.');
  loadRachaoDetail();
}

// ===== SESSIONS =====
function createSession() {
  const rachao = getRachaoById(currentRachaoId);
  if (!rachao) return;
  const nextDate = getNextDayOfWeek(rachao.dayOfWeek);
  const session = {
    id: generateId(), rachaoId: rachao.id, date: nextDate,
    confirmed: [], waiting: [], teams: null, leftover: [], status: 'open'
  };
  const ss = getSessions(); ss.push(session); saveSessions(ss);
  currentSessionId = session.id;
  showToast('Jogo criado para ' + formatDateBR(nextDate));
  loadRachaoDetail();
}

function togglePresence() {
  const user = getCurrentUser();
  const session = getSessionById(currentSessionId);
  if (!session || !user) return;

  if (user.blocked) {
    document.getElementById('modal-request-release').style.display = 'flex';
    return;
  }

  const isConf = session.confirmed.includes(user.id);
  if (isConf) {
    session.confirmed = session.confirmed.filter(id => id !== user.id);
    if (session.waiting && session.waiting.length > 0) {
      const nextId = session.waiting.find(id => { const p = getPlayerById(id); return !p || !p.blocked; });
      if (nextId) { session.waiting = session.waiting.filter(id => id !== nextId); session.confirmed.push(nextId); }
    }
    updateSession(currentSessionId, session);
    showToast('Presença cancelada');
  } else {
    session.confirmed.push(user.id);
    updateSession(currentSessionId, session);
    showToast('Presença confirmada!');
  }
}

function endSession() {
  const session = getSessionById(currentSessionId);
  if (session) {
    updateSession(currentSessionId, { status: 'done' });
    showToast('Jogo encerrado');
    loadRachaoDetail();
  }
}

// ===== DRAW TEAMS =====
function drawTeams() {
  const session = getSessionById(currentSessionId);
  const rachao = getRachaoById(currentRachaoId);
  if (!session || !rachao) return;

  const teamSize = rachao.playersPerTeam + 1;
  if (session.confirmed.length < teamSize * 2) {
    showToast(`Precisa de pelo menos ${teamSize * 2} jogadores`);
    return;
  }

  const players = session.confirmed.map(id => getPlayerById(id)).filter(Boolean);
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const gks = shuffled.filter(p => p.position === 'Goleiro');
  const field = shuffled.filter(p => p.position !== 'Goleiro');
  const numTeams = Math.floor(shuffled.length / teamSize);
  const teams = [];

  for (let t = 0; t < numTeams; t++) {
    const gk = gks[t] || field.shift();
    const teamPlayers = [];
    for (let i = 0; i < rachao.playersPerTeam; i++) {
      const next = field.shift();
      if (next && next !== gk) teamPlayers.push(next);
    }
    teams.push({ goalkeeper: gk, players: teamPlayers, name: getTeamName(t) });
  }

  const leftover = field.filter(p => !teams.some(t => t.goalkeeper?.id === p.id || t.players.some(tp => tp.id === p.id)));

  updateSession(currentSessionId, { teams, leftover: leftover.map(p => p.id) });
  document.getElementById('teams-result').style.display = 'block';
  renderAllTeams(teams);
  addNotification({ type:'orange', icon:'fa-shuffle', title:'Times sorteados!', text: `${numTeams} times formados` });
  showToast(`${numTeams} times sorteados!`);
  loadRachaoDetail();
}

function getTeamName(idx) { return ['Time A','Time B','Time C','Time D','Time E','Time F'][idx] || 'Time ' + (idx+1); }
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

// ===== PAYMENTS PAGE (lista de rachões com cobrança) =====
function loadPayments() {
  const user = getCurrentUser();
  const rachaos = getRachaos().filter(r => r.participants.includes(user.id) && r.monthlyVenueCost > 0);
  const listEl = document.getElementById('payments-rachao-list');
  const emptyEl = document.getElementById('payments-empty');

  if (rachaos.length === 0) { listEl.innerHTML = ''; emptyEl.style.display = 'flex'; return; }
  emptyEl.style.display = 'none';

  listEl.innerHTML = rachaos.map(r => {
    const perPerson = r.participants.length > 0 ? Math.ceil(r.monthlyVenueCost / r.participants.length * 100) / 100 : 0;
    const month = getCurrentMonth();
    const billing = getMonthlyBilling().find(b => b.rachaoId === r.id && b.month === month);
    const myPay = billing ? billing.payments.find(p => p.playerId === user.id) : null;
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
function loadAdminPayments() {
  const user = getCurrentUser();
  const rachaos = getRachaos().filter(r => r.createdBy === user.id && r.monthlyVenueCost > 0);
  const list = document.getElementById('admin-payment-list');
  if (rachaos.length === 0) { list.innerHTML = '<p class="text-muted" style="padding:16px;text-align:center">Nenhum rachão com cobrança</p>'; return; }

  list.innerHTML = rachaos.map(r => {
    const month = getCurrentMonth();
    const perPerson = r.participants.length > 0 ? Math.ceil(r.monthlyVenueCost / r.participants.length * 100) / 100 : 0;
    const billing = getOrCreateBilling(r, month, perPerson);
    const paid = billing.payments.filter(p => p.status === 'paid').length;
    const total = billing.payments.length;
    return `<div class="card" style="margin-bottom:12px">
      <h3>${escapeHtml(r.name)}</h3>
      <p class="text-muted" style="font-size:12px">${paid}/${total} pagos • ${formatCurrency(perPerson)}/pessoa</p>
      <div style="margin-top:8px">${billing.payments.map(pay => {
        const p = getPlayerById(pay.playerId);
        if (!p) return '';
        const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
        const statusLabel = pay.status === 'paid' ? 'Pago' : pay.status === 'awaiting_confirmation' ? 'Aguardando' : 'Pendente';
        return `<div class="admin-pay-item">
          <div class="player-avatar">${ini}</div>
          <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${formatCurrency(perPerson)} • ${statusLabel}</div></div>
          <div class="admin-pay-actions">
            ${pay.status !== 'paid' ? `<button class="btn-success" onclick="confirmBillingPayment('${billing.id}','${pay.playerId}')">✓ Pago</button>` : ''}
            ${!p.blocked ? `<button class="btn-danger" onclick="blockPlayer('${p.id}')">Bloquear</button>` : `<button class="btn-success" onclick="unblockPlayer('${p.id}')">Liberar</button>`}
          </div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }).join('');
}

// ===== BLOCK/UNBLOCK =====
function blockPlayer(pid) {
  updatePlayer(pid, { blocked: true });
  const b = getBlockedPlayers();
  if (!b.includes(pid)) { b.push(pid); saveBlockedPlayers(b); }
  const p = getPlayerById(pid);
  addNotification({ type:'red', icon:'fa-ban', title:'Jogador bloqueado', text: p.name + ' bloqueado por inadimplência' });
  showToast('Jogador bloqueado');
  loadAdminPayments();
}

function unblockPlayer(pid) {
  updatePlayer(pid, { blocked: false });
  saveBlockedPlayers(getBlockedPlayers().filter(id => id !== pid));
  showToast('Jogador desbloqueado');
  if (typeof loadAdminBlocked === 'function') loadAdminBlocked();
}

// ===== BLOCKED / RELEASE =====
function loadAdminBlocked() {
  const blocked = getBlockedPlayers();
  const releases = getReleaseRequests();
  const reqCard = document.getElementById('release-requests-card');

  if (releases.length > 0) {
    reqCard.style.display = 'block';
    document.getElementById('release-requests-list').innerHTML = releases.map(r => {
      const p = getPlayerById(r.playerId);
      if (!p) return '';
      const ini = p.name.split(' ').map(w => w[0]).join('').substring(0, 2);
      return `<div class="release-item">
        <div class="player-avatar" style="background:var(--orange)">${escapeHtml(ini)}</div>
        <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${escapeHtml(r.message || 'Sem mensagem')}</div></div>
        <div class="admin-pay-actions">
          <button class="btn-success" onclick="approveRelease('${r.id}','${r.playerId}')">Liberar</button>
          <button class="btn-danger" onclick="denyRelease('${r.id}')">Negar</button>
        </div>
      </div>`;
    }).join('');
  } else reqCard.style.display = 'none';

  const list = document.getElementById('blocked-players-list');
  const empty = document.getElementById('blocked-empty');
  if (blocked.length === 0) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  list.innerHTML = blocked.map(pid => {
    const p = getPlayerById(pid);
    if (!p) return '';
    const ini = p.name.split(' ').map(w => w[0]).join('').substring(0, 2);
    return `<div class="blocked-item">
      <div class="player-avatar" style="background:var(--red)">${escapeHtml(ini)}</div>
      <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${escapeHtml(p.position)} • Bloqueado</div></div>
      <button class="btn-success" onclick="unblockPlayer('${pid}');loadAdminBlocked()">Desbloquear</button>
    </div>`;
  }).join('');
}

function requestRelease() {
  const user = getCurrentUser();
  if (!user) return;
  const msg = document.getElementById('release-message').value.trim();
  const reqs = getReleaseRequests();
  if (reqs.find(r => r.playerId === user.id)) { showToast('Pedido já enviado'); closeModal('request-release'); return; }
  reqs.push({ id: generateId(), playerId: user.id, message: msg, timestamp: new Date().toISOString() });
  saveReleaseRequests(reqs);
  addNotification({ type:'orange', icon:'fa-hand', title:'Pedido de liberação', text: user.name + ' solicita liberação' });
  showToast('Pedido enviado ao admin!');
  closeModal('request-release');
}

function approveRelease(reqId, playerId) {
  unblockPlayer(playerId);
  saveReleaseRequests(getReleaseRequests().filter(r => r.id !== reqId));
  showToast('Jogador liberado!');
  loadAdminBlocked();
}

function denyRelease(reqId) {
  saveReleaseRequests(getReleaseRequests().filter(r => r.id !== reqId));
  showToast('Pedido negado');
  loadAdminBlocked();
}

// ===== STATS =====
function loadStats() { renderStatsTab('ranking'); }

function renderStatsTab(tab) {
  const players = getPlayers();
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
function loadRegisterStats() {
  const session = getSessionById(currentSessionId);
  if (!session) return;
  document.getElementById('stats-register-list').innerHTML = session.confirmed.map(pid => {
    const p = getPlayerById(pid);
    if (!p) return '';
    const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
    const isGK = p.position === 'Goleiro';
    return `<div class="stat-register-item">
      <div class="stat-player-header">
        <div class="player-avatar">${ini}</div>
        <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${escapeHtml(p.position)}</div></div>
      </div>
      <div class="stat-grid">
        ${isGK ? `
          <div class="stat-input-group"><label>Defesas</label><input type="number" min="0" value="0" id="saves-${pid}"></div>
          <div class="stat-input-group"><label>Gols Sofr.</label><input type="number" min="0" value="0" id="conceded-${pid}"></div>
          <div class="stat-input-group"><label>Clean Sheet</label><input type="number" min="0" value="0" max="1" id="cs-${pid}"></div>
        ` : `
          <div class="stat-input-group"><label>Gols</label><input type="number" min="0" value="0" id="goals-${pid}"></div>
          <div class="stat-input-group"><label>Assist.</label><input type="number" min="0" value="0" id="assists-${pid}"></div>
          <div class="stat-input-group"><label>Desarmes</label><input type="number" min="0" value="0" id="tackles-${pid}"></div>
          <div class="stat-input-group"><label>Faltas</label><input type="number" min="0" value="0" id="fouls-${pid}"></div>
          <div class="stat-input-group"><label>Amarelo</label><input type="number" min="0" value="0" id="yellows-${pid}"></div>
          <div class="stat-input-group"><label>Vermelho</label><input type="number" min="0" value="0" id="reds-${pid}"></div>
        `}
      </div>
    </div>`;
  }).join('');
}

function saveMatchStats() {
  const session = getSessionById(currentSessionId);
  if (!session) return;
  const pending = getPendingStats();
  let count = 0;
  session.confirmed.forEach(pid => {
    const p = getPlayerById(pid);
    if (!p) return;
    const isGK = p.position === 'Goleiro';
    const stat = { id: generateId(), sessionId: currentSessionId, rachaoId: currentRachaoId, playerId: pid, validated: false };
    if (isGK) {
      stat.saves = parseInt(document.getElementById('saves-'+pid)?.value) || 0;
      stat.goalsConceded = parseInt(document.getElementById('conceded-'+pid)?.value) || 0;
      stat.cleanSheet = parseInt(document.getElementById('cs-'+pid)?.value) || 0;
      stat.isGoalkeeper = true;
      if (stat.saves > 0 || stat.goalsConceded > 0 || stat.cleanSheet > 0) { pending.push(stat); count++; }
    } else {
      stat.goals = parseInt(document.getElementById('goals-'+pid)?.value) || 0;
      stat.assists = parseInt(document.getElementById('assists-'+pid)?.value) || 0;
      stat.tackles = parseInt(document.getElementById('tackles-'+pid)?.value) || 0;
      stat.fouls = parseInt(document.getElementById('fouls-'+pid)?.value) || 0;
      stat.yellows = parseInt(document.getElementById('yellows-'+pid)?.value) || 0;
      stat.reds = parseInt(document.getElementById('reds-'+pid)?.value) || 0;
      stat.isGoalkeeper = false;
      if (stat.goals > 0 || stat.assists > 0 || stat.tackles > 0 || stat.fouls > 0 || stat.yellows > 0 || stat.reds > 0) { pending.push(stat); count++; }
    }
  });
  savePendingStats(pending);
  showToast(`${count} estatísticas enviadas para validação!`);
  addNotification({ type:'purple', icon:'fa-shield-halved', title:'Anti-fraude', text:`${count} stats pendentes de validação` });
  navigateTo('match-detail');
}

// ===== ADMIN STATS VALIDATION =====
function loadAdminStats() {
  const pending = getPendingStats().filter(s => !s.validated);
  const list = document.getElementById('pending-stats-list');
  const empty = document.getElementById('pending-stats-empty');
  if (pending.length === 0) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  list.innerHTML = pending.map(s => {
    const p = getPlayerById(s.playerId);
    const rachao = getRachaoById(s.rachaoId);
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
  }).join('');
}

function validateStat(statId, approved) {
  const pending = getPendingStats();
  const i = pending.findIndex(s => s.id === statId);
  if (i === -1) return;
  const stat = pending[i];
  if (approved) {
    const p = getPlayerById(stat.playerId);
    if (p) {
      if (stat.isGoalkeeper) {
        updatePlayer(stat.playerId, { saves: (p.saves||0) + (stat.saves||0), cleanSheets: (p.cleanSheets||0) + (stat.cleanSheet||0) });
      } else {
        updatePlayer(stat.playerId, { goals: (p.goals||0) + (stat.goals||0), assists: (p.assists||0) + (stat.assists||0), tackles: (p.tackles||0) + (stat.tackles||0), fouls: (p.fouls||0) + (stat.fouls||0), yellows: (p.yellows||0) + (stat.yellows||0), reds: (p.reds||0) + (stat.reds||0) });
      }
    }
    const vs = getValidatedStats(); stat.validated = true; vs.push(stat); saveValidatedStats(vs);
    updateFantasyScoresFromStat(stat);
    showToast('Estatística aprovada!');
  } else showToast('Estatística rejeitada');
  pending.splice(i, 1);
  savePendingStats(pending);
  loadAdminStats();
}

function loadAdminBadges() {
  const pendingCount = getPendingStats().filter(s => !s.validated).length;
  const releaseCount = getReleaseRequests().length;
  document.getElementById('admin-pending-count').textContent = pendingCount > 0 ? pendingCount : '';
  document.getElementById('admin-release-count').textContent = releaseCount > 0 ? releaseCount : '';
}

// ===== PLAYERS =====
function loadPlayers() { renderPlayerList(getPlayers()); }

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

function filterPlayers() {
  const q = document.getElementById('search-players').value.toLowerCase();
  renderPlayerList(getPlayers().filter(p => p.name.toLowerCase().includes(q)));
}

function addPlayer() {
  const name = document.getElementById('player-add-name').value.trim();
  const phone = document.getElementById('player-add-phone').value.replace(/\D/g, '');
  const position = document.getElementById('player-add-position').value;
  if (!name) { showToast('Digite o nome'); return; }
  const ps = getPlayers();
  ps.push({ id: generateId(), name, phone, position, goals:0, assists:0, tackles:0, fouls:0, yellows:0, reds:0, saves:0, cleanSheets:0, matches:0, blocked:false });
  savePlayers(ps);
  showToast('Jogador adicionado!');
  navigateTo('players');
}

// ===== PROFILE =====
function loadProfile() {
  const user = getCurrentUser();
  if (!user) return;
  const fresh = getPlayerById(user.id) || user;
  document.getElementById('profile-name').textContent = fresh.name;
  document.getElementById('profile-phone').textContent = formatPhone(fresh.phone);
  document.getElementById('profile-position').textContent = fresh.position;
  document.getElementById('profile-matches').textContent = fresh.matches || 0;
  document.getElementById('profile-goals').textContent = fresh.goals || 0;
  document.getElementById('profile-assists').textContent = fresh.assists || 0;
  document.getElementById('profile-desarmes').textContent = fresh.tackles || 0;
}

function logout() { DB.remove('currentUser'); navigateTo('login'); showToast('Até a próxima!'); }

// ===== NOTIFICATIONS =====
function loadNotifications() {
  const ns = getNotifications();
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
function loadRotation() {
  const state = getRotationState();
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

function startRotation() {
  const session = getSessionById(currentSessionId);
  const rachao = getRachaoById(currentRachaoId);
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

  if (session.leftover && session.leftover.length > 0) {
    const leftovers = session.leftover.map(id => getPlayerById(id)).filter(Boolean);
    if (leftovers.length > 0) state.queue.push({ name: 'Reservas', players: leftovers });
  }

  saveRotationState(state);
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
      const ini = p.name.split(' ').map(w => w[0]).join('').substring(0, 2);
      return `<div class="player-item"><div class="player-avatar" style="background:var(--orange)">${escapeHtml(ini)}</div><div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${escapeHtml(p.position)}</div></div></div>`;
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

function addGoalRotation(team) {
  const state = getRotationState();
  if (!state || !state.active) return;
  if (team === 'a') state.scoreA++; else state.scoreB++;
  saveRotationState(state);
  document.getElementById('rot-score-' + team).textContent = team === 'a' ? state.scoreA : state.scoreB;
}

function finishRound() {
  const state = getRotationState();
  if (!state || !state.active) return;

  state.rounds.push({ round: state.round, teamA: state.teamA.name, teamB: state.teamB.name, scoreA: state.scoreA, scoreB: state.scoreB });

  let winner, loser;
  if (state.scoreA > state.scoreB) { winner = 'a'; loser = 'b'; }
  else if (state.scoreB > state.scoreA) { winner = 'b'; loser = 'a'; }
  else { winner = null; loser = 'both'; }

  if (state.queue.length === 0) {
    state.round++; state.scoreA = 0; state.scoreB = 0;
    saveRotationState(state);
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
  saveRotationState(state);
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

function endRotation() {
  const state = getRotationState();
  if (!state) return;
  state.active = false;
  saveRotationState(state);
  addNotification({ type: 'purple', icon: 'fa-flag-checkered', title: 'Rachão encerrado!', text: `${state.rounds.length} rodadas jogadas` });
  showToast('Rachão encerrado!');
  loadRotation();
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

// Fantasy score update is in fantasy.js (updateFantasyScoresFromStat)

// ===== TABS =====
function initTabs() {
  document.addEventListener('click', e => {
    if (e.target.classList.contains('tab')) {
      const parent = e.target.closest('.tabs');
      parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      const tab = e.target.dataset.tab;
      // Stats tabs
      if (['ranking','artilharia','assists','desarmes'].includes(tab)) renderStatsTab(tab);
      // Fantasy tabs
      if (tab === 'fantasy-ranking') { show('fantasy-ranking-content'); hide('fantasy-team-content'); hide('fantasy-scoring-content'); hide('fantasy-prizes-content'); }
      if (tab === 'fantasy-team') { hide('fantasy-ranking-content'); show('fantasy-team-content'); hide('fantasy-scoring-content'); hide('fantasy-prizes-content'); }
      if (tab === 'fantasy-scoring') { hide('fantasy-ranking-content'); hide('fantasy-team-content'); show('fantasy-scoring-content'); hide('fantasy-prizes-content'); }
      if (tab === 'fantasy-prizes') { hide('fantasy-ranking-content'); hide('fantasy-team-content'); hide('fantasy-scoring-content'); show('fantasy-prizes-content'); loadPrizes(); }
      // Rachão detail tabs
      if (tab === 'rachao-game') { show('rachao-game-content'); hide('rachao-members-content'); hide('rachao-finance-content'); }
      if (tab === 'rachao-members') { hide('rachao-game-content'); show('rachao-members-content'); hide('rachao-finance-content'); }
      if (tab === 'rachao-finance') { hide('rachao-game-content'); hide('rachao-members-content'); show('rachao-finance-content'); }
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
