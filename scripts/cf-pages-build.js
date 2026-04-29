#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const FILES = [
  'index.html',
  'privacy.html',
  'terms.html',
  'delete-account.html',
  'manifest.json',
  'sw.js',
  '_headers',
  '_redirects',
];

const DIRS = [
  'assets',
  'css',
  'js',
  'data',
  'landing',
];

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

if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

for (const f of FILES) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DIST, f));
    console.log('  copied', f);
  }
}

for (const d of DIRS) {
  const src = path.join(ROOT, d);
  if (fs.existsSync(src)) {
    copyRecursive(src, path.join(DIST, d));
    console.log('  copied dir', d);
  }
}

console.log('\nBuild done →', DIST);
