// ========== PAYWALL + ADMIN CUPONS ==========

// ===== EMAIL DO COMPRADOR PRO MP =====
const MP_EMAIL_STORAGE_KEY = 'rachao_mpEmail';
let _mpEmailResolver = null;

function askMpEmail() {
  return new Promise(resolve => {
    _mpEmailResolver = resolve;
    const cached = localStorage.getItem(MP_EMAIL_STORAGE_KEY) || '';
    const input = document.getElementById('mp-email-input');
    input.value = cached;
    document.getElementById('modal-mp-email').style.display = 'flex';
    setTimeout(() => input.focus(), 50);
  });
}

function fecharModalMpEmail() {
  document.getElementById('modal-mp-email').style.display = 'none';
  if (_mpEmailResolver) { _mpEmailResolver(null); _mpEmailResolver = null; }
}

function confirmarMpEmail() {
  const email = (document.getElementById('mp-email-input').value || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('Digite um email válido');
    return;
  }
  localStorage.setItem(MP_EMAIL_STORAGE_KEY, email);
  document.getElementById('modal-mp-email').style.display = 'none';
  if (_mpEmailResolver) { _mpEmailResolver(email); _mpEmailResolver = null; }
}

// Tela de assinatura Pro e administração de cupons promocionais.
// IAP nativo (RevenueCat) será adicionado em fase posterior — por ora os botões
// de plano mostram um placeholder explicando que a compra será habilitada na build mobile.

// Preços de exibição. Vão ser sobrescritos pelos preços reais vindos do RevenueCat
// na fase de IAP nativo.
const PAYWALL_PRICES = {
  monthly:  { display: 'R$ 14,90',  period: 'por 30 dias' },
  yearly:   { display: 'R$ 99,90',  period: 'por 1 ano'   },
  lifetime: { display: 'R$ 199,90', period: 'pra sempre'  },
};

// ===== LOAD =====
async function loadPaywall() {
  // Trata retorno do checkout web do Mercado Pago (?paywall=success|fail|pending)
  await handlePaywallReturn();

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

  // Ajusta UI conforme plataforma: PWA usa Mercado Pago (cartão/PIX),
  // APK usa loja (Google Play). Restaurar compras só faz sentido no APK.
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const restoreBtn = document.querySelector('.paywall-restore');
  if (restoreBtn) restoreBtn.style.display = isNative ? '' : 'none';
  const legal = document.getElementById('paywall-legal-text');
  if (legal) {
    legal.innerHTML = isNative
      ? 'Pagamento processado pela loja de aplicativos. Renovação automática para planos mensal/anual — pode ser cancelada nas configurações da conta da loja.<br><a href="#" onclick="event.preventDefault();navigateTo(\'terms\')">Termos</a> · <a href="#" onclick="event.preventDefault();navigateTo(\'privacy\')">Privacidade</a>'
      : 'Pagamento processado pelo Mercado Pago. Mensal/anual é cobrado automaticamente no cartão e pode ser cancelado a qualquer momento.<br><a href="#" onclick="event.preventDefault();navigateTo(\'terms\')">Termos</a> · <a href="#" onclick="event.preventDefault();navigateTo(\'privacy\')">Privacidade</a>';
  }

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
    // Botão de cancelar foi descontinuado: todos os planos web agora são compra avulsa
    // (one-shot Checkout Pro). Sem recorrência = sem cancelamento; o Pro só expira.
    const cancelBtn = document.getElementById('paywall-cancel-mp');
    if (cancelBtn) {
      cancelBtn.style.display = 'none';
      const canCancel = false;
    }
  } else {
    if (alreadyEl) alreadyEl.style.display = 'none';
    plansSection.forEach(el => el.style.display = '');
  }
}

// ===== RETORNO DO CHECKOUT WEB (Mercado Pago) =====
async function handlePaywallReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('paywall');
  if (!status) return;

  // Limpa o param da URL pra não disparar de novo num refresh
  params.delete('paywall');
  const newQs = params.toString();
  const newUrl = window.location.pathname + (newQs ? '?' + newQs : '') + window.location.hash;
  history.replaceState(null, '', newUrl);

  if (status === 'success') {
    showToast('Confirmando pagamento...');
    // Pequeno polling: webhook MP pode demorar uns segundos
    const user = (typeof apiGetCurrentUser === 'function') ? apiGetCurrentUser() : null;
    if (!user) return;
    for (let i = 0; i < 4; i++) {
      await ProManager.syncFromServer(user.id);
      if (ProManager.isPro()) {
        showToast('🎉 Bem-vindo ao Pro!');
        return;
      }
      await new Promise(r => setTimeout(r, 2500));
    }
    showToast('Pagamento aprovado, mas ainda processando. Tente recarregar em alguns segundos.');
  } else if (status === 'fail') {
    showToast('Pagamento não foi concluído. Tente novamente.');
  } else if (status === 'pending') {
    showToast('Pagamento pendente. Confirmação chegará em instantes.');
  }
}

// ===== AÇÕES DE PLANO =====
async function paywallSelectPlan(plan) {
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const cardEl = document.querySelector(`.paywall-plan[data-plan="${plan}"]`);
  if (cardEl) cardEl.style.opacity = '0.6';

  try {
    if (isNative) {
      // ===== Caminho APK: RevenueCat IAP =====
      if (!window.Billing) {
        showToast('Pagamento ainda não habilitado nesta versão.');
        return;
      }
      const result = await Billing.purchase(plan);
      if (result?.cancelled) { showToast('Compra cancelada'); return; }
      if (result?.ok) {
        showToast('🎉 Bem-vindo ao Pro!');
        await ProManager.syncFromServer();
        refreshPaywallProState();
      }
    } else {
      // ===== Caminho PWA/web: Mercado Pago =====
      const user = (typeof apiGetCurrentUser === 'function') ? apiGetCurrentUser() : null;
      if (!user) { showToast('Faça login para assinar'); return; }

      // MP exige que o email do payer bata com o email da conta MP do usuário.
      // Se o usuário cadastrou email, usa direto; senão pede via modal (cache localStorage).
      const payerEmail = user.email || await askMpEmail();
      if (!payerEmail) return; // usuário cancelou

      const result = await apiCreateMpCheckout(plan, user.id, payerEmail);
      if (!result?.init_point) {
        showToast('Não foi possível abrir o checkout');
        return;
      }
      // Redireciona pro checkout do MP. O retorno cai em ?paywall=success|fail|pending.
      window.location.assign(result.init_point);
    }
  } catch (err) {
    console.error('[Paywall] purchase falhou:', err);
    showToast('Não foi possível concluir a compra: ' + (err.message || 'erro'));
  } finally {
    if (cardEl) cardEl.style.opacity = '';
  }
}

// ===== CANCELAR ASSINATURA (somente mp_web recorrente) =====
async function paywallCancelMpSubscription() {
  const status = ProManager.getStatus();
  if (status.source !== 'mp_web' || status.is_lifetime) return;
  const proUntil = status.expires_at
    ? new Date(status.expires_at).toLocaleDateString('pt-BR')
    : 'a data atual';
  if (!confirm(`Cancelar a assinatura? Você continua Pro até ${proUntil} e a renovação não será cobrada.`)) return;

  const user = (typeof apiGetCurrentUser === 'function') ? apiGetCurrentUser() : null;
  if (!user) return;
  const btn = document.getElementById('paywall-cancel-mp');
  setLoading(btn, true);
  try {
    const r = await apiCancelMpSubscription(user.id);
    showToast(`Assinatura cancelada. Pro segue ativo até ${new Date(r.pro_until).toLocaleDateString('pt-BR')}.`);
    await ProManager.syncFromServer(user.id);
    refreshPaywallProState();
  } catch (err) {
    showToast('Erro ao cancelar: ' + (err.message || ''));
  } finally {
    setLoading(btn, false);
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

// Geração/listagem/exclusão de cupons foi movida pro painel admin local
// (server/admin.html). Cliente só RESGATA cupom (paywallRedeemCoupon acima).
