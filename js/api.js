// ========== SUPABASE API LAYER ==========
// Usa @supabase/supabase-js via CDN (carregado no index.html)

let _supabaseClient;

function initSupabase() {
  if (!_supabaseClient) {
    // CDN UMD expõe window.supabase com createClient dentro
    const lib = window.supabase;
    if (!lib) { console.error('Supabase SDK não carregou'); return null; }
    const createFn = lib.createClient || (lib.supabase && lib.supabase.createClient);
    if (!createFn) { console.error('createClient não encontrado no SDK'); return null; }
    _supabaseClient = createFn(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabaseClient;
}

// ===== PLAYERS =====
async function apiGetPlayers() {
  const { data, error } = await initSupabase().from('players').select('*').order('name');
  if (error) throw error;
  return data.map(p => ({ ...p, isAdmin: p.is_admin, cleanSheets: p.clean_sheets }));
}

async function apiGetPlayerById(id) {
  const { data, error } = await initSupabase().from('players').select('id, name, phone, position, goals, assists, tackles, fouls, yellows, reds, saves, clean_sheets, matches, blocked, is_admin, created_at').eq('id', id).single();
  if (error) throw error;
  return { ...data, isAdmin: data.is_admin, cleanSheets: data.clean_sheets };
}

async function apiCreatePlayer(player) {
  const id = player.id || generateId();
  const { data, error } = await initSupabase().from('players').insert({
    id, name: player.name, phone: player.phone,
    position: player.position || 'Meia',
    is_admin: player.isAdmin || false
  }).select().single();
  if (error) throw error;
  return { ...data, isAdmin: data.is_admin, cleanSheets: data.clean_sheets };
}

async function apiUpdatePlayer(id, fields) {
  const mapped = {};
  if (fields.name !== undefined) mapped.name = fields.name;
  if (fields.phone !== undefined) mapped.phone = fields.phone;
  if (fields.position !== undefined) mapped.position = fields.position;
  if (fields.goals !== undefined) mapped.goals = fields.goals;
  if (fields.assists !== undefined) mapped.assists = fields.assists;
  if (fields.tackles !== undefined) mapped.tackles = fields.tackles;
  if (fields.fouls !== undefined) mapped.fouls = fields.fouls;
  if (fields.yellows !== undefined) mapped.yellows = fields.yellows;
  if (fields.reds !== undefined) mapped.reds = fields.reds;
  if (fields.saves !== undefined) mapped.saves = fields.saves;
  if (fields.cleanSheets !== undefined) mapped.clean_sheets = fields.cleanSheets;
  if (fields.matches !== undefined) mapped.matches = fields.matches;
  if (fields.blocked !== undefined) mapped.blocked = fields.blocked;
  if (fields.isAdmin !== undefined) mapped.is_admin = fields.isAdmin;

  const { data, error } = await initSupabase().from('players').update(mapped).eq('id', id).select().single();
  if (error) throw error;
  return { ...data, isAdmin: data.is_admin, cleanSheets: data.clean_sheets };
}

// ===== AUTH (via Supabase RPC) =====
async function apiCheckPhone(phone) {
  const cleanPhone = phone.replace(/\D/g, '');
  const { data, error } = await initSupabase().rpc('check_phone', { p_phone: cleanPhone });
  if (error) throw new Error('Erro ao verificar telefone');
  return data;
}

async function apiLoginWithPassword(phone, password) {
  const cleanPhone = phone.replace(/\D/g, '');
  const { data, error } = await initSupabase().rpc('login_with_password', { p_phone: cleanPhone, p_password: password });
  if (error) throw new Error('Erro ao fazer login');
  if (!data.success) throw new Error(data.error || 'Erro ao fazer login');
  return data.user;
}

async function apiRegisterUser(phone, password, name, position) {
  const cleanPhone = phone.replace(/\D/g, '');
  const { data, error } = await initSupabase().rpc('register_user', { p_phone: cleanPhone, p_password: password, p_name: name, p_position: position || 'Meia' });
  if (error) throw new Error('Erro ao cadastrar');
  if (!data.success) throw new Error(data.error || 'Erro ao cadastrar');
  return data.user;
}

// ===== RACHAOS =====
async function apiGetRachaos() {
  const { data, error } = await initSupabase().from('rachaos').select('*').eq('status', 'active').order('name');
  if (error) throw error;

  const { data: parts } = await initSupabase().from('rachao_participants').select('rachao_id, player_id');
  const partMap = {};
  (parts || []).forEach(p => {
    if (!partMap[p.rachao_id]) partMap[p.rachao_id] = [];
    partMap[p.rachao_id].push(p.player_id);
  });

  return data.map(r => ({
    ...r,
    dayOfWeek: r.day_of_week,
    playersPerTeam: r.players_per_team,
    tieRule: r.tie_rule,
    monthlyVenueCost: r.monthly_venue_cost,
    pixKey: r.pix_key,
    createdBy: r.created_by,
    participants: partMap[r.id] || []
  }));
}

async function apiGetRachaoById(id) {
  const { data, error } = await initSupabase().from('rachaos').select('*').eq('id', id).single();
  if (error) throw error;
  const { data: parts } = await initSupabase().from('rachao_participants').select('player_id').eq('rachao_id', id);
  return {
    ...data,
    dayOfWeek: data.day_of_week,
    playersPerTeam: data.players_per_team,
    tieRule: data.tie_rule,
    monthlyVenueCost: data.monthly_venue_cost,
    pixKey: data.pix_key,
    createdBy: data.created_by,
    participants: (parts || []).map(p => p.player_id)
  };
}

async function apiGetRachaoByCode(code) {
  const { data } = await initSupabase().from('rachaos').select('*').eq('code', code.toUpperCase()).maybeSingle();
  if (!data) return null;
  const { data: parts } = await initSupabase().from('rachao_participants').select('player_id').eq('rachao_id', data.id);
  return {
    ...data,
    dayOfWeek: data.day_of_week,
    playersPerTeam: data.players_per_team,
    tieRule: data.tie_rule,
    monthlyVenueCost: data.monthly_venue_cost,
    pixKey: data.pix_key,
    createdBy: data.created_by,
    participants: (parts || []).map(p => p.player_id)
  };
}

async function apiCreateRachao(rachao) {
  const id = rachao.id || generateId();
  const { data, error } = await initSupabase().from('rachaos').insert({
    id, code: rachao.code, name: rachao.name, location: rachao.location,
    day_of_week: rachao.dayOfWeek, time: rachao.time,
    players_per_team: rachao.playersPerTeam || 5,
    tie_rule: rachao.tieRule || 'playing_leaves',
    monthly_venue_cost: rachao.monthlyVenueCost || 0,
    pix_key: rachao.pixKey || '',
    latitude: rachao.latitude ?? null, longitude: rachao.longitude ?? null,
    created_by: rachao.createdBy, status: 'active'
  }).select().single();
  if (error) throw error;

  // Add participants
  if (rachao.participants && rachao.participants.length > 0) {
    const rows = rachao.participants.map(pid => ({ rachao_id: id, player_id: pid }));
    await initSupabase().from('rachao_participants').upsert(rows);
  }

  return { id: data.id, code: data.code };
}

async function apiUpdateRachao(id, fields) {
  const mapped = {};
  if (fields.name !== undefined) mapped.name = fields.name;
  if (fields.location !== undefined) mapped.location = fields.location;
  if (fields.dayOfWeek !== undefined) mapped.day_of_week = fields.dayOfWeek;
  if (fields.time !== undefined) mapped.time = fields.time;
  if (fields.playersPerTeam !== undefined) mapped.players_per_team = fields.playersPerTeam;
  if (fields.tieRule !== undefined) mapped.tie_rule = fields.tieRule;
  if (fields.monthlyVenueCost !== undefined) mapped.monthly_venue_cost = fields.monthlyVenueCost;
  if (fields.pixKey !== undefined) mapped.pix_key = fields.pixKey;
  if (fields.status !== undefined) mapped.status = fields.status;
  if (fields.latitude !== undefined) mapped.latitude = fields.latitude;
  if (fields.longitude !== undefined) mapped.longitude = fields.longitude;

  if (Object.keys(mapped).length > 0) {
    await initSupabase().from('rachaos').update(mapped).eq('id', id);
  }
  if (fields.participants) {
    await initSupabase().from('rachao_participants').delete().eq('rachao_id', id);
    const rows = fields.participants.map(pid => ({ rachao_id: id, player_id: pid }));
    await initSupabase().from('rachao_participants').upsert(rows);
  }
}

async function apiJoinRachao(rachaoId, playerId) {
  await initSupabase().from('rachao_participants').upsert({ rachao_id: rachaoId, player_id: playerId });
}

// ===== SESSIONS =====
async function apiGetSessions(rachaoId) {
  let query = initSupabase().from('sessions').select('*').order('date', { ascending: false });
  if (rachaoId) query = query.eq('rachao_id', rachaoId);
  const { data, error } = await query;
  if (error) throw error;

  const sessionIds = data.map(s => s.id);
  const { data: confs } = await initSupabase().from('session_confirmations').select('*').in('session_id', sessionIds).order('position');

  return data.map(s => {
    const sConfs = (confs || []).filter(c => c.session_id === s.id);
    return {
      id: s.id, rachaoId: s.rachao_id, date: s.date, status: s.status,
      confirmed: sConfs.filter(c => c.type === 'confirmed').map(c => c.player_id),
      waiting: sConfs.filter(c => c.type === 'waiting').map(c => c.player_id),
      teams: s.teams, leftover: s.leftover || [],
      allow_guests: !!s.allow_guests, guest_fee: s.guest_fee, guest_slots: s.guest_slots
    };
  });
}

async function apiGetSessionById(id) {
  const { data, error } = await initSupabase().from('sessions').select('*').eq('id', id).single();
  if (error) throw error;
  const { data: confs } = await initSupabase().from('session_confirmations').select('*').eq('session_id', id).order('position');
  return {
    id: data.id, rachaoId: data.rachao_id, date: data.date, status: data.status,
    confirmed: (confs || []).filter(c => c.type === 'confirmed').map(c => c.player_id),
    waiting: (confs || []).filter(c => c.type === 'waiting').map(c => c.player_id),
    teams: data.teams, leftover: data.leftover || [],
    allow_guests: !!data.allow_guests, guest_fee: data.guest_fee, guest_slots: data.guest_slots
  };
}

async function apiCreateSession(session) {
  const id = session.id || generateId();
  const { data, error } = await initSupabase().from('sessions').insert({
    id, rachao_id: session.rachaoId, date: session.date, status: 'open'
  }).select().single();
  if (error) throw error;
  return { id: data.id };
}

async function apiUpdateSession(id, fields) {
  const mapped = {};
  if (fields.status) mapped.status = fields.status;
  if (fields.teams !== undefined) mapped.teams = fields.teams;
  if (fields.leftover !== undefined) mapped.leftover = fields.leftover;

  if (Object.keys(mapped).length > 0) {
    await initSupabase().from('sessions').update(mapped).eq('id', id);
  }

  if (fields.confirmed !== undefined || fields.waiting !== undefined) {
    await initSupabase().from('session_confirmations').delete().eq('session_id', id);
    const rows = [];
    if (fields.confirmed) fields.confirmed.forEach((pid, i) => rows.push({ session_id: id, player_id: pid, type: 'confirmed', position: i }));
    if (fields.waiting) fields.waiting.forEach((pid, i) => rows.push({ session_id: id, player_id: pid, type: 'waiting', position: i }));
    if (rows.length > 0) await initSupabase().from('session_confirmations').insert(rows);
  }
}

async function apiTogglePresence(sessionId, playerId, action) {
  if (action === 'confirm') {
    const { data: maxPos } = await initSupabase().from('session_confirmations')
      .select('position').eq('session_id', sessionId).eq('type', 'confirmed')
      .order('position', { ascending: false }).limit(1);
    const pos = (maxPos && maxPos.length > 0) ? maxPos[0].position + 1 : 0;
    await initSupabase().from('session_confirmations').upsert({
      session_id: sessionId, player_id: playerId, type: 'confirmed', position: pos
    });
  } else if (action === 'cancel') {
    await initSupabase().from('session_confirmations').delete()
      .eq('session_id', sessionId).eq('player_id', playerId);

    // Promote from waiting list (non-blocked player)
    const { data: waiting } = await initSupabase().from('session_confirmations')
      .select('player_id').eq('session_id', sessionId).eq('type', 'waiting')
      .order('position').limit(10);

    if (waiting && waiting.length > 0) {
      for (const w of waiting) {
        const { data: player } = await initSupabase().from('players')
          .select('blocked').eq('id', w.player_id).single();
        if (!player || !player.blocked) {
          await initSupabase().from('session_confirmations')
            .update({ type: 'confirmed' })
            .eq('session_id', sessionId).eq('player_id', w.player_id);
          break;
        }
      }
    }
  } else if (action === 'wait') {
    const { data: maxPos } = await initSupabase().from('session_confirmations')
      .select('position').eq('session_id', sessionId).eq('type', 'waiting')
      .order('position', { ascending: false }).limit(1);
    const pos = (maxPos && maxPos.length > 0) ? maxPos[0].position + 1 : 0;
    await initSupabase().from('session_confirmations').upsert({
      session_id: sessionId, player_id: playerId, type: 'waiting', position: pos
    });
  }
}

// ===== BILLING =====
function _mapBilling(data, payments) {
  return {
    ...data,
    rachaoId: data.rachao_id,
    perPerson: data.per_person,
    totalCost: data.total_cost,
    venuePaidAt: data.venue_paid_at,
    venuePaidBy: data.venue_paid_by,
    payments: payments || [],
  };
}

async function apiGetBilling(rachaoId, month) {
  const { data } = await initSupabase().from('monthly_billing').select('*')
    .eq('rachao_id', rachaoId).eq('month', month).maybeSingle();
  if (!data) return null;
  const { data: payments } = await initSupabase().from('billing_payments').select('*').eq('billing_id', data.id);
  return _mapBilling(data, payments);
}

async function apiUpdateBillingValues(billingId, { totalCost, perPerson }) {
  const patch = {};
  if (totalCost !== undefined && totalCost !== null) patch.total_cost = Number(totalCost);
  if (perPerson !== undefined && perPerson !== null) patch.per_person = Number(perPerson);
  if (Object.keys(patch).length === 0) return;
  const { error } = await initSupabase().from('monthly_billing').update(patch).eq('id', billingId);
  if (error) throw error;
}

async function apiMarkVenuePaid(billingId, userId, paid) {
  const patch = paid
    ? { venue_paid_at: new Date().toISOString(), venue_paid_by: userId }
    : { venue_paid_at: null, venue_paid_by: null };
  const { error } = await initSupabase().from('monthly_billing').update(patch).eq('id', billingId);
  if (error) throw error;
}

async function apiGetCashFlow(rachaoId) {
  const { data: billings } = await initSupabase().from('monthly_billing')
    .select('id, month, total_cost, per_person, venue_paid_at')
    .eq('rachao_id', rachaoId)
    .order('month', { ascending: true });
  if (!billings || billings.length === 0) return { months: [], accumulated: 0 };

  const ids = billings.map(b => b.id);
  const { data: payments } = await initSupabase().from('billing_payments')
    .select('billing_id, status')
    .in('billing_id', ids);

  const paidCountByBilling = {};
  (payments || []).forEach(p => {
    if (p.status === 'paid') paidCountByBilling[p.billing_id] = (paidCountByBilling[p.billing_id] || 0) + 1;
  });

  let accumulated = 0;
  const months = billings.map(b => {
    const paidCount = paidCountByBilling[b.id] || 0;
    const collected = paidCount * Number(b.per_person || 0);
    const venuePaid = !!b.venue_paid_at;
    const net = collected - (venuePaid ? Number(b.total_cost || 0) : 0);
    if (venuePaid) accumulated += collected - Number(b.total_cost || 0);
    return {
      billingId: b.id,
      month: b.month,
      totalCost: Number(b.total_cost || 0),
      perPerson: Number(b.per_person || 0),
      paidCount,
      collected,
      venuePaid,
      net,
    };
  });

  return { months, accumulated };
}

async function apiCreateBilling(billing) {
  const id = billing.id || generateId();
  const { error } = await initSupabase().from('monthly_billing').insert({
    id, rachao_id: billing.rachaoId, month: billing.month,
    total_cost: billing.totalCost, participant_count: billing.participantCount,
    per_person: billing.perPerson
  });
  if (error && error.code !== '23505') throw error; // ignore duplicate

  if (billing.payments && billing.payments.length > 0) {
    const rows = billing.payments.map(p => ({
      billing_id: id, player_id: p.playerId, status: p.status || 'pending', paid_at: p.paidAt || null
    }));
    await initSupabase().from('billing_payments').upsert(rows);
  }
  return { id };
}

async function apiConfirmPayment(billingId, playerId, status) {
  await initSupabase().from('billing_payments').update({
    status: status || 'paid',
    paid_at: status === 'paid' ? new Date().toISOString() : null
  }).eq('billing_id', billingId).eq('player_id', playerId);
}

// ===== PAYMENT CONFIG (per rachão) =====
async function apiGetPaymentStatus(rachaoId) {
  const { data } = await initSupabase().from('rachao_payment_status')
    .select('rachao_id, provider, mp_enabled, updated_at')
    .eq('rachao_id', rachaoId)
    .maybeSingle();
  return data || { rachao_id: rachaoId, provider: 'mercado_pago', mp_enabled: false };
}

async function apiSavePaymentConfig(rachaoId, userId, { mpAccessToken, mpEnabled }) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/save-payment-config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      rachao_id: rachaoId,
      user_id: userId,
      mp_access_token: mpAccessToken || null,
      mp_enabled: !!mpEnabled,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Erro ao salvar configuração');
  return data;
}

// ===== PIX PAYMENTS =====
async function apiCreatePixCharge(billingId, playerId, rachaoId, amount, description) {
  const supabaseUrl = SUPABASE_URL;
  const resp = await fetch(`${supabaseUrl}/functions/v1/create-pix-charge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      billing_id: billingId,
      player_id: playerId,
      rachao_id: rachaoId,
      amount,
      description,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Erro ao criar cobrança PIX');
  return data;
}

async function apiCreateGuestPixCharge(sessionId, playerId, rachaoId, payerEmail, description) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-pix-charge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      purpose: 'guest_fee',
      session_id: sessionId,
      player_id: playerId,
      rachao_id: rachaoId,
      payer_email: payerEmail || undefined,
      description,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error(data.error || 'Erro ao criar cobrança PIX');
    err.code = data.code;
    throw err;
  }
  return data;
}

async function apiGetPixTransaction(billingId, playerId) {
  const { data } = await initSupabase().from('pix_transactions')
    .select('*')
    .eq('billing_id', billingId)
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function apiGetPixTransactionById(txId) {
  const { data } = await initSupabase().from('pix_transactions')
    .select('*').eq('id', txId).single();
  return data;
}

// Subscription Realtime para atualizações de pagamento PIX
let _pixRealtimeChannel = null;

function apiSubscribePixUpdates(callback) {
  if (_pixRealtimeChannel) {
    initSupabase().removeChannel(_pixRealtimeChannel);
  }
  _pixRealtimeChannel = initSupabase()
    .channel('pix-payments-realtime')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'pix_transactions',
    }, (payload) => {
      callback({ type: 'pix_transaction', data: payload.new });
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'billing_payments',
    }, (payload) => {
      callback({ type: 'billing_payment', data: payload.new });
    })
    .subscribe();
  return _pixRealtimeChannel;
}

function apiUnsubscribePixUpdates() {
  if (_pixRealtimeChannel) {
    initSupabase().removeChannel(_pixRealtimeChannel);
    _pixRealtimeChannel = null;
  }
}

// ===== STATS =====
async function apiGetPendingStats() {
  const { data } = await initSupabase().from('pending_stats').select('*')
    .eq('validated', false).order('created_at', { ascending: false });
  return (data || []).map(s => ({
    ...s, isGoalkeeper: s.is_goalkeeper, sessionId: s.session_id,
    rachaoId: s.rachao_id, playerId: s.player_id,
    saves: s.saves_count, goalsConceded: s.goals_conceded, cleanSheet: s.clean_sheet
  }));
}

async function apiGetValidatedStats() {
  const { data } = await initSupabase().from('validated_stats').select('*').order('validated_at', { ascending: false });
  return (data || []).map(s => ({
    ...s, isGoalkeeper: s.is_goalkeeper, sessionId: s.session_id,
    rachaoId: s.rachao_id, playerId: s.player_id,
    saves: s.saves_count, goalsConceded: s.goals_conceded, cleanSheet: s.clean_sheet
  }));
}

async function apiSubmitStats(stats) {
  const arr = Array.isArray(stats) ? stats : [stats];
  const rows = arr.map(s => ({
    id: s.id || generateId(),
    session_id: s.sessionId, rachao_id: s.rachaoId, player_id: s.playerId,
    is_goalkeeper: s.isGoalkeeper || false,
    goals: s.goals || 0, assists: s.assists || 0, tackles: s.tackles || 0,
    fouls: s.fouls || 0, yellows: s.yellows || 0, reds: s.reds || 0,
    saves_count: s.saves || 0, goals_conceded: s.goalsConceded || 0,
    clean_sheet: s.cleanSheet || 0
  }));
  await initSupabase().from('pending_stats').insert(rows);
  return { count: rows.length };
}

async function apiValidateStat(statId, approved) {
  await initSupabase().rpc('validate_stat', { p_stat_id: statId, p_approved: approved });
}

async function apiValidateStatsBatch(statIds, approved) {
  if (!Array.isArray(statIds) || statIds.length === 0) return { count: 0 };
  await Promise.all(statIds.map(id => apiValidateStat(id, approved)));
  return { count: statIds.length };
}

// ===== CO-ADMINS / PERMISSÕES =====
const COADMIN_PERMISSIONS = [
  { key: 'approve_stats', label: 'Aprovar estatísticas', icon: 'fa-check-double' },
  { key: 'manage_payments', label: 'Gerenciar pagamentos', icon: 'fa-money-bill' },
  { key: 'edit_values', label: 'Editar valores (quadra/mensalidade)', icon: 'fa-pen-to-square' },
  { key: 'mark_venue_paid', label: 'Marcar quadra como paga', icon: 'fa-check' },
  { key: 'config_pix', label: 'Configurar PIX automático', icon: 'fa-qrcode' },
  { key: 'end_session', label: 'Encerrar jogo/sessão', icon: 'fa-flag-checkered' },
  { key: 'draw_teams', label: 'Sortear times', icon: 'fa-shuffle' },
  { key: 'block_players', label: 'Bloquear/liberar jogadores', icon: 'fa-ban' },
];

async function apiListRachaoAdmins(rachaoId) {
  const { data, error } = await initSupabase().rpc('list_rachao_admins', { p_rachao_id: rachaoId });
  if (error) { console.error(error); return []; }
  return (data || []).map(r => ({
    playerId: r.player_id,
    playerName: r.player_name,
    permissions: r.permissions || {},
    grantedBy: r.granted_by,
    grantedAt: r.granted_at,
  }));
}

async function apiCheckPermission(rachaoId, playerId, permission) {
  if (!rachaoId || !playerId || !permission) return false;
  const { data, error } = await initSupabase().rpc('check_rachao_permission', {
    p_rachao_id: rachaoId,
    p_player_id: playerId,
    p_permission: permission,
  });
  if (error) { console.error(error); return false; }
  return !!data;
}

const _coAdminCache = new Map();

async function getCoAdminsCached(rachaoId) {
  if (!_coAdminCache.has(rachaoId)) {
    _coAdminCache.set(rachaoId, apiListRachaoAdmins(rachaoId));
  }
  return await _coAdminCache.get(rachaoId);
}

function invalidateCoAdminCache(rachaoId) {
  if (rachaoId) _coAdminCache.delete(rachaoId);
  else _coAdminCache.clear();
}

async function hasRachaoPermission(rachao, user, perm) {
  if (!rachao || !user) return false;
  if (rachao.createdBy === user.id) return true;
  const admins = await getCoAdminsCached(rachao.id);
  const coAdmin = admins.find(a => a.playerId === user.id);
  return !!(coAdmin && coAdmin.permissions && coAdmin.permissions[perm]);
}

// Retorna os rachaoIds onde o user tem uma permissão (owner OU co-admin com ela)
async function getRachaosWithPermission(user, perm) {
  if (!user) return [];
  const rachaos = await apiGetRachaos();
  const results = [];
  for (const r of rachaos) {
    if (r.createdBy === user.id) { results.push(r.id); continue; }
    const admins = await getCoAdminsCached(r.id);
    const coAdmin = admins.find(a => a.playerId === user.id);
    if (coAdmin && coAdmin.permissions && coAdmin.permissions[perm]) results.push(r.id);
  }
  return results;
}

async function apiManageCoAdmin(action, { rachaoId, playerId, userId, permissions }) {
  const url = `${SUPABASE_URL}/functions/v1/manage-coadmin`;
  const body = { action, rachao_id: rachaoId, player_id: playerId, user_id: userId };
  if (permissions) body.permissions = permissions;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Erro ao gerenciar co-admin');
  invalidateCoAdminCache(rachaoId);
  return json;
}

// ===== FANTASY =====
async function apiGetFantasyTeams(rachaoId, userId) {
  let query = initSupabase().from('fantasy_teams').select('*');
  if (rachaoId) query = query.eq('rachao_id', rachaoId);
  if (userId) query = query.eq('user_id', userId);
  const { data } = await query;
  return (data || []).map(t => ({ ...t, rachaoId: t.rachao_id, userId: t.user_id, slots: t.slots || {} }));
}

async function apiSaveFantasyTeam(team) {
  await initSupabase().from('fantasy_teams').upsert({
    user_id: team.userId, rachao_id: team.rachaoId,
    name: team.name, slots: team.slots, saved_at: new Date().toISOString()
  });
}

async function apiGetFantasyScores(rachaoId) {
  let query = initSupabase().from('fantasy_scores').select('*');
  if (rachaoId) query = query.eq('rachao_id', rachaoId);
  const { data } = await query;
  return (data || []).map(s => ({ ...s, rachaoId: s.rachao_id, userId: s.user_id }));
}

async function apiUpdateFantasyScore(score) {
  await initSupabase().rpc('upsert_fantasy_score', {
    p_user_id: score.userId, p_rachao_id: score.rachaoId,
    p_name: score.name, p_points: score.points,
    p_monthly: score.monthly, p_daily: score.daily
  });
}

// ===== ROTATION =====
async function apiGetRotationState() {
  const { data } = await initSupabase().from('rotation_state').select('state').eq('id', 1).single();
  return data ? data.state : null;
}

async function apiSaveRotationState(state) {
  await initSupabase().from('rotation_state').update({ state }).eq('id', 1);
}

// ===== BLOCKED / RELEASE =====
async function apiGetBlockedPlayers() {
  const { data } = await initSupabase().from('blocked_players').select('player_id');
  return (data || []).map(b => b.player_id);
}

async function apiBlockPlayer(playerId) {
  await initSupabase().from('blocked_players').upsert({ player_id: playerId });
  await initSupabase().from('players').update({ blocked: true }).eq('id', playerId);
}

async function apiUnblockPlayer(playerId) {
  await initSupabase().from('blocked_players').delete().eq('player_id', playerId);
  await initSupabase().from('players').update({ blocked: false }).eq('id', playerId);
}

async function apiGetReleaseRequests() {
  const { data } = await initSupabase().from('release_requests').select('*').order('created_at', { ascending: false });
  return (data || []).map(r => ({ ...r, playerId: r.player_id, timestamp: r.created_at }));
}

async function apiCreateReleaseRequest(playerId, message) {
  const existing = await initSupabase().from('release_requests').select('id').eq('player_id', playerId).maybeSingle();
  if (existing.data) throw new Error('Pedido já enviado');
  await initSupabase().from('release_requests').insert({ player_id: playerId, message: message || '' });
}

async function apiDeleteReleaseRequest(id) {
  await initSupabase().from('release_requests').delete().eq('id', id);
}

// ===== PRIZES =====
async function apiGetPrizes() {
  const { data } = await initSupabase().from('prizes').select('*').eq('id', 1).single();
  return data || { first: 'Isenção de mensalidade', second: '50% de desconto', third: 'Escolhe o time' };
}

async function apiSavePrizes(prizes) {
  await initSupabase().from('prizes').update({ first: prizes.first, second: prizes.second, third: prizes.third }).eq('id', 1);
}

// ===== NOTIFICATIONS =====
async function apiGetNotifications() {
  const { data } = await initSupabase().from('notifications').select('*').order('timestamp', { ascending: false }).limit(50);
  return data || [];
}

async function apiAddNotification(notif) {
  await initSupabase().from('notifications').insert({
    type: notif.type, icon: notif.icon, title: notif.title, text: notif.text
  });
}

// ===== CURRENT USER (sessão local) =====
function apiGetCurrentUser() {
  try { return JSON.parse(localStorage.getItem('rachao_currentUser')); } catch { return null; }
}

function apiSetCurrentUser(user) {
  localStorage.setItem('rachao_currentUser', JSON.stringify(user));
}

function apiLogout() {
  localStorage.removeItem('rachao_currentUser');
  localStorage.removeItem('rachao_proStatus');
}

// ===== PRO / ASSINATURA =====
async function apiGetProStatus(userId) {
  const { data, error } = await initSupabase().rpc('get_pro_status', { p_user_id: userId });
  if (error) throw error;
  // RPC retorna array; pegamos a primeira (única) linha
  const row = Array.isArray(data) ? data[0] : data;
  return row || { is_pro: false };
}

async function apiRedeemCoupon(code, userId) {
  const { data, error } = await initSupabase().rpc('redeem_coupon', { p_code: code, p_user_id: userId });
  if (error) throw error;
  return data || { ok: false, error: 'RPC_FAIL' };
}

async function apiCreateCoupon({ code, type, durationDays, maxUses, expiresAt, description }) {
  const user = apiGetCurrentUser();
  const { data, error } = await initSupabase().rpc('create_coupon', {
    p_code: code,
    p_type: type,
    p_duration_days: durationDays || null,
    p_max_uses: maxUses || null,
    p_expires_at: expiresAt || null,
    p_description: description || null,
    p_created_by: user?.id || null,
  });
  if (error) throw error;
  return data || { ok: false };
}

async function apiListCoupons() {
  const { data, error } = await initSupabase().rpc('list_coupons');
  if (error) throw error;
  return data || [];
}

async function apiDeleteCoupon(id) {
  const { error } = await initSupabase().rpc('delete_coupon', { p_id: id });
  if (error) throw error;
  return { ok: true };
}

// ===== JOGADORES AVULSOS (sessões abertas para pagantes) =====
async function apiUpdateSessionGuestConfig(sessionId, allowGuests, guestFee, guestSlots, neededPositions) {
  const user = apiGetCurrentUser();
  const { data, error } = await initSupabase().rpc('update_session_guest_config', {
    p_session_id: sessionId,
    p_allow_guests: !!allowGuests,
    p_guest_fee: guestFee != null ? Number(guestFee) : null,
    p_guest_slots: guestSlots != null ? parseInt(guestSlots, 10) : null,
    p_caller_id: user?.id || null,
    p_needed_positions: Array.isArray(neededPositions) && neededPositions.length ? neededPositions : null,
  });
  if (error) throw error;
  return data || { ok: false };
}

async function apiListSessionGuests(sessionId) {
  const { data, error } = await initSupabase().rpc('list_session_guests', { p_session_id: sessionId });
  if (error) throw error;
  return data || [];
}

// ===== PUSH (device tokens) =====
async function apiRegisterDeviceToken(playerId, fcmToken, platform) {
  const { data, error } = await initSupabase().rpc('register_device_token', {
    p_player_id: playerId,
    p_fcm_token: fcmToken,
    p_platform: platform,
    p_app_version: (typeof window !== 'undefined' && window.APP_VERSION) || null,
  });
  if (error) throw error;
  return data;
}
window.apiRegisterDeviceToken = apiRegisterDeviceToken;

async function apiUnregisterDeviceToken(fcmToken) {
  if (!fcmToken) return { ok: true };
  const { data, error } = await initSupabase().rpc('unregister_device_token', {
    p_fcm_token: fcmToken,
  });
  if (error) throw error;
  return data;
}
window.apiUnregisterDeviceToken = apiUnregisterDeviceToken;

async function apiCancelSession(sessionId) {
  const user = apiGetCurrentUser();
  const callerId = user?.id || null;
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/cancel-session-with-refunds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ session_id: sessionId, caller_id: callerId }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok && !data?.cancelled) {
    return { ok: false, error: data?.error || 'CANCEL_FAILED' };
  }
  return data;
}

async function apiGetSessionGuestConfig(sessionId) {
  const { data, error } = await initSupabase()
    .from('sessions')
    .select('id, allow_guests, guest_fee, guest_slots, needed_positions')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ===== SEED (via Supabase, verificar se tem dados) =====
async function apiSeedDemo() {
  const { count } = await initSupabase().from('players').select('*', { count: 'exact', head: true });
  if (count > 0) return { message: 'Banco já possui dados' };
  // Seed é feito via SQL no Supabase Dashboard
  return { message: 'Execute supabase/seed.sql no SQL Editor do Supabase' };
}
