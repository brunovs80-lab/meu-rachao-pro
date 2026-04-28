# Setup Push Notifications (Firebase Cloud Messaging)

Guia pra ligar push notifications no Meu Rachão Pro. O código já está pronto — faltam só as credenciais Firebase.

---

## Visão geral

```
Edge function (Supabase)        Firebase                Device (Android/iOS)
       │                            │                          │
       ├── service-account JWT ───► OAuth token                 │
       │                                                        │
       └── POST /v1/projects/X/messages:send ──► FCM ──► push ──┤
                                                                │
       ◄── token registration RPC ◄── @capacitor/push-notifications ──┘
```

Disparos automáticos (já implementados):

| Evento backend                          | Quem recebe          | type            |
|-----------------------------------------|----------------------|-----------------|
| Avulso paga PIX (purpose=guest_fee)     | Admin do rachão      | `guest_paid`    |
| Mensalidade paga                        | Admin do rachão      | `mensalidade_paid` |
| Sessão cancelada com refunds falhando   | Admin do rachão      | `refund_failed` |
| Co-admin convidado/atualizado           | O próprio convidado  | `coadmin_updated` |

---

## 1. Firebase Console (10 min)

1. Vai em https://console.firebase.google.com → **Add project** (gratuito)
2. Nome: "Meu Rachão Pro" — desabilita Analytics se quiser, não é necessário
3. Em **Project settings → General**, role até **Your apps** → **Add app** → ícone Android
   - Package name: `com.meurachao.pro`
   - App nickname: "Meu Rachão Pro Android"
   - SHA-1: opcional pra push (necessário só pra Sign-In)
4. Baixa o **`google-services.json`** que aparece e coloca em `android/app/google-services.json`
   - ⚠️ **NÃO commite esse arquivo** — `android/` já está no `.gitignore`. Mantém local.
5. (Quando publicar iOS) **Add app → iOS**:
   - Bundle id: `com.meurachao.pro`
   - Baixa `GoogleService-Info.plist` e coloca em `ios/App/App/`
   - Em **Project settings → Cloud Messaging → Apple app config**, sobe a APNs Authentication Key (.p8) baixada do Apple Developer (Certificates, Identifiers & Profiles → Keys)

---

## 2. Service Account pro backend (5 min)

Pra a edge function `send-push` autenticar com o FCM, precisamos de uma service account JSON.

1. No Firebase Console: **Project settings → Service accounts**
2. Clica em **Generate new private key** → confirma → baixa o JSON
3. Esse JSON tem `private_key`, `client_email`, `project_id`. **NUNCA commite**.
4. Cola o conteúdo INTEIRO como secret no Supabase:

```bash
npx supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON="$(cat caminho/do/arquivo.json)"
```

(No Windows PowerShell: `$json = Get-Content arquivo.json -Raw; npx supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON=$json`)

5. Confirma:

```bash
npx supabase secrets list
```

Deve aparecer `FIREBASE_SERVICE_ACCOUNT_JSON` (valor obscurecido).

---

## 3. Build do app (2 min)

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

Se a build reclamar que `firebaseMessagingVersion` não está definido, confere `android/variables.gradle` — deve ter `firebaseMessagingVersion = '24.0.0'`.

Instala no aparelho/emulador:

```bash
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 4. Testar (em emulador com Google Play Services ou aparelho real)

1. Abre o app, faz login.
2. Permissão "Notificações" deve ser solicitada na primeira vez.
3. No console do dispositivo (`adb logcat | grep Push`) você deve ver `[Push] FCM token recebido: ...`.
4. Confere no Supabase:
   ```sql
   SELECT player_id, platform, LEFT(fcm_token, 20) AS prefix, created_at
     FROM device_tokens
    ORDER BY created_at DESC LIMIT 5;
   ```
5. **Teste manual de disparo:** chama o edge function direto:
   ```bash
   curl -X POST https://ajthlptdgpmbvfxifnon.supabase.co/functions/v1/send-push \
     -H "Authorization: Bearer SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"player_ids":["<seu_player_id>"],"title":"Teste","body":"Funcionou!","type":"test"}'
   ```
6. Se não chegar, vê os logs:
   ```bash
   npx supabase functions logs send-push --tail
   ```

Erros comuns:
- `FIREBASE_SERVICE_ACCOUNT_JSON não configurado` → faltou o passo 2.4
- `OAuth token error` → o JSON está corrompido ou o service account perdeu permissões
- `UNREGISTERED` → o token foi inválido (app desinstalado/reinstalado); o sistema apaga sozinho

---

## 5. Re-aplicar customizações se regenerar android/

Como `android/` é gitignored, se você rodar `npx cap add android` do zero, vai perder estas duas customizações que push exige:

**`android/app/src/main/AndroidManifest.xml`** — adicionar antes de `</manifest>`:
```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

**`android/variables.gradle`** — adicionar dentro do `ext { }`:
```groovy
firebaseMessagingVersion = '24.0.0'
```

(O `apply plugin: 'com.google.gms.google-services'` em `android/app/build.gradle` já vem condicionado ao json existir.)

---

## 6. iOS (quando for publicar)

Além do `GoogleService-Info.plist` do passo 1:
1. No Xcode: **Signing & Capabilities → + Capability → Push Notifications**
2. **+ Capability → Background Modes** → marca "Remote notifications"
3. Sobe a APNs key (.p8) no Firebase (já mencionado no passo 1)
4. Na primeira execução, o app pede permissão e registra o token igual no Android

---

## Referências dentro do código

- Migration `supabase/migration_016_device_tokens.sql` — tabela + RPCs `register_device_token`, `unregister_device_token`, `get_device_tokens_for_players`
- Edge function `supabase/functions/send-push/index.ts` — JWT-bearer flow + FCM v1 + auto-removal de tokens inválidos (verify_jwt=true; chamadores internos passam SERVICE_ROLE_KEY)
- Disparos: `pix-webhook` (paid), `cancel-session-with-refunds` (refund_failed), `manage-coadmin` (upsert)
- Frontend bundle: `src-push/push.src.js` → `www/js/push.bundle.js` (esbuild via `scripts/build-web.js`)
- Hook no auth: `js/auth.js` e `js/app.js` chamam `Push.init(user.id)` após login/registro e `Push.logout()` no logout
- Secret: `FIREBASE_SERVICE_ACCOUNT_JSON` no Supabase
