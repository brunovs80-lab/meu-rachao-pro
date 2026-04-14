/**
 * Testes unitarios para js/data.js
 * Camada de dados - CRUD, utilitarios, migracao e seed
 */

// setup.js is loaded via Jest setupFiles - all data.js functions are global

beforeEach(() => {
  __clearAllData();
});

// ==================== DB (baixo nivel) ====================

describe('DB - localStorage wrapper', () => {
  test('DB.set e DB.get armazenam e recuperam dados', () => {
    DB.set('test', { foo: 'bar' });
    expect(DB.get('test')).toEqual({ foo: 'bar' });
  });

  test('DB.get retorna null para chave inexistente', () => {
    expect(DB.get('naoexiste')).toBeNull();
  });

  test('DB.remove apaga a chave', () => {
    DB.set('temp', 123);
    DB.remove('temp');
    expect(DB.get('temp')).toBeNull();
  });

  test('DB usa prefixo rachao_ no localStorage', () => {
    DB.set('xyz', 'valor');
    expect(localStorage.getItem('rachao_xyz')).toBe('"valor"');
  });
});

// ==================== PLAYERS ====================

describe('Players CRUD', () => {
  test('getPlayers retorna array vazio quando nao ha dados', () => {
    expect(getPlayers()).toEqual([]);
  });

  test('savePlayers e getPlayers persistem jogadores', () => {
    const players = [
      { id: 'p1', name: 'Carlos', position: 'Atacante' },
      { id: 'p2', name: 'Rafael', position: 'Meia' }
    ];
    savePlayers(players);
    expect(getPlayers()).toEqual(players);
    expect(getPlayers()).toHaveLength(2);
  });

  test('getPlayerById encontra jogador por ID', () => {
    savePlayers([
      { id: 'p1', name: 'Carlos' },
      { id: 'p2', name: 'Rafael' }
    ]);
    expect(getPlayerById('p1').name).toBe('Carlos');
    expect(getPlayerById('p2').name).toBe('Rafael');
    expect(getPlayerById('p99')).toBeUndefined();
  });

  test('updatePlayer atualiza campos do jogador', () => {
    savePlayers([{ id: 'p1', name: 'Carlos', goals: 0 }]);
    updatePlayer('p1', { goals: 5 });
    expect(getPlayerById('p1').goals).toBe(5);
    expect(getPlayerById('p1').name).toBe('Carlos');
  });

  test('updatePlayer nao faz nada para ID inexistente', () => {
    savePlayers([{ id: 'p1', name: 'Carlos' }]);
    updatePlayer('p99', { name: 'Ninguem' });
    expect(getPlayers()).toHaveLength(1);
    expect(getPlayerById('p1').name).toBe('Carlos');
  });
});

// ==================== RACHAOS ====================

describe('Rachaos CRUD', () => {
  test('getRachaos retorna array vazio quando nao ha dados', () => {
    expect(getRachaos()).toEqual([]);
  });

  test('saveRachaos e getRachaos persistem rachoes', () => {
    const rachaos = [{ id: 'r1', name: 'Rachao de Domingo', dayOfWeek: 0 }];
    saveRachaos(rachaos);
    expect(getRachaos()).toEqual(rachaos);
  });

  test('getRachaoById encontra rachao por ID', () => {
    saveRachaos([
      { id: 'r1', name: 'Domingo' },
      { id: 'r2', name: 'Quinta' }
    ]);
    expect(getRachaoById('r1').name).toBe('Domingo');
    expect(getRachaoById('r99')).toBeUndefined();
  });

  test('updateRachao atualiza campos do rachao', () => {
    saveRachaos([{ id: 'r1', name: 'Domingo', participants: [] }]);
    updateRachao('r1', { participants: ['p1', 'p2'] });
    expect(getRachaoById('r1').participants).toEqual(['p1', 'p2']);
    expect(getRachaoById('r1').name).toBe('Domingo');
  });
});

// ==================== SESSIONS ====================

describe('Sessions CRUD', () => {
  test('getSessions retorna array vazio inicialmente', () => {
    expect(getSessions()).toEqual([]);
  });

  test('saveSessions e getSessionById funcionam', () => {
    const sessions = [
      { id: 's1', rachaoId: 'r1', date: '2026-04-20', confirmed: [], status: 'open' },
      { id: 's2', rachaoId: 'r1', date: '2026-04-27', confirmed: [], status: 'done' }
    ];
    saveSessions(sessions);
    expect(getSessionById('s1').date).toBe('2026-04-20');
    expect(getSessionById('s2').status).toBe('done');
  });

  test('getSessionsByRachao filtra por rachaoId', () => {
    saveSessions([
      { id: 's1', rachaoId: 'r1' },
      { id: 's2', rachaoId: 'r2' },
      { id: 's3', rachaoId: 'r1' }
    ]);
    const r1Sessions = getSessionsByRachao('r1');
    expect(r1Sessions).toHaveLength(2);
    expect(r1Sessions.map(s => s.id)).toEqual(['s1', 's3']);
  });

  test('updateSession atualiza campos da sessao', () => {
    saveSessions([{ id: 's1', rachaoId: 'r1', confirmed: [], status: 'open' }]);
    updateSession('s1', { confirmed: ['p1', 'p2'], status: 'done' });
    const s = getSessionById('s1');
    expect(s.confirmed).toEqual(['p1', 'p2']);
    expect(s.status).toBe('done');
  });
});

// ==================== MONTHLY BILLING ====================

describe('Monthly Billing', () => {
  test('getMonthlyBilling retorna array vazio', () => {
    expect(getMonthlyBilling()).toEqual([]);
  });

  test('saveMonthlyBilling persiste dados', () => {
    const billing = [{
      id: 'bill1', rachaoId: 'r1', month: '2026-04',
      totalCost: 800, participantCount: 18, perPerson: 44.44,
      payments: [{ playerId: 'p1', status: 'paid', paidAt: '2026-04-01' }]
    }];
    saveMonthlyBilling(billing);
    expect(getMonthlyBilling()).toHaveLength(1);
    expect(getMonthlyBilling()[0].perPerson).toBe(44.44);
  });
});

// ==================== STATS ====================

describe('Stats (Pending/Validated)', () => {
  test('getPendingStats e savePendingStats funcionam', () => {
    expect(getPendingStats()).toEqual([]);
    savePendingStats([{ id: 'st1', playerId: 'p1', goals: 2 }]);
    expect(getPendingStats()).toHaveLength(1);
  });

  test('getValidatedStats e saveValidatedStats funcionam', () => {
    expect(getValidatedStats()).toEqual([]);
    saveValidatedStats([{ id: 'st1', playerId: 'p1', goals: 2 }]);
    expect(getValidatedStats()).toHaveLength(1);
  });
});

// ==================== FANTASY ====================

describe('Fantasy Data', () => {
  test('getFantasyTeams retorna array vazio', () => {
    expect(getFantasyTeams()).toEqual([]);
  });

  test('saveFantasyTeams persiste times', () => {
    saveFantasyTeams([{ userId: 'p1', rachaoId: 'r1', slots: {} }]);
    expect(getFantasyTeams()).toHaveLength(1);
  });

  test('getFantasyScores retorna array vazio', () => {
    expect(getFantasyScores()).toEqual([]);
  });

  test('saveFantasyScores persiste scores', () => {
    saveFantasyScores([{ userId: 'p1', rachaoId: 'r1', points: 100 }]);
    expect(getFantasyScores()[0].points).toBe(100);
  });
});

// ==================== ROTATION ====================

describe('Rotation State', () => {
  test('getRotationState retorna null inicialmente', () => {
    expect(getRotationState()).toBeNull();
  });

  test('saveRotationState persiste estado', () => {
    const state = { sessionId: 's1', teams: [], round: 1, scoreA: 0, scoreB: 0 };
    saveRotationState(state);
    expect(getRotationState()).toEqual(state);
  });
});

// ==================== BLOCKED / RELEASE ====================

describe('Blocked Players e Release Requests', () => {
  test('getBlockedPlayers retorna array vazio', () => {
    expect(getBlockedPlayers()).toEqual([]);
  });

  test('saveBlockedPlayers persiste lista', () => {
    saveBlockedPlayers(['p1', 'p2']);
    expect(getBlockedPlayers()).toEqual(['p1', 'p2']);
  });

  test('getReleaseRequests retorna array vazio', () => {
    expect(getReleaseRequests()).toEqual([]);
  });

  test('saveReleaseRequests persiste pedidos', () => {
    saveReleaseRequests([{ id: 'req1', playerId: 'p1', message: 'por favor' }]);
    expect(getReleaseRequests()).toHaveLength(1);
  });
});

// ==================== PRIZES ====================

describe('Prizes', () => {
  test('getPrizes retorna defaults', () => {
    const prizes = getPrizes();
    expect(prizes.first).toBe('Isenção de mensalidade');
    expect(prizes.second).toBeDefined();
    expect(prizes.third).toBeDefined();
  });

  test('savePrizesData persiste premios', () => {
    savePrizesData({ first: 'R$ 100', second: 'R$ 50', third: 'Nada' });
    expect(getPrizes().first).toBe('R$ 100');
  });
});

// ==================== NOTIFICATIONS ====================

describe('Notifications', () => {
  test('getNotifications retorna array vazio', () => {
    expect(getNotifications()).toEqual([]);
  });

  test('addNotification adiciona notificacao com id e timestamp', () => {
    addNotification({ type: 'green', icon: 'fa-check', title: 'Teste', text: 'mensagem' });
    const ns = getNotifications();
    expect(ns).toHaveLength(1);
    expect(ns[0].id).toBeDefined();
    expect(ns[0].timestamp).toBeDefined();
    expect(ns[0].title).toBe('Teste');
  });

  test('addNotification limita a 50 notificacoes', () => {
    for (let i = 0; i < 55; i++) {
      addNotification({ title: `Notif ${i}` });
    }
    expect(getNotifications()).toHaveLength(50);
  });

  test('addNotification insere no inicio (mais recente primeiro)', () => {
    addNotification({ title: 'Primeira' });
    addNotification({ title: 'Segunda' });
    expect(getNotifications()[0].title).toBe('Segunda');
  });
});

// ==================== USER ====================

describe('Current User', () => {
  test('getCurrentUser retorna null se nao logado', () => {
    expect(getCurrentUser()).toBeNull();
  });

  test('setCurrentUser e getCurrentUser funcionam', () => {
    setCurrentUser({ id: 'p1', name: 'Carlos', phone: '11999990001' });
    expect(getCurrentUser().name).toBe('Carlos');
  });
});

// ==================== UTILITARIOS ====================

describe('Utilitarios', () => {
  test('generateId gera IDs unicos', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  test('formatPhone formata corretamente', () => {
    expect(formatPhone('11999991234')).toBe('(11) 99999-1234');
    expect(formatPhone('11')).toBe('(11');
    expect(formatPhone('11999')).toBe('(11) 999');
  });

  test('formatCurrency formata em reais', () => {
    expect(formatCurrency(44.44)).toBe('R$ 44,44');
    expect(formatCurrency(0)).toBe('R$ 0,00');
    expect(formatCurrency(1000)).toBe('R$ 1000,00');
  });

  test('formatDateBR formata data brasileira', () => {
    expect(formatDateBR('2026-04-20')).toBe('20/04/2026');
    expect(formatDateBR('')).toBe('');
  });

  test('getMonthAbbr retorna mes abreviado', () => {
    expect(getMonthAbbr(0)).toBe('JAN');
    expect(getMonthAbbr(3)).toBe('ABR');
    expect(getMonthAbbr(11)).toBe('DEZ');
  });

  test('getDayName retorna nome do dia', () => {
    expect(getDayName(0)).toBe('Domingo');
    expect(getDayName(1)).toBe('Segunda');
    expect(getDayName(6)).toBe('Sábado');
  });

  test('getDayNameShort retorna dia abreviado', () => {
    expect(getDayNameShort(0)).toBe('DOM');
    expect(getDayNameShort(5)).toBe('SEX');
  });

  test('getCurrentMonth retorna formato YYYY-MM', () => {
    const month = getCurrentMonth();
    expect(month).toMatch(/^\d{4}-\d{2}$/);
  });

  test('getNextDayOfWeek retorna data futura correta', () => {
    const nextSunday = getNextDayOfWeek(0);
    expect(nextSunday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date(nextSunday + 'T12:00:00');
    expect(d.getDay()).toBe(0); // Domingo
    expect(d >= new Date()).toBe(true);
  });
});

// ==================== POINTS SYSTEM ====================

describe('Sistema de Pontos (POINTS)', () => {
  test('POINTS.field tem todas as categorias', () => {
    expect(POINTS.field.goal).toBe(5);
    expect(POINTS.field.assist).toBe(3);
    expect(POINTS.field.tackle).toBe(2);
    expect(POINTS.field.win).toBe(2);
    expect(POINTS.field.presence).toBe(1);
    expect(POINTS.field.foul).toBe(-1);
    expect(POINTS.field.yellow).toBe(-2);
    expect(POINTS.field.red).toBe(-4);
  });

  test('POINTS.goalkeeper tem multiplicador 1.3', () => {
    expect(POINTS.goalkeeper.save).toBe(1);
    expect(POINTS.goalkeeper.cleanSheet).toBe(5);
    expect(POINTS.goalkeeper.multiplier).toBe(1.3);
    expect(POINTS.goalkeeper.goalConceded).toBe(-0.5);
  });
});

// ==================== MIGRACAO ====================

describe('Migracao de dados antigos', () => {
  test('migrateToRachaoModel converte matches antigos', () => {
    // Setup dados antigos
    DB.set('matches', [{
      id: 'm1', name: 'Pelada', location: 'Quadra',
      date: '2026-04-20', time: '20:00', playersPerTeam: 5,
      price: 50, confirmed: ['p1', 'p2'], waiting: [],
      createdBy: 'p1', status: 'open'
    }]);
    DB.set('payments', []);

    migrateToRachaoModel();

    // Verifica conversao
    const rachaos = getRachaos();
    expect(rachaos).toHaveLength(1);
    expect(rachaos[0].name).toBe('Pelada');
    expect(rachaos[0].dayOfWeek).toBe(new Date('2026-04-20T12:00:00').getDay());
    expect(rachaos[0].participants).toEqual(['p1', 'p2']);

    const sessions = getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].rachaoId).toBe('m1');
    expect(sessions[0].confirmed).toEqual(['p1', 'p2']);

    // Verifica que matches antigos foram removidos
    expect(DB.get('matches')).toBeNull();
    expect(DB.get('migrationVersion')).toBe(2);
  });

  test('migrateToRachaoModel nao roda duas vezes', () => {
    DB.set('migrationVersion', 2);
    DB.set('matches', [{ id: 'm1', name: 'Nao deve migrar' }]);

    migrateToRachaoModel();

    // Matches ainda existem porque migracao nao rodou
    expect(DB.get('matches')).toBeTruthy();
  });
});

// ==================== SEED ====================

describe('Seed Demo Data', () => {
  test('seedDemoData cria dados completos', () => {
    seedDemoData();

    expect(getPlayers()).toHaveLength(18);
    expect(getRachaos()).toHaveLength(1);
    expect(getSessions()).toHaveLength(1);
    expect(getMonthlyBilling()).toHaveLength(1);
    expect(getFantasyScores().length).toBeGreaterThan(0);

    const rachao = getRachaoById('r1');
    expect(rachao.name).toBe('Rachão de Domingo');
    expect(rachao.code).toBe('R4CH40');
    expect(rachao.monthlyVenueCost).toBe(800);
    expect(rachao.participants).toHaveLength(18);

    const session = getSessionById('s1');
    expect(session.rachaoId).toBe('r1');
    expect(session.confirmed).toHaveLength(12);
    expect(session.status).toBe('open');

    const billing = getMonthlyBilling()[0];
    expect(billing.totalCost).toBe(800);
    expect(billing.participantCount).toBe(18);
    expect(billing.perPerson).toBeCloseTo(44.44, 1);
  });

  test('seedDemoData nao duplica se ja existem dados', () => {
    seedDemoData();
    seedDemoData(); // segunda chamada
    expect(getPlayers()).toHaveLength(18); // nao duplicou
    expect(getRachaos()).toHaveLength(1);
  });
});
