# Deploy - Meu Rachão Pro

## 1. Configurar Supabase (Banco de Dados)

### Criar projeto no Supabase
1. Acesse https://supabase.com e crie uma conta gratuita
2. Clique em **New Project**
3. Escolha nome, senha e região (South America - São Paulo)
4. Aguarde o projeto ser criado (~2 min)

### Executar o SQL de criação das tabelas
1. No Dashboard do Supabase, vá em **SQL Editor**
2. Clique em **New query**
3. Copie e cole o conteúdo de `supabase/migration.sql`
4. Clique em **Run** (executar)
5. Deve aparecer "Success. No rows returned"

### Carregar dados demo (opcional)
1. No **SQL Editor**, crie outra query
2. Copie e cole o conteúdo de `supabase/seed.sql`
3. Clique em **Run**

### Pegar as credenciais
1. Vá em **Settings** → **API**
2. Copie a **Project URL** (ex: `https://xyz.supabase.co`)
3. Copie a **anon public key** (começa com `eyJ...`)

### Configurar no app
1. Abra o arquivo `js/config.js`
2. Substitua os valores:
```js
const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGci...SUA-KEY-AQUI';
```

## 2. Deploy do App (Hospedagem)

### Opção A: Vercel (recomendado)
1. Acesse https://vercel.com e faça login com GitHub
2. Clique em **Add New** → **Project**
3. Importe o repositório `meu-rachao-pro`
4. Framework Preset: **Other**
5. Build Command: deixe vazio
6. Output Directory: `.`
7. Clique em **Deploy**
8. Seu app estará em `https://meu-rachao-pro.vercel.app`

### Opção B: Netlify
1. Acesse https://netlify.com e faça login com GitHub
2. Clique em **Add new site** → **Import an existing project**
3. Conecte o repositório
4. Build command: deixe vazio
5. Publish directory: `.`
6. Clique em **Deploy site**

### Opção C: GitHub Pages
1. No repositório GitHub, vá em **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main`, pasta: `/ (root)`
4. Salve e aguarde o deploy

## 3. Instalar como App no Celular

### Android (Chrome)
1. Abra o link do app no Chrome
2. Aparecerá um banner "Adicionar à tela inicial"
3. Ou toque no menu (3 pontos) → **Instalar app**
4. O app aparecerá como ícone na tela inicial
5. Funciona como app nativo, sem barra do navegador

### iPhone/iPad (Safari)
1. Abra o link do app no Safari
2. Toque no botão de compartilhar (quadrado com seta)
3. Role e toque em **Adicionar à Tela de Início**
4. Dê um nome e toque em **Adicionar**
5. O app aparecerá como ícone na tela inicial

### Qualquer smartphone
O app é uma **PWA (Progressive Web App)** e funciona em qualquer navegador moderno. Basta acessar o link e instalar.

## 4. Build Nativo (Opcional - App Store / Play Store)

### Pré-requisitos
- Node.js instalado
- Android Studio (para Android)
- Xcode (para iOS, apenas em Mac)

### Android
```bash
npx cap add android
npx cap sync
npx cap open android
# Android Studio abrirá - clique em Build → Generate Signed Bundle
```

### iOS
```bash
npx cap add ios
npx cap sync
npx cap open ios
# Xcode abrirá - configure o signing team e faça o build
```

## 5. Verificar

Após o deploy, verifique:
- [ ] App carrega e mostra tela de login
- [ ] Cadastro de jogador funciona
- [ ] Criar rachão funciona
- [ ] Entrar com código funciona
- [ ] Confirmar presença funciona
- [ ] Sortear times funciona
- [ ] App instala no celular como PWA
- [ ] Funciona offline (assets cacheados)

## Troubleshooting

**"Failed to fetch" ou erro de rede**
- Verifique se as credenciais em `js/config.js` estão corretas
- Verifique se o SQL de migration foi executado com sucesso

**App não instala no celular**
- O site precisa estar em HTTPS (Vercel/Netlify já fornecem)
- Verifique se o `manifest.json` está acessível

**Dados não aparecem**
- Execute o `supabase/seed.sql` para carregar dados demo
- Verifique no Supabase Dashboard → Table Editor se as tabelas existem
