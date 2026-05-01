#!/usr/bin/env node
/**
 * Build Cloudflare Pages.
 *
 * Layout final em dist/:
 *   /                    → landing (landing/index.html copiado pra raiz)
 *   /assets/             → assets/ (compartilhado: landing usa via path relativo)
 *   /privacy.html        → URLs estáveis exigidos pela Play Store
 *   /terms.html
 *   /delete-account.html
 *   /_headers, /_redirects
 *   /app/                → PWA (index.html, manifest.json, sw.js, css/, js/, assets/, data/)
 *
 * O app fica em /app/ pra deixar a landing na raiz do domínio.
 * O Capacitor (build-web.js) continua copiando o app na raiz do www/, sem mexer aqui.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const APP_DIR = path.join(DIST, 'app');

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    if (/\.(db|db-wal|db-shm)$/.test(src)) return;
    fs.copyFileSync(src, dest);
  }
}

function copyFile(srcRel, destRel, base = ROOT, target = DIST) {
  const src = path.join(base, srcRel);
  const dest = path.join(target, destRel);
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function copyDir(srcRel, destRel, base = ROOT, target = DIST) {
  const src = path.join(base, srcRel);
  const dest = path.join(target, destRel);
  if (!fs.existsSync(src)) return false;
  copyRecursive(src, dest);
  return true;
}

function rewriteAbsolutePathsToApp(text) {
  // Reescreve só strings literais começando com / pra paths conhecidos do app.
  // Não toca em /api/ (usado em check de runtime no SW) nem em URLs externas.
  return text
    .replace(/(["'`])\/(["'`])/g, '$1/app/$2')                  // '/' standalone → '/app/'
    .replace(/(["'`])\/index\.html/g, '$1/app/index.html')
    .replace(/(["'`])\/manifest\.json/g, '$1/app/manifest.json')
    .replace(/(["'`])\/sw\.js/g, '$1/app/sw.js')
    .replace(/(["'`])\/css\//g, '$1/app/css/')
    .replace(/(["'`])\/js\//g, '$1/app/js/')
    .replace(/(["'`])\/assets\//g, '$1/app/assets/');
}

function copyWithRewrite(srcRel, destRel, target = DIST) {
  const src = path.join(ROOT, srcRel);
  const dest = path.join(target, destRel);
  if (!fs.existsSync(src)) return false;
  const content = fs.readFileSync(src, 'utf8');
  const rewritten = rewriteAbsolutePathsToApp(content);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, rewritten);
  return true;
}

// --- limpa dist ---
if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// --- raiz: landing + legais + assets compartilhados + headers ---
console.log('Copiando raiz...');
copyFile('landing/index.html', 'index.html')   && console.log('  + index.html (landing)');
copyFile('privacy.html', 'privacy.html')       && console.log('  + privacy.html');
copyFile('terms.html', 'terms.html')           && console.log('  + terms.html');
copyFile('delete-account.html', 'delete-account.html') && console.log('  + delete-account.html');
copyFile('_headers', '_headers')               && console.log('  + _headers');
copyFile('_redirects', '_redirects')           && console.log('  + _redirects');
copyDir('assets', 'assets')                    && console.log('  + assets/');

// --- /app/ : PWA com paths absolutos reescritos ---
console.log('\nCopiando /app/...');
fs.mkdirSync(APP_DIR, { recursive: true });

// HTML do app: usa paths relativos, vai direto sem reescrita.
copyFile('index.html', 'app/index.html')       && console.log('  + app/index.html');

// Manifest e SW: paths absolutos /assets/ etc precisam virar /app/...
copyWithRewrite('manifest.json', 'app/manifest.json') && console.log('  + app/manifest.json (paths reescritos)');
copyWithRewrite('sw.js', 'app/sw.js')                 && console.log('  + app/sw.js (paths reescritos)');

// Assets do app (relativos no HTML do app, então precisam estar em /app/...)
copyDir('css', 'app/css')                      && console.log('  + app/css/');
copyDir('js', 'app/js')                        && console.log('  + app/js/');
copyDir('assets', 'app/assets')                && console.log('  + app/assets/');
copyDir('data', 'app/data')                    && console.log('  + app/data/');

console.log('\nBuild done →', DIST);
