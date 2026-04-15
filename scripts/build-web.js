#!/usr/bin/env node
/**
 * Build script - copia apenas os assets web para www/
 * Usado pelo Capacitor para gerar os apps nativos.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'www');

// Arquivos e pastas que compõem o app web
const ITEMS = [
  'index.html',
  'manifest.json',
  'sw.js',
  'css',
  'js',
  'assets',
];

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
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

console.log('✅ Build complete → www/');
