// ========== AUTH MODULE ==========

// ===== PHONE INPUT =====
function initPhoneInput() {
  const input = document.getElementById('phone-input');
  input.addEventListener('input', e => {
    let d = e.target.value.replace(/\D/g, '');
    if (d.length > 11) d = d.slice(0, 11);
    e.target.value = formatPhone(d);
  });
  document.getElementById('btn-login').addEventListener('click', handleLogin);
  input.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
}

async function handleLogin() {
  const phone = document.getElementById('phone-input').value.replace(/\D/g, '');
  if (phone.length < 10) { showToast('Digite um número válido'); return; }
  document.getElementById('password-phone').textContent = formatPhone(phone);
  const btn = document.getElementById('btn-login');
  try {
    setLoading(btn, true);
    const result = await apiCheckPhone(phone);
    if (result.exists) {
      document.getElementById('password-title').textContent = 'Digite sua senha';
      document.getElementById('btn-password').textContent = 'ENTRAR';
      document.getElementById('btn-password').onclick = handlePasswordLogin;
    } else {
      navigateTo('register');
      return;
    }
  } catch (err) {
    console.error('Erro ao verificar telefone:', err);
    showToast('Erro de conexão. Tente novamente.');
    return;
  } finally {
    setLoading(btn, false);
  }
  navigateTo('password');
  setTimeout(() => document.querySelector('#page-password .code-digit')?.focus(), 100);
}

// ===== PASSWORD INPUT =====
function initPasswordInputs() {
  document.querySelectorAll('.code-inputs').forEach(group => {
    const digits = group.querySelectorAll('.code-digit');
    digits.forEach((inp, i) => {
      inp.addEventListener('input', e => { if (e.target.value && i < digits.length - 1) digits[i+1].focus(); });
      inp.addEventListener('keydown', e => { if (e.key === 'Backspace' && !e.target.value && i > 0) digits[i-1].focus(); });
    });
  });
  document.getElementById('btn-password').addEventListener('click', handlePasswordLogin);
}

function getPasswordFromInputs(container) {
  return Array.from(container.querySelectorAll('.code-digit')).map(d => d.value).join('');
}

async function handlePasswordLogin() {
  const password = getPasswordFromInputs(document.getElementById('page-password'));
  if (password.length < 6) { showToast('Digite a senha de 6 dígitos'); return; }
  const phone = document.getElementById('phone-input').value.replace(/\D/g, '');
  const btn = document.getElementById('btn-password');
  try {
    setLoading(btn, true);
    const user = await apiLoginWithPassword(phone, password);
    apiSetCurrentUser(user);
    ProManager.syncFromServer(user.id).catch(() => {});
    if (window.Billing) Billing.init(user.id).catch(err => console.warn('[Billing] init falhou:', err));
    if (window.Push) Push.init(user.id).catch(err => console.warn('[Push] init falhou:', err));
    navigateTo('dashboard');
    showToast('Bem-vindo de volta, ' + user.name + '!');
  } catch (err) {
    console.error('Erro no login:', err);
    const msg = err.message || 'Erro de conexão';
    if (msg.includes('Senha incorreta')) showToast('Senha incorreta');
    else if (msg.includes('nao encontrado')) showToast('Usuário não encontrado');
    else showToast(msg);
  } finally {
    setLoading(btn, false);
  }
}

// ===== REGISTER =====
document.getElementById('btn-register').addEventListener('click', async () => {
  const name = document.getElementById('register-name').value.trim().substring(0, 50);
  const position = document.getElementById('register-position').value;
  if (!name) { showToast('Digite seu nome'); return; }
  const password = getPasswordFromInputs(document.getElementById('page-register'));
  if (password.length < 6) { showToast('Crie uma senha de 6 dígitos'); return; }
  const phone = document.getElementById('phone-input').value.replace(/\D/g, '');
  const btn = document.getElementById('btn-register');

  try {
    setLoading(btn, true);
    const newUser = await apiRegisterUser(phone, password, name, position || 'Meia');
    apiSetCurrentUser(newUser);
    ProManager.syncFromServer(newUser.id).catch(() => {});
    if (window.Billing) Billing.init(newUser.id).catch(err => console.warn('[Billing] init falhou:', err));
    if (window.Push) Push.init(newUser.id).catch(err => console.warn('[Push] init falhou:', err));
    navigateTo('dashboard');
    showToast('Conta criada!');
    await apiAddNotification({ type:'purple', icon:'fa-user-plus', title:'Bem-vindo!', text:'Sua conta foi criada.' });
  } catch (err) {
    console.error('Erro no cadastro:', err);
    showToast(err.message || 'Erro ao cadastrar');
  } finally {
    setLoading(btn, false);
  }
});

// ===== PROFILE =====
async function loadProfile() {
  const user = apiGetCurrentUser();
  if (!user) return;
  const fresh = await apiGetPlayerById(user.id).catch(() => user);
  document.getElementById('profile-name').textContent = fresh.name;
  document.getElementById('profile-phone').textContent = formatPhone(fresh.phone);
  document.getElementById('profile-position').textContent = fresh.position;
  document.getElementById('profile-matches').textContent = fresh.matches || 0;
  document.getElementById('profile-goals').textContent = fresh.goals || 0;
  document.getElementById('profile-assists').textContent = fresh.assists || 0;
  document.getElementById('profile-desarmes').textContent = fresh.tackles || 0;

  // Atualiza estado Pro (badge no menu + esconder CTA de upgrade)
  await ProManager.syncFromServer(user.id);
  const status = ProManager.getStatus();
  const proInfoEl = document.getElementById('profile-pro-status');
  if (proInfoEl) {
    if (status.is_lifetime) proInfoEl.textContent = '· Vitalício';
    else if (status.expires_at) proInfoEl.textContent = '· até ' + new Date(status.expires_at).toLocaleDateString('pt-BR');
    else proInfoEl.textContent = '';
  }
}

function logout() {
  apiLogout();
  if (window.Billing) Billing.logout().catch(() => {});
  if (window.Push) Push.logout().catch(() => {});
  navigateTo('login');
  showToast('Até a próxima!');
}
