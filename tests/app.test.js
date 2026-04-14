/**
 * Testes de integracao para js/app.js
 * Fluxos principais: rachao, sessao, presenca, sorteio, billing, rotacao
 */

const fs = require('fs');
const path = require('path');

// Load app.js functions into global scope
let appCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
appCode = appCode.replace(/document\.addEventListener\('DOMContentLoaded'[\s\S]*?\}\);/, '');
appCode = appCode.replace(/^const\s+(\w+)\s*=/gm, 'global.$1 =');
appCode = appCode.replace(/^let\s+(\w+)\s*=/gm, 'global.$1 =');
appCode = appCode.replace(/^function\s+(\w+)\s*\(/gm, 'global.$1 = function $1(');

// Also load fantasy.js
let fantasyCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'fantasy.js'), 'utf8');
fantasyCode = fantasyCode.replace(/^const\s+(\w+)\s*=/gm, 'global.$1 =');
fantasyCode = fantasyCode.replace(/^let\s+(\w+)\s*=/gm, 'global.$1 =');
fantasyCode = fantasyCode.replace(/^function\s+(\w+)\s*\(/gm, 'global.$1 = function $1(');

// Mock DOM
const mockElements = {};
const getMockEl = (id) => {
  if (!mockElements[id]) {
    mockElements[id] = {
      innerHTML: '', value: '', textContent: '', className: '',
      style: { display: '' },
      classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn(() => false) },
      addEventListener: jest.fn(),
      querySelector: jest.fn(() => null),
      querySelectorAll: jest.fn(() => []),
      setAttribute: jest.fn(),
    };
  }
  return mockElements[id];
};

global.document.getElementById = jest.fn(getMockEl);
global.document.querySelector = jest.fn(() => null);
global.document.querySelectorAll = jest.fn(() => []);

// Eval source code
eval(appCode);
eval(fantasyCode);

// NOW override showToast/navigateTo etc after eval (app.js defines them)
const _origShowToast = global.showToast;
const _origNavigateTo = global.navigateTo;
let toastMessages = [];
let navigations = [];

global.showToast = (msg) => { toastMessages.push(msg); };
global.navigateTo = (page) => { navigations.push(page); };

beforeEach(() => {
  __clearAllData();
  Object.keys(mockElements).forEach(k => delete mockElements[k]);
  global.currentRachaoId = null;
  global.currentSessionId = null;
  toastMessages = [];
  navigations = [];
});

// ==================== GENERATE CODE ====================

describe('generateRachaoCode', () => {
  test('gera codigo de 6 caracteres', () => {
    const code = generateRachaoCode();
    expect(code).toHaveLength(6);
  });

  test('codigo contem apenas caracteres validos (sem O, I, L, 0, 1)', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateRachaoCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  test('gera codigos unicos', () => {
    const codes = new Set();
    for (let i = 0; i < 50; i++) codes.add(generateRachaoCode());
    expect(codes.size).toBe(50);
  });
});

// ==================== CREATE RACHAO ====================

describe('createRachao', () => {
  beforeEach(() => {
    setCurrentUser({ id: 'u1', name: 'Carlos', phone: '11999990001', position: 'Atacante' });
    getMockEl('rachao-name').value = 'Rachao Teste';
    getMockEl('rachao-day').value = '0';
    getMockEl('rachao-time').value = '20:00';
    getMockEl('rachao-location').value = 'Quadra X';
    getMockEl('rachao-players').value = '5';
    getMockEl('rachao-tie-rule').value = 'playing_leaves';
    getMockEl('rachao-venue-cost').value = '800';
    getMockEl('rachao-pix').value = '11999990001';
  });

  test('cria rachao com todos os campos corretos', () => {
    createRachao();

    const rachaos = getRachaos();
    expect(rachaos).toHaveLength(1);

    const r = rachaos[0];
    expect(r.name).toBe('Rachao Teste');
    expect(r.dayOfWeek).toBe(0);
    expect(r.time).toBe('20:00');
    expect(r.location).toBe('Quadra X');
    expect(r.playersPerTeam).toBe(5);
    expect(r.tieRule).toBe('playing_leaves');
    expect(r.monthlyVenueCost).toBe(800);
    expect(r.pixKey).toBe('11999990001');
    expect(r.code).toHaveLength(6);
    expect(r.participants).toEqual(['u1']);
    expect(r.createdBy).toBe('u1');
    expect(r.status).toBe('active');
  });

  test('criador e adicionado como participante', () => {
    createRachao();
    expect(getRachaos()[0].participants).toContain('u1');
  });

  test('rejeita sem campos obrigatorios', () => {
    getMockEl('rachao-name').value = '';
    createRachao();
    expect(getRachaos()).toHaveLength(0);
    expect(toastMessages).toContain('Preencha todos os campos');
  });

  test('gera notificacao ao criar', () => {
    createRachao();
    const ns = getNotifications();
    expect(ns.length).toBeGreaterThan(0);
    expect(ns[0].title).toBe('Novo rachão!');
  });
});

// ==================== JOIN RACHAO BY CODE ====================

describe('joinRachaoByCode', () => {
  beforeEach(() => {
    setCurrentUser({ id: 'u2', name: 'Rafael', phone: '11999990002' });
    saveRachaos([{
      id: 'r1', code: 'ABC123', name: 'Rachao', location: 'Quadra',
      dayOfWeek: 0, time: '20:00', playersPerTeam: 5,
      participants: ['u1'], createdBy: 'u1', status: 'active'
    }]);
  });

  test('entra no rachao com codigo valido', () => {
    getMockEl('join-code').value = 'ABC123';
    joinRachaoByCode();
    expect(getRachaoById('r1').participants).toContain('u2');
    expect(toastMessages).toContain('Você entrou no rachão!');
  });

  test('funciona case-insensitive', () => {
    getMockEl('join-code').value = 'abc123';
    joinRachaoByCode();
    expect(getRachaoById('r1').participants).toContain('u2');
  });

  test('rejeita codigo invalido', () => {
    getMockEl('join-code').value = 'XXXXXX';
    joinRachaoByCode();
    expect(getRachaoById('r1').participants).not.toContain('u2');
    expect(toastMessages).toContain('Código não encontrado');
  });

  test('rejeita codigo com menos de 6 digitos', () => {
    getMockEl('join-code').value = 'ABC';
    joinRachaoByCode();
    expect(toastMessages).toContain('Digite o código de 6 dígitos');
  });

  test('nao duplica participante', () => {
    getMockEl('join-code').value = 'ABC123';
    joinRachaoByCode();
    getMockEl('join-code').value = 'ABC123';
    joinRachaoByCode();
    expect(getRachaoById('r1').participants.filter(p => p === 'u2')).toHaveLength(1);
    expect(toastMessages).toContain('Você já está neste rachão');
  });
});

// ==================== CREATE SESSION ====================

describe('createSession', () => {
  beforeEach(() => {
    saveRachaos([{
      id: 'r1', code: 'ABC123', name: 'Rachao',
      dayOfWeek: 0, time: '20:00', playersPerTeam: 5,
      participants: ['u1'], createdBy: 'u1', status: 'active'
    }]);
    global.currentRachaoId = 'r1';
    global.loadRachaoDetail = jest.fn();
  });

  test('cria sessao com data do proximo dia da semana', () => {
    createSession();

    const sessions = getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].rachaoId).toBe('r1');
    expect(sessions[0].status).toBe('open');
    expect(sessions[0].confirmed).toEqual([]);
    expect(sessions[0].teams).toBeNull();

    const d = new Date(sessions[0].date + 'T12:00:00');
    expect(d.getDay()).toBe(0);
  });

  test('nao cria sessao sem rachao valido', () => {
    global.currentRachaoId = 'inexistente';
    createSession();
    expect(getSessions()).toHaveLength(0);
  });
});

// ==================== TOGGLE PRESENCE ====================

describe('togglePresence', () => {
  beforeEach(() => {
    setCurrentUser({ id: 'u1', name: 'Carlos', blocked: false });
    saveSessions([{
      id: 's1', rachaoId: 'r1', date: '2026-04-20',
      confirmed: [], waiting: [], teams: null, leftover: [], status: 'open'
    }]);
    global.currentSessionId = 's1';
  });

  test('confirma presenca', () => {
    togglePresence();
    expect(getSessionById('s1').confirmed).toContain('u1');
    expect(toastMessages).toContain('Presença confirmada!');
  });

  test('cancela presenca', () => {
    updateSession('s1', { confirmed: ['u1'], waiting: [] });
    togglePresence();
    expect(getSessionById('s1').confirmed).not.toContain('u1');
    expect(toastMessages).toContain('Presença cancelada');
  });

  test('promove jogador da lista de espera ao cancelar', () => {
    updateSession('s1', { confirmed: ['u1'], waiting: ['u2'] });
    togglePresence();
    const session = getSessionById('s1');
    expect(session.confirmed).not.toContain('u1');
    expect(session.confirmed).toContain('u2');
    expect(session.waiting).toEqual([]);
  });

  test('bloqueia jogador bloqueado', () => {
    setCurrentUser({ id: 'u1', name: 'Carlos', blocked: true });
    togglePresence();
    expect(getSessionById('s1').confirmed).not.toContain('u1');
  });
});

// ==================== DRAW TEAMS ====================

describe('drawTeams', () => {
  beforeEach(() => {
    const players = [];
    for (let i = 1; i <= 12; i++) {
      players.push({
        id: `p${i}`, name: `Player ${i}`,
        position: i <= 2 ? 'Goleiro' : 'Atacante',
        goals: 0, assists: 0
      });
    }
    savePlayers(players);

    saveRachaos([{
      id: 'r1', name: 'Rachao', playersPerTeam: 5,
      participants: players.map(p => p.id)
    }]);

    saveSessions([{
      id: 's1', rachaoId: 'r1', date: '2026-04-20',
      confirmed: players.map(p => p.id),
      waiting: [], teams: null, leftover: [], status: 'open'
    }]);

    global.currentRachaoId = 'r1';
    global.currentSessionId = 's1';
    global.loadRachaoDetail = jest.fn();
  });

  test('sorteia 2 times com 12 jogadores e 5 por time', () => {
    drawTeams();
    const session = getSessionById('s1');
    expect(session.teams).toBeTruthy();
    expect(session.teams).toHaveLength(2);
  });

  test('rejeita com poucos jogadores', () => {
    updateSession('s1', { confirmed: ['p1', 'p2', 'p3'] });
    drawTeams();
    expect(getSessionById('s1').teams).toBeNull();
    expect(toastMessages.length).toBeGreaterThan(0);
  });

  test('cada time tem um nome', () => {
    drawTeams();
    const session = getSessionById('s1');
    expect(session.teams[0].name).toBe('Time A');
    expect(session.teams[1].name).toBe('Time B');
  });

  test('gera notificacao apos sorteio', () => {
    drawTeams();
    const ns = getNotifications();
    expect(ns.some(n => n.title === 'Times sorteados!')).toBe(true);
  });
});

// ==================== END SESSION ====================

describe('endSession', () => {
  beforeEach(() => {
    saveSessions([{
      id: 's1', rachaoId: 'r1', date: '2026-04-20',
      confirmed: ['p1'], status: 'open'
    }]);
    global.currentSessionId = 's1';
    global.loadRachaoDetail = jest.fn();
  });

  test('marca sessao como done', () => {
    endSession();
    expect(getSessionById('s1').status).toBe('done');
    expect(toastMessages).toContain('Jogo encerrado');
  });
});

// ==================== BILLING ====================

describe('getOrCreateBilling', () => {
  test('cria billing se nao existe', () => {
    const rachao = { id: 'r1', participants: ['p1', 'p2', 'p3'], monthlyVenueCost: 300 };
    const billing = getOrCreateBilling(rachao, '2026-04', 100);

    expect(billing).toBeTruthy();
    expect(billing.rachaoId).toBe('r1');
    expect(billing.month).toBe('2026-04');
    expect(billing.totalCost).toBe(300);
    expect(billing.perPerson).toBe(100);
    expect(billing.payments).toHaveLength(3);
    expect(billing.payments[0].status).toBe('pending');
  });

  test('retorna billing existente sem duplicar', () => {
    const rachao = { id: 'r1', participants: ['p1', 'p2'], monthlyVenueCost: 200 };
    getOrCreateBilling(rachao, '2026-04', 100);
    getOrCreateBilling(rachao, '2026-04', 100);
    expect(getMonthlyBilling().filter(b => b.rachaoId === 'r1' && b.month === '2026-04')).toHaveLength(1);
  });
});

describe('confirmBillingPayment', () => {
  test('confirma pagamento de um jogador', () => {
    saveMonthlyBilling([{
      id: 'bill1', rachaoId: 'r1', month: '2026-04',
      totalCost: 200, participantCount: 2, perPerson: 100,
      payments: [
        { playerId: 'p1', status: 'pending', paidAt: null },
        { playerId: 'p2', status: 'pending', paidAt: null }
      ]
    }]);

    confirmBillingPayment('bill1', 'p1');

    const billing = getMonthlyBilling()[0];
    const p1Payment = billing.payments.find(p => p.playerId === 'p1');
    expect(p1Payment.status).toBe('paid');
    expect(p1Payment.paidAt).toBeTruthy();
  });
});

// ==================== TEAM NAMES ====================

describe('getTeamName e getTeamClass', () => {
  test('retorna nomes corretos', () => {
    expect(getTeamName(0)).toBe('Time A');
    expect(getTeamName(1)).toBe('Time B');
    expect(getTeamName(5)).toBe('Time F');
    expect(getTeamName(6)).toBe('Time 7');
  });

  test('retorna classes CSS corretas', () => {
    expect(getTeamClass(0)).toBe('team-a');
    expect(getTeamClass(3)).toBe('team-d');
    expect(getTeamClass(4)).toBe('team-a');
  });
});

// ==================== VALIDATE STAT ====================

describe('validateStat', () => {
  beforeEach(() => {
    savePlayers([{
      id: 'p1', name: 'Carlos', position: 'Atacante',
      goals: 0, assists: 0, tackles: 0, saves: 0, cleanSheets: 0,
      fouls: 0, yellows: 0, reds: 0, matches: 0
    }]);
    savePendingStats([{
      id: 'st1', playerId: 'p1', sessionId: 's1', rachaoId: 'r1',
      goals: 2, assists: 1, tackles: 3, saves: 0, cleanSheets: 0,
      fouls: 0, yellows: 0, reds: 0
    }]);
    global.loadAdminStats = jest.fn();
  });

  test('aprovar stat atualiza gols, assists e tackles do jogador', () => {
    validateStat('st1', true);

    const player = getPlayerById('p1');
    expect(player.goals).toBe(2);
    expect(player.assists).toBe(1);
    expect(player.tackles).toBe(3);

    expect(getPendingStats()).toHaveLength(0);
    expect(getValidatedStats()).toHaveLength(1);
  });

  test('rejeitar stat remove sem atualizar jogador', () => {
    validateStat('st1', false);

    const player = getPlayerById('p1');
    expect(player.goals).toBe(0);
    expect(player.assists).toBe(0);

    expect(getPendingStats()).toHaveLength(0);
    expect(getValidatedStats()).toHaveLength(0);
  });
});

// ==================== BLOCK / UNBLOCK ====================

describe('blockPlayer e unblockPlayer', () => {
  beforeEach(() => {
    savePlayers([
      { id: 'p1', name: 'Carlos', blocked: false },
      { id: 'p2', name: 'Rafael', blocked: false }
    ]);
    global.loadAdminPayments = jest.fn();
  });

  test('bloqueia jogador', () => {
    blockPlayer('p1');
    expect(getPlayerById('p1').blocked).toBe(true);
    expect(getBlockedPlayers()).toContain('p1');
  });

  test('desbloqueia jogador', () => {
    blockPlayer('p1');
    unblockPlayer('p1');
    expect(getPlayerById('p1').blocked).toBe(false);
    expect(getBlockedPlayers()).not.toContain('p1');
  });
});

// ==================== CALC PLAYER POINTS ====================

describe('calcPlayerPoints', () => {
  test('calcula pontos de jogador de linha', () => {
    // goals*5 + assists*3 + tackles*2 + matches*1 - fouls*1 - yellows*2 - reds*4
    const pts = calcPlayerPoints({
      goals: 10, assists: 5, tackles: 8, matches: 10,
      fouls: 0, yellows: 0, reds: 0
    });
    // 10*5 + 5*3 + 8*2 + 10*1 = 50+15+16+10 = 91
    expect(pts).toBe(91);
  });

  test('desconta faltas e cartoes', () => {
    const pts = calcPlayerPoints({
      goals: 1, assists: 0, tackles: 0, matches: 1,
      fouls: 2, yellows: 1, reds: 0
    });
    // 1*5 + 0 + 0 + 1*1 - 2*1 - 1*2 = 5+1-2-2 = 2
    expect(pts).toBe(2);
  });

  test('calcula pontos de goleiro com multiplicador', () => {
    const pts = calcPlayerPoints({
      position: 'Goleiro', saves: 10, cleanSheets: 2, matches: 5,
      goals: 0, assists: 0, tackles: 0, fouls: 0, yellows: 0, reds: 0
    });
    // (10*1 + 2*5 + 5*1) * 1.3 = 25 * 1.3 = 32.5 -> round = 33
    expect(pts).toBe(33);
  });

  test('retorna 0 para jogador sem stats', () => {
    expect(calcPlayerPoints({ goals: 0, assists: 0, tackles: 0, matches: 0, fouls: 0, yellows: 0, reds: 0 })).toBe(0);
  });
});
