// ========== FANTASY - LIGA DO MEU RACHÃO (API VERSION) ==========

let fantasySlotSelection = null;
let fantasyTeamSlots = {
  ATK1: null, ATK2: null,
  MID1: null, MID2: null,
  DEF1: null,
  GK: null
};

// ===== LOAD FANTASY =====
async function loadFantasy() {
  const user = apiGetCurrentUser();
  if (!user || !currentRachaoId) return;

  const teams = await apiGetFantasyTeams(currentRachaoId, user.id);
  const myTeam = teams.find(t => t.userId === user.id && t.rachaoId === currentRachaoId);
  if (myTeam) {
    fantasyTeamSlots = { ...myTeam.slots };
  } else {
    fantasyTeamSlots = { ATK1: null, ATK2: null, MID1: null, MID2: null, DEF1: null, GK: null };
  }
  renderFantasyFormation();
  await renderFantasyRanking('daily');
}

// ===== FANTASY RANKING =====
async function renderFantasyRanking(period) {
  const scores = (await apiGetFantasyScores(currentRachaoId));
  const sorted = [...scores].sort((a, b) => {
    if (period === 'daily') return (b.daily || 0) - (a.daily || 0);
    if (period === 'monthly') return (b.monthly || 0) - (a.monthly || 0);
    return (b.points || 0) - (a.points || 0);
  });

  const container = document.getElementById('fantasy-ranking-list');
  if (!container) return;

  if (sorted.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-trophy"></i>
        <p>Nenhum ranking disponível ainda</p>
      </div>`;
    return;
  }

  container.innerHTML = sorted.map((s, i) => {
    const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const val = period === 'daily' ? s.daily : period === 'monthly' ? s.monthly : s.points;
    return `
      <div class="ranking-item">
        <div class="ranking-pos ${posClass}">${i + 1}</div>
        <div class="ranking-info">
          <div class="ranking-name">${escapeHtml(s.name)}</div>
          <div class="ranking-detail">${period === 'daily' ? 'Hoje' : period === 'monthly' ? 'Este mês' : 'Total'}</div>
        </div>
        <div class="ranking-value">${val || 0}pts</div>
      </div>`;
  }).join('');
}

// ===== FANTASY TEAM =====
async function openFantasyPicker(slot) {
  fantasySlotSelection = slot;

  const rachao = await apiGetRachaoById(currentRachaoId);
  let availablePlayers = [];

  if (currentSessionId) {
    const session = await apiGetSessionById(currentSessionId);
    if (session) {
      availablePlayers = (await Promise.all(session.confirmed.map(id => apiGetPlayerById(id).catch(() => null)))).filter(Boolean);
    }
  }

  if (availablePlayers.length === 0 && rachao) {
    availablePlayers = (await Promise.all(rachao.participants.map(id => apiGetPlayerById(id).catch(() => null)))).filter(Boolean);
  }

  const selectedIds = Object.values(fantasyTeamSlots).filter(Boolean).map(p => p.id);
  const filterable = availablePlayers.filter(p => !selectedIds.includes(p.id));

  const list = document.getElementById('fantasy-picker-list');
  list.innerHTML = filterable.map(p => {
    const initials = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
    return `
      <div class="player-item" onclick="selectFantasyPlayer('${escapeHtml(p.id)}')" style="cursor:pointer">
        <div class="player-avatar">${initials}</div>
        <div class="player-info">
          <div class="player-name">${escapeHtml(p.name)}</div>
          <div class="player-detail">${escapeHtml(p.position)} • ${p.goals}G ${p.assists}A</div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('modal-fantasy-picker').style.display = 'flex';
}

async function selectFantasyPlayer(playerId) {
  const player = await apiGetPlayerById(playerId);
  if (!player || !fantasySlotSelection) return;

  fantasyTeamSlots[fantasySlotSelection] = player;
  closeModal('fantasy-picker');
  renderFantasyFormation();
}

function renderFantasyFormation() {
  Object.keys(fantasyTeamSlots).forEach(slot => {
    const el = document.querySelector(`.formation-slot[data-pos="${slot}"]`);
    if (!el) return;

    const player = fantasyTeamSlots[slot];
    const circle = el.querySelector('.slot-circle');
    const label = el.querySelector('span');

    if (player) {
      const initials = player.name.split(' ').map(w => w[0]).join('').substring(0, 2);
      circle.innerHTML = initials;
      circle.classList.add('filled');
      label.textContent = player.name.split(' ')[0];
      label.classList.add('slot-name');
    } else {
      circle.innerHTML = '<i class="fas fa-plus"></i>';
      circle.classList.remove('filled');
      const posLabels = { ATK1: 'ATA', ATK2: 'ATA', MID1: 'MEI', MID2: 'MEI', DEF1: 'ZAG', GK: 'GOL' };
      label.textContent = posLabels[slot];
      label.classList.remove('slot-name');
    }
  });
}

async function saveFantasyTeam() {
  const user = apiGetCurrentUser();
  if (!user || !currentRachaoId) return;

  const filledSlots = Object.values(fantasyTeamSlots).filter(Boolean).length;
  if (filledSlots < 3) {
    showToast('Escolha pelo menos 3 jogadores');
    return;
  }

  await apiSaveFantasyTeam({
    userId: user.id,
    rachaoId: currentRachaoId,
    name: user.name,
    slots: { ...fantasyTeamSlots }
  });

  showToast('Time salvo!');
  await apiAddNotification({ type: 'orange', icon: 'fa-trophy', title: 'Time Fantasy salvo!', text: 'Boa sorte na Liga do Meu Rachão!' });
}

// ===== UPDATE FANTASY SCORES FROM STAT =====
async function updateFantasyScoresFromStat(stat) {
  if (!stat || !stat.rachaoId) return;

  const fantasyTeams = await apiGetFantasyTeams(stat.rachaoId);
  const player = await apiGetPlayerById(stat.playerId).catch(() => null);
  const isGK = player && player.position === 'Goleiro';

  for (const team of fantasyTeams) {
    const slots = Object.values(team.slots).filter(Boolean);
    const hasPlayer = slots.find(p => p.id === stat.playerId);

    if (hasPlayer) {
      let points = 0;
      if (isGK) {
        points += (stat.saves || 0) * POINTS.goalkeeper.save;
        points += (stat.cleanSheets || 0) * POINTS.goalkeeper.cleanSheet;
        points *= POINTS.goalkeeper.multiplier;
      } else {
        points += (stat.goals || 0) * POINTS.field.goal;
        points += (stat.assists || 0) * POINTS.field.assist;
        points += (stat.tackles || 0) * POINTS.field.tackle;
        points -= (stat.fouls || 0) * Math.abs(POINTS.field.foul);
        points -= (stat.yellows || 0) * Math.abs(POINTS.field.yellow);
        points -= (stat.reds || 0) * Math.abs(POINTS.field.red);
      }
      points += POINTS.field.presence;

      await apiUpdateFantasyScore({
        userId: team.userId,
        rachaoId: stat.rachaoId,
        name: team.name,
        points, daily: points, monthly: points
      });
    }
  }
}

// ===== PRIZES =====
async function loadPrizes() {
  const prizes = await apiGetPrizes();
  const p1 = document.getElementById('prize-1');
  const p2 = document.getElementById('prize-2');
  const p3 = document.getElementById('prize-3');
  if (p1) p1.value = prizes.first || '';
  if (p2) p2.value = prizes.second || '';
  if (p3) p3.value = prizes.third || '';

  const prizeItems = document.querySelectorAll('.prize-item span');
  if (prizeItems[0]) prizeItems[0].textContent = prizes.first;
  if (prizeItems[1]) prizeItems[1].textContent = prizes.second;
  if (prizeItems[2]) prizeItems[2].textContent = prizes.third;
}

async function savePrizes() {
  const prizes = {
    first: document.getElementById('prize-1').value.trim() || 'Não paga o próximo rachão',
    second: document.getElementById('prize-2').value.trim() || '50% de desconto na próxima',
    third: document.getElementById('prize-3').value.trim() || 'Escolhe o time no sorteio'
  };
  await apiSavePrizes(prizes);
  showToast('Prêmios salvos!');
}
