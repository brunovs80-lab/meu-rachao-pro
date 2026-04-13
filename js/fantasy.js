// ========== FANTASY - LIGA DO MEU RACHÃO ==========

let fantasySlotSelection = null;
let fantasyTeamSlots = {
  ATK1: null, ATK2: null,
  MID1: null, MID2: null,
  DEF1: null,
  GK: null
};

// ===== LOAD FANTASY =====
function loadFantasy() {
  // Load saved team
  const user = getCurrentUser();
  if (user) {
    const teams = getFantasyTeams();
    const myTeam = teams.find(t => t.userId === user.id);
    if (myTeam) {
      fantasyTeamSlots = { ...myTeam.slots };
      renderFantasyFormation();
    }
  }
  renderFantasyRanking('daily');
}

// ===== FANTASY RANKING =====
function renderFantasyRanking(period) {
  const scores = getFantasyScores();
  const sorted = [...scores].sort((a, b) => {
    if (period === 'daily') return (b.daily || 0) - (a.daily || 0);
    if (period === 'monthly') return (b.monthly || 0) - (a.monthly || 0);
    return (b.points || 0) - (a.points || 0);
  });

  const container = document.getElementById('fantasy-ranking-list');
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
          <div class="ranking-name">${s.name}</div>
          <div class="ranking-detail">${period === 'daily' ? 'Hoje' : period === 'monthly' ? 'Este mês' : 'Total'}</div>
        </div>
        <div class="ranking-value">${val || 0}pts</div>
      </div>`;
  }).join('');
}

// ===== FANTASY TEAM =====
function openFantasyPicker(slot) {
  fantasySlotSelection = slot;

  // Get confirmed players from next match
  const matches = getMatches().filter(m => m.status !== 'done');
  let availablePlayers = [];

  if (matches.length > 0) {
    const match = matches[0];
    availablePlayers = match.confirmed.map(id => getPlayerById(id)).filter(Boolean);
  } else {
    availablePlayers = getPlayers();
  }

  // Filter out already selected
  const selectedIds = Object.values(fantasyTeamSlots).filter(Boolean).map(p => p.id);
  const filterable = availablePlayers.filter(p => !selectedIds.includes(p.id));

  const list = document.getElementById('fantasy-picker-list');
  list.innerHTML = filterable.map(p => {
    const initials = p.name.split(' ').map(w => w[0]).join('').substring(0, 2);
    return `
      <div class="player-item" onclick="selectFantasyPlayer('${p.id}')" style="cursor:pointer">
        <div class="player-avatar">${initials}</div>
        <div class="player-info">
          <div class="player-name">${p.name}</div>
          <div class="player-detail">${p.position} • ${p.goals}G ${p.assists}A</div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('modal-fantasy-picker').style.display = 'flex';
}

function selectFantasyPlayer(playerId) {
  const player = getPlayerById(playerId);
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

function saveFantasyTeam() {
  const user = getCurrentUser();
  if (!user) return;

  const filledSlots = Object.values(fantasyTeamSlots).filter(Boolean).length;
  if (filledSlots < 3) {
    showToast('Escolha pelo menos 3 jogadores');
    return;
  }

  const teams = getFantasyTeams();
  const existingIdx = teams.findIndex(t => t.userId === user.id);

  const teamData = {
    userId: user.id,
    name: user.name,
    slots: { ...fantasyTeamSlots },
    savedAt: new Date().toISOString()
  };

  if (existingIdx !== -1) {
    teams[existingIdx] = teamData;
  } else {
    teams.push(teamData);
  }

  saveFantasyTeams(teams);
  showToast('Time salvo!');
  addNotification({ type: 'orange', icon: 'fa-trophy', title: 'Time Fantasy salvo!', text: 'Boa sorte na Liga do Meu Rachão!' });
}

// ===== UPDATE FANTASY SCORES =====
function updateFantasyScores(stat) {
  const fantasyTeams = getFantasyTeams();
  const scores = getFantasyScores();

  fantasyTeams.forEach(team => {
    const slots = Object.values(team.slots).filter(Boolean);
    const hasPlayer = slots.find(p => p.id === stat.playerId);

    if (hasPlayer) {
      const points = (stat.goals * 10) + (stat.assists * 5);
      let scoreEntry = scores.find(s => s.userId === team.userId);

      if (scoreEntry) {
        scoreEntry.points = (scoreEntry.points || 0) + points;
        scoreEntry.daily = (scoreEntry.daily || 0) + points;
        scoreEntry.monthly = (scoreEntry.monthly || 0) + points;
      } else {
        scores.push({
          userId: team.userId,
          name: team.name,
          points,
          daily: points,
          monthly: points
        });
      }
    }
  });

  saveFantasyScores(scores);
}

// ===== PRIZES =====
function loadPrizes() {
  const prizes = getPrizes();
  document.getElementById('prize-1').value = prizes.first || '';
  document.getElementById('prize-2').value = prizes.second || '';
  document.getElementById('prize-3').value = prizes.third || '';

  // Update display
  const prizeItems = document.querySelectorAll('.prize-item span');
  if (prizeItems[0]) prizeItems[0].textContent = prizes.first;
  if (prizeItems[1]) prizeItems[1].textContent = prizes.second;
  if (prizeItems[2]) prizeItems[2].textContent = prizes.third;
}

function savePrizes() {
  const prizes = {
    first: document.getElementById('prize-1').value.trim() || 'Não paga o próximo rachão',
    second: document.getElementById('prize-2').value.trim() || '50% de desconto na próxima',
    third: document.getElementById('prize-3').value.trim() || 'Escolhe o time no sorteio'
  };
  savePrizesData(prizes);
  showToast('Prêmios salvos!');
}
