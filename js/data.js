// ========== DATA LAYER ==========
const DB = {
  get(key) { try { return JSON.parse(localStorage.getItem('rachao_' + key)); } catch { return null; } },
  set(key, val) { localStorage.setItem('rachao_' + key, JSON.stringify(val)); },
  remove(key) { localStorage.removeItem('rachao_' + key); }
};

function getCurrentUser() { return DB.get('currentUser'); }
function setCurrentUser(user) { DB.set('currentUser', user); }

// ===== PLAYERS =====
function getPlayers() { return DB.get('players') || []; }
function savePlayers(p) { DB.set('players', p); }
function getPlayerById(id) { return getPlayers().find(p => p.id === id); }
function updatePlayer(id, data) {
  const ps = getPlayers();
  const i = ps.findIndex(p => p.id === id);
  if (i !== -1) { ps[i] = { ...ps[i], ...data }; savePlayers(ps); }
}

// ===== RACHÕES (grupos permanentes) =====
function getRachaos() { return DB.get('rachaos') || []; }
function saveRachaos(r) { DB.set('rachaos', r); }
function getRachaoById(id) { return getRachaos().find(r => r.id === id); }
function updateRachao(id, data) {
  const rs = getRachaos();
  const i = rs.findIndex(r => r.id === id);
  if (i !== -1) { rs[i] = { ...rs[i], ...data }; saveRachaos(rs); }
}

// ===== SESSÕES (dias de jogo) =====
function getSessions() { return DB.get('sessions') || []; }
function saveSessions(s) { DB.set('sessions', s); }
function getSessionById(id) { return getSessions().find(s => s.id === id); }
function getSessionsByRachao(rachaoId) {
  return getSessions().filter(s => s.rachaoId === rachaoId);
}
function updateSession(id, data) {
  const ss = getSessions();
  const i = ss.findIndex(s => s.id === id);
  if (i !== -1) { ss[i] = { ...ss[i], ...data }; saveSessions(ss); }
}

// ===== COBRANÇA MENSAL =====
function getMonthlyBilling() { return DB.get('monthlyBilling') || []; }
function saveMonthlyBilling(b) { DB.set('monthlyBilling', b); }

// ===== STATS =====
function getPendingStats() { return DB.get('pendingStats') || []; }
function savePendingStats(s) { DB.set('pendingStats', s); }
function getValidatedStats() { return DB.get('validatedStats') || []; }
function saveValidatedStats(s) { DB.set('validatedStats', s); }

// ===== FANTASY =====
function getFantasyTeams() { return DB.get('fantasyTeams') || []; }
function saveFantasyTeams(t) { DB.set('fantasyTeams', t); }
function getFantasyScores() { return DB.get('fantasyScores') || []; }
function saveFantasyScores(s) { DB.set('fantasyScores', s); }

// ===== ROTATION =====
function getRotationState() { return DB.get('rotationState') || null; }
function saveRotationState(s) { DB.set('rotationState', s); }

// ===== BLOQUEIO / LIBERAÇÃO =====
function getReleaseRequests() { return DB.get('releaseRequests') || []; }
function saveReleaseRequests(r) { DB.set('releaseRequests', r); }
function getBlockedPlayers() { return DB.get('blockedPlayers') || []; }
function saveBlockedPlayers(b) { DB.set('blockedPlayers', b); }

// ===== PRÊMIOS =====
function getPrizes() {
  return DB.get('prizes') || { first: 'Isenção de mensalidade', second: '50% de desconto na próxima', third: 'Escolhe o time no sorteio', type: 'exemption' };
}
function savePrizesData(p) { DB.set('prizes', p); }

// ===== NOTIFICAÇÕES =====
function getNotifications() { return DB.get('notifications') || []; }
function addNotification(notif) {
  const ns = getNotifications();
  ns.unshift({ id: generateId(), ...notif, timestamp: new Date().toISOString() });
  DB.set('notifications', ns.slice(0, 50));
}

// ===== OFFLINE SYNC =====
function getSyncQueue() { return DB.get('syncQueue') || []; }
function addToSyncQueue(action) {
  const q = getSyncQueue();
  q.push({ ...action, timestamp: new Date().toISOString() });
  DB.set('syncQueue', q);
}
function clearSyncQueue() { DB.set('syncQueue', []); }

// ===== UTILITÁRIOS =====
function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

// Loading state para botoes
function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn._originalText = btn.innerHTML;
    btn.classList.add('btn-loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
    if (btn._originalText) btn.innerHTML = btn._originalText;
  }
}

// Skeleton placeholder para listas
function showListSkeleton(containerId, count) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = Array(count || 3).fill('<div class="skeleton"></div>').join('');
}

// Debounce
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Throttle para prevenir double-click
function throttleBtn(btn, fn, delay) {
  if (!btn) return fn;
  return async function(...args) {
    if (btn.classList.contains('btn-throttled')) return;
    btn.classList.add('btn-throttled');
    try { await fn.apply(this, args); }
    finally { setTimeout(() => btn.classList.remove('btn-throttled'), delay || 1000); }
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function formatPhone(phone) {
  const d = phone.replace(/\D/g, '');
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
}

function formatCurrency(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }

function formatDateBR(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function getMonthAbbr(i) { return ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][i]; }

function getDayName(i) { return ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][i]; }
function getDayNameShort(i) { return ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'][i]; }

function getCurrentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function getNextDayOfWeek(dayOfWeek) {
  const today = new Date();
  const todayDay = today.getDay();
  let diff = dayOfWeek - todayDay;
  if (diff <= 0) diff += 7;
  const next = new Date(today);
  next.setDate(today.getDate() + diff);
  return next.toISOString().split('T')[0];
}

// Fantasy point system
const POINTS = {
  field: { goal: 5, assist: 3, tackle: 2, win: 2, presence: 1, foul: -1, yellow: -2, red: -4 },
  goalkeeper: { save: 1, cleanSheet: 5, win: 3, presence: 1, goalConceded: -0.5, multiplier: 1.3 }
};

// ===== MIGRAÇÃO DE DADOS ANTIGOS =====
function migrateToRachaoModel() {
  if (DB.get('migrationVersion') >= 2) return;

  const oldMatches = DB.get('matches');
  if (oldMatches && oldMatches.length > 0) {
    const rachaos = [];
    const sessions = [];
    const billing = [];

    oldMatches.forEach(m => {
      const d = new Date(m.date + 'T12:00:00');
      const rachao = {
        id: m.id,
        code: m.code || generateId().slice(-6).toUpperCase(),
        name: m.name,
        location: m.location,
        dayOfWeek: d.getDay(),
        time: m.time,
        playersPerTeam: m.playersPerTeam,
        tieRule: m.tieRule || 'playing_leaves',
        monthlyVenueCost: (m.price || 0) * (m.confirmed ? m.confirmed.length : 0),
        pixKey: m.pixKey || '',
        participants: m.participants || m.confirmed || [],
        createdBy: m.createdBy,
        status: 'active'
      };
      rachaos.push(rachao);

      const session = {
        id: 's_' + m.id,
        rachaoId: m.id,
        date: m.date,
        confirmed: m.confirmed || [],
        waiting: m.waiting || [],
        teams: m.teams,
        leftover: m.leftover || [],
        status: m.status === 'done' ? 'done' : 'open'
      };
      sessions.push(session);

      // Migrate payments to billing
      const oldPayments = (DB.get('payments') || []).filter(p => p.matchId === m.id);
      if (oldPayments.length > 0) {
        const month = m.date ? m.date.substring(0, 7) : getCurrentMonth();
        billing.push({
          id: 'bill_' + m.id,
          rachaoId: m.id,
          month: month,
          totalCost: rachao.monthlyVenueCost,
          participantCount: rachao.participants.length,
          perPerson: rachao.participants.length > 0 ? rachao.monthlyVenueCost / rachao.participants.length : 0,
          payments: rachao.participants.map(pid => {
            const oldPay = oldPayments.find(p => p.playerId === pid);
            return { playerId: pid, status: oldPay ? oldPay.status : 'pending', paidAt: null };
          })
        });
      }
    });

    saveRachaos(rachaos);
    saveSessions(sessions);
    saveMonthlyBilling(billing);

    // Migrate stats to use sessionId
    const pending = getPendingStats().map(s => ({ ...s, sessionId: 's_' + s.matchId, rachaoId: s.matchId }));
    savePendingStats(pending);
    const validated = getValidatedStats().map(s => ({ ...s, sessionId: 's_' + s.matchId, rachaoId: s.matchId }));
    saveValidatedStats(validated);

    // Migrate rotation state
    const rot = getRotationState();
    if (rot && rot.matchId) {
      rot.sessionId = 's_' + rot.matchId;
      rot.rachaoId = rot.matchId;
      saveRotationState(rot);
    }

    DB.remove('matches');
    DB.remove('payments');
  }

  DB.set('migrationVersion', 2);
}

// ===== SEED DEMO DATA =====
function seedDemoData() {
  if (getRachaos().length > 0 || getPlayers().length > 0) return;

  const demoPlayers = [
    { id:'p1', name:'Carlos Silva', phone:'11999990001', position:'Atacante', goals:12, assists:5, tackles:3, fouls:2, yellows:1, reds:0, saves:0, cleanSheets:0, matches:8, blocked:false, password:'123456' },
    { id:'p2', name:'Rafael Santos', phone:'11999990002', position:'Meia', goals:8, assists:10, tackles:6, fouls:1, yellows:0, reds:0, saves:0, cleanSheets:0, matches:10, blocked:false, password:'123456' },
    { id:'p3', name:'Bruno Costa', phone:'11999990003', position:'Zagueiro', goals:2, assists:1, tackles:15, fouls:4, yellows:2, reds:0, saves:0, cleanSheets:0, matches:9, blocked:false, password:'123456' },
    { id:'p4', name:'Lucas Oliveira', phone:'11999990004', position:'Goleiro', goals:0, assists:0, tackles:0, fouls:0, yellows:0, reds:0, saves:35, cleanSheets:4, matches:10, blocked:false, password:'123456' },
    { id:'p5', name:'Thiago Almeida', phone:'11999990005', position:'Atacante', goals:15, assists:3, tackles:2, fouls:3, yellows:1, reds:0, saves:0, cleanSheets:0, matches:10, blocked:false, password:'123456' },
    { id:'p6', name:'Diego Ferreira', phone:'11999990006', position:'Volante', goals:3, assists:7, tackles:18, fouls:2, yellows:1, reds:0, saves:0, cleanSheets:0, matches:7, blocked:false, password:'123456' },
    { id:'p7', name:'Pedro Souza', phone:'11999990007', position:'Meia', goals:6, assists:8, tackles:5, fouls:1, yellows:0, reds:0, saves:0, cleanSheets:0, matches:9, blocked:false, password:'123456' },
    { id:'p8', name:'André Lima', phone:'11999990008', position:'Lateral', goals:1, assists:4, tackles:10, fouls:2, yellows:1, reds:0, saves:0, cleanSheets:0, matches:8, blocked:false, password:'123456' },
    { id:'p9', name:'Marcos Pereira', phone:'11999990009', position:'Atacante', goals:9, assists:2, tackles:1, fouls:5, yellows:2, reds:1, saves:0, cleanSheets:0, matches:6, blocked:false, password:'123456' },
    { id:'p10', name:'Felipe Rocha', phone:'11999990010', position:'Goleiro', goals:0, assists:1, tackles:0, fouls:0, yellows:0, reds:0, saves:28, cleanSheets:3, matches:10, blocked:false, password:'123456' },
    { id:'p11', name:'João Mendes', phone:'11999990011', position:'Zagueiro', goals:1, assists:0, tackles:12, fouls:3, yellows:1, reds:0, saves:0, cleanSheets:0, matches:5, blocked:false, password:'123456' },
    { id:'p12', name:'Gustavo Nunes', phone:'11999990012', position:'Meia', goals:4, assists:6, tackles:4, fouls:1, yellows:0, reds:0, saves:0, cleanSheets:0, matches:7, blocked:false, password:'123456' },
    { id:'p13', name:'Leandro Ramos', phone:'11999990013', position:'Atacante', goals:7, assists:4, tackles:2, fouls:2, yellows:0, reds:0, saves:0, cleanSheets:0, matches:6, blocked:false, password:'123456' },
    { id:'p14', name:'Fábio Martins', phone:'11999990014', position:'Volante', goals:2, assists:3, tackles:14, fouls:3, yellows:2, reds:0, saves:0, cleanSheets:0, matches:8, blocked:false, password:'123456' },
    { id:'p15', name:'Rodrigo Neves', phone:'11999990015', position:'Lateral', goals:0, assists:5, tackles:8, fouls:1, yellows:0, reds:0, saves:0, cleanSheets:0, matches:7, blocked:false, password:'123456' },
    { id:'p16', name:'Vinícius Souza', phone:'11999990016', position:'Meia', goals:5, assists:9, tackles:3, fouls:0, yellows:0, reds:0, saves:0, cleanSheets:0, matches:9, blocked:false, password:'123456' },
    { id:'p17', name:'Henrique Dias', phone:'11999990017', position:'Zagueiro', goals:1, assists:0, tackles:16, fouls:4, yellows:3, reds:0, saves:0, cleanSheets:0, matches:8, blocked:false, password:'123456' },
    { id:'p18', name:'Matheus Lopes', phone:'11999990018', position:'Goleiro', goals:0, assists:0, tackles:0, fouls:0, yellows:0, reds:0, saves:22, cleanSheets:2, matches:5, blocked:false, password:'123456' },
  ];
  savePlayers(demoPlayers);

  const nextSunday = getNextDayOfWeek(0);

  const demoRachaos = [{
    id: 'r1',
    code: 'R4CH40',
    name: 'Rachão de Domingo',
    location: 'Quadra Society Central',
    dayOfWeek: 0,
    time: '20:00',
    playersPerTeam: 5,
    tieRule: 'playing_leaves',
    monthlyVenueCost: 800,
    pixKey: '11999990001',
    participants: ['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11','p12','p13','p14','p15','p16','p17','p18'],
    createdBy: 'p1',
    status: 'active'
  }];
  saveRachaos(demoRachaos);

  const demoSessions = [{
    id: 's1',
    rachaoId: 'r1',
    date: nextSunday,
    confirmed: ['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11','p12','p13','p14','p15','p16','p17','p18'],
    waiting: [],
    teams: null,
    leftover: [],
    status: 'open'
  }];
  saveSessions(demoSessions);

  // Monthly billing: R$800 / 18 participantes = R$44,44 por pessoa
  const month = getCurrentMonth();
  const demoBilling = [{
    id: 'bill1',
    rachaoId: 'r1',
    month: month,
    totalCost: 800,
    participantCount: 18,
    perPerson: Math.round(800 / 18 * 100) / 100,
    payments: demoRachaos[0].participants.map((pid, i) => ({
      playerId: pid,
      status: i < 10 ? 'paid' : 'pending',
      paidAt: i < 10 ? new Date().toISOString() : null
    }))
  }];
  saveMonthlyBilling(demoBilling);

  const demoFantasy = [
    { userId:'p1', rachaoId:'r1', name:'Carlos Silva', points:145, monthly:85, daily:22 },
    { userId:'p2', rachaoId:'r1', name:'Rafael Santos', points:132, monthly:78, daily:18 },
    { userId:'p5', rachaoId:'r1', name:'Thiago Almeida', points:128, monthly:90, daily:25 },
    { userId:'p7', rachaoId:'r1', name:'Pedro Souza', points:115, monthly:65, daily:15 },
    { userId:'p6', rachaoId:'r1', name:'Diego Ferreira', points:98, monthly:55, daily:12 },
  ];
  saveFantasyScores(demoFantasy);
}
