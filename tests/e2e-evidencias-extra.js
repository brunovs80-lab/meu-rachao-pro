/**
 * Testes E2E extras - Captura das evidências que faltaram
 * (tabs financeiro/membros via seletores corretos, logout, erro código)
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
const EVIDENCE_DIR = path.join(__dirname, 'evidencias');
const QUALITY = 45;

const TEST_PHONE = '11999990001';
const TEST_PASSWORD = '123456';

let browser, page;
let testNum = 55;

async function screenshot(name) {
  const filename = `${String(testNum).padStart(2, '0')}_${name}.jpg`;
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, filename),
    type: 'jpeg', quality: QUALITY, fullPage: false
  });
  console.log(`  ✓ [${testNum}] ${filename}`);
  testNum++;
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function navigateToPage(p) {
  await page.evaluate((pg) => navigateTo(pg), p);
  await wait(1500);
}

async function ensureLoggedIn() {
  const isLogged = await page.evaluate(() => {
    const u = localStorage.getItem('rachao_currentUser');
    return u && u !== 'null';
  });
  if (!isLogged) {
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await wait(1500);
    const input = await page.$('#phone-input');
    await input.click({ clickCount: 3 });
    await input.type(TEST_PHONE, { delay: 30 });
    await page.click('#btn-login');
    await wait(2000);
    const digits = await page.$$('#page-password .code-digit');
    for (let i = 0; i < TEST_PASSWORD.length && i < digits.length; i++) {
      await digits[i].type(TEST_PASSWORD[i], { delay: 30 });
    }
    await page.click('#btn-password');
    await wait(3000);
  }
}

async function run() {
  console.log('=== Testes E2E extras ===\n');

  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 1 }
  });

  page = await browser.newPage();
  page.setDefaultTimeout(10000);
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('  [BROWSER]', msg.text());
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 15000 });
    await wait(2000);
    await ensureLoggedIn();
    await wait(1500);

    // --- Tab Financeiro (dentro do rachão detail) ---
    console.log('\n--- TAB FINANCEIRO ---');
    await navigateToPage('matches');
    await wait(2000);
    const rachaoCard = await page.$('.match-list-item');
    if (rachaoCard) {
      await rachaoCard.click();
      await wait(2500);
    }

    // Clicar na tab "Financeiro" via data-tab
    await page.evaluate(() => {
      const tab = document.querySelector('#page-match-detail [data-tab="rachao-finance"]');
      if (tab) tab.click();
    });
    await wait(2500);
    await screenshot('tab_financeiro_detalhe');

    // Scroll pra ver chave Pix
    await page.evaluate(() => {
      const el = document.getElementById('finance-pix-card') || document.getElementById('finance-pix-key');
      if (el) el.scrollIntoView({ behavior: 'instant' });
    });
    await wait(500);
    await screenshot('tab_financeiro_pix');

    // --- Tab Membros ---
    console.log('\n--- TAB MEMBROS ---');
    await page.evaluate(() => {
      const tab = document.querySelector('#page-match-detail [data-tab="rachao-members"]');
      if (tab) tab.click();
    });
    await wait(2000);
    await screenshot('tab_membros_rachao');

    // --- Tab Stats do rachão ---
    console.log('\n--- TAB STATS RACHÃO ---');
    await page.evaluate(() => {
      const tab = document.querySelector('#page-match-detail [data-tab="rachao-stats"]');
      if (tab) tab.click();
    });
    await wait(2000);
    await screenshot('tab_stats_rachao');

    // --- Tab Ranking do rachão ---
    console.log('\n--- TAB RANKING RACHÃO ---');
    await page.evaluate(() => {
      const tab = document.querySelector('#page-match-detail [data-tab="rachao-ranking"]');
      if (tab) tab.click();
    });
    await wait(2000);
    await screenshot('tab_ranking_rachao');

    // --- Voltar para tab Jogo ---
    console.log('\n--- CONFIRMADOS SCROLL ---');
    await page.evaluate(() => {
      const tab = document.querySelector('#page-match-detail [data-tab="rachao-game"]');
      if (tab) tab.click();
    });
    await wait(2000);
    await page.evaluate(() => {
      const el = document.getElementById('confirmed-list');
      if (el) el.scrollIntoView({ behavior: 'instant' });
    });
    await wait(500);
    await screenshot('lista_confirmados');

    // --- Stats tabs: Artilharia, Assistências, Desarmes ---
    console.log('\n--- STATS TABS ---');
    await navigateToPage('stats');
    await wait(2000);

    await page.evaluate(() => {
      const tab = document.querySelector('#page-stats [data-tab="artilharia"]');
      if (tab) tab.click();
    });
    await wait(1500);
    await screenshot('stats_artilharia');

    await page.evaluate(() => {
      const tab = document.querySelector('#page-stats [data-tab="assists"]');
      if (tab) tab.click();
    });
    await wait(1500);
    await screenshot('stats_assistencias');

    await page.evaluate(() => {
      const tab = document.querySelector('#page-stats [data-tab="desarmes"]');
      if (tab) tab.click();
    });
    await wait(1500);
    await screenshot('stats_desarmes');

    // --- Fantasy sub-tabs ---
    console.log('\n--- FANTASY TABS ---');
    await navigateToPage('fantasy');
    await wait(2000);

    await page.evaluate(() => {
      const tab = document.querySelector('#page-fantasy [data-tab="fantasy-team"]');
      if (tab) tab.click();
    });
    await wait(1500);
    await screenshot('fantasy_meu_time');

    await page.evaluate(() => {
      const tab = document.querySelector('#page-fantasy [data-tab="fantasy-scoring"]');
      if (tab) tab.click();
    });
    await wait(1500);
    await screenshot('fantasy_pontos');

    await page.evaluate(() => {
      const tab = document.querySelector('#page-fantasy [data-tab="fantasy-prizes"]');
      if (tab) tab.click();
    });
    await wait(1500);
    await screenshot('fantasy_premios');

    // --- Logout ---
    console.log('\n--- LOGOUT ---');
    await navigateToPage('settings');
    await wait(1000);

    await page.evaluate(() => {
      const btns = document.querySelectorAll('#page-settings button, #page-settings a, #page-settings .btn-outline');
      for (const b of btns) {
        if (b.textContent.toLowerCase().includes('sair') || b.textContent.toLowerCase().includes('logout')) {
          b.click(); return;
        }
      }
      const all = document.querySelectorAll('[onclick*="logout"], [onclick*="Logout"], [onclick*="apiLogout"]');
      if (all.length > 0) all[0].click();
    });
    await wait(2000);
    await screenshot('apos_logout_login');

    // --- Admin: validação de stats detalhado ---
    console.log('\n--- ADMIN STATS ---');
    await ensureLoggedIn();
    await wait(1500);
    await navigateToPage('admin');
    await wait(2000);
    await screenshot('admin_painel_completo');

    console.log(`\n=== Extras CONCLUÍDO: ${testNum - 55} evidências (55 a ${testNum - 1}) ===`);

  } catch (err) {
    console.error('\n[ERRO]', err.message);
    try {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `ERROR_EXTRA.jpg`), type: 'jpeg', quality: QUALITY });
    } catch (e) {}
  } finally {
    await browser.close();
  }
}

run();
