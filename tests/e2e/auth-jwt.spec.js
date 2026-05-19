// E2E test da Fase 3 da auditoria: login custom emite JWT, cliente injeta
// Bearer e RPCs autenticam via auth.jwt()->>'sub'.
//
// Rodar: npx playwright test tests/e2e/auth-jwt.spec.js --reporter=line
// Dev server precisa estar em http://127.0.0.1:3000 (npm start).

const { test, expect } = require('@playwright/test');

const APP_URL = 'http://127.0.0.1:3000/';
const TEST_PHONE = '11999990000';
const TEST_PASSWORD = '123456';
const TEST_PLAYER_ID = 'bab82c4fa114ce3a';

function decodeJwtPayload(token) {
  const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const pad = part.length % 4;
  const padded = pad ? part + '='.repeat(4 - pad) : part;
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
}

test.describe('Fase 3 — JWT custom', () => {
  test('login salva token e cliente faz call RPC com Bearer', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.apiLoginWithPassword === 'function');

    const beforeLogin = await page.evaluate(() => localStorage.getItem('rachao_authToken'));
    expect(beforeLogin).toBeNull();

    const user = await page.evaluate(async ({ phone, password }) => {
      return await window.apiLoginWithPassword(phone, password);
    }, { phone: TEST_PHONE, password: TEST_PASSWORD });

    expect(user.id).toBe(TEST_PLAYER_ID);

    const token = await page.evaluate(() => localStorage.getItem('rachao_authToken'));
    expect(token).toBeTruthy();
    expect(token.split('.').length).toBe(3);

    const payload = decodeJwtPayload(token);
    expect(payload.sub).toBe(TEST_PLAYER_ID);
    expect(payload.aud).toBe('authenticated');
    expect(payload.role).toBe('authenticated');
    expect(payload.exp).toBeGreaterThan(payload.iat);
    expect(payload.exp - payload.iat).toBeGreaterThanOrEqual(60 * 60 * 24 * 29); // ~30d

    // RPC via cliente — não passa p_caller_id, força uso de auth.jwt()->>'sub'
    const result = await page.evaluate(async () => {
      const { data, error } = await window.initSupabase().rpc('debug_jwt_sub');
      return { data, error };
    });
    expect(result.error).toBeNull();
    expect(result.data.sub).toBe(TEST_PLAYER_ID);
    expect(result.data.role).toBe('authenticated');
  });

  test('get_my_profile via JWT sem p_caller_id retorna o caller', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.apiLoginWithPassword === 'function');
    await page.evaluate(async ({ phone, password }) => window.apiLoginWithPassword(phone, password),
      { phone: TEST_PHONE, password: TEST_PASSWORD });

    const profile = await page.evaluate(async () => {
      const { data } = await window.initSupabase().rpc('get_my_profile', { p_caller_id: null });
      return data;
    });
    expect(profile.ok).toBe(true);
    expect(profile.id).toBe(TEST_PLAYER_ID);
    expect(profile.phone).toBe(TEST_PHONE);
  });

  test('forgery via p_caller_id é ignorado quando JWT presente', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.apiLoginWithPassword === 'function');
    await page.evaluate(async ({ phone, password }) => window.apiLoginWithPassword(phone, password),
      { phone: TEST_PHONE, password: TEST_PASSWORD });

    // Tenta forjar caller pra demoplayer_alex — JWT deve vencer
    const profile = await page.evaluate(async () => {
      const { data } = await window.initSupabase().rpc('get_my_profile', { p_caller_id: 'demoplayer_alex' });
      return data;
    });
    expect(profile.ok).toBe(true);
    expect(profile.id).toBe(TEST_PLAYER_ID); // não alex
  });

  test('token persiste após reload e ainda autentica', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.apiLoginWithPassword === 'function');
    await page.evaluate(async ({ phone, password }) => window.apiLoginWithPassword(phone, password),
      { phone: TEST_PHONE, password: TEST_PASSWORD });

    const tokenBefore = await page.evaluate(() => localStorage.getItem('rachao_authToken'));

    await page.reload();
    await page.waitForFunction(() => typeof window.initSupabase === 'function');

    const tokenAfter = await page.evaluate(() => localStorage.getItem('rachao_authToken'));
    expect(tokenAfter).toBe(tokenBefore);

    const result = await page.evaluate(async () => {
      const { data } = await window.initSupabase().rpc('debug_jwt_sub');
      return data;
    });
    expect(result.sub).toBe(TEST_PLAYER_ID);
  });

  test('logout limpa token e cai pra anon (sub=null)', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.apiLoginWithPassword === 'function');
    await page.evaluate(async ({ phone, password }) => window.apiLoginWithPassword(phone, password),
      { phone: TEST_PHONE, password: TEST_PASSWORD });

    await page.evaluate(() => window.apiLogout());

    const tokenAfter = await page.evaluate(() => localStorage.getItem('rachao_authToken'));
    expect(tokenAfter).toBeNull();

    const result = await page.evaluate(async () => {
      const { data } = await window.initSupabase().rpc('debug_jwt_sub');
      return data;
    });
    expect(result.sub).toBeNull();
    expect(result.role).toBe('anon');
  });
});
