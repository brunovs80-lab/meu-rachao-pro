/**
 * Testes unitarios para js/fantasy.js
 * Fantasy League - pontuacao, times, ranking por rachao
 */

const fs = require('fs');
const path = require('path');

// Load fantasy.js into global scope (data.js already loaded by setup.js)
let fantasyCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'fantasy.js'), 'utf8');
fantasyCode = fantasyCode.replace(/^const\s+(\w+)\s*=/gm, 'global.$1 =');
fantasyCode = fantasyCode.replace(/^let\s+(\w+)\s*=/gm, 'global.$1 =');
fantasyCode = fantasyCode.replace(/^function\s+(\w+)\s*\(/gm, 'global.$1 = function $1(');
eval(fantasyCode);

// Mock DOM elements and app globals
global.currentRachaoId = null;
global.currentSessionId = null;
global.showToast = jest.fn();
global.closeModal = jest.fn();
global.addNotification = global.addNotification || jest.fn();

// Mock document methods for fantasy
const mockElements = {};
global.document.getElementById = jest.fn((id) => {
  if (!mockElements[id]) {
    mockElements[id] = { innerHTML: '', value: '', textContent: '', style: { display: '' } };
  }
  return mockElements[id];
});
global.document.querySelector = jest.fn(() => null);
global.document.querySelectorAll = jest.fn(() => []);

beforeEach(() => {
  __clearAllData();
  global.currentRachaoId = 'r1';
  global.currentSessionId = 's1';
  global.fantasyTeamSlots = { ATK1: null, ATK2: null, MID1: null, MID2: null, DEF1: null, GK: null };
  global.fantasySlotSelection = null;
  jest.clearAllMocks();
});

// ==================== FANTASY SCORES ====================

describe('updateFantasyScoresFromStat', () => {
  const setupFantasyTeam = () => {
    const player = { id: 'p1', name: 'Carlos', position: 'Atacante', goals: 5, assists: 3 };
    savePlayers([player]);
    saveFantasyTeams([{
      userId: 'u1', rachaoId: 'r1', name: 'User 1',
      slots: { ATK1: player, ATK2: null, MID1: null, MID2: null, DEF1: null, GK: null }
    }]);
    return player;
  };

  test('calcula pontos de jogador de linha corretamente', () => {
    setupFantasyTeam();

    updateFantasyScoresFromStat({
      playerId: 'p1', rachaoId: 'r1',
      goals: 2, assists: 1, tackles: 3, fouls: 1, yellows: 0, reds: 0
    });

    const scores = getFantasyScores();
    expect(scores).toHaveLength(1);
    // 2*5 + 1*3 + 3*2 - 1*1 + 1 (presence) = 10+3+6-1+1 = 19
    expect(scores[0].points).toBe(19);
    expect(scores[0].daily).toBe(19);
    expect(scores[0].monthly).toBe(19);
    expect(scores[0].rachaoId).toBe('r1');
  });

  test('calcula pontos de goleiro com multiplicador x1.3', () => {
    const gk = { id: 'p4', name: 'Lucas', position: 'Goleiro', goals: 0, assists: 0 };
    savePlayers([gk]);
    saveFantasyTeams([{
      userId: 'u2', rachaoId: 'r1', name: 'User 2',
      slots: { ATK1: null, ATK2: null, MID1: null, MID2: null, DEF1: null, GK: gk }
    }]);

    updateFantasyScoresFromStat({
      playerId: 'p4', rachaoId: 'r1',
      saves: 5, cleanSheets: 1
    });

    const scores = getFantasyScores();
    expect(scores).toHaveLength(1);
    // (5*1 + 1*5) * 1.3 + 1 (presence) = 13 + 1 = 14
    expect(scores[0].points).toBe(14);
  });

  test('acumula pontos em chamadas multiplas', () => {
    setupFantasyTeam();

    updateFantasyScoresFromStat({ playerId: 'p1', rachaoId: 'r1', goals: 1 });
    updateFantasyScoresFromStat({ playerId: 'p1', rachaoId: 'r1', goals: 1 });

    const scores = getFantasyScores();
    // Primeira: 1*5 + 1 = 6, Segunda: 1*5 + 1 = 6, Total: 12
    expect(scores[0].points).toBe(12);
  });

  test('nao pontua jogador que nao esta no time', () => {
    setupFantasyTeam();

    updateFantasyScoresFromStat({ playerId: 'p99', rachaoId: 'r1', goals: 5 });

    expect(getFantasyScores()).toHaveLength(0);
  });

  test('nao pontua time de outro rachao', () => {
    setupFantasyTeam();

    updateFantasyScoresFromStat({ playerId: 'p1', rachaoId: 'r_outro', goals: 5 });

    expect(getFantasyScores()).toHaveLength(0);
  });

  test('ignora stat sem rachaoId', () => {
    setupFantasyTeam();
    updateFantasyScoresFromStat({ playerId: 'p1' });
    expect(getFantasyScores()).toHaveLength(0);
  });

  test('desconta pontos por cartoes', () => {
    setupFantasyTeam();

    updateFantasyScoresFromStat({
      playerId: 'p1', rachaoId: 'r1',
      goals: 0, assists: 0, tackles: 0, fouls: 2, yellows: 1, reds: 1
    });

    const scores = getFantasyScores();
    // 0 - 2*1 - 1*2 - 1*4 + 1 = -7
    expect(scores[0].points).toBe(-7);
  });
});

// ==================== SAVE FANTASY TEAM ====================

describe('saveFantasyTeam', () => {
  test('salva time com minimo de 3 jogadores', () => {
    setCurrentUser({ id: 'u1', name: 'Carlos' });
    global.currentRachaoId = 'r1';

    const p1 = { id: 'p1', name: 'A' };
    const p2 = { id: 'p2', name: 'B' };
    const p3 = { id: 'p3', name: 'C' };
    global.fantasyTeamSlots = { ATK1: p1, ATK2: p2, MID1: p3, MID2: null, DEF1: null, GK: null };

    saveFantasyTeam();

    const teams = getFantasyTeams();
    expect(teams).toHaveLength(1);
    expect(teams[0].userId).toBe('u1');
    expect(teams[0].rachaoId).toBe('r1');
  });

  test('rejeita time com menos de 3 jogadores', () => {
    setCurrentUser({ id: 'u1', name: 'Carlos' });
    global.currentRachaoId = 'r1';
    global.fantasyTeamSlots = { ATK1: { id: 'p1' }, ATK2: null, MID1: null, MID2: null, DEF1: null, GK: null };

    saveFantasyTeam();

    expect(getFantasyTeams()).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith('Escolha pelo menos 3 jogadores');
  });

  test('nao salva sem usuario logado', () => {
    global.currentRachaoId = 'r1';
    global.fantasyTeamSlots = { ATK1: { id: 'p1' }, ATK2: { id: 'p2' }, MID1: { id: 'p3' }, MID2: null, DEF1: null, GK: null };

    saveFantasyTeam();

    expect(getFantasyTeams()).toHaveLength(0);
  });

  test('atualiza time existente em vez de duplicar', () => {
    setCurrentUser({ id: 'u1', name: 'Carlos' });
    global.currentRachaoId = 'r1';

    const p1 = { id: 'p1' }, p2 = { id: 'p2' }, p3 = { id: 'p3' }, p4 = { id: 'p4' };

    global.fantasyTeamSlots = { ATK1: p1, ATK2: p2, MID1: p3, MID2: null, DEF1: null, GK: null };
    saveFantasyTeam();

    global.fantasyTeamSlots = { ATK1: p1, ATK2: p2, MID1: p4, MID2: null, DEF1: null, GK: null };
    saveFantasyTeam();

    expect(getFantasyTeams()).toHaveLength(1);
    expect(getFantasyTeams()[0].slots.MID1.id).toBe('p4');
  });
});

// ==================== FANTASY RANKING ====================

describe('renderFantasyRanking', () => {
  test('renderiza ranking vazio sem erro', () => {
    global.currentRachaoId = 'r1';
    renderFantasyRanking('daily');
    const el = document.getElementById('fantasy-ranking-list');
    expect(el.innerHTML).toContain('Nenhum ranking');
  });

  test('filtra scores pelo rachaoId atual', () => {
    global.currentRachaoId = 'r1';
    saveFantasyScores([
      { userId: 'u1', rachaoId: 'r1', name: 'Carlos', points: 100, daily: 20, monthly: 50 },
      { userId: 'u2', rachaoId: 'r2', name: 'Outro', points: 200, daily: 40, monthly: 80 },
      { userId: 'u3', rachaoId: 'r1', name: 'Rafael', points: 80, daily: 15, monthly: 40 },
    ]);

    renderFantasyRanking('daily');
    const el = document.getElementById('fantasy-ranking-list');
    expect(el.innerHTML).toContain('Carlos');
    expect(el.innerHTML).toContain('Rafael');
    expect(el.innerHTML).not.toContain('Outro');
  });

  test('ordena por daily no modo diario', () => {
    global.currentRachaoId = 'r1';
    saveFantasyScores([
      { userId: 'u1', rachaoId: 'r1', name: 'Segundo', daily: 10 },
      { userId: 'u2', rachaoId: 'r1', name: 'Primeiro', daily: 25 },
    ]);

    renderFantasyRanking('daily');
    const el = document.getElementById('fantasy-ranking-list');
    const firstIdx = el.innerHTML.indexOf('Primeiro');
    const secondIdx = el.innerHTML.indexOf('Segundo');
    expect(firstIdx).toBeLessThan(secondIdx);
  });
});

// ==================== SELECT FANTASY PLAYER ====================

describe('selectFantasyPlayer', () => {
  test('seleciona jogador para o slot correto', () => {
    savePlayers([{ id: 'p1', name: 'Carlos Silva', position: 'Atacante' }]);
    global.fantasySlotSelection = 'ATK1';

    selectFantasyPlayer('p1');

    expect(global.fantasyTeamSlots.ATK1).toBeTruthy();
    expect(global.fantasyTeamSlots.ATK1.id).toBe('p1');
    expect(closeModal).toHaveBeenCalledWith('fantasy-picker');
  });

  test('nao seleciona jogador inexistente', () => {
    global.fantasySlotSelection = 'ATK1';
    selectFantasyPlayer('p_inexistente');
    expect(global.fantasyTeamSlots.ATK1).toBeNull();
  });

  test('nao seleciona sem slot definido', () => {
    savePlayers([{ id: 'p1', name: 'Carlos' }]);
    global.fantasySlotSelection = null;
    selectFantasyPlayer('p1');
    expect(global.fantasyTeamSlots.ATK1).toBeNull();
  });
});
