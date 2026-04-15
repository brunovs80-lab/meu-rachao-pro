# Build Mobile - Meu Rachao Pro

## Pre-requisitos

### Android
- **Android Studio** instalado (com Android SDK 36)
- **JDK 17+**
- Variavel `ANDROID_HOME` configurada

### iOS (somente no macOS)
- **Xcode 15+** instalado
- **CocoaPods**: `sudo gem install cocoapods`
- Conta Apple Developer ($99/ano)

---

## Scripts disponíveis

| Comando | O que faz |
|---|---|
| `npm run build` | Copia assets web para `www/` |
| `npm run cap:sync` | Build + sync em todas as plataformas |
| `npm run cap:android` | Build + sync + abre Android Studio |
| `npm run cap:ios` | Build + sync + abre Xcode |
| `npm run cap:build:android` | Gera APK release |
| `npm run cap:build:aab` | Gera AAB (Google Play) |

---

## Android - Gerar APK/AAB para Google Play

### 1. Criar keystore (apenas uma vez)

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore android/meu-rachao-pro.keystore \
  -alias meu-rachao-pro \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Meu Rachao Pro, O=Bruno VS, L=Brasilia, ST=DF, C=BR"
```

> **IMPORTANTE:** Guarde a senha e o arquivo keystore em lugar seguro. Se perder, nao consegue atualizar o app na Play Store.

### 2. Configurar signing

Crie o arquivo `android/keystore.properties` (use o `.example` como modelo):

```properties
storeFile=meu-rachao-pro.keystore
storePassword=SUA_SENHA
keyAlias=meu-rachao-pro
keyPassword=SUA_SENHA
```

### 3. Gerar AAB (recomendado para Play Store)

```bash
npm run cap:build:aab
```

O arquivo sera gerado em:
```
android/app/build/outputs/bundle/release/app-release.aab
```

### 4. Gerar APK (para testes/distribuicao direta)

```bash
npm run cap:build:android
```

O arquivo sera gerado em:
```
android/app/build/outputs/apk/release/app-release.apk
```

### 5. Publicar na Google Play Store

1. Acesse [Google Play Console](https://play.google.com/console)
2. Crie uma conta de desenvolvedor ($25 taxa unica)
3. Crie um novo app
4. Preencha a ficha da loja (descricao, screenshots, icone 512x512)
5. Faca upload do `.aab` em **Release > Production**
6. Preencha classificacao de conteudo e politica de privacidade
7. Envie para revisao

---

## iOS - Gerar IPA para App Store

### 1. Instalar dependencias (primeira vez)

```bash
cd ios/App
pod install
cd ../..
```

### 2. Abrir no Xcode

```bash
npm run cap:ios
```

### 3. Configurar no Xcode

1. Selecione o projeto **App** no navigator
2. Em **Signing & Capabilities**:
   - Selecione seu Team (Apple Developer Account)
   - O Bundle Identifier ja esta: `com.meurachao.pro`
3. Em **General**:
   - Version: `1.0.0`
   - Build: `1`

### 4. Gerar Archive

1. No Xcode, selecione **Product > Archive**
2. Quando terminar, clique **Distribute App**
3. Escolha **App Store Connect**
4. Siga o wizard de upload

### 5. Publicar na App Store

1. Acesse [App Store Connect](https://appstoreconnect.apple.com)
2. Conta Apple Developer necessaria ($99/ano)
3. Crie um novo app com Bundle ID `com.meurachao.pro`
4. Preencha metadados (descricao, screenshots, icone 1024x1024)
5. Selecione o build que voce enviou
6. Envie para revisao da Apple

---

## Atualizando o app

Para cada nova versao:

1. Incremente `versionCode` e `versionName` em `android/app/build.gradle`
2. Incremente Version e Build no Xcode
3. Rode `npm run cap:sync`
4. Gere novo AAB/IPA e envie para as lojas

---

## Testando localmente

### Android
```bash
npm run cap:android
# No Android Studio: Run > Run 'app' (emulador ou dispositivo USB)
```

### iOS (somente macOS)
```bash
npm run cap:ios
# No Xcode: selecione simulador e clique Run
```

---

## Estrutura do build

```
meu-rachao-pro/
  scripts/build-web.js   <- Script que copia assets para www/
  www/                    <- Assets web (gerado pelo build, gitignored)
  android/               <- Projeto Android Studio
    keystore.properties   <- Credenciais de signing (gitignored)
    meu-rachao-pro.keystore <- Keystore (gitignored)
  ios/                   <- Projeto Xcode
  capacitor.config.json  <- Configuracao do Capacitor
```
