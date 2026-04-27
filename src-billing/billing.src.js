// ========== BILLING (RevenueCat IAP) ==========
// Bundled by scripts/build-web.js -> www/js/billing.bundle.js
// Exposes window.Billing with a stable API used by paywall.js.

import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';
import { Capacitor } from '@capacitor/core';

// Chaves públicas da API RevenueCat (são públicas, podem ficar no client).
// SUBSTITUA pelos valores do seu projeto: app.revenuecat.com → Project Settings → API Keys.
const REVENUECAT_API_KEY_ANDROID = 'REPLACE_WITH_GOOGLE_KEY';
const REVENUECAT_API_KEY_IOS     = 'REPLACE_WITH_APPLE_KEY';

// Identificador do entitlement no RevenueCat (criado no dashboard).
// Todos os 3 produtos (mensal/anual/vitalício) devem desbloquear este mesmo entitlement.
const ENTITLEMENT_ID = 'pro';

// Mapeia plan_type interno → product_identifier configurado nas lojas + RevenueCat
// Esses identificadores devem bater com o que você criar no Google Play Console
// e App Store Connect (e estar dentro de uma "offering" no RevenueCat).
const PLAN_TO_PACKAGE = {
  monthly:  '$rc_monthly',
  yearly:   '$rc_annual',
  lifetime: '$rc_lifetime',
};

let _initialized = false;
let _currentOfferings = null;

function isNative() {
  return Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
}

// ===== INIT =====
// Chamado após o login (sabemos o user.id). Pode ser chamado novamente em logout/login.
async function init(userId) {
  if (!isNative()) {
    console.log('[Billing] não-native, SDK do RevenueCat desativado');
    return false;
  }
  try {
    if (!_initialized) {
      const apiKey = Capacitor.getPlatform() === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
      if (!apiKey || apiKey.startsWith('REPLACE_')) {
        console.warn('[Billing] API key do RevenueCat não configurada — IAP desativado');
        return false;
      }
      await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
      await Purchases.configure({ apiKey, appUserID: userId || null });
      _initialized = true;
    } else if (userId) {
      // Trocou de usuário no app
      await Purchases.logIn({ appUserID: userId });
    }

    // Primeira sincronização do estado
    await syncWithBackend();
    return true;
  } catch (err) {
    console.error('[Billing] init falhou:', err);
    return false;
  }
}

// ===== OFFERINGS / PREÇOS =====
async function getOfferings() {
  if (!_initialized) return null;
  try {
    const result = await Purchases.getOfferings();
    _currentOfferings = result?.current || null;
    return _currentOfferings;
  } catch (err) {
    console.error('[Billing] getOfferings falhou:', err);
    return null;
  }
}

// Retorna preços formatados pra UI: { monthly: 'R$ 9,90', yearly: 'R$ 59,90', lifetime: 'R$ 149,90' }
async function getFormattedPrices() {
  const offerings = await getOfferings();
  if (!offerings || !offerings.availablePackages) return null;

  const out = {};
  for (const [plan, pkgId] of Object.entries(PLAN_TO_PACKAGE)) {
    const pkg = offerings.availablePackages.find(p => p.identifier === pkgId);
    if (pkg && pkg.product) {
      out[plan] = {
        display: pkg.product.priceString,    // já vem formatado pela loja
        period:  plan === 'monthly' ? '/mês' : plan === 'yearly' ? '/ano' : 'uma vez',
        rawPrice: pkg.product.price,
        currency: pkg.product.currencyCode,
      };
    }
  }
  return out;
}

// ===== COMPRA =====
async function purchase(plan) {
  if (!_initialized) throw new Error('Billing não inicializado');
  const offerings = await getOfferings();
  if (!offerings) throw new Error('Nenhuma oferta disponível');

  const pkgId = PLAN_TO_PACKAGE[plan];
  if (!pkgId) throw new Error('Plano inválido: ' + plan);

  const pkg = offerings.availablePackages.find(p => p.identifier === pkgId);
  if (!pkg) throw new Error('Plano não encontrado nas ofertas');

  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    await syncWithBackend(customerInfo);
    return { ok: true, customerInfo };
  } catch (err) {
    if (err && err.userCancelled) return { ok: false, cancelled: true };
    throw err;
  }
}

// ===== RESTAURAR =====
async function restore() {
  if (!_initialized) throw new Error('Billing não inicializado');
  const { customerInfo } = await Purchases.restorePurchases();
  await syncWithBackend(customerInfo);
  return customerInfo;
}

// ===== LOGOUT =====
async function logout() {
  if (!_initialized) return;
  try { await Purchases.logOut(); } catch (e) { /* ignore */ }
}

// ===== SYNC COM BACKEND =====
// Após qualquer compra/restauro, atualizamos pro_subscriptions via webhook do RevenueCat.
// Esta função apenas atualiza o cache local imediatamente (UX) e dispara um sync com o backend.
async function syncWithBackend(customerInfo) {
  try {
    if (!customerInfo) {
      const r = await Purchases.getCustomerInfo();
      customerInfo = r.customerInfo;
    }
    const ent = customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
    if (ent) {
      // Marca cache local imediatamente (otimista)
      const isLifetime = ent.periodType === 'NORMAL' && (!ent.expirationDate || ent.productIdentifier?.includes('lifetime'));
      const status = {
        is_pro: true,
        is_lifetime: isLifetime,
        plan_type: ent.productIdentifier?.includes('yearly') ? 'yearly'
                  : ent.productIdentifier?.includes('lifetime') ? 'lifetime'
                  : 'monthly',
        expires_at: ent.expirationDate || null,
        source: 'iap',
      };
      localStorage.setItem('rachao_proStatus', JSON.stringify({ ...status, _cachedAt: Date.now() }));
    }
    // Reconfere com o servidor (que recebe webhook do RevenueCat → atualiza pro_subscriptions)
    if (window.ProManager) {
      setTimeout(() => window.ProManager.syncFromServer().catch(() => {}), 1500);
    }
    return customerInfo;
  } catch (err) {
    console.error('[Billing] syncWithBackend falhou:', err);
    return null;
  }
}

// Expor globalmente
window.Billing = {
  init,
  getOfferings,
  getFormattedPrices,
  purchase,
  restore,
  logout,
  syncWithBackend,
  isNative,
  ENTITLEMENT_ID,
};
