#!/usr/bin/env node
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_LOGO = path.join(ROOT, 'assets', 'logo.png');
const OUT_DIR = path.join(ROOT, 'assets', 'play');

if (!fs.existsSync(SRC_LOGO)) {
  console.error('Logo não encontrado em', SRC_LOGO);
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const meta = await sharp(SRC_LOGO).metadata();
  console.log('Source logo:', meta.width, 'x', meta.height);

  const cropSize = Math.min(meta.width, meta.height);
  const left = Math.floor((meta.width - cropSize) / 2);
  const top = Math.floor((meta.height - cropSize) / 2);

  const iconPath = path.join(OUT_DIR, 'icon-512.png');
  await sharp(SRC_LOGO)
    .extract({ left, top, width: cropSize, height: cropSize })
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(iconPath);
  console.log('  ->', iconPath, `(${(fs.statSync(iconPath).size / 1024).toFixed(0)} KB)`);

  const FW = 1024;
  const FH = 500;
  const logoBuf = await sharp(SRC_LOGO)
    .extract({ left, top, width: cropSize, height: cropSize })
    .resize(420, 420, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const bgSvg = `<svg width="${FW}" height="${FH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FF7A00"/>
        <stop offset="60%" stop-color="#1C1C1C"/>
        <stop offset="100%" stop-color="#0A0A0A"/>
      </linearGradient>
    </defs>
    <rect width="${FW}" height="${FH}" fill="url(#g)"/>
    <circle cx="900" cy="80" r="120" fill="#FF7A00" opacity="0.15"/>
    <circle cx="980" cy="420" r="80" fill="#FF7A00" opacity="0.10"/>
  </svg>`;

  const textSvg = `<svg width="${FW}" height="${FH}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .head { font-family: 'Impact', 'Arial Black', sans-serif; font-weight: 900; fill: #FFFFFF; letter-spacing: 1.5px; }
      .accent { fill: #FF7A00; }
      .tag { font-family: 'Arial', sans-serif; font-weight: 700; fill: #FFFFFF; }
      .sub { font-family: 'Arial', sans-serif; font-weight: 500; fill: #E5E7EB; }
    </style>
    <text x="740" y="220" text-anchor="middle" class="head" font-size="56">MEU RACHÃO <tspan class="accent">PRO</tspan></text>
    <text x="740" y="280" text-anchor="middle" class="tag" font-size="24">A pelada que você organiza no celular</text>
    <text x="740" y="330" text-anchor="middle" class="sub" font-size="18" opacity="0.85">Times balanceados • PIX automático • Estatísticas</text>
  </svg>`;

  const featurePath = path.join(OUT_DIR, 'feature-graphic-1024x500.png');
  await sharp(Buffer.from(bgSvg))
    .composite([
      { input: logoBuf, left: 40, top: 40 },
      { input: Buffer.from(textSvg), left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(featurePath);
  console.log('  ->', featurePath, `(${(fs.statSync(featurePath).size / 1024).toFixed(0)} KB)`);

  console.log('\nDone. Arquivos em', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
