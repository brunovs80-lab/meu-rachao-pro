// ========== SERVIDOR COM AUTH API ==========
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const BCRYPT_ROUNDS = 10;

app.use(express.json());

// --- Supabase client (server-side, usa service role se disponivel) ---
let supabase;
function getSupabase() {
  if (!supabase) {
    // Tenta carregar config do client-side para reutilizar URL/key
    const fs = require('fs');
    const configPath = path.join(__dirname, '..', 'js', 'config.js');
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const urlMatch = configContent.match(/SUPABASE_URL\s*=\s*'([^']+)'/);
    const keyMatch = configContent.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/);
    const url = process.env.SUPABASE_URL || (urlMatch && urlMatch[1]);
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || (keyMatch && keyMatch[1]);
    if (!url || !key) throw new Error('Supabase URL/Key nao configurada');
    supabase = createClient(url, key);
  }
  return supabase;
}

// ========== AUTH ENDPOINTS ==========

// POST /api/auth/check-phone - verifica se telefone ja existe
app.post('/api/auth/check-phone', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ error: 'Telefone invalido' });
    }
    const cleanPhone = phone.replace(/\D/g, '');
    const { data } = await getSupabase().from('players').select('id, name, position, is_admin').eq('phone', cleanPhone).maybeSingle();
    if (data) {
      return res.json({ exists: true, id: data.id, name: data.name });
    }
    return res.json({ exists: false });
  } catch (err) {
    console.error('check-phone error:', err);
    return res.status(500).json({ error: 'Erro ao verificar telefone' });
  }
});

// POST /api/auth/login - login com senha (bcrypt)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Telefone e senha obrigatorios' });
    }
    const cleanPhone = phone.replace(/\D/g, '');
    const { data } = await getSupabase().from('players').select('*').eq('phone', cleanPhone).maybeSingle();
    if (!data) {
      return res.status(401).json({ error: 'Usuario nao encontrado' });
    }

    // Verificar senha - suporta hash bcrypt e senha legada (plain text)
    let passwordValid = false;
    if (data.password && data.password.startsWith('$2')) {
      // Senha ja esta com hash bcrypt
      passwordValid = await bcrypt.compare(password, data.password);
    } else {
      // Senha legada em texto plano - comparar e migrar para hash
      passwordValid = data.password === password;
      if (passwordValid) {
        const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await getSupabase().from('players').update({ password: hash }).eq('id', data.id);
      }
    }

    if (!passwordValid) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    // Retornar usuario SEM a senha
    const { password: _, ...user } = data;
    return res.json({
      success: true,
      user: {
        ...user,
        isAdmin: user.is_admin,
        cleanSheets: user.clean_sheets
      }
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// POST /api/auth/register - cadastro com hash de senha
app.post('/api/auth/register', async (req, res) => {
  try {
    const { phone, password, name, position } = req.body;
    if (!phone || !password || !name) {
      return res.status(400).json({ error: 'Campos obrigatorios: phone, password, name' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 6 digitos' });
    }

    const cleanPhone = phone.replace(/\D/g, '');

    // Verificar se ja existe
    const { data: existing } = await getSupabase().from('players').select('id').eq('phone', cleanPhone).maybeSingle();
    if (existing) {
      return res.status(409).json({ error: 'Telefone ja cadastrado' });
    }

    // Hash da senha
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Verificar se e o primeiro usuario (admin)
    const { count } = await getSupabase().from('players').select('*', { count: 'exact', head: true });
    const isFirst = count === 0;

    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const { data, error } = await getSupabase().from('players').insert({
      id,
      name: name.substring(0, 50),
      phone: cleanPhone,
      position: position || 'Meia',
      is_admin: isFirst,
      password: hash
    }).select().single();

    if (error) throw error;

    // Retornar usuario SEM a senha
    const { password: _, ...user } = data;
    return res.json({
      success: true,
      user: {
        ...user,
        isAdmin: user.is_admin,
        cleanSheets: user.clean_sheets
      }
    });
  } catch (err) {
    console.error('register error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Telefone ja cadastrado' });
    }
    return res.status(500).json({ error: 'Erro ao cadastrar' });
  }
});

// POST /api/auth/change-password - alterar senha
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;
    if (!userId || !oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Campos obrigatorios' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 6 digitos' });
    }

    const { data } = await getSupabase().from('players').select('password').eq('id', userId).single();
    if (!data) return res.status(404).json({ error: 'Usuario nao encontrado' });

    let oldValid = false;
    if (data.password && data.password.startsWith('$2')) {
      oldValid = await bcrypt.compare(oldPassword, data.password);
    } else {
      oldValid = data.password === oldPassword;
    }
    if (!oldValid) return res.status(401).json({ error: 'Senha atual incorreta' });

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await getSupabase().from('players').update({ password: hash }).eq('id', userId);

    return res.json({ success: true });
  } catch (err) {
    console.error('change-password error:', err);
    return res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

// Servir arquivos estaticos da raiz do projeto
app.use(express.static(path.join(__dirname, '..')));

// Fallback para SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Meu Rachao Pro rodando em http://localhost:${PORT}`);
  console.log('Auth API: /api/auth/*');
  console.log('Banco de dados: Supabase (cloud)');
});
