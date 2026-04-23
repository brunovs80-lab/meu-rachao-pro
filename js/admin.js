// ========== ADMIN MODULE ==========

// ===== ADMIN PAYMENTS =====
async function loadAdminPayments() {
  const user = apiGetCurrentUser();
  const allowedIds = await getRachaosWithPermission(user, 'manage_payments');
  const rachaos = (await apiGetRachaos()).filter(r =>
    r.monthlyVenueCost > 0 && (r.createdBy === user.id || allowedIds.includes(r.id))
  );
  const list = document.getElementById('admin-payment-list');
  if (rachaos.length === 0) { list.innerHTML = '<p class="text-muted" style="padding:16px;text-align:center">Nenhum rachão com cobrança</p>'; return; }

  const month = getCurrentMonth();
  let html = '';
  for (const r of rachaos) {
    const perPerson = r.participants.length > 0 ? Math.ceil(r.monthlyVenueCost / r.participants.length * 100) / 100 : 0;
    let billing = await apiGetBilling(r.id, month);
    if (!billing) {
      await apiCreateBilling({ rachaoId: r.id, month, totalCost: r.monthlyVenueCost, participantCount: r.participants.length, perPerson, payments: r.participants.map(pid => ({ playerId: pid, status: 'pending' })) });
      billing = await apiGetBilling(r.id, month);
    }
    if (!billing || !billing.payments) continue;

    const paid = billing.payments.filter(p => p.status === 'paid').length;
    const total = billing.payments.length;

    const payHtmls = await Promise.all(billing.payments.map(async pay => {
      const pid = pay.player_id || pay.playerId;
      const p = await apiGetPlayerById(pid).catch(() => null);
      if (!p) return '';
      const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
      const statusLabel = pay.status === 'paid' ? 'Pago' : pay.status === 'awaiting_confirmation' ? 'Aguardando' : 'Pendente';
      return `<div class="admin-pay-item">
        <div class="player-avatar">${ini}</div>
        <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${formatCurrency(perPerson)} • ${statusLabel}</div></div>
        <div class="admin-pay-actions">
          ${pay.status !== 'paid' ? `<button class="btn-success" onclick="confirmBillingPayment('${billing.id}','${pid}')">✓ Pago</button>` : ''}
          ${!p.blocked ? `<button class="btn-danger" onclick="blockPlayer('${p.id}')">Bloquear</button>` : `<button class="btn-success" onclick="unblockPlayer('${p.id}')">Liberar</button>`}
        </div>
      </div>`;
    }));

    html += `<div class="card" style="margin-bottom:12px">
      <h3>${escapeHtml(r.name)}</h3>
      <p class="text-muted" style="font-size:12px">${paid}/${total} pagos • ${formatCurrency(perPerson)}/pessoa</p>
      <div style="margin-top:8px">${payHtmls.join('')}</div>
    </div>`;
  }
  list.innerHTML = html;
}

// ===== BLOCK/UNBLOCK =====
async function blockPlayer(pid) {
  await apiBlockPlayer(pid);
  const p = await apiGetPlayerById(pid);
  await apiAddNotification({ type:'red', icon:'fa-ban', title:'Jogador bloqueado', text: p.name + ' bloqueado por inadimplência' });
  showToast('Jogador bloqueado');
  await loadAdminPayments();
}

async function unblockPlayer(pid) {
  await apiUnblockPlayer(pid);
  showToast('Jogador desbloqueado');
  if (document.getElementById('page-admin-blocked').classList.contains('active')) await loadAdminBlocked();
}

// ===== BLOCKED / RELEASE =====
async function loadAdminBlocked() {
  const blocked = await apiGetBlockedPlayers();
  const releases = await apiGetReleaseRequests();
  const reqCard = document.getElementById('release-requests-card');

  if (releases.length > 0) {
    reqCard.style.display = 'block';
    const relHtml = await Promise.all(releases.map(async r => {
      const p = await apiGetPlayerById(r.playerId).catch(() => null);
      if (!p) return '';
      const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
      return `<div class="release-item">
        <div class="player-avatar" style="background:var(--orange)">${ini}</div>
        <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${escapeHtml(r.message || 'Sem mensagem')}</div></div>
        <div class="admin-pay-actions">
          <button class="btn-success" onclick="approveRelease('${r.id}','${r.playerId}')">Liberar</button>
          <button class="btn-danger" onclick="denyRelease('${r.id}')">Negar</button>
        </div>
      </div>`;
    }));
    document.getElementById('release-requests-list').innerHTML = relHtml.join('');
  } else reqCard.style.display = 'none';

  const list = document.getElementById('blocked-players-list');
  const empty = document.getElementById('blocked-empty');
  if (blocked.length === 0) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  const blockedHtml = await Promise.all(blocked.map(async pid => {
    const p = await apiGetPlayerById(pid).catch(() => null);
    if (!p) return '';
    const ini = escapeHtml(p.name.split(' ').map(w => w[0]).join('').substring(0, 2));
    return `<div class="blocked-item">
      <div class="player-avatar" style="background:var(--red)">${ini}</div>
      <div class="player-info"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-detail">${escapeHtml(p.position)} • Bloqueado</div></div>
      <button class="btn-success" onclick="unblockPlayer('${pid}');loadAdminBlocked()">Desbloquear</button>
    </div>`;
  }));
  list.innerHTML = blockedHtml.join('');
}

async function requestRelease() {
  const user = apiGetCurrentUser();
  if (!user) return;
  const msg = document.getElementById('release-message').value.trim();
  try {
    await apiCreateReleaseRequest(user.id, msg);
    await apiAddNotification({ type:'orange', icon:'fa-hand', title:'Pedido de liberação', text: user.name + ' solicita liberação' });
    showToast('Pedido enviado ao admin!');
  } catch { showToast('Pedido já enviado'); }
  closeModal('request-release');
}

async function approveRelease(reqId, playerId) {
  await unblockPlayer(playerId);
  await apiDeleteReleaseRequest(reqId);
  showToast('Jogador liberado!');
  await loadAdminBlocked();
}

async function denyRelease(reqId) {
  await apiDeleteReleaseRequest(reqId);
  showToast('Pedido negado');
  await loadAdminBlocked();
}

// ===== ADMIN STATS VALIDATION =====
async function loadAdminStats() {
  const user = apiGetCurrentUser();
  const allPending = await apiGetPendingStats();
  const rachaos = await apiGetRachaos().catch(() => []);
  const ownedIds = new Set(rachaos.filter(r => r.createdBy === user.id).map(r => r.id));
  const allowedIds = new Set(await getRachaosWithPermission(user, 'approve_stats'));
  const pending = allPending.filter(s => !s.rachaoId || ownedIds.has(s.rachaoId) || allowedIds.has(s.rachaoId));
  const list = document.getElementById('pending-stats-list');
  const empty = document.getElementById('pending-stats-empty');
  const bulkBar = document.getElementById('stats-bulk-bar');
  if (pending.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'flex';
    if (bulkBar) bulkBar.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  if (bulkBar) bulkBar.style.display = 'flex';

  const html = await Promise.all(pending.map(async s => {
    const p = await apiGetPlayerById(s.playerId).catch(() => null);
    const rachao = s.rachaoId ? await apiGetRachaoById(s.rachaoId).catch(() => null) : null;
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
      <div class="stat-validation-header">
        <label class="stat-check-wrap">
          <input type="checkbox" class="stat-check" data-stat-id="${s.id}" onchange="updateStatsBulkBar()">
          <h4 style="margin:0">${escapeHtml(p.name)}</h4>
        </label>
        <span class="match-label">${rachao ? escapeHtml(rachao.name) : ''}</span>
      </div>
      <div class="stat-validation-details">${chips}</div>
      <div class="stat-val-actions">
        <button class="btn-success" onclick="validateStat('${s.id}',true)"><i class="fas fa-check"></i> Aprovar</button>
        <button class="btn-danger" onclick="validateStat('${s.id}',false)"><i class="fas fa-xmark"></i> Rejeitar</button>
      </div>
    </div>`;
  }));
  list.innerHTML = html.join('');
  updateStatsBulkBar();
}

function getSelectedStatIds() {
  return Array.from(document.querySelectorAll('.stat-check:checked')).map(el => el.dataset.statId);
}

function updateStatsBulkBar() {
  const count = getSelectedStatIds().length;
  const total = document.querySelectorAll('.stat-check').length;
  const countEl = document.getElementById('stats-bulk-count');
  const actionAll = document.getElementById('btn-approve-all');
  const actionSelected = document.getElementById('btn-approve-selected');
  const rejectSelected = document.getElementById('btn-reject-selected');
  if (countEl) countEl.textContent = count > 0 ? `${count}/${total} selecionadas` : `${total} pendente(s)`;
  if (actionSelected) actionSelected.style.display = count > 0 ? 'inline-flex' : 'none';
  if (rejectSelected) rejectSelected.style.display = count > 0 ? 'inline-flex' : 'none';
  if (actionAll) actionAll.style.display = count > 0 ? 'none' : 'inline-flex';
}

function toggleAllStats(checked) {
  document.querySelectorAll('.stat-check').forEach(el => { el.checked = checked; });
  updateStatsBulkBar();
}

async function validateStat(statId, approved) {
  await apiValidateStat(statId, approved);
  showToast(approved ? 'Estatística aprovada!' : 'Estatística rejeitada');
  await loadAdminStats();
  await loadAdminBadges();
}

async function approveAllStats() {
  const user = apiGetCurrentUser();
  const allPending = await apiGetPendingStats();
  const rachaos = await apiGetRachaos().catch(() => []);
  const ownedIds = new Set(rachaos.filter(r => r.createdBy === user.id).map(r => r.id));
  const allowedIds = new Set(await getRachaosWithPermission(user, 'approve_stats'));
  const pending = allPending.filter(s => !s.rachaoId || ownedIds.has(s.rachaoId) || allowedIds.has(s.rachaoId));
  if (pending.length === 0) return;
  if (!confirm(`Aprovar todas as ${pending.length} estatísticas pendentes?`)) return;
  await apiValidateStatsBatch(pending.map(s => s.id), true);
  showToast(`${pending.length} estatística(s) aprovada(s)!`);
  await loadAdminStats();
  await loadAdminBadges();
}

async function approveSelectedStats() {
  const ids = getSelectedStatIds();
  if (ids.length === 0) return;
  await apiValidateStatsBatch(ids, true);
  showToast(`${ids.length} estatística(s) aprovada(s)!`);
  await loadAdminStats();
  await loadAdminBadges();
}

async function rejectSelectedStats() {
  const ids = getSelectedStatIds();
  if (ids.length === 0) return;
  if (!confirm(`Rejeitar ${ids.length} estatística(s) selecionada(s)?`)) return;
  await apiValidateStatsBatch(ids, false);
  showToast(`${ids.length} estatística(s) rejeitada(s)`);
  await loadAdminStats();
  await loadAdminBadges();
}

async function loadAdminBadges() {
  const user = apiGetCurrentUser();
  const allPending = await apiGetPendingStats();
  const releases = await apiGetReleaseRequests();
  let pendingCount = allPending.length;
  if (user) {
    const rachaos = await apiGetRachaos().catch(() => []);
    const ownedIds = new Set(rachaos.filter(r => r.createdBy === user.id).map(r => r.id));
    const allowedIds = new Set(await getRachaosWithPermission(user, 'approve_stats'));
    pendingCount = allPending.filter(s => !s.rachaoId || ownedIds.has(s.rachaoId) || allowedIds.has(s.rachaoId)).length;
  }
  document.getElementById('admin-pending-count').textContent = pendingCount > 0 ? pendingCount : '';
  document.getElementById('admin-release-count').textContent = releases.length > 0 ? releases.length : '';
}

async function showAdminDashboardAlert() {
  const container = document.getElementById('dash-admin-alert');
  if (!container) return;
  const user = apiGetCurrentUser();
  if (!user) { container.style.display = 'none'; return; }

  // Mostrar se é dono OU tem permissões administrativas em algum rachão
  const rachaos = await apiGetRachaos().catch(() => []);
  const ownedIds = new Set(rachaos.filter(r => r.createdBy === user.id).map(r => r.id));
  const canApproveIds = new Set(await getRachaosWithPermission(user, 'approve_stats'));
  const canBlockIds = await getRachaosWithPermission(user, 'block_players');
  const hasAnyAdminPerm = ownedIds.size > 0 || canApproveIds.size > 0 || canBlockIds.length > 0;
  if (!hasAnyAdminPerm) { container.style.display = 'none'; return; }

  const [allPending, releases] = await Promise.all([
    apiGetPendingStats().catch(() => []),
    apiGetReleaseRequests().catch(() => []),
  ]);
  const pending = allPending.filter(s => !s.rachaoId || ownedIds.has(s.rachaoId) || canApproveIds.has(s.rachaoId));

  const parts = [];
  if (pending.length > 0) parts.push({ count: pending.length, label: 'estatística(s)', target: 'admin-stats' });
  if (releases.length > 0 && (ownedIds.size > 0 || canBlockIds.length > 0)) parts.push({ count: releases.length, label: 'pedido(s) de liberação', target: 'admin-blocked' });

  if (parts.length === 0) { container.style.display = 'none'; return; }

  const primary = parts[0];
  const totalCount = parts.reduce((sum, p) => sum + p.count, 0);
  const text = parts.map(p => `${p.count} ${p.label}`).join(' · ');

  container.innerHTML = `<div class="admin-alert-banner" onclick="navigateTo('${primary.target}')">
    <div class="aab-icon"><i class="fas fa-bell"></i></div>
    <div class="aab-content">
      <div class="aab-title">${totalCount} aprovação(ões) pendente(s)</div>
      <div class="aab-text">${escapeHtml(text)}</div>
    </div>
    <div class="aab-chevron"><i class="fas fa-chevron-right"></i></div>
  </div>`;
  container.style.display = 'block';
}
