// ========== PAYWALL + ADMIN CUPONS ==========
// Tela de assinatura Pro e administração de cupons promocionais.
// IAP nativo (RevenueCat) será adicionado em fase posterior — por ora os botões
// de plano mostram um placeholder explicando que a compra será habilitada na build mobile.

// Preços de exibição. Vão ser sobrescritos pelos preços reais vindos do RevenueCat
// na fase de IAP nativo.
const PAYWALL_PRICES = {
  monthly:  { display: 'R$ 14,90',  period: '/mês' },
  yearly:   { display: 'R$ 99,90',  period: '/ano' },
  lifetime: { display: 'R$ 199,90', period: 'uma vez' },
};

// ===== LOAD =====
async function loadPaywall() {
  // Mostra mensagem dinâmica se entrou via requirePro()
  const trigger = window.__paywallTrigger;
  const msgEl = document.getElementById('paywall-trigger-msg');
  if (msgEl) {
    if (trigger && ProManager.FEATURES[trigger]) {
      const label = ProManager.getFeatureLabel(trigger);
      msgEl.innerHTML = `Para usar <strong>${escapeHtml(label)}</strong> você precisa do plano Pro.`;
    } else {
      msgEl.textContent = 'Acesso completo a todas as funções premium do app.';
    }
  }
  window.__paywallTrigger = null;

  // Tenta puxar preços reais das lojas via Billing (RevenueCat); cai pro fallback se falhar
  let prices = PAYWALL_PRICES;
  if (window.Billing && Billing.isNative && Billing.isNative()) {
    try {
      const real = await Billing.getFormattedPrices();
      if (real) prices = { ...PAYWALL_PRICES, ...real };
    } catch (err) {
      console.warn('[Paywall] não foi possível obter preços reais:', err);
    }
  }
  for (const [plan, info] of Object.entries(prices)) {
    const el = document.getElementById('plan-price-' + plan);
    if (el) el.textContent = info.display;
  }

  // Resetar caixa de cupom
  const box = document.getElementById('paywall-coupon-box');
  const input = document.getElementById('paywall-coupon-input');
  if (box) box.style.display = 'none';
  if (input) input.value = '';

  // Sincroniza estado Pro e mostra "já é Pro" se for o caso
  await ProManager.syncFromServer();
  refreshPaywallProState();
}

function refreshPaywallProState() {
  const isPro = ProManager.isPro();
  const status = ProManager.getStatus();
  const alreadyEl = document.getElementById('paywall-already-pro');
  const plansSection = document.querySelectorAll('.paywall-plans, .paywall-coupon, .paywall-restore, .paywall-section-title');

  if (isPro) {
    if (alreadyEl) alreadyEl.style.display = 'block';
    plansSection.forEach(el => el.style.display = 'none');
    const info = document.getElementById('paywall-pro-info');
    if (info) {
      if (status.is_lifetime) {
        info.textContent = 'Acesso vitalício ativo. Aproveite!';
      } else if (status.expires_at) {
        const dt = new Date(status.expires_at);
        info.textContent = 'Pro válido até ' + dt.toLocaleDateString('pt-BR') + '.';
      } else {
        info.textContent = 'Aproveite todas as funções premium.';
      }
    }
  } else {
    if (alreadyEl) alreadyEl.style.display = 'none';
    plansSection.forEach(el => el.style.display = '');
  }
}

// ===== AÇÕES DE PLANO =====
async function paywallSelectPlan(plan) {
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!isNative) {
    showToast('A compra só é liberada na versão da loja (Android/iOS).');
    return;
  }
  if (!window.Billing) {
    showToast('Pagamento ainda não habilitado nesta versão.');
    return;
  }
  const cardEl = document.querySelector(`.paywall-plan[data-plan="${plan}"]`);
  if (cardEl) cardEl.style.opacity = '0.6';
  try {
    const result = await Billing.purchase(plan);
    if (result?.cancelled) {
      showToast('Compra cancelada');
      return;
    }
    if (result?.ok) {
      showToast('🎉 Bem-vindo ao Pro!');
      await ProManager.syncFromServer();
      refreshPaywallProState();
    }
  } catch (err) {
    console.error('[Paywall] purchase falhou:', err);
    showToast('Não foi possível concluir a compra: ' + (err.message || 'erro'));
  } finally {
    if (cardEl) cardEl.style.opacity = '';
  }
}

function paywallToggleCoupon() {
  const box = document.getElementById('paywall-coupon-box');
  if (!box) return;
  const showing = box.style.display !== 'none';
  box.style.display = showing ? 'none' : 'flex';
  if (!showing) {
    setTimeout(() => document.getElementById('paywall-coupon-input')?.focus(), 50);
  }
}

async function paywallRedeemCoupon() {
  const input = document.getElementById('paywall-coupon-input');
  const btn = document.getElementById('btn-redeem-coupon');
  const code = (input?.value || '').trim().toUpperCase();
  if (!code) { showToast('Digite o código do cupom'); return; }

  try {
    setLoading(btn, true);
    const result = await ProManager.redeemCoupon(code);
    if (result.is_lifetime) {
      showToast('🎉 Cupom resgatado! Acesso vitalício liberado.');
    } else {
      const days = result.duration_days || 0;
      showToast(`🎉 Cupom resgatado! Pro liberado por ${days} dia${days === 1 ? '' : 's'}.`);
    }
    if (input) input.value = '';
    refreshPaywallProState();
  } catch (err) {
    showToast(err.message || 'Erro ao resgatar cupom');
  } finally {
    setLoading(btn, false);
  }
}

async function paywallRestore() {
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!isNative) {
    showToast('Restaurar compras só funciona na versão da loja.');
    return;
  }
  if (!window.Billing) {
    showToast('Restauração ainda não habilitada nesta versão.');
    return;
  }
  try {
    await Billing.restore();
    await ProManager.syncFromServer();
    refreshPaywallProState();
    if (ProManager.isPro()) showToast('✅ Compras restauradas!');
    else showToast('Nenhuma compra encontrada nesta conta da loja.');
  } catch (err) {
    showToast('Não foi possível restaurar: ' + (err.message || 'erro'));
  }
}

// ===== ADMIN: CUPONS =====
function onCouponTypeChange() {
  const type = document.getElementById('coupon-type').value;
  const wrap = document.getElementById('coupon-duration-wrap');
  if (wrap) wrap.style.display = type === 'trial' ? 'block' : 'none';
}

function generateCouponCode() {
  // Código curto e legível, sem caracteres ambíguos (0/O, 1/I)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function adminCreateCoupon() {
  const type = document.getElementById('coupon-type').value;
  const codeInput = document.getElementById('coupon-code').value.trim().toUpperCase();
  const duration = parseInt(document.getElementById('coupon-duration').value, 10);
  const maxUsesRaw = document.getElementById('coupon-max-uses').value.trim();
  const expiresRaw = document.getElementById('coupon-expires').value;
  const description = document.getElementById('coupon-description').value.trim();
  const btn = document.getElementById('btn-create-coupon');

  if (type === 'trial' && (!duration || duration <= 0)) {
    showToast('Informe a duração em dias');
    return;
  }

  const code = codeInput || generateCouponCode();
  const maxUses = maxUsesRaw ? parseInt(maxUsesRaw, 10) : null;
  const expiresAt = expiresRaw ? new Date(expiresRaw + 'T23:59:59').toISOString() : null;

  try {
    setLoading(btn, true);
    const result = await apiCreateCoupon({
      code,
      type,
      durationDays: type === 'trial' ? duration : null,
      maxUses,
      expiresAt,
      description,
    });
    if (!result.ok) {
      const msgs = {
        CODIGO_DUPLICADO: 'Já existe um cupom com este código',
        CODIGO_VAZIO:     'Código inválido',
        TIPO_INVALIDO:    'Tipo inválido',
        DURACAO_INVALIDA: 'Duração inválida',
      };
      showToast(msgs[result.error] || result.error || 'Erro ao gerar cupom');
      return;
    }
    showToast('✅ Cupom ' + code + ' gerado!');
    // Limpa form
    document.getElementById('coupon-code').value = '';
    document.getElementById('coupon-description').value = '';
    document.getElementById('coupon-max-uses').value = '';
    await loadAdminCoupons();
  } catch (err) {
    console.error('[Admin] gerar cupom falhou:', err);
    showToast('Erro ao gerar cupom: ' + (err.message || ''));
  } finally {
    setLoading(btn, false);
  }
}

async function loadAdminCoupons() {
  const listEl = document.getElementById('admin-coupons-list');
  if (!listEl) return;
  listEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:16px">Carregando...</p>';
  try {
    const coupons = await apiListCoupons();
    if (!coupons.length) {
      listEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:16px">Nenhum cupom criado ainda.</p>';
      return;
    }
    listEl.innerHTML = coupons.map(c => {
      const used = c.used_count || 0;
      const max = c.max_uses ? `${used}/${c.max_uses}` : `${used}`;
      const validity = c.expires_at
        ? `expira ${new Date(c.expires_at).toLocaleDateString('pt-BR')}`
        : 'sem validade';
      const desc = c.description ? `· ${escapeHtml(c.description)}` : '';
      const typeLabel = c.type === 'lifetime'
        ? '∞ vitalício'
        : `${c.duration_days}d trial`;
      return `
        <div class="coupon-item">
          <div class="coupon-item-main">
            <div class="coupon-code">
              ${escapeHtml(c.code)}
              <button class="coupon-copy" title="Copiar" onclick="copyCouponCode('${escapeHtml(c.code)}')"><i class="fas fa-copy"></i></button>
            </div>
            <div class="coupon-meta">
              <span>${typeLabel}</span>
              <span>${max} usos</span>
              <span>${validity}</span>
            </div>
            ${desc ? `<div class="text-muted" style="font-size:11px;margin-top:4px">${desc}</div>` : ''}
          </div>
          <button class="coupon-delete" title="Excluir" onclick="deleteCoupon('${c.id}', '${escapeHtml(c.code)}')"><i class="fas fa-trash"></i></button>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('[Admin] listar cupons falhou:', err);
    listEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:16px">Erro ao carregar cupons.</p>';
  }
}

function copyCouponCode(code) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(code).then(() => showToast('Código copiado: ' + code));
  } else {
    showToast('Copie manualmente: ' + code);
  }
}

async function deleteCoupon(id, code) {
  if (!confirm(`Excluir o cupom ${code}? Os usuários que já resgataram mantêm o acesso.`)) return;
  try {
    await apiDeleteCoupon(id);
    showToast('Cupom excluído');
    await loadAdminCoupons();
  } catch (err) {
    showToast('Erro ao excluir cupom');
  }
}
