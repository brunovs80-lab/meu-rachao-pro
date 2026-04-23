// ========== ROTATION & TIMER MODULE ==========

// ===== ROTATION SYSTEM =====
async function loadRotation() {
  const state = await apiGetRotationState();
  const active = document.getElementById('rotation-active');
  const empty = document.getElementById('rotation-empty');

  if (state && state.active) {
    active.style.display = 'block';
    empty.style.display = 'none';
    renderRotationState(state);
  } else {
    active.style.display = 'none';
    empty.style.display = 'flex';
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
    state.queue.push({ name: '', players: teamPlayers });
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
  if (nextCard) nextCard.style.display = 'none';
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
    return;
  }

  const nextTeamData = state.queue.shift();
  // Usar nome digitado pelo usuário no campo, se disponível
  const customName = document.getElementById('rot-next-team-name')?.value?.trim();
  if (customName) nextTeamData.name = customName;
  const fullTeamSize = state.playersPerTeam + 1;

  if (loser === 'both') {
    const losingPlayers = [];
    if (state.teamA.goalkeeper) losingPlayers.push(state.teamA.goalkeeper);
    losingPlayers.push(...state.teamA.players);
    if (state.teamB.goalkeeper) losingPlayers.push(state.teamB.goalkeeper);
    losingPlayers.push(...state.teamB.players);

    const nextPlayers = [...nextTeamData.players];
    const needed = fullTeamSize - nextPlayers.length;
    const borrowed = needed > 0 ? losingPlayers.splice(0, needed) : [];
    nextPlayers.push(...borrowed);
    state.teamA = buildRotationTeam({ name: nextTeamData.name, players: nextPlayers });

    if (state.queue.length > 0) {
      const secondData = state.queue.shift();
      const secondPlayers = [...secondData.players];
      const needed2 = fullTeamSize - secondPlayers.length;
      if (needed2 > 0) secondPlayers.push(...losingPlayers.splice(0, needed2));
      state.teamB = buildRotationTeam({ name: secondData.name, players: secondPlayers });
    } else {
      state.teamB = buildRotationTeam({ name: 'Perdedores', players: losingPlayers.splice(0, fullTeamSize) });
    }

    if (losingPlayers.length > 0) {
      state.queue.push({ name: 'Espera', players: losingPlayers });
    }
  } else {
    const loserTeam = loser === 'a' ? state.teamA : state.teamB;
    const loserPlayers = [];
    if (loserTeam.goalkeeper) loserPlayers.push(loserTeam.goalkeeper);
    loserPlayers.push(...loserTeam.players);

    const nextPlayers = [...nextTeamData.players];
    const needed = fullTeamSize - nextPlayers.length;
    if (needed > 0) {
      const borrowed = loserPlayers.splice(0, needed);
      nextPlayers.push(...borrowed);
    }

    if (loserPlayers.length > 0) {
      state.queue.push({ name: loserTeam.name, players: loserPlayers });
    }

    const newTeam = buildRotationTeam({ name: nextTeamData.name, players: nextPlayers });
    if (loser === 'a') state.teamA = newTeam; else state.teamB = newTeam;
  }

  state.round++; state.scoreA = 0; state.scoreB = 0;
  await apiSaveRotationState(state);
  renderRotationState(state);
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
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  await apiAddNotification({ type: 'purple', icon: 'fa-flag-checkered', title: 'Rachão encerrado!', text: `${state.rounds.length} rodadas jogadas` });
  showToast('Rachão encerrado!');
  navigateTo('dashboard');
}

// ===== TIMER =====
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
