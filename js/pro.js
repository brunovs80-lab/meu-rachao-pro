// ========== PRO MODULE ==========
// Gerencia o estado de acesso Pro do usuário:
//   - Cache local em localStorage (rachao_proStatus)
//   - Sincronização com Supabase (apiGetProStatus)
//   - Gating de features via requirePro(feature, onUnlock)
//   - Resgate de cupons via apiRedeemCoupon
//
// Para forçar Pro em desenvolvimento, no console do navegador:
//   localStorage.setItem('__FORCE_PRO__', '1'); location.reload();

const ProManager = (() => {
  const CACHE_KEY = 'rachao_proStatus';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5min — após isso reconsulta servidor

  // Lista canônica de features Pro (também usada para mensagens no paywall)
  const FEATURES = {
    'multi-rachao':        { label: 'Criar mais de 1 rachão ativo' },
    'jogadores-ilimitados':{ label: 'Cadastrar mais de 15 jogadores' },
    'sortear-times':       { label: 'Sortear times ilimitados (Free: 1 vez)' },
    'fantasy':             { label: 'Fantasy / Ranking de craques' },
    'historico-stats':     { label: 'Histórico completo de estatísticas' },
    'co-admin':            { label: 'Co-administradores com permissões' },
    'aprovar-lote':        { label: 'Aprovar estatísticas em lote' },
    'avulsos':             { label: 'Liberar jogadores avulsos pagantes' },
    'pagamentos':          { label: 'Pagamentos via PIX' },
    'caixa':               { label: 'Caixa / Fluxo financeiro' },
    'exportar':            { label: 'Exportar dados (CSV/PDF)' },
    'backup-cloud':        { label: 'Backup na nuvem' },
  };

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function writeCache(status) {
    const payload = { ...status, _cachedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    return payload;
  }

  function clearCache() {
    localStorage.removeItem(CACHE_KEY);
  }

  function isCacheFresh(status) {
    if (!status || !status._cachedAt) return false;
    return (Date.now() - status._cachedAt) < CACHE_TTL_MS;
  }

  // Avalia se o status em cache ainda vale (não expirou)
  function isStatusActive(status) {
    if (!status) return false;
    if (status.is_lifetime) return true;
    if (!status.expires_at) return false;
    return new Date(status.expires_at).getTime() > Date.now();
  }

  // ====== API PÚBLICA ======

  function isPro() {
    if (localStorage.getItem('__FORCE_PRO__') === '1') return true;
    const status = readCache();
    return isStatusActive(status);
  }

  function getStatus() {
    const cached = readCache();
    if (!cached) return { is_pro: false };
    return {
      is_pro: isStatusActive(cached),
      is_lifetime: !!cached.is_lifetime,
      plan_type: cached.plan_type || null,
      expires_at: cached.expires_at || null,
      source: cached.source || null,
    };
  }

  // Sincroniza com o backend e atualiza o cache.
  // Chamada após login, após resgate de cupom, e periodicamente.
  async function syncFromServer(userId) {
    if (!userId) {
      const u = (typeof apiGetCurrentUser === 'function') ? apiGetCurrentUser() : null;
      userId = u?.id;
    }
    if (!userId) return null;
    try {
      const status = await apiGetProStatus(userId);
      if (status) {
        writeCache({
          is_pro: !!status.is_pro,
          is_lifetime: !!status.is_lifetime,
          plan_type: status.plan_type,
          expires_at: status.expires_at,
          source: status.source,
        });
      }
      updateProBadgeUI();
      return status;
    } catch (err) {
      console.warn('[Pro] sync falhou (mantendo cache):', err?.message);
      return readCache();
    }
  }

  // Gate principal. Use em pontos de entrada de features Pro.
  //   if (!ProManager.requirePro('fantasy')) return;
  // Retorna true se liberado, false se bloqueou (e abriu paywall).
  function requirePro(featureKey, opts = {}) {
    if (isPro()) return true;
    const feature = FEATURES[featureKey];
    const label = feature?.label || featureKey;
    if (typeof showToast === 'function') {
      showToast('🔒 ' + label + ' é uma função Pro');
    }
    // Pequeno delay pra não atropelar a navegação atual
    setTimeout(() => {
      if (typeof navigateTo === 'function') {
        window.__paywallTrigger = featureKey;
        navigateTo('paywall');
      }
    }, 300);
    return false;
  }

  // Resgate de cupom — usa RPC redeem_coupon
  async function redeemCoupon(code) {
    const user = (typeof apiGetCurrentUser === 'function') ? apiGetCurrentUser() : null;
    if (!user) throw new Error('Faça login primeiro');
    if (!code || !code.trim()) throw new Error('Digite um código');
    const result = await apiRedeemCoupon(code.trim(), user.id);
    if (!result.ok) {
      const msgs = {
        CUPOM_INVALIDO:   'Cupom inválido',
        CUPOM_EXPIRADO:   'Este cupom expirou',
        CUPOM_ESGOTADO:   'Cupom esgotado',
        CUPOM_JA_USADO:   'Você já usou este cupom',
        JA_VITALICIO:     'Você já tem acesso vitalício',
        USUARIO_INVALIDO: 'Sessão inválida. Faça login novamente.',
      };
      throw new Error(msgs[result.error] || result.error || 'Erro ao resgatar cupom');
    }
    await syncFromServer(user.id);
    return result;
  }

  // Atualiza badges visuais "PRO" e item do paywall no menu
  function updateProBadgeUI() {
    document.querySelectorAll('[data-pro-badge]').forEach(el => {
      el.style.display = isPro() ? '' : 'none';
    });
    document.querySelectorAll('[data-upgrade-btn]').forEach(el => {
      el.style.display = isPro() ? 'none' : '';
    });
  }

  function getFeatureLabel(key) {
    return FEATURES[key]?.label || key;
  }

  return {
    isPro,
    getStatus,
    syncFromServer,
    requirePro,
    redeemCoupon,
    updateProBadgeUI,
    getFeatureLabel,
    clearCache,
    FEATURES,
  };
})();

// Expõe globalmente
window.ProManager = ProManager;
