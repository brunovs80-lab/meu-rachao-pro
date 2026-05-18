// ========== SERVIDOR DEV + ADMIN PANEL ==========
require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;
const BIND = process.env.ADMIN_BIND || '127.0.0.1';
const BCRYPT_ROUNDS = 10;
const SESSION_TTL_MS = 60 * 60 * 1000; // 1h

app.use(express.json());

// --- Supabase clients ---
// `anon` = usado pelos endpoints publicos do app (mesmo que o front).
// `admin` = usa SERVICE_ROLE_KEY, bypassa RLS, exclusivo para /admin/api/*.

let supabaseAnon, supabaseAdmin;

function getEnvFromConfig(varName) {
  const fs = require('fs');
  const configPath = path.join(__dirname, '..', 'js', 'config.js');
  if (!fs.existsSync(configPath)) return null;
  const content = fs.readFileSync(configPath, 'utf-8');
  const re = new RegExp(`${varName}\\s*=\\s*'([^']+)'`);
  const m = content.match(re);
  return m && m[1];
}

function getSupabase() {
  if (!supabaseAnon) {
    const url = process.env.SUPABASE_URL || getEnvFromConfig('SUPABASE_URL');
    const key = process.env.SUPABASE_ANON_KEY || getEnvFromConfig('SUPABASE_ANON_KEY');
    if (!url || !key) throw new Error('Supabase URL/ANON_KEY nao configurada');
    supabaseAnon = createClient(url, key);
  }
  return supabaseAnon;
}

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    const url = process.env.SUPABASE_URL || getEnvFromConfig('SUPABASE_URL');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) throw new Error('SUPABASE_URL nao configurada');
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY nao configurada no .env');
    supabaseAdmin = createClient(url, key, { auth: { persistSession: false } });
  }
  return supabaseAdmin;
}

// ========== AUTH ENDPOINTS (player app) ==========

app.post('/api/auth/check-phone', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ error: 'Telefone invalido' });
    }
    const cleanPhone = phone.replace(/\D/g, '');
    const { data } = await getSupabase().from('players').select('id, name, position, is_admin').eq('phone', cleanPhone).maybeSingle();
    if (data) return res.json({ exists: true, id: data.id, name: data.name });
    return res.json({ exists: false });
  } catch (err) {
    console.error('check-phone error:', err);
    return res.status(500).json({ error: 'Erro ao verificar telefone' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'Telefone e senha obrigatorios' });
    const cleanPhone = phone.replace(/\D/g, '');
    // service_role: precisa ler password pra bcrypt.compare. Anon não pode mais (REVOKE column-level).
    const sb = getSupabaseAdmin();
    const { data } = await sb.from('players').select('*').eq('phone', cleanPhone).maybeSingle();
    if (!data) return res.status(401).json({ error: 'Usuario nao encontrado' });

    let passwordValid = false;
    if (data.password && data.password.startsWith('$2')) {
      passwordValid = await bcrypt.compare(password, data.password);
    } else {
      passwordValid = data.password === password;
      if (passwordValid) {
        const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await sb.from('players').update({ password: hash }).eq('id', data.id);
      }
    }
    if (!passwordValid) return res.status(401).json({ error: 'Senha incorreta' });

    const { password: _, ...user } = data;
    return res.json({ success: true, user: { ...user, isAdmin: user.is_admin, cleanSheets: user.clean_sheets } });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { phone, password, name, position } = req.body;
    if (!phone || !password || !name) return res.status(400).json({ error: 'Campos obrigatorios: phone, password, name' });
    if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 digitos' });

    const cleanPhone = phone.replace(/\D/g, '');
    const { data: existing } = await getSupabase().from('players').select('id').eq('phone', cleanPhone).maybeSingle();
    if (existing) return res.status(409).json({ error: 'Telefone ja cadastrado' });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { count } = await getSupabase().from('players').select('*', { count: 'exact', head: true });
    const isFirst = count === 0;

    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const { data, error } = await getSupabase().from('players').insert({
      id,
      name: name.substring(0, 50),
      phone: cleanPhone,
      position: position || 'Meia',
      is_admin: isFirst,
      password: hash,
    }).select().single();

    if (error) throw error;
    const { password: _, ...user } = data;
    return res.json({ success: true, user: { ...user, isAdmin: user.is_admin, cleanSheets: user.clean_sheets } });
  } catch (err) {
    console.error('register error:', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Telefone ja cadastrado' });
    return res.status(500).json({ error: 'Erro ao cadastrar' });
  }
});

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;
    if (!userId || !oldPassword || !newPassword) return res.status(400).json({ error: 'Campos obrigatorios' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 digitos' });

    // service_role: precisa ler/escrever password. Anon não pode mais (REVOKE column-level).
    const sb = getSupabaseAdmin();
    const { data } = await sb.from('players').select('password').eq('id', userId).single();
    if (!data) return res.status(404).json({ error: 'Usuario nao encontrado' });

    let oldValid = false;
    if (data.password && data.password.startsWith('$2')) {
      oldValid = await bcrypt.compare(oldPassword, data.password);
    } else {
      oldValid = data.password === oldPassword;
    }
    if (!oldValid) return res.status(401).json({ error: 'Senha atual incorreta' });

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await sb.from('players').update({ password: hash }).eq('id', userId);
    return res.json({ success: true });
  } catch (err) {
    console.error('change-password error:', err);
    return res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

// ========== ADMIN PANEL ==========
//
// Auth via cookie HttpOnly. Sessao em memoria (some no restart, ok pra dev local).
// Toda rota /admin/api/* (exceto login) exige cookie valido.
// Toda acao destrutiva grava em admin_audit_log.

const sessions = new Map(); // token -> { expiresAt }

function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie || '';
  for (const part of h.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(v.join('='));
  }
  return out;
}

function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getActiveSession(req) {
  const token = parseCookies(req).admin_session;
  if (!token) return null;
  const sess = sessions.get(token);
  if (!sess) return null;
  if (sess.expiresAt < Date.now()) { sessions.delete(token); return null; }
  return token;
}

function requireAdmin(req, res, next) {
  const token = getActiveSession(req);
  if (!token) return res.status(401).json({ error: 'Nao autenticado' });
  req.adminSession = token;
  // renova TTL a cada request autenticado
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });
  next();
}

async function audit(req, action, targetType, targetId, details = {}) {
  try {
    await getSupabaseAdmin().from('admin_audit_log').insert({
      action,
      target_type: targetType,
      target_id: targetId ? String(targetId) : null,
      details,
      admin_session: req.adminSession ? req.adminSession.slice(0, 8) : null,
      ip_addr: req.ip || req.socket?.remoteAddress || null,
    });
  } catch (e) {
    console.warn('[audit] falhou:', e.message);
  }
}

// ----- AUTH -----

app.post('/admin/api/login', async (req, res) => {
  const { password } = req.body || {};
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) return res.status(500).json({ error: 'ADMIN_PASSWORD nao configurada no .env' });
  if (!password || password !== adminPass) {
    // pequeno delay anti brute-force
    await new Promise(r => setTimeout(r, 800));
    return res.status(401).json({ error: 'Senha incorreta' });
  }
  const token = newSessionToken();
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });
  res.setHeader('Set-Cookie', `admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`);
  return res.json({ success: true });
});

app.post('/admin/api/logout', (req, res) => {
  const token = parseCookies(req).admin_session;
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  return res.json({ success: true });
});

app.get('/admin/api/me', (req, res) => {
  const token = getActiveSession(req);
  return res.json({ authenticated: !!token });
});

// ----- METRICS -----

app.get('/admin/api/metrics', requireAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const [usersActive, usersDeleted, proAll, deviceTokens, txnsThisMonth, rachaos, sessionsOpen] = await Promise.all([
      sb.from('players').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      sb.from('players').select('*', { count: 'exact', head: true }).not('deleted_at', 'is', null),
      sb.from('pro_subscriptions').select('plan_type, source, is_lifetime, expires_at'),
      sb.from('device_tokens').select('platform', { count: 'exact' }),
      sb.from('pix_transactions').select('amount').eq('status', 'paid').gte('paid_at', monthStart.toISOString()),
      sb.from('rachaos').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      sb.from('sessions').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    ]);

    const proRows = proAll.data || [];
    const now = Date.now();
    const proActive = proRows.filter(p => p.is_lifetime || (p.expires_at && new Date(p.expires_at).getTime() > now));
    const proBySource = proActive.reduce((acc, p) => { acc[p.source] = (acc[p.source] || 0) + 1; return acc; }, {});
    const proByPlan = proActive.reduce((acc, p) => { acc[p.plan_type] = (acc[p.plan_type] || 0) + 1; return acc; }, {});
    const revenueMonth = (txnsThisMonth.data || []).reduce((s, t) => s + Number(t.amount || 0), 0);

    return res.json({
      users: {
        active: usersActive.count || 0,
        deleted: usersDeleted.count || 0,
      },
      pro: {
        active: proActive.length,
        bySource: proBySource,
        byPlan: proByPlan,
      },
      pushTokens: deviceTokens.count || 0,
      revenue: {
        currentMonth: Number(revenueMonth.toFixed(2)),
        currency: 'BRL',
      },
      rachaos: { active: rachaos.count || 0 },
      sessions: { open: sessionsOpen.count || 0 },
    });
  } catch (err) {
    console.error('[admin/metrics]', err);
    return res.status(500).json({ error: err.message || 'Erro ao buscar metricas' });
  }
});

// ----- USERS -----

app.get('/admin/api/users', requireAdmin, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const includeDeleted = req.query.includeDeleted === '1';

    let query = getSupabaseAdmin()
      .from('players')
      .select('id, name, phone, position, is_admin, blocked, deleted_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!includeDeleted) query = query.is('deleted_at', null);

    if (q) {
      const safe = q.replace(/[%,()]/g, '');
      query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return res.json({ users: data || [] });
  } catch (err) {
    console.error('[admin/users]', err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/admin/api/users/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const sb = getSupabaseAdmin();
    const [user, sub, devices, parts] = await Promise.all([
      sb.from('players').select('*').eq('id', id).maybeSingle(),
      sb.from('pro_subscriptions').select('*').eq('user_id', id).maybeSingle(),
      sb.from('device_tokens').select('id, platform, app_version, created_at, updated_at').eq('player_id', id),
      sb.from('rachao_participants').select('rachao_id, joined_at').eq('player_id', id),
    ]);
    if (!user.data) return res.status(404).json({ error: 'Usuario nao encontrado' });
    const { password, ...safeUser } = user.data;
    return res.json({
      user: safeUser,
      pro: sub.data || null,
      devices: devices.data || [],
      rachaos: parts.data || [],
    });
  } catch (err) {
    console.error('[admin/users/:id]', err);
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/admin/api/users/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const sb = getSupabaseAdmin();
    const { data: user } = await sb.from('players').select('name, deleted_at').eq('id', id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (user.deleted_at) return res.status(400).json({ error: 'Ja excluido' });

    const { error } = await sb.from('players').update({
      deleted_at: new Date().toISOString(),
      name: 'Jogador removido',
      phone: null,
    }).eq('id', id);
    if (error) throw error;
    await audit(req, 'soft_delete_user', 'user', id, { name: user.name });
    return res.json({ success: true });
  } catch (err) {
    console.error('[admin/users delete]', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/users/:id/unblock', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { error } = await getSupabaseAdmin().from('players').update({ blocked: false }).eq('id', id);
    if (error) throw error;
    await audit(req, 'unblock_user', 'user', id, {});
    return res.json({ success: true });
  } catch (err) {
    console.error('[admin/users unblock]', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/users/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { newPassword } = req.body || {};
    if (!newPassword || !/^\d{6}$/.test(newPassword)) {
      return res.status(400).json({ error: 'Senha deve ter exatamente 6 dígitos' });
    }
    const sb = getSupabaseAdmin();
    const { data: user } = await sb.from('players').select('id, name, deleted_at').eq('id', id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (user.deleted_at) return res.status(400).json({ error: 'Usuario excluido' });

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const { error } = await sb.from('players').update({ password: hash }).eq('id', id);
    if (error) throw error;
    await audit(req, 'reset_password', 'user', id, { name: user.name });
    return res.json({ success: true });
  } catch (err) {
    console.error('[admin/users reset-password]', err);
    return res.status(500).json({ error: err.message });
  }
});

// ----- COUPONS -----

app.get('/admin/api/coupons', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('pro_coupons')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ coupons: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/coupons', requireAdmin, async (req, res) => {
  try {
    const { code, type, durationDays, maxUses, expiresAt, description } = req.body || {};
    if (!code || !type) return res.status(400).json({ error: 'code e type obrigatorios' });
    if (!['trial', 'lifetime'].includes(type)) return res.status(400).json({ error: "type deve ser 'trial' ou 'lifetime'" });
    if (type === 'trial' && (!durationDays || Number(durationDays) < 1)) {
      return res.status(400).json({ error: 'trial precisa durationDays >= 1' });
    }

    const insert = {
      code: String(code).trim().toUpperCase(),
      type,
      duration_days: type === 'trial' ? Number(durationDays) : null,
      max_uses: maxUses ? Number(maxUses) : null,
      expires_at: expiresAt || null,
      description: description || null,
    };
    const { data, error } = await getSupabaseAdmin().from('pro_coupons').insert(insert).select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Codigo ja existe' });
      throw error;
    }
    await audit(req, 'create_coupon', 'coupon', data.id, { code: data.code, type, durationDays, maxUses });
    return res.json({ coupon: data });
  } catch (err) {
    console.error('[admin/coupons create]', err);
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/admin/api/coupons/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const sb = getSupabaseAdmin();
    const { data: cup } = await sb.from('pro_coupons').select('code').eq('id', id).maybeSingle();
    const { error } = await sb.from('pro_coupons').delete().eq('id', id);
    if (error) throw error;
    await audit(req, 'delete_coupon', 'coupon', id, { code: cup?.code });
    return res.json({ success: true });
  } catch (err) {
    console.error('[admin/coupons delete]', err);
    return res.status(500).json({ error: err.message });
  }
});

// ----- PRO SUBSCRIPTIONS -----

app.get('/admin/api/subscriptions', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('pro_subscriptions')
      .select('user_id, source, plan_type, expires_at, is_lifetime, platform, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    // hidrata nome
    const ids = (data || []).map(d => d.user_id);
    let names = {};
    if (ids.length) {
      const { data: players } = await getSupabaseAdmin().from('players').select('id, name, phone').in('id', ids);
      names = Object.fromEntries((players || []).map(p => [p.id, p]));
    }
    const enriched = (data || []).map(s => ({
      ...s,
      player_name: names[s.user_id]?.name || null,
      player_phone: names[s.user_id]?.phone || null,
    }));
    return res.json({ subscriptions: enriched });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/subscriptions/grant', requireAdmin, async (req, res) => {
  try {
    const { userId, planType, expiresAt } = req.body || {};
    if (!userId || !planType) return res.status(400).json({ error: 'userId e planType obrigatorios' });
    if (!['monthly', 'yearly', 'lifetime', 'trial'].includes(planType)) {
      return res.status(400).json({ error: 'planType invalido' });
    }
    const isLifetime = planType === 'lifetime';
    const insert = {
      user_id: userId,
      source: 'admin',
      plan_type: planType,
      expires_at: isLifetime ? null : (expiresAt || null),
      is_lifetime: isLifetime,
      platform: 'admin',
    };
    const { data, error } = await getSupabaseAdmin()
      .from('pro_subscriptions')
      .upsert(insert, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;
    await audit(req, 'grant_pro', 'user', userId, { planType, expiresAt, isLifetime });
    return res.json({ subscription: data });
  } catch (err) {
    console.error('[admin/subs grant]', err);
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/admin/api/subscriptions/:userId', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;
    const { error } = await getSupabaseAdmin().from('pro_subscriptions').delete().eq('user_id', userId);
    if (error) throw error;
    await audit(req, 'revoke_pro', 'user', userId, {});
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ----- AUDIT -----

app.get('/admin/api/audit', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const { data, error } = await getSupabaseAdmin()
      .from('admin_audit_log')
      .select('*')
      .order('ts', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return res.json({ logs: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ----- SITE CONFIG (landing toggle) -----

const SITE_CONFIG_FIELDS = 'landing_enabled, maintenance_message, play_link_enabled, pwa_link_enabled, updated_at';

app.get('/admin/api/site-config', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('site_config')
      .select(SITE_CONFIG_FIELDS)
      .eq('id', true)
      .maybeSingle();
    if (error) throw error;
    return res.json(data || { landing_enabled: true, maintenance_message: '', play_link_enabled: true, pwa_link_enabled: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/site-config', requireAdmin, async (req, res) => {
  try {
    const { landing_enabled, maintenance_message, play_link_enabled, pwa_link_enabled } = req.body || {};
    if (typeof landing_enabled !== 'boolean') return res.status(400).json({ error: 'landing_enabled deve ser boolean' });
    if (typeof play_link_enabled !== 'boolean') return res.status(400).json({ error: 'play_link_enabled deve ser boolean' });
    if (typeof pwa_link_enabled !== 'boolean') return res.status(400).json({ error: 'pwa_link_enabled deve ser boolean' });
    const msg = typeof maintenance_message === 'string' ? maintenance_message.slice(0, 500) : '';
    const { data, error } = await getSupabaseAdmin()
      .from('site_config')
      .update({ landing_enabled, maintenance_message: msg, play_link_enabled, pwa_link_enabled, updated_at: new Date().toISOString() })
      .eq('id', true)
      .select(SITE_CONFIG_FIELDS)
      .single();
    if (error) throw error;
    await audit(req, 'site_config_update', 'site_config', 'main', {
      landing_enabled, play_link_enabled, pwa_link_enabled, maintenance_message: msg,
    });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ----- ADMIN HTML -----

app.get(['/admin', '/admin/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ========== STATIC + SPA FALLBACK ==========

app.use(express.static(path.join(__dirname, '..')));

app.use((req, res) => {
  // Nao retorna index.html pra rotas /admin/api/* (ja seria 404 acima, mas seguranca extra)
  if (req.path.startsWith('/admin')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, BIND, () => {
  console.log(`App rodando em http://${BIND}:${PORT}`);
  console.log(`Admin panel em http://${BIND}:${PORT}/admin`);
  if (!process.env.ADMIN_PASSWORD) console.warn('!! ADMIN_PASSWORD nao definida — painel admin nao funciona');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) console.warn('!! SUPABASE_SERVICE_ROLE_KEY nao definida — painel admin nao funciona');
});
