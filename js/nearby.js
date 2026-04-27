// ========== DESCOBERTA DE RACHÕES PRÓXIMOS ==========

let _lastNearbyResults = [];
let _selectedNearby = null;

const DAY_NAMES_FULL = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

async function searchNearby() {
  const btn  = document.getElementById('btn-search-nearby');
  const list = document.getElementById('nearby-results');
  const radius = parseInt(document.getElementById('nearby-radius').value, 10) || 25;

  list.innerHTML = '<p class="text-muted" style="text-align:center;padding:16px"><i class="fas fa-spinner fa-spin"></i> Buscando...</p>';
  try {
    setLoading(btn, true);
    const coords = await getCurrentCoords();
    const { data, error } = await initSupabase().rpc('list_open_guest_sessions_nearby', {
      p_lat: coords.latitude,
      p_lng: coords.longitude,
      p_radius_km: radius,
    });
    if (error) throw error;
    _lastNearbyResults = data || [];
    renderNearbyResults();
  } catch (err) {
    console.error('[Nearby] erro:', err);
    list.innerHTML = `<div class="card" style="text-align:center;padding:16px">
      <i class="fas fa-triangle-exclamation" style="color:var(--orange);font-size:24px;margin-bottom:8px"></i>
      <p>${escapeHtml(err.message || 'Erro ao buscar')}</p>
    </div>`;
  } finally {
    setLoading(btn, false);
  }
}

function renderNearbyResults() {
  const list = document.getElementById('nearby-results');
  if (!_lastNearbyResults.length) {
    list.innerHTML = `<div class="card" style="text-align:center;padding:24px">
      <i class="fas fa-futbol" style="font-size:36px;color:var(--text-muted);margin-bottom:8px"></i>
      <h4>Nenhum rachão encontrado</h4>
      <p class="text-muted" style="font-size:13px;margin-top:4px">Tente aumentar a distância ou volte mais tarde.</p>
    </div>`;
    return;
  }
  list.innerHTML = _lastNearbyResults.map((r, idx) => {
    const fee = Number(r.guest_fee || 0).toFixed(2).replace('.', ',');
    const slotsLeft = Math.max(0, (r.guest_slots || 0) - (r.guests_paid || 0));
    const slotsBadge = slotsLeft > 0
      ? `<span style="color:var(--green);font-weight:700">${slotsLeft} vaga${slotsLeft===1?'':'s'}</span>`
      : `<span style="color:var(--red);font-weight:700">Esgotado</span>`;
    return `<div class="card" style="margin-bottom:10px;cursor:pointer" onclick="openNearbyDetail(${idx})">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div style="flex:1;min-width:0">
          <h4 style="margin-bottom:4px">${escapeHtml(r.rachao_name)}</h4>
          <p class="text-muted" style="font-size:12px">
            <i class="fas fa-location-dot"></i> ${escapeHtml(r.rachao_location)}
          </p>
          <p class="text-muted" style="font-size:12px;margin-top:2px">
            <i class="fas fa-calendar-day"></i> ${DAY_NAMES_FULL[r.rachao_day_of_week]} • ${escapeHtml(r.rachao_time || '')} · ${formatDateBR(r.session_date)}
          </p>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:13px;font-weight:700;color:var(--orange)">${r.distance_km} km</div>
          <div style="font-size:18px;font-weight:800;margin-top:4px">R$ ${fee}</div>
          <div style="font-size:11px;margin-top:2px">${slotsBadge}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openNearbyDetail(idx) {
  const r = _lastNearbyResults[idx];
  if (!r) return;
  _selectedNearby = r;

  const fee = Number(r.guest_fee || 0).toFixed(2).replace('.', ',');
  const slotsLeft = Math.max(0, (r.guest_slots || 0) - (r.guests_paid || 0));
  const sold = r.guest_slots ? Math.round(((r.guests_paid || 0) / r.guest_slots) * 100) : 0;

  document.getElementById('nearby-detail-body').innerHTML = `
    <h3 style="margin-bottom:6px">${escapeHtml(r.rachao_name)}</h3>
    <p class="text-muted" style="font-size:13px;margin-bottom:14px">
      <i class="fas fa-location-dot"></i> ${escapeHtml(r.rachao_location)} · ${r.distance_km} km daqui
    </p>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="background:var(--bg-card);padding:10px;border-radius:var(--radius);text-align:center;border:1px solid var(--border)">
        <p class="text-muted" style="font-size:11px">Quando</p>
        <p style="font-size:14px;font-weight:700;margin-top:2px">${DAY_NAMES_FULL[r.rachao_day_of_week]}</p>
        <p class="text-muted" style="font-size:12px">${escapeHtml(r.rachao_time || '')} · ${formatDateBR(r.session_date)}</p>
      </div>
      <div style="background:var(--bg-card);padding:10px;border-radius:var(--radius);text-align:center;border:1px solid var(--border)">
        <p class="text-muted" style="font-size:11px">Diária</p>
        <p style="font-size:18px;font-weight:800;color:var(--green);margin-top:2px">R$ ${fee}</p>
      </div>
    </div>

    <div style="background:var(--bg-card);padding:12px;border-radius:var(--radius);border:1px solid var(--border);margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:13px;font-weight:700">Avulsos confirmados</span>
        <span style="font-size:13px">${r.guests_paid || 0} / ${r.guest_slots || 0}</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${sold}%"></div></div>
      <p class="text-muted" style="font-size:11px;margin-top:6px">
        Membros fixos confirmados: ${r.confirmed_count || 0}
      </p>
    </div>

    ${slotsLeft > 0 ? `
      <button class="btn-orange btn-large" style="width:100%" onclick="iniciarPagamentoAvulso()">
        <i class="fas fa-qrcode"></i> ENTRAR E PAGAR R$ ${fee}
      </button>
      <p class="text-muted" style="font-size:11px;text-align:center;margin-top:8px">
        Pagamento via PIX. Você só entra na lista após a confirmação.
      </p>
    ` : `
      <button class="btn-outline" style="width:100%" disabled>
        <i class="fas fa-ban"></i> VAGAS ESGOTADAS
      </button>
    `}
  `;
  document.getElementById('modal-nearby-detail').style.display = 'flex';
}

function fecharNearbyDetail() {
  document.getElementById('modal-nearby-detail').style.display = 'none';
  _selectedNearby = null;
}

// ========== PIX AUTOMÁTICO PARA AVULSO ==========
// Reaproveita o modal #modal-pix-payment (mesmo da mensalidade) com seu
// timer/realtime/subscribe; só troca o gerador de cobrança.

async function iniciarPagamentoAvulso() {
  const r = _selectedNearby;
  if (!r) return;

  const user = (typeof apiGetCurrentUser === 'function') ? apiGetCurrentUser() : null;
  if (!user) {
    showToast('Faça login para entrar no rachão');
    return;
  }

  // Mantém referência para o "TENTAR NOVAMENTE" disparar o fluxo certo
  _pixRetryFn = iniciarPagamentoAvulso;

  // Esconde o modal de detalhes (sem zerar _selectedNearby — é usado em retry)
  const detailModal = document.getElementById('modal-nearby-detail');
  if (detailModal) detailModal.style.display = 'none';

  const modal = document.getElementById('modal-pix-payment');
  modal.style.display = 'flex';
  showPixState('loading');

  try {
    const description = `Avulso ${r.rachao_name} · ${formatDateBR(r.session_date)}`;
    const result = await apiCreateGuestPixCharge(
      r.session_id, user.id, r.rachao_id, user.email || '', description
    );

    _pixCurrentTxId = result.transaction_id;

    document.getElementById('pix-modal-amount').textContent = 'Valor: ' + formatCurrency(result.amount);
    document.getElementById('pix-modal-code').value = result.qr_code || '';
    const imgEl = document.getElementById('pix-qr-image');
    if (result.qr_code_base64) {
      imgEl.src = 'data:image/png;base64,' + result.qr_code_base64;
      imgEl.style.display = 'block';
    } else {
      imgEl.style.display = 'none';
    }

    showPixState('ready');
    startPixTimer(result.expires_at);

    apiSubscribePixUpdates((evt) => {
      if (evt.type === 'pix_transaction'
          && evt.data.id === _pixCurrentTxId
          && evt.data.status === 'paid') {
        if (_pixTimerInterval) { clearInterval(_pixTimerInterval); _pixTimerInterval = null; }
        document.getElementById('pix-paid-amount').textContent = formatCurrency(evt.data.amount);
        showPixState('paid');
        // Atualiza lista nearby pra refletir a vaga preenchida
        searchNearby().catch(() => {});
      }
    });
  } catch (err) {
    console.error('PIX avulso error:', err);
    document.getElementById('pix-error-msg').textContent = err.message || 'Erro desconhecido';
    showPixState('error');
  }
}
