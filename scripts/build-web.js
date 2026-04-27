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

// Bundla o módulo billing (depende de @revenuecat/purchases-capacitor + @capacitor/core)
const billingSrc = path.join(ROOT, 'src-billing', 'billing.src.js');
const billingOut = path.join(OUT, 'js', 'billing.bundle.js');
if (fs.existsSync(billingSrc)) {
  console.log('🔨 Bundling billing module (RevenueCat)...');
  try {
    const esbuild = require('esbuild');
    esbuild.buildSync({
      entryPoints: [billingSrc],
      bundle: true,
      outfile: billingOut,
      format: 'iife',
      platform: 'browser',
      target: ['es2017'],
      minify: true,
      logLevel: 'warning',
    });
    console.log('  ✔ js/billing.bundle.js');
  } catch (err) {
    console.error('  ✖ falha ao bundlar billing:', err.message);
    process.exit(1);
  }
}

console.log('✅ Build complete → www/');
