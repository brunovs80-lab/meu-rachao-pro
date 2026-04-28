#!/usr/bin/env node
/**
 * Gera versões .webp dos PNGs em assets/.
 * Browsers modernos baixam o webp (60-80% menor); o <picture> faz fallback no PNG.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ASSETS = path.resolve(__dirname, '..', 'assets');
const TARGETS = ['logo.png', 'screenshot-narrow.png', 'screenshot-wide.png'];

(async function () {
  console.log('Convertendo PNGs em WebP...');
  for (const file of TARGETS) {
    const input = path.join(ASSETS, file);
    if (!fs.existsSync(input)) {
      console.log(`  - ${file} não encontrado, pulando`);
      continue;
    }
    const output = path.join(ASSETS, file.replace(/\.png$/i, '.webp'));
    await sharp(input).webp({ quality: 85, effort: 6 }).toFile(output);
    const before = fs.statSync(input).size;
    const after = fs.statSync(output).size;
    console.log(`  ✔ ${file}: ${(before / 1024).toFixed(1)}KB → ${(after / 1024).toFixed(1)}KB (${((1 - after / before) * 100).toFixed(0)}% menor)`);
  }
})();
