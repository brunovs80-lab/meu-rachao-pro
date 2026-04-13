// ========== DATA LAYER ==========
const DB = {
  get(key) { try { return JSON.parse(localStorage.getItem('rachao_' + key)); } catch { return null; } },
  set(key, val) { localStorage.setItem('rachao_' + key, JSON.stringify(val)); },
  remove(key) { localStorage.removeItem('rachao_' + key); }
};

function getCurrentUser() { return DB.get('currentUser'); }
function setCurrentUser(user) { DB.set('currentUser', user); }

function getPlayers() { return DB.get('players') || []; }
function savePlayers(p) { DB.set('players', p); }
function getPlayerById(id) { return getPlayers().find(p => p.id === id); }
function updatePlayer(id, data) {
  const ps = getPlayers();
  const i = ps.findIndex(p => p.id === id);
  if (i !== -1) { ps[i] = { ...ps[i], ...data }; savePlayers(ps); }
}

function getMatches() { return DB.get('matches') || []; }
function saveMatches(m) { DB.set('matches', m); }
function getMatchById(id) { return getMatches().find(m => m.id === id); }
function updateMatch(id, data) {
  const ms = getMatches();
  const i = ms.findIndex(m => m.id === id);
  if (i !== -1) { ms[i] = { ...ms[i], ...data }; saveMatches(ms); }
}

function getPayments() { return DB.get('payments') || []; }
function savePayments(p) { DB.set('payments', p); }

function getPendingStats() { return DB.get('pendingStats') || []; }
function savePendingStats(s) { DB.set('pendingStats', s); }

function getValidatedStats() { return DB.get('validatedStats') || []; }
function saveValidatedStats(s) { DB.set('validatedStats', s); }

function getFantasyTeams() { return DB.get('fantasyTeams') || []; }
function saveFantasyTeams(t) { DB.set('fantasyTeams', t); }

function getFantasyScores() { return DB.get('fantasyScores') || []; }
function saveFantasyScores(s) { DB.set('fantasyScores', s); }

function getRotationState() { return DB.get('rotationState') || null; }
function saveRotationState(s) { DB.set('rotationState', s); }

function getReleaseRequests() { return DB.get('releaseRequests') || []; }
function saveReleaseRequests(r) { DB.set('releaseRequests', r); }

function getBlockedPlayers() { return DB.get('blockedPlayers') || []; }
function saveBlockedPlayers(b) { DB.set('blockedPlayers', b); }

function getPrizes() {
  return DB.get('prizes') || { first: 'Isenção de mensalidade', second: '50% de desconto na próxima', third: 'Escolhe o time no sorteio', type: 'exemption' };
}
function savePrizesData(p) { DB.set('prizes', p); }

function getNotifications() { return DB.get('notifications') || []; }
function addNotification(notif) {
  const ns = getNotifications();
  ns.unshift({ id: generateId(), ...notif, timestamp: new Date().toISOString() });
  DB.set('notifications', ns.slice(0, 50));
}

// Offline sync queue
function getSyncQueue() { return DB.get('syncQueue') || []; }
function addToSyncQueue(action) {
  const q = getSyncQueue();
  q.push({ ...action, timestamp: new Date().toISOString() });
  DB.set('syncQueue', q);
}
function clearSyncQueue() { DB.set('syncQueue', []); }

// Utility
function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

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

// Fantasy point system
const POINTS = {
  field: { goal: 5, assist: 3, tackle: 2, win: 2, presence: 1, foul: -1, yellow: -2, red: -4 },
  goalkeeper: { save: 1, cleanSheet: 5, win: 3, presence: 1, goalConceded: -0.5, multiplier: 1.3 }
};

// Seed demo data
function seedDemoData() {
  if (getPlayers().length > 0) return;

  const demoPlayers = [
    { id:'p1', name:'Carlos Silva', phone:'11999990001', position:'Atacante', goals:12, assists:5, tackles:3, fouls:2, yellows:1, reds:0, saves:0, cleanSheets:0, matches:8, blocked:false },
    { id:'p2', name:'Rafael Santos', phone:'11999990002', position:'Meia', goals:8, assists:10, tackles:6, fouls:1, yellows:0, reds:0, saves:0, cleanSheets:0, matches:10, blocked:false },
    { id:'p3', name:'Bruno Costa', phone:'11999990003', position:'Zagueiro', goals:2, assists:1, tackles:15, fouls:4, yellows:2, reds:0, saves:0, cleanSheets:0, matches:9, blocked:false },
    { id:'p4', name:'Lucas Oliveira', phone:'11999990004', position:'Goleiro', goals:0, assists:0, tackles:0, fouls:0, yellows:0, reds:0, saves:35, cleanSheets:4, matches:10, blocked:false },
    { id:'p5', name:'Thiago Almeida', phone:'11999990005', position:'Atacante', goals:15, assists:3, tackles:2, fouls:3, yellows:1, reds:0, saves:0, cleanSheets:0, matches:10, blocked:false },
    { id:'p6', name:'Diego Ferreira', phone:'11999990006', position:'Volante', goals:3, assists:7, tackles:18, fouls:2, yellows:1, reds:0, saves:0, cleanSheets:0, matches:7, blocked:false },
    { id:'p7', name:'Pedro Souza', phone:'11999990007', position:'Meia', goals:6, assists:8, tackles:5, fouls:1, yellows:0, reds:0, saves:0, cleanSheets:0, matches:9, blocked:false },
    { id:'p8', name:'André Lima', phone:'11999990008', position:'Lateral', goals:1, assists:4, tackles:10, fouls:2, yellows:1, reds:0, saves:0, cleanSheets:0, matches:8, blocked:false },
    { id:'p9', name:'Marcos Pereira', phone:'11999990009', position:'Atacante', goals:9, assists:2, tackles:1, fouls:5, yellows:2, reds:1, saves:0, cleanSheets:0, matches:6, blocked:false },
    { id:'p10', name:'Felipe Rocha', phone:'11999990010', position:'Goleiro', goals:0, assists:1, tackles:0, fouls:0, yellows:0, reds:0, saves:28, cleanSheets:3, matches:10, blocked:false },
    { id:'p11', name:'João Mendes', phone:'11999990011', position:'Zagueiro', goals:1, assists:0, tackles:12, fouls:3, yellows:1, reds:0, saves:0, cleanSheets:0, matches:5, blocked:false },
    { id:'p12', name:'Gustavo Nunes', phone:'11999990012', position:'Meia', goals:4, assists:6, tackles:4, fouls:1, yellows:0, reds:0, saves:0, cleanSheets:0, matches:7, blocked:false },
    { id:'p13', name:'Leandro Ramos', phone:'11999990013', position:'Atacante', goals:7, assists:4, tackles:2, fouls:2, yellows:0, reds:0, saves:0, cleanSheets:0, matches:6, blocked:false },
    { id:'p14', name:'Fábio Martins', phone:'11999990014', position:'Volante', goals:2, assists:3, tackles:14, fouls:3, yellows:2, reds:0, saves:0, cleanSheets:0, matches:8, blocked:false },
    { id:'p15', name:'Rodrigo Neves', phone:'11999990015', position:'Lateral', goals:0, assists:5, tackles:8, fouls:1, yellows:0, reds:0, saves:0, cleanSheets:0, matches:7, blocked:false },
    { id:'p16', name:'Vinícius Souza', phone:'11999990016', position:'Meia', goals:5, assists:9, tackles:3, fouls:0, yellows:0, reds:0, saves:0, cleanSheets:0, matches:9, blocked:false },
    { id:'p17', name:'Henrique Dias', phone:'11999990017', position:'Zagueiro', goals:1, assists:0, tackles:16, fouls:4, yellows:3, reds:0, saves:0, cleanSheets:0, matches:8, blocked:false },
    { id:'p18', name:'Matheus Lopes', phone:'11999990018', position:'Goleiro', goals:0, assists:0, tackles:0, fouls:0, yellows:0, reds:0, saves:22, cleanSheets:2, matches:5, blocked:false },
  ];
  savePlayers(demoPlayers);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];

  const demoMatches = [{
    id: 'm1',
    name: 'Rachão de Quinta',
    date: dateStr,
    time: '20:00',
    location: 'Quadra Society Central',
    playersPerTeam: 5,
    tieRule: 'playing_leaves',
    paymentType: 'per_match',
    price: 25,
    pixKey: '11999990001',
    confirmed: ['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11','p12','p13','p14','p15','p16','p17','p18'],
    waiting: [],
    teams: null,
    status: 'open',
    createdBy: 'admin'
  }];
  saveMatches(demoMatches);

  const demoPayments = [
    { id:'pay1', matchId:'m1', playerId:'p1', status:'paid', amount:25 },
    { id:'pay2', matchId:'m1', playerId:'p2', status:'paid', amount:25 },
    { id:'pay3', matchId:'m1', playerId:'p3', status:'pending', amount:25 },
    { id:'pay4', matchId:'m1', playerId:'p4', status:'paid', amount:25 },
    { id:'pay5', matchId:'m1', playerId:'p5', status:'pending', amount:25 },
    { id:'pay6', matchId:'m1', playerId:'p6', status:'paid', amount:25 },
    { id:'pay7', matchId:'m1', playerId:'p7', status:'paid', amount:25 },
    { id:'pay8', matchId:'m1', playerId:'p8', status:'pending', amount:25 },
    { id:'pay9', matchId:'m1', playerId:'p9', status:'paid', amount:25 },
    { id:'pay10', matchId:'m1', playerId:'p10', status:'paid', amount:25 },
  ];
  savePayments(demoPayments);

  const demoFantasy = [
    { userId:'p1', name:'Carlos Silva', points:145, monthly:85, daily:22 },
    { userId:'p2', name:'Rafael Santos', points:132, monthly:78, daily:18 },
    { userId:'p5', name:'Thiago Almeida', points:128, monthly:90, daily:25 },
    { userId:'p7', name:'Pedro Souza', points:115, monthly:65, daily:15 },
    { userId:'p6', name:'Diego Ferreira', points:98, monthly:55, daily:12 },
  ];
  saveFantasyScores(demoFantasy);
}
