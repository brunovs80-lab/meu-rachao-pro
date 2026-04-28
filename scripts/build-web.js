#!/usr/bin/env node
/**
 * Build script - copia assets web + bundla módulo billing (RevenueCat) para www/
 * Usado pelo Capacitor para gerar os apps nativos.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'www');

const ITEMS = [
  'index.html',
  'manifest.json',
  'sw.js',
  'css',
  'js',
  'assets',
];

function cleanDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('🔨 Building web assets into www/ ...');
cleanDir(OUT);

for (const item of ITEMS) {
  const src = path.join(ROOT, item);
  const dest = path.join(OUT, item);
  if (!fs.existsSync(src)) {
    console.warn(`  ⚠ ${item} not found, skipping`);
    continue;
  }
  copyRecursive(src, dest);
  console.log(`  ✔ ${item}`);
}

function bundleModule(label, srcRel, outRel) {
  const src = path.join(ROOT, srcRel);
  const out = path.join(OUT, outRel);
  if (!fs.existsSync(src)) return;
  console.log(`🔨 Bundling ${label}...`);
  try {
    const esbuild = require('esbuild');
    esbuild.buildSync({
      entryPoints: [src],
      bundle: true,
      outfile: out,
      format: 'iife',
      platform: 'browser',
      target: ['es2017'],
      minify: true,
      logLevel: 'warning',
    });
    console.log(`  ✔ ${outRel}`);
  } catch (err) {
    console.error(`  ✖ falha ao bundlar ${label}:`, err.message);
    process.exit(1);
  }
}

// Bundla módulos com dependências de plugins Capacitor
bundleModule('billing module (RevenueCat)', 'src-billing/billing.src.js', 'js/billing.bundle.js');
bundleModule('push module (FCM)', 'src-push/push.src.js', 'js/push.bundle.js');

console.log('✅ Build complete → www/');
