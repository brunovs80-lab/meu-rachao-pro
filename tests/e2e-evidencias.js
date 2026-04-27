/**
 * Testes E2E - Evidências visuais (continuação a partir do teste 30)
 * Screenshots em JPEG com qualidade reduzida para otimizar espaço
 *
 * Execução: node tests/e2e-evidencias.js
 * Pré-requisito: servidor rodando em localhost:3000
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
const EVIDENCE_DIR = path.join(__dirname, 'evidencias');
const QUALITY = 45; // JPEG quality (0-100) - baixa para otimizar espaço

// Dados de teste - usuário admin existente no Supabase
const TEST_PHONE = '11999990001'; // Carlos (admin)
const TEST_PASSWORD = '123456';

let browser, page;
let testNum = 30;

async function screenshot(name) {
  const filename = `${String(testNum).padStart(2, '0')}_${name}.jpg`;
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, filename),
    type: 'jpeg',
    quality: QUALITY,
    fullPage: false
  });
  console.log(`  ✓ [${testNum}] ${filename}`);
  testNum++;
}

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForNav(timeout = 3000) {
  await wait(timeout);
}

async function clickAndWait(selector, ms = 2000) {
  await page.click(selector);
  await wait(ms);
}

async function navigateToPage(pageName) {
  await page.evaluate((p) => navigateTo(p), pageName);
  await wait(1500);
}

async function typePhone(phone) {
  const input = await page.$('#phone-input');
  await input.click({ clickCount: 3 });
  await input.type(phone, { delay: 30 });
}

async function typePassword(password) {
  const digits = await page.$$('#page-password .code-digit');
  for (let i = 0; i < password.length && i < digits.length; i++) {
    await digits[i].type(password[i], { delay: 30 });
  }
}

async function ensureLoggedIn() {
  // Injeta sessão de admin via localStorage para pular o fluxo de login
  const isLogged = await page.evaluate(() => {
    const u = localStorage.getItem('rachao_currentUser');
    return u && u !== 'null';
  });
  if (!isLogged) {
    // Fazer login real
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await wait(1500);
    await typePhone(TEST_PHONE);
    await page.click('#btn-login');
    await wait(2000);
    // Tela de senha
    await typePassword(TEST_PASSWORD);
    await page.click('#btn-password');
    await wait(3000);
  }
}

// ===================== TESTES =====================

async function test_sorteio_times() {
  console.log('\n--- SORTEIO DE TIMES ---');

  // Abrir o rachão
  await navigateToPage('matches');
  await wait(2000);
  await screenshot('lista_rachaos');

  // Clicar no primeiro rachão
  const rachaoCard = await page.$('.match-list-item');
  if (rachaoCard) {
    await rachaoCard.click();
    await wait(2500);
    await screenshot('detalhe_rachao_jogo');
  }

  // Verificar se tem sessão aberta e botão de sorteio
  const btnDraw = await page.$('#btn-draw-teams');
  if (btnDraw) {
    const isVisible = await page.evaluate(el => el.offsetParent !== null, btnDraw);
    if (isVisible) {
      await btnDraw.click();
      await wait(3000);
      await screenshot('times_sorteados');
    }
  }

  // Verificar resultado do sorteio
  const teamsResult = await page.$('#teams-result');
  if (teamsResult) {
    const isVisible = await page.evaluate(el => el.style.display !== 'none', teamsResult);
    if (isVisible) {
      await screenshot('resultado_sorteio_times');
    }
  }
}

async function test_rotacao_partida() {
  console.log('\n--- ROTAÇÃO DE PARTIDA ---');

  const btnRotation = await page.$('#btn-start-rotation');
  if (btnRotation) {
    const isVisible = await page.evaluate(el => el.offsetParent !== null, btnRotation);
    if (isVisible) {
      await btnRotation.click();
      await wait(2000);
      await screenshot('rotacao_iniciada');
    }
  }

  // Tentar acessar página de rotação diretamente
  await navigateToPage('rotation');
  await wait(2000);
  await screenshot('tela_rotacao');

  // Verificar se tem estado de rotação ativo
  const rotActive = await page.$('#rotation-active');
  if (rotActive) {
    const display = await page.evaluate(el => el.style.display, rotActive);
    if (display !== 'none') {
      await screenshot('rotacao_ativa_placar');
    }
  }

  // Estado vazio da rotação
  const rotEmpty = await page.$('#rotation-empty');
  if (rotEmpty) {
    const display = await page.evaluate(el => el.style.display, rotEmpty);
    if (display !== 'none') {
      await screenshot('rotacao_sem_partida');
    }
  }
}

async function test_entrar_rachao_codigo() {
  console.log('\n--- ENTRAR NO RACHÃO POR CÓDIGO ---');

  await navigateToPage('match-join');
  await wait(1500);
  await screenshot('tela_entrar_codigo');

  // Digitar código inválido
  const joinInput = await page.$('#join-code');
  if (joinInput) {
    await joinInput.type('XXXXXX', { delay: 50 });
    await screenshot('codigo_invalido_digitado');

    const btnJoin = await page.$('#btn-join-rachao');
    if (btnJoin) {
      await btnJoin.click();
      await wait(2000);
      await screenshot('erro_codigo_invalido');
    }

    // Limpar e testar código curto
    await joinInput.click({ clickCount: 3 });
    await joinInput.type('ABC', { delay: 50 });
    if (await page.$('#btn-join-rachao')) {
      await page.click('#btn-join-rachao');
      await wait(1500);
      await screenshot('erro_codigo_curto');
    }
  }
}

async function test_pagamentos() {
  console.log('\n--- PAGAMENTOS ---');

  await navigateToPage('payments');
  await wait(2500);
  await screenshot('tela_pagamentos');
}

async function test_stats_ranking() {
  console.log('\n--- STATS & RANKING ---');

  await navigateToPage('stats');
  await wait(2000);
  await screenshot('stats_ranking_geral');

  // Tabs de stats
  const statsTabs = await page.$$('#page-stats .tab-btn, #page-stats [onclick*="renderStatsTab"]');
  for (const tab of statsTabs) {
    const tabText = await page.evaluate(el => el.textContent, tab);
    if (tabText.includes('Artilharia') || tabText.includes('artilharia')) {
      await tab.click();
      await wait(1500);
      await screenshot('stats_artilharia');
    }
    if (tabText.includes('Assist') || tabText.includes('assist')) {
      await tab.click();
      await wait(1500);
      await screenshot('stats_assistencias');
    }
    if (tabText.includes('Desarme') || tabText.includes('desarme')) {
      await tab.click();
      await wait(1500);
      await screenshot('stats_desarmes');
    }
  }
}

async function test_registrar_stats_jogador() {
  console.log('\n--- REGISTRAR STATS (JOGADOR) ---');

  await navigateToPage('register-stats');
  await wait(2000);
  await screenshot('tela_registrar_stats');

  // Preencher stats simulados
  const goalsInput = await page.$('[id^="goals-"]');
  if (goalsInput) {
    await goalsInput.click({ clickCount: 3 });
    await goalsInput.type('2', { delay: 50 });
    const assistsInput = await page.$('[id^="assists-"]');
    if (assistsInput) {
      await assistsInput.click({ clickCount: 3 });
      await assistsInput.type('1', { delay: 50 });
    }
    await screenshot('stats_preenchidos');
  }
}

async function test_jogadores_lista() {
  console.log('\n--- JOGADORES ---');

  await navigateToPage('players');
  await wait(2000);
  await screenshot('lista_jogadores_completa');
}

async function test_adicionar_jogador() {
  console.log('\n--- ADICIONAR JOGADOR ---');

  await navigateToPage('player-add');
  await wait(1500);
  await screenshot('tela_adicionar_jogador');
}

async function test_fantasy() {
  console.log('\n--- FANTASY LEAGUE ---');

  await navigateToPage('fantasy');
  await wait(2000);
  await screenshot('tela_fantasy');

  // Verificar sub-tabs do fantasy
  const fantasyTabs = await page.$$('#page-fantasy .tab-btn');
  for (const tab of fantasyTabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text.includes('Time') || text.includes('time')) {
      await tab.click();
      await wait(1500);
      await screenshot('fantasy_meu_time');
    }
    if (text.includes('Ranking') || text.includes('ranking')) {
      await tab.click();
      await wait(1500);
      await screenshot('fantasy_ranking');
    }
  }
}

async function test_perfil_edicao() {
  console.log('\n--- PERFIL E EDIÇÃO ---');

  await navigateToPage('profile');
  await wait(1500);
  await screenshot('perfil_completo');
}

async function test_admin_payments() {
  console.log('\n--- ADMIN - PAGAMENTOS ---');

  await navigateToPage('admin-payments');
  await wait(2000);
  await screenshot('admin_pagamentos');
}

async function test_dashboard_vazio() {
  console.log('\n--- DASHBOARD ---');

  await navigateToPage('dashboard');
  await wait(2500);
  await screenshot('dashboard_completo');
}

async function test_tela_senha() {
  console.log('\n--- TELA DE SENHA ---');

  // Salvar estado atual
  const currentUser = await page.evaluate(() => localStorage.getItem('rachao_currentUser'));

  // Simular fluxo de login para capturar tela de senha
  await page.evaluate(() => localStorage.removeItem('rachao_currentUser'));
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await wait(1500);

  await typePhone(TEST_PHONE);
  await page.click('#btn-login');
  await wait(2000);
  await screenshot('tela_senha_login');

  // Digitar senha parcial
  const digits = await page.$$('#page-password .code-digit');
  if (digits.length >= 3) {
    await digits[0].type('1', { delay: 50 });
    await digits[1].type('2', { delay: 50 });
    await digits[2].type('3', { delay: 50 });
    await screenshot('senha_parcial');
  }

  // Restaurar sessão
  if (currentUser) {
    await page.evaluate((u) => localStorage.setItem('rachao_currentUser', u), currentUser);
    await page.goto(BASE_URL + '#dashboard', { waitUntil: 'networkidle2' });
    await wait(1500);
  }
}

async function test_configuracoes_detalhadas() {
  console.log('\n--- CONFIGURAÇÕES DETALHADAS ---');

  await navigateToPage('settings');
  await wait(1500);
  await screenshot('configuracoes_completas');
}

async function test_logout() {
  console.log('\n--- LOGOUT ---');

  await navigateToPage('settings');
  await wait(1000);

  // Capturar tela antes do logout
  await screenshot('antes_logout');

  // Clicar no botão de logout
  const logoutBtn = await page.$('#btn-logout, [onclick*="logout"], [onclick*="Logout"]');
  if (logoutBtn) {
    await logoutBtn.click();
    await wait(2000);
    await screenshot('apos_logout');
  }
}

async function test_menu_partida() {
  console.log('\n--- MENU DA PARTIDA ---');

  // Relogar se necessário
  await ensureLoggedIn();
  await wait(1000);

  // Abrir rachão detail
  await navigateToPage('matches');
  await wait(2000);
  const rachaoCard = await page.$('.match-list-item');
  if (rachaoCard) {
    await rachaoCard.click();
    await wait(2500);
  }

  // Menu 3 pontos
  const menuBtn = await page.$('[onclick*="showMatchMenu"], .match-menu-btn, #btn-match-menu');
  if (menuBtn) {
    await menuBtn.click();
    await wait(1000);
    await screenshot('menu_partida_opcoes');
  }
}

async function test_compartilhar_codigo() {
  console.log('\n--- COMPARTILHAR CÓDIGO ---');

  // Já na tela do rachão detail
  const shareBtn = await page.$('[onclick*="shareRachaoCode"], #btn-share-code');
  if (shareBtn) {
    await shareBtn.click();
    await wait(1500);
    await screenshot('compartilhar_codigo');
  }
}

async function test_historico_jogos() {
  console.log('\n--- HISTÓRICO DE JOGOS ---');

  // Scroll down para ver histórico na tela do rachão detail
  await page.evaluate(() => {
    const el = document.getElementById('sessions-history-list');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  });
  await wait(1000);
  await screenshot('historico_jogos');
}

async function test_tab_financeiro_detalhe() {
  console.log('\n--- FINANCEIRO DETALHADO ---');

  // Na tela do rachão, trocar para tab financeiro
  const financeTab = await page.$('[onclick*="finance"], [data-tab="finance"]');
  if (financeTab) {
    await financeTab.click();
    await wait(2000);
    await screenshot('financeiro_detalhado');

    // Scroll para ver Pix
    await page.evaluate(() => {
      const el = document.getElementById('finance-pix-key');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });
    await wait(500);
    await screenshot('financeiro_pix');
  }
}

async function test_aba_membros() {
  console.log('\n--- ABA MEMBROS ---');

  const membersTab = await page.$('[onclick*="members"], [data-tab="members"]');
  if (membersTab) {
    await membersTab.click();
    await wait(2000);
    await screenshot('aba_membros_rachao');
  }
}

// ===================== RUNNER =====================

async function run() {
  console.log('=== Testes E2E - Evidências (JPEG q=' + QUALITY + ') ===\n');

  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 1 }
  });

  page = await browser.newPage();
  page.setDefaultTimeout(10000);

  // Interceptar console.log para debug
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('  [BROWSER ERROR]', msg.text());
  });

  try {
    // 1. Login
    console.log('--- LOGIN ---');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 15000 });
    await wait(2000);
    await ensureLoggedIn();
    await wait(2000);

    // 2. Executar testes em sequência
    await test_sorteio_times();
    await test_rotacao_partida();
    await test_entrar_rachao_codigo();
    await test_pagamentos();
    await test_stats_ranking();
    await test_registrar_stats_jogador();
    await test_jogadores_lista();
    await test_adicionar_jogador();
    await test_fantasy();
    await test_perfil_edicao();
    await test_admin_payments();
    await test_dashboard_vazio();
    await test_tela_senha();
    await test_configuracoes_detalhadas();
    await test_historico_jogos();
    await test_tab_financeiro_detalhe();
    await test_aba_membros();
    await test_menu_partida();
    await test_compartilhar_codigo();
    await test_logout();

    console.log(`\n=== CONCLUÍDO: ${testNum - 30} evidências capturadas (30 a ${testNum - 1}) ===`);
    console.log(`Diretório: ${EVIDENCE_DIR}`);

  } catch (err) {
    console.error('\n[ERRO]', err.message);
    // Capturar screenshot do erro
    try {
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `ERROR_${testNum}.jpg`),
        type: 'jpeg', quality: QUALITY
      });
      console.log(`  Screenshot de erro salvo: ERROR_${testNum}.jpg`);
    } catch (e) {}
  } finally {
    await browser.close();
  }
}

run();
