#!/usr/bin/env node
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'assets', 'play', 'real-shots');
const OUT_DIR = path.join(ROOT, 'assets', 'play');

const TARGET_W = 1080;
const TARGET_H = 1920;

const SHOTS = [
  { src: '00-current.png', out: 'screenshot-1-login.png' },
  { src: '11-relaunch.png', out: 'screenshot-2-home.png' },
  { src: '18a-rachao-9conf.png', out: 'screenshot-3-rachao.png' },
  { src: '09-rachao-detail.png', out: 'screenshot-4-pro.png' },
];

async function main() {
  for (const { src, out } of SHOTS) {
    const srcPath = path.join(SRC_DIR, src);
    const outPath = path.join(OUT_DIR, out);
    if (!fs.existsSync(srcPath)) {
      console.error('miss:', srcPath);
      continue;
    }
    const meta = await sharp(srcPath).metadata();
    const top = 0;
    await sharp(srcPath)
      .extract({ left: 0, top, width: TARGET_W, height: TARGET_H })
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
    console.log(`  ${src} -> ${out} (${kb} KB, crop top=${top})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
