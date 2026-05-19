// E2E Fase 4 — JWT é estritamente obrigatório, fallback p_caller_id removido,
// cancel-session-with-refunds exige JWT no header.

const { test, expect } = require('@playwright/test');

const APP_URL = 'http://127.0.0.1:3000/';
const SUPABASE_URL = 'https://ajthlptdgpmbvfxifnon.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqdGhscHRkZ3BtYnZmeGlmbm9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTYzMDcsImV4cCI6MjA5MTc3MjMwN30.n4OReYR6jxTdvtwaH6GvccEp8lvMNxc_H1w-ipNr9wA';
const TEST_PHONE = '11999990000';
const TEST_PASSWORD = '123456';
const TEST_PLAYER_ID = 'bab82c4fa114ce3a';

test.describe('Fase 4 — JWT estritamente obrigatório', () => {
  test('RPC com p_caller_id mas SEM JWT retorna NO_CALLER', async () => {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_profile`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_caller_id: TEST_PLAYER_ID }),
    });
    const data = await resp.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe('NO_CALLER');
  });

  test('forgery sem JWT em set_rachao_participants é bloqueado', async () => {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/set_rachao_participants`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_rachao_id: 'demorachao_quinta',
        p_participants: [],
        p_caller_id: TEST_PLAYER_ID, // forjado
      }),
    });
    const data = await resp.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe('NO_CALLER');
  });

  test('cancel-session-with-refunds sem JWT retorna 401', async () => {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/cancel-session-with-refunds`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'anyid' }),
    });
    // verify_jwt=true platform-level: rejeita anon key como JWT inválido pra função
    expect(resp.status).toBe(401);
  });

  test('boot com currentUser sem authToken força logout', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.checkAuth === 'function');

    // Simula sessão antiga (pré-JWT): user salvo mas sem token
    await page.evaluate(() => {
      localStorage.setItem('rachao_currentUser', JSON.stringify({ id: 'bab82c4fa114ce3a', name: 'Teste' }));
      localStorage.removeItem('rachao_authToken');
    });

    await page.reload();
    await page.waitForFunction(() => typeof window.checkAuth === 'function');

    // checkAuth roda no DOMContentLoaded — depois dele, currentUser deve ter sido limpo
    await page.waitForFunction(() => localStorage.getItem('rachao_currentUser') === null);
    const user = await page.evaluate(() => localStorage.getItem('rachao_currentUser'));
    expect(user).toBeNull();
  });

  test('com JWT válido cancel-session-with-refunds aceita (mesmo retornando SESSAO_INVALIDA)', async () => {
    const login = await fetch(`${SUPABASE_URL}/functions/v1/auth-login`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: TEST_PHONE, password: TEST_PASSWORD }),
    });
    const { token } = await login.json();
    expect(token).toBeTruthy();

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/cancel-session-with-refunds`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'INEXISTENTE_TESTE' }),
    });
    expect(resp.status).toBe(404);
    const data = await resp.json();
    expect(data.error).toBe('SESSAO_INVALIDA');
  });
});
