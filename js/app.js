// ========== MEU RACHÃO PRO - MAIN APP ==========
let currentMatchId = null;

document.addEventListener('DOMContentLoaded', () => {
  seedDemoData();
  initPhoneInput();
  initCodeInputs();
  initTabs();
  initMatchForm();
  checkAuth();
});

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
    'matches': loadMatches,
    'match-detail': loadMatchDetail,
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
  const name = document.getElementById('register-name').value.trim();
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
  document.getElementById('dash-username').textContent = user.name;

  const matches = getMatches().filter(m => m.status !== 'done').sort((a,b) => a.date.localeCompare(b.date));
  if (matches.length > 0) {
    const next = matches[0];
    currentMatchId = next.id;
    document.getElementById('next-match-title').textContent = next.name;
    document.getElementById('next-match-info').textContent = `${formatDateBR(next.date)} às ${next.time} • ${next.location}`;
    document.getElementById('next-match-actions').style.display = 'flex';
    const isConf = next.confirmed.includes(user.id);
    const btn = document.getElementById('btn-confirm-presence');
    btn.textContent = isConf ? '✓ CONFIRMADO' : 'CONFIRMAR';
    btn.className = isConf ? 'btn-outline btn-sm confirmed-badge' : 'btn-outline btn-sm';
    btn.onclick = () => togglePresence(next.id);
  } else {
    document.getElementById('next-match-title').textContent = 'Nenhuma pelada agendada';
    document.getElementById('next-match-info').textContent = '';
    document.getElementById('next-match-actions').style.display = 'none';
  }
  loadDashRanking();
}

function togglePresence(matchId) {
  const user = getCurrentUser();
  const match = getMatchById(matchId);
  if (!match || !user) return;

  if (user.blocked) {
    document.getElementById('modal-request-release').style.display = 'flex';
    return;
  }

  const maxP = (match.playersPerTeam + 1) * 2; // line + 1 gk per team, 2 teams minimum
  // Actually: unlimited confirmed, teams will auto-form
  const isConf = match.confirmed.includes(user.id);
  if (isConf) {
    match.confirmed = match.confirmed.filter(id => id !== user.id);
    if (match.waiting.length > 0) match.confirmed.push(match.waiting.shift());
    updateMatch(matchId, match);
    showToast('Presença cancelada');
  } else {
    match.confirmed.push(user.id);
    updateMatch(matchId, match);
    showToast('Presença confirmada!');
  }
  loadDashboard();
}

function loadDashRanking() {
  const players = getPlayers().map(p => ({
    ...p,
    totalPts: calcPlayerPoints(p)
  })).sort((a,b) => b.totalPts - a.totalPts).slice(0, 5);

  document.getElementById('dash-ranking').innerHTML = players.map((p, i) => {
    const cls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    return `<div class="ranking-item">
      <div class="ranking-pos ${cls}">${i+1}</div>
      <div class="ranking-info"><div class="ranking-name">${p.name}</div><div class="ranking-detail">${p.position} • ${p.matches} jogos</div></div>
      <div class="ranking-value">${p.totalPts}pts</div>
    </div>`;
  }).join('');
}

function calcPlayerPoints(p) {
  if (p.position === 'Goleiro') {
    return Math.round(((p.saves || 0) * POINTS.goalkeeper.save + (p.cleanSheets || 0) * POINTS.goalkeeper.cleanSheet + (p.matches || 0) * POINTS.goalkeeper.presence) * POINTS.goalkeeper.multiplier);
  }
  return (p.goals || 0) * POINTS.field.goal + (p.assists || 0) * POINTS.field.assist + (p.tackles || 0) * POINTS.field.tackle + (p.matches || 0) * POINTS.field.presence + (p.fouls || 0) * POINTS.field.foul + (p.yellows || 0) * POINTS.field.yellow + (p.reds || 0) * POINTS.field.red;
}

// ===== MATCHES =====
function loadMatches() {
  const matches = getMatches();
  const list = document.getElementById('matches-list');
  const empty = document.getElementById('matches-empty');
  if (matches.length === 0) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  list.innerHTML = matches.sort((a,b) => b.date.localeCompare(a.date)).map(m => {
    const d = new Date(m.date + 'T12:00:00');
    const total = m.confirmed.length;
    const teamSize = m.playersPerTeam + 1;
    const statusClass = m.status === 'done' ? 'status-done' : total >= teamSize * 2 ? 'status-full' : 'status-open';
    const statusText = m.status === 'done' ? 'Encerrada' : total >= teamSize * 2 ? `${Math.floor(total/teamSize)} times` : 'Aberta';
    return `<div class="match-list-item" onclick="openMatch('${m.id}')">
      <div class="match-date-box"><span class="day">${d.getDate()}</span><span class="month">${getMonthAbbr(d.getMonth())}</span></div>
      <div class="match-list-info"><h4>${m.name}</h4><p>${m.time} • ${m.location}</p><p>${total} confirmados (${m.playersPerTeam}+1 por time)</p></div>
      <span class="match-status ${statusClass}">${statusText}</span>
    </div>`;
  }).join('');
}

function openMatch(id) { currentMatchId = id; navigateTo('match-detail'); }

// ===== CREATE MATCH =====
function initMatchForm() {
  document.getElementById('match-players').addEventListener('change', updateTotalPerTeam);
  document.getElementById('btn-create-match').addEventListener('click', createMatch);
}

function updateTotalPerTeam() {
  const n = parseInt(document.getElementById('match-players').value) || 5;
  document.getElementById('total-per-team').textContent = n + 1;
}

function createMatch() {
  const name = document.getElementById('match-name').value.trim();
  const date = document.getElementById('match-date').value;
  const time = document.getElementById('match-time').value;
  const location = document.getElementById('match-location').value.trim();
  const players = parseInt(document.getElementById('match-players').value);
  const tieRule = document.getElementById('match-tie-rule').value;
  const paymentType = document.getElementById('match-payment-type').value;
  const price = parseFloat(document.getElementById('match-price').value) || 0;
  const pix = document.getElementById('match-pix').value.trim();
  if (!name || !date || !time || !location) { showToast('Preencha todos os campos'); return; }
  const user = getCurrentUser();
  const m = {
    id: generateId(), name, date, time, location, playersPerTeam: players,
    tieRule, paymentType, price, pixKey: pix,
    confirmed: [user.id], waiting: [], teams: null, status: 'open', createdBy: user.id
  };
  const ms = getMatches(); ms.push(m); saveMatches(ms);
  addNotification({ type:'green', icon:'fa-calendar-plus', title:'Nova pelada!', text: name + ' em ' + formatDateBR(date) });
  showToast('Pelada criada!');
  currentMatchId = m.id;
  navigateTo('match-detail');
}

function adjustNumber(id, delta) {
  const inp = document.getElementById(id);
  let v = parseInt(inp.value) + delta;
  v = Math.max(parseInt(inp.min), Math.min(parseInt(inp.max), v));
  inp.value = v;
  updateTotalPerTeam();
}

// ===== MATCH DETAIL =====
function loadMatchDetail() {
  const match = getMatchById(currentMatchId);
  if (!match) return;
  const user = getCurrentUser();
  document.getElementById('detail-match-title').textContent = match.name;
  document.getElementById('detail-date').textContent = formatDateBR(match.date);
  document.getElementById('detail-time').textContent = match.time;
  document.getElementById('detail-location').textContent = match.location;
  document.getElementById('detail-format').textContent = `${match.playersPerTeam} linha + 1 gol`;

  const teamSize = match.playersPerTeam + 1;
  const maxDisplay = teamSize * 2;
  document.getElementById('confirmed-count').textContent = match.confirmed.length;
  document.getElementById('max-players').textContent = maxDisplay + '+';

  const pct = Math.min(100, (match.confirmed.length / maxDisplay) * 100);
  document.getElementById('confirmed-progress').style.width = pct + '%';

  document.getElementById('confirmed-list').innerHTML = match.confirmed.map((pid, idx) => {
    const p = getPlayerById(pid);
    if (!p) return '';
    const ini = p.name.split(' ').map(w => w[0]).join('').substring(0, 2);
    return `<div class="player-item">
      <div class="player-avatar">${ini}</div>
      <div class="player-info"><div class="player-name">${p.name}</div><div class="player-detail">${p.position}</div></div>
      <span class="confirmed-badge"><i class="fas fa-check-circle"></i></span>
    </div>`;
  }).join('');

  const waitCard = document.getElementById('waiting-list-card');
  if (match.waiting.length > 0) {
    waitCard.style.display = 'block';
    document.getElementById('waiting-list').innerHTML = match.waiting.map((pid, i) => {
      const p = getPlayerById(pid);
      if (!p) return '';
      return `<div class="player-item"><div class="player-avatar" style="background:var(--orange)">${i+1}</div>
        <div class="player-info"><div class="player-name">${p.name}</div><div class="player-detail">${p.position}</div></div></div>`;
    }).join('');
  } else waitCard.style.display = 'none';

  // Presence button
  const btn = document.getElementById('btn-toggle-presence');
  const isConf = match.confirmed.includes(user.id);
  const isWait = match.waiting.includes(user.id);
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
  btn.onclick = () => { togglePresence(currentMatchId); loadMatchDetail(); };

  // Teams
  if (match.teams) {
    document.getElementById('teams-result').style.display = 'block';
    renderAllTeams(match.teams);
  } else {
    document.getElementById('teams-result').style.display = 'none';
  }
}

// ===== DRAW TEAMS (auto-form from all confirmed) =====
function drawTeams() {
  const match = getMatchById(currentMatchId);
  if (!match) return;

  const teamSize = match.playersPerTeam + 1; // line + goalkeeper
  if (match.confirmed.length < teamSize * 2) {
    showToast(`Precisa de pelo menos ${teamSize * 2} jogadores`);
    return;
  }

  const players = match.confirmed.map(id => getPlayerById(id)).filter(Boolean);
  const shuffled = [...players].sort(() => Math.random() - 0.5);

  // Separate goalkeepers
  const gks = shuffled.filter(p => p.position === 'Goleiro');
  const field = shuffled.filter(p => p.position !== 'Goleiro');

  const numTeams = Math.floor(shuffled.length / teamSize);
  const teams = [];

  for (let t = 0; t < numTeams; t++) {
    const gk = gks[t] || field.shift();
    const teamPlayers = [];
    for (let i = 0; i < match.playersPerTeam; i++) {
      const next = field.shift();
      if (next && next !== gk) teamPlayers.push(next);
    }
    teams.push({ goalkeeper: gk, players: teamPlayers, name: getTeamName(t) });
  }

  // Leftover players form a reserve queue
  const leftover = field.filter(p => !teams.some(t => t.goalkeeper?.id === p.id || t.players.some(tp => tp.id === p.id)));

  match.teams = teams;
  match.leftover = leftover.map(p => p.id);
  updateMatch(currentMatchId, match);

  document.getElementById('teams-result').style.display = 'block';
  renderAllTeams(teams);

  addNotification({ type:'orange', icon:'fa-shuffle', title:'Times sorteados!', text: `${numTeams} times formados para ${match.name}` });
  showToast(`${numTeams} times sorteados!`);
}

function getTeamName(idx) {
  return ['Time A','Time B','Time C','Time D','Time E','Time F'][idx] || 'Time ' + (idx+1);
}

function getTeamClass(idx) {
  return ['team-a','team-b','team-c','team-d'][idx % 4];
}

function renderAllTeams(teams) {
  const container = document.getElementById('teams-container');
  container.innerHTML = teams.map((t, i) => {
    let html = '';
    if (t.goalkeeper) html += `<div class="team-player"><span class="jersey">🧤</span> ${t.goalkeeper.name}</div>`;
    t.players.forEach(p => { html += `<div class="team-player"><span class="jersey">👕</span> ${p.name}</div>`; });
    return `<div class="team-card ${getTeamClass(i)}"><h3><i class="fas fa-shirt"></i> ${t.name}</h3>${html}</div>`;
  }).join('');
}

function showMatchMenu() { document.getElementById('modal-match-menu').style.display = 'flex'; }

function endMatch() {
  const match = getMatchById(currentMatchId);
  if (match) { updateMatch(currentMatchId, { status: 'done' }); showToast('Pelada encerrada'); navigateTo('matches'); }
}

// ===== PAYMENTS =====
function loadPayments() {
  const matches = getMatches().filter(m => m.price > 0).sort((a,b) => b.date.localeCompare(a.date));
  if (matches.length === 0) return;

  const m = matches[0];
  const payments = getPayments().filter(p => p.matchId === m.id);
  const total = m.confirmed.length * m.price;
  const received = payments.filter(p => p.status === 'paid').reduce((s,p) => s + p.amount, 0);

  document.getElementById('payment-total').textContent = formatCurrency(total);
  document.getElementById('payment-received').textContent = formatCurrency(received);
  document.getElementById('payment-pending').textContent = formatCurrency(total - received);

  document.getElementById('payment-players-list').innerHTML = m.confirmed.map(pid => {
    const p = getPlayerById(pid);
    if (!p) return '';
    const pay = payments.find(x => x.playerId === pid);
    const status = pay ? pay.status : 'pending';
    const ini = p.name.split(' ').map(w => w[0]).join('').substring(0,2);
    return `<div class="player-item">
      <div class="player-avatar">${ini}</div>
      <div class="player-info"><div class="player-name">${p.name}</div><div class="player-detail">${formatCurrency(m.price)} • ${m.paymentType === 'monthly' ? 'Mensalidade' : 'Avulso'}</div></div>
      <span class="payment-badge ${status==='paid'?'badge-paid':'badge-pending'}">${status==='paid'?'Pago':'Pendente'}</span>
    </div>`;
  }).join('');

  // Pix info
  document.getElementById('pix-copy-text').value = m.pixKey || '';
  document.getElementById('pix-recipient').textContent = m.pixKey || '-';
  document.getElementById('pix-amount').textContent = formatCurrency(m.price);
  generatePixQR(m.pixKey, m.price);
}

function generatePixQR(key, amount) {
  const canvas = document.getElementById('pix-qr-canvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 200, 200);
  // Simple QR-like pattern
  ctx.fillStyle = '#000000';
  const data = `PIX:${key}:${amount}`;
  const size = 8;
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 20; j++) {
      if ((i + j) % 2 === 0 || Math.random() > 0.6) {
        if (i < 3 && j < 3) { ctx.fillRect(i*size+20, j*size+20, size-1, size-1); continue; }
        if (i > 16 && j < 3) { ctx.fillRect(i*size+20, j*size+20, size-1, size-1); continue; }
        if (i < 3 && j > 16) { ctx.fillRect(i*size+20, j*size+20, size-1, size-1); continue; }
        if (Math.random() > 0.4) ctx.fillRect(i*size+20, j*size+20, size-1, size-1);
      }
    }
  }
  // Corner markers
  const drawMarker = (x, y) => {
    ctx.fillStyle = '#000'; ctx.fillRect(x, y, 24, 24);
    ctx.fillStyle = '#FFF'; ctx.fillRect(x+3, y+3, 18, 18);
    ctx.fillStyle = '#000'; ctx.fillRect(x+6, y+6, 12, 12);
  };
  drawMarker(20, 20); drawMarker(140, 20); drawMarker(20, 140);
}

function copyPix() {
  const text = document.getElementById('pix-copy-text').value;
  navigator.clipboard.writeText(text).then(() => showToast('Chave Pix copiada!')).catch(() => showToast('Copie manualmente'));
}

function notifyPayment() {
  const user = getCurrentUser();
  const matches = getMatches().filter(m => m.price > 0).sort((a,b) => b.date.localeCompare(a.date));
  if (matches.length === 0) return;
  const m = matches[0];
  const payments = getPayments();
  const existing = payments.findIndex(p => p.matchId === m.id && p.playerId === user.id);
  if (existing !== -1) { payments[existing].status = 'awaiting_confirmation'; }
  else { payments.push({ id: generateId(), matchId: m.id, playerId: user.id, status: 'awaiting_confirmation', amount: m.price }); }
  savePayments(payments);
  addNotification({ type:'green', icon:'fa-money-bill-wave', title:'Pagamento informado', text:'Aguardando confirmação do admin' });
  showToast('Pagamento informado! Admin será notificado.');
}

// ===== ADMIN PAYMENTS =====
function loadAdminPayments() {
  const matches = getMatches().filter(m => m.price > 0).sort((a,b) => b.date.localeCompare(a.date));
  if (matches.length === 0) return;
  const m = matches[0];
  const payments = getPayments();
  document.getElementById('admin-payment-list').innerHTML = m.confirmed.map(pid => {
    const p = getPlayerById(pid);
    if (!p) return '';
    const pay = payments.find(x => x.playerId === pid && x.matchId === m.id);
    const status = pay ? pay.status : 'pending';
    const ini = p.name.split(' ').map(w => w[0]).join('').substring(0,2);
    const statusLabel = status === 'paid' ? 'Pago' : status === 'awaiting_confirmation' ? 'Aguardando' : 'Pendente';
    return `<div class="admin-pay-item">
      <div class="player-avatar">${ini}</div>
      <div class="player-info"><div class="player-name">${p.name}</div><div class="player-detail">${formatCurrency(m.price)} • ${statusLabel}</div></div>
      <div class="admin-pay-actions">
        ${status !== 'paid' ? `<button class="btn-success" onclick="confirmPayment('${m.id}','${pid}',${m.price})">✓ Pago</button>` : ''}
        ${!p.blocked ? `<button class="btn-danger" onclick="blockPlayer('${pid}')">Bloquear</button>` : `<button class="btn-success" onclick="unblockPlayer('${pid}')">Liberar</button>`}
      </div>
    </div>`;
  }).join('');
}

function confirmPayment(matchId, playerId, amount) {
  const payments = getPayments();
  const i = payments.findIndex(p => p.matchId === matchId && p.playerId === playerId);
  if (i !== -1) payments[i].status = 'paid';
  else payments.push({ id: generateId(), matchId, playerId, status: 'paid', amount });
  savePayments(payments);
  showToast('Pagamento confirmado!');
  loadAdminPayments();
}

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
      const ini = p.name.split(' ').map(w => w[0]).join('').substring(0,2);
      return `<div class="release-item">
        <div class="player-avatar" style="background:var(--orange)">${ini}</div>
        <div class="player-info"><div class="player-name">${p.name}</div><div class="player-detail">${r.message || 'Sem mensagem'}</div></div>
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
    const ini = p.name.split(' ').map(w => w[0]).join('').substring(0,2);
    return `<div class="blocked-item">
      <div class="player-avatar" style="background:var(--red)">${ini}</div>
      <div class="player-info"><div class="player-name">${p.name}</div><div class="player-detail">${p.position} • Bloqueado</div></div>
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
      <div class="ranking-info"><div class="ranking-name">${p.name}</div><div class="ranking-detail">${p.position} • ${p.matches} jogos</div></div>
      <div class="ranking-value">${valueLabel(p)}</div>
    </div>`;
  }).join('');
}

// ===== REGISTER STATS (expanded) =====
function loadRegisterStats() {
  const match = getMatchById(currentMatchId);
  if (!match) return;
  document.getElementById('stats-register-list').innerHTML = match.confirmed.map(pid => {
    const p = getPlayerById(pid);
    if (!p) return '';
    const ini = p.name.split(' ').map(w => w[0]).join('').substring(0,2);
    const isGK = p.position === 'Goleiro';
    return `<div class="stat-register-item">
      <div class="stat-player-header">
        <div class="player-avatar">${ini}</div>
        <div class="player-info"><div class="player-name">${p.name}</div><div class="player-detail">${p.position}</div></div>
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
  const match = getMatchById(currentMatchId);
  if (!match) return;
  const pending = getPendingStats();
  let count = 0;
  match.confirmed.forEach(pid => {
    const p = getPlayerById(pid);
    if (!p) return;
    const isGK = p.position === 'Goleiro';
    const stat = { id: generateId(), matchId: currentMatchId, playerId: pid, validated: false };
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
    const m = getMatchById(s.matchId);
    if (!p || !m) return '';
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
      <div class="stat-validation-header"><h4>${p.name}</h4><span class="match-label">${m.name}</span></div>
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
        updatePlayer(stat.playerId, {
          saves: (p.saves||0) + (stat.saves||0),
          cleanSheets: (p.cleanSheets||0) + (stat.cleanSheet||0)
        });
      } else {
        updatePlayer(stat.playerId, {
          goals: (p.goals||0) + (stat.goals||0),
          assists: (p.assists||0) + (stat.assists||0),
          tackles: (p.tackles||0) + (stat.tackles||0),
          fouls: (p.fouls||0) + (stat.fouls||0),
          yellows: (p.yellows||0) + (stat.yellows||0),
          reds: (p.reds||0) + (stat.reds||0)
        });
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
    const ini = p.name.split(' ').map(w => w[0]).join('').substring(0,2);
    const blocked = p.blocked ? '<span class="payment-badge badge-blocked">Bloqueado</span>' : '';
    return `<div class="player-item">
      <div class="player-avatar">${ini}</div>
      <div class="player-info"><div class="player-name">${p.name}</div><div class="player-detail">${p.position} • ${p.goals}G ${p.assists}A ${p.tackles||0}D</div></div>
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
      <div class="notif-icon ${n.type}"><i class="fas ${n.icon}"></i></div>
      <div class="notif-content"><h4>${n.title}</h4><p>${n.text}</p><span class="notif-time">${ts}</span></div>
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
      if (tab === 'pay-overview') { show('pay-overview-content'); hide('pay-pix-content'); }
      if (tab === 'pay-pix') { hide('pay-overview-content'); show('pay-pix-content'); }
    }
    if (e.target.classList.contains('pill')) {
      e.target.closest('.fantasy-period-toggle').querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      renderFantasyRanking(e.target.dataset.period);
    }
  });
}

function show(id) { document.getElementById(id).style.display = 'block'; }
function hide(id) { document.getElementById(id).style.display = 'none'; }
function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
function closeModal(name) { document.getElementById('modal-' + name).style.display = 'none'; }
