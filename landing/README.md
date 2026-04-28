# Landing — Meu Rachão Pro

Landing page estática single-file pra divulgação do app. Sem build step, sem dependência: HTML + Tailwind CDN + Google Fonts.

## Hospedagens grátis (escolha 1)

### GitHub Pages (recomendado, já que o repo está no GitHub)

1. **Settings → Pages**
2. Source: `Deploy from a branch`
3. Branch: `main` · Folder: `/landing`
4. Save → URL fica `https://brunovs80-lab.github.io/meu-rachao-pro/`

> Os assets (`../assets/*`, `../privacy.html`, `../terms.html`) são referenciados de fora da pasta. Como o repositório inteiro vai junto, isso funciona normalmente no GitHub Pages.

### Netlify

1. New site → Deploy manually → arrasta a pasta `landing/` (ou conecta o repo e aponta `Publish directory: landing`)
2. URL custom grátis: `meurachao-pro.netlify.app`

### Vercel

1. Import repo → Framework preset: `Other` → Root Directory: `landing`
2. URL: `meurachao-pro.vercel.app`

### Cloudflare Pages

1. Connect to Git → Build command: nenhum → Build output: `landing`

## Domínio próprio (opcional)

Qualquer das opções acima aceita custom domain grátis. Ex.: comprar `meurachao.pro` em registro.br (R$ 40/ano) e apontar via DNS.

## Edição

Tudo num arquivo só (`index.html`). Para mudar:
- **Cores**: dentro de `<script>tailwind.config = {...}` ou no bloco `<style>`
- **Fontes**: trocar a URL de `fonts.googleapis.com` no `<head>`
- **Conteúdo**: editar direto, é HTML semântico (sem template engine)
- **Screenshots**: atualiza `assets/screenshot-narrow.png`

## Antes de publicar

- [ ] Trocar URL do Google Play (atualmente `play.google.com/store/apps/details?id=com.meurachao.pro` — só funciona depois de publicar)
- [ ] Trocar `app.meurachao.pro` no passo iOS pelo domínio real onde o PWA estiver hospedado
- [ ] Trocar email `contato@meurachao.pro` no footer
- [ ] Verificar `og:image` (atualmente aponta pra `../assets/screenshot-wide.png`)

## Performance

- Tailwind CDN é Play Mode (~25KB gzip mas com warning em prod) — para release definitiva, considerar build estático com `npx tailwindcss -i ... -o style.css --minify` e remover o `<script src="cdn.tailwindcss.com">`. Sem urgência: a página já carrega rápido pra divulgação.
- Imagens são lazy-loadable; substitua `screenshot-narrow.png` por `.webp` pra ganhar mais.
