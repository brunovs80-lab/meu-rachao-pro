# Setup IAP (RevenueCat + Google Play + App Store)

Guia passo a passo pra ligar pagamentos in-app no Meu Rachão Pro.

---

## Visão geral

```
App (Capacitor)
   │
   ├── @revenuecat/purchases-capacitor ──► RevenueCat ──► Google Play / App Store
   │                                            │
   │                                            └── Webhook ──► Supabase Edge Function
   │                                                                  │
   └── Polling pro_subscriptions ◄──────────────────── Supabase DB ◄──┘
```

---

## 1. RevenueCat (5 min)

1. Cria conta em https://app.revenuecat.com (grátis até US$ 2.5k/mês)
2. **+ New Project** → nome "Meu Rachão Pro"
3. Em **Project Settings → Apps**, adiciona dois apps:
   - **Google Play**: package name `com.meurachao.pro`
   - **App Store**: bundle id `com.meurachao.pro`
4. Em **Project Settings → API Keys**, copia:
   - **Public SDK key — Google** (começa com `goog_`)
   - **Public SDK key — Apple** (começa com `appl_`)
5. Cola essas duas chaves em `src-billing/billing.src.js`:
   ```js
   const REVENUECAT_API_KEY_ANDROID = 'goog_...';
   const REVENUECAT_API_KEY_IOS     = 'appl_...';
   ```
6. Roda `npm run build` pra rebundlar.

---

## 2. Google Play Console (15-30 min)

### 2.1 Criar produtos

Em **Monetize → Products**:

| Tipo | Product ID | Preço sugerido |
|---|---|---|
| **Subscription** | `rachao_pro_monthly` | R$ 14,90 / 1 mês |
| **Subscription** | `rachao_pro_yearly` | R$ 99,90 / 1 ano (com 7d trial) |
| **Managed product** (one-time) | `rachao_pro_lifetime` | R$ 199,90 |

**Importante:** os Product IDs precisam bater **exatamente** com o que o RevenueCat espera (próximo passo).

### 2.2 Service account pro RevenueCat

1. Google Cloud Console → IAM & Admin → Service Accounts → **Create**
2. Nome: `revenuecat-rachao` → **Done**
3. Na linha do service account, **⋮ → Manage keys → Add key → JSON** → baixa o `.json`
4. Em Play Console → **Setup → API access** → encontra esse service account → **Grant access**
5. Permissões: marca **"View financial data, orders, and cancellation survey responses"** + **"Manage orders and subscriptions"**
6. Volta no RevenueCat → **Project Settings → Apps → seu app Android → Service Account credentials JSON** → cola o conteúdo do `.json`

---

## 3. App Store Connect (15-30 min)

### 3.1 Criar produtos

Em **My Apps → seu app → Monetization → In-App Purchases**:

| Tipo | Product ID | Preço |
|---|---|---|
| **Auto-Renewable Subscription** | `rachao_pro_monthly` | Tier R$ 14,90 |
| **Auto-Renewable Subscription** | `rachao_pro_yearly` | Tier R$ 99,90 + Introductory 7d free |
| **Non-Consumable** | `rachao_pro_lifetime` | Tier R$ 199,90 |

Crie um **Subscription Group** "Pro" e coloque os dois mensal/anual dentro.

### 3.2 App Store Connect API key

1. App Store Connect → **Users and Access → Integrations → App Store Connect API**
2. **Generate API Key** → role **App Manager**
3. Baixa o `.p8`, anota o **Key ID** e o **Issuer ID**
4. RevenueCat → seu app iOS → **App-Specific Shared Secret** + **API Key (.p8 + Key ID + Issuer ID)**

---

## 4. Configurar offerings no RevenueCat (5 min)

1. **Products** → "+ New" → adiciona os 3 IDs (`rachao_pro_monthly`, `rachao_pro_yearly`, `rachao_pro_lifetime`) e marca em qual loja cada um existe
2. **Entitlements** → "+ New" → ID `pro` → attach os 3 produtos
3. **Offerings** → cria uma "Default" offering com 3 packages:
   - `$rc_monthly` → `rachao_pro_monthly`
   - `$rc_annual` → `rachao_pro_yearly`
   - `$rc_lifetime` → `rachao_pro_lifetime`
4. Marca essa offering como **Current** ✅

> Se mudar os identifiers de package, atualize também `PLAN_TO_PACKAGE` em `src-billing/billing.src.js`.

---

## 5. Webhook RevenueCat → Supabase (5 min)

### 5.1 Deploy da edge function

```bash
# Login uma vez
npx supabase login

# Link no projeto (uma vez)
npx supabase link --project-ref ajthlptdgpmbvfxifnon

# Deploy da função
npx supabase functions deploy revenuecat-webhook --no-verify-jwt

# Definir o segredo do webhook
npx supabase secrets set REVENUECAT_WEBHOOK_SECRET=<algum-segredo-aleatorio>
```

> Use `--no-verify-jwt` porque o RevenueCat não envia JWT do Supabase — a validação é feita por Bearer token customizado.

### 5.2 Configurar no RevenueCat

RevenueCat → **Project → Integrations → + Webhook**:
- **URL**: `https://ajthlptdgpmbvfxifnon.supabase.co/functions/v1/revenuecat-webhook`
- **Authorization header value**: `Bearer <mesmo-segredo-do-passo-5.1>`
- Eventos: marca **all events**
- **Send test event** → confere logs em `npx supabase functions logs revenuecat-webhook`

---

## 6. Testar (sandbox)

### Android (Internal testing)

1. Build `.aab`: `npm run cap:build:aab`
2. Sobe no Play Console → **Internal testing** → cria release → adiciona seu email como tester
3. Aceita o convite no e-mail (**importante:** abre o link no celular)
4. Instala o app via Internal testing → faz login → vai pro Paywall → seleciona um plano
5. Cobrança aparece como "Test card, always approves" (não cobra de verdade)
6. Após confirmar, o webhook entra → `pro_subscriptions` recebe linha → `requirePro` libera tudo

### iOS (Sandbox)

1. App Store Connect → **Users and Access → Sandbox Testers → +**
2. Cria um sandbox tester com email descartável
3. No iPhone físico, **Settings → App Store → Sandbox Account** → loga com o tester
4. Roda o app em Xcode (Run) → Paywall → compra
5. Cobranças sandbox renovam mais rápido (1 mês = 5 min) — bom pra testar renovação

---

## 7. Checklist final antes de publicar

- [ ] Chaves RevenueCat (`goog_…` e `appl_…`) preenchidas em `src-billing/billing.src.js`
- [ ] Webhook deploiado e RevenueCat configurado
- [ ] Os 3 product IDs criados em ambas as lojas e linkados no RevenueCat
- [ ] Offering "Default" marcada como Current
- [ ] Service account Google + API Key Apple conectadas
- [ ] Termos de Uso e Política de Privacidade publicados (Play Store exige link)
- [ ] Teste real com cartão de testador interno em pelo menos 1 plano
- [ ] Webhook recebendo eventos (verificar `supabase functions logs`)

---

## Troubleshooting

| Sintoma | Causa provável |
|---|---|
| Paywall mostra preços fake (R$ 14,90 etc) | App não é nativo OU `Billing.init` falhou OU offering não tem os packages |
| `purchase()` lança "No products available" | Produtos não publicados na loja, ou app rodando em build não-internal |
| Compra OK mas user continua não-Pro | Webhook não chegou — confere logs da edge function |
| 401 no webhook | Header `Authorization: Bearer X` divergente do `REVENUECAT_WEBHOOK_SECRET` |
| `app_user_id` no webhook é `$RCAnonymousID:...` | Você esqueceu de chamar `Billing.init(userId)` antes da compra |
