// ========== PUSH NOTIFICATIONS (FCM via Capacitor) ==========
// Bundled by scripts/build-web.js -> www/js/push.bundle.js
// Exposes window.Push with init(userId) / logout() / isNative().
//
// Fluxo:
//   1. init(userId) é chamado depois do login (auth.js).
//   2. Pede permissão via PushNotifications.requestPermissions().
//   3. Chama register() — gera token FCM no Android (precisa do
//      google-services.json + plugin firebase-messaging no build.gradle).
//   4. Listener 'registration' recebe o token e salva via RPC
//      register_device_token. Token é (player_id, fcm_token, platform).
//   5. Listener 'pushNotificationReceived' (foreground) toasta a notificação.
//   6. Listener 'pushNotificationActionPerformed' (tap) navega:
//        type=guest_paid|refund_failed → match-detail do rachao_id
//        type=coadmin_updated → permissions tab
//        default → notifications

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

let _initialized = false;
let _currentUserId = null;
let _registeredToken = null;

function isNative() {
  return Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
}

function platform() {
  if (!Capacitor) return 'web';
  const p = Capacitor.getPlatform && Capacitor.getPlatform();
  if (p === 'ios' || p === 'android') return p;
  return 'web';
}

function showToastSafe(msg) {
  if (typeof window.showToast === 'function') {
    try { window.showToast(msg); } catch (_) {}
  }
}

async function persistToken(userId, token, plat) {
  // Reaproveita o supabase client global (initSupabase em api.js).
  if (typeof window.apiRegisterDeviceToken === 'function') {
    try {
      await window.apiRegisterDeviceToken(userId, token, plat);
    } catch (err) {
      console.warn('[Push] register_device_token falhou:', err);
    }
  } else {
    console.warn('[Push] apiRegisterDeviceToken não disponível ainda');
  }
}

function dispatchTap(notification) {
  // Capacitor passa: { actionId, notification: { data, ... } }
  // Aqui já extraímos; aceita também o formato direto.
  const data = notification?.notification?.data || notification?.data || {};
  const type = data.type || '';
  const rachaoId = data.rachao_id || null;

  // Navega após próximo tick pra garantir que o app já hidratou
  setTimeout(() => {
    try {
      if (rachaoId && (type === 'guest_paid' || type === 'refund_failed' || type === 'coadmin_updated')) {
        if (typeof window.openRachao === 'function') {
          window.openRachao(rachaoId);
          return;
        }
      }
      if (typeof window.navigateTo === 'function') {
        window.navigateTo('notifications');
      }
    } catch (e) {
      console.warn('[Push] dispatchTap erro:', e);
    }
  }, 50);
}

async function init(userId) {
  if (!isNative()) {
    console.log('[Push] não-native — push desativado');
    return false;
  }
  if (_initialized && _currentUserId === userId) return true;

  _currentUserId = userId;

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      console.log('[Push] permissão negada:', perm.receive);
      return false;
    }

    // Listeners (limpa antes pra não duplicar)
    if (!_initialized) {
      await PushNotifications.removeAllListeners();

      PushNotifications.addListener('registration', async (token) => {
        const fcmToken = token?.value || '';
        if (!fcmToken) return;
        _registeredToken = fcmToken;
        console.log('[Push] FCM token recebido:', fcmToken.substring(0, 20) + '...');
        await persistToken(_currentUserId, fcmToken, platform());
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('[Push] registrationError:', err);
      });

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        // Foreground: o sistema não exibe a notif, então mostramos toast
        const title = notification?.title || notification?.notification?.title || '';
        const body  = notification?.body  || notification?.notification?.body  || '';
        showToastSafe(title ? `${title}: ${body}` : body);
        // Atualiza badge/notifications no app, se a função existir
        if (typeof window.refreshNotifications === 'function') {
          try { window.refreshNotifications(); } catch (_) {}
        }
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        dispatchTap(action);
      });
    }

    await PushNotifications.register();
    _initialized = true;
    return true;
  } catch (err) {
    console.warn('[Push] init falhou:', err);
    return false;
  }
}

async function logout() {
  // Remove o token do server (se temos um) e os listeners
  if (_registeredToken && typeof window.apiUnregisterDeviceToken === 'function') {
    try { await window.apiUnregisterDeviceToken(_registeredToken); } catch (_) {}
  }
  if (isNative()) {
    try { await PushNotifications.removeAllListeners(); } catch (_) {}
  }
  _initialized = false;
  _currentUserId = null;
  _registeredToken = null;
}

window.Push = {
  init,
  logout,
  isNative,
};
