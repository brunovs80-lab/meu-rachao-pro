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

  const SCREENSHOTS = [
    {
      file: 'screenshot-1-times.png',
      icon: '⚽',
      headline: 'TIMES BALANCEADOS',
      headline2: 'EM 5 SEGUNDOS',
      sub: 'Sorteio automático que considera posição\ne nível de cada jogador',
    },
    {
      file: 'screenshot-2-pix.png',
      icon: '💰',
      headline: 'PIX AUTOMÁTICO',
      headline2: 'PRO AVULSO',
      sub: 'Avulso paga sozinho via PIX e cai\ndireto na chave do organizador',
    },
    {
      file: 'screenshot-3-stats.png',
      icon: '📊',
      headline: 'ESTATÍSTICAS',
      headline2: 'DE VERDADE',
      sub: 'Gols, assistências, MVP, vitórias\ntudo registrado partida a partida',
    },
    {
      file: 'screenshot-4-ranking.png',
      icon: '🏆',
      headline: 'RANKING DO MÊS',
      headline2: 'E LIGA FANTASY',
      sub: 'Quem tá voando, quem tá enferrujado\nliga fantasy entre os jogadores',
    },
  ];

  const SW = 1080;
  const SH = 1920;
  const screenshotLogoBuf = await sharp(SRC_LOGO)
    .extract({ left, top, width: cropSize, height: cropSize })
    .resize(280, 280, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  for (const s of SCREENSHOTS) {
    const subLines = s.sub.split('\n');
    const ssSvg = `<svg width="${SW}" height="${SH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FF7A00"/>
          <stop offset="50%" stop-color="#1C1C1C"/>
          <stop offset="100%" stop-color="#0A0A0A"/>
        </linearGradient>
        <linearGradient id="card" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <rect width="${SW}" height="${SH}" fill="url(#g2)"/>
      <circle cx="900" cy="200" r="220" fill="#FF7A00" opacity="0.10"/>
      <circle cx="180" cy="1700" r="180" fill="#FF7A00" opacity="0.08"/>
      <rect x="80" y="780" width="${SW - 160}" height="700" rx="32" ry="32" fill="url(#card)" stroke="#FF7A00" stroke-opacity="0.25" stroke-width="2"/>
      <text x="${SW / 2}" y="950" text-anchor="middle" font-size="220" font-family="Arial">${s.icon}</text>
      <text x="${SW / 2}" y="1180" text-anchor="middle" font-family="Impact, 'Arial Black', sans-serif" font-weight="900" font-size="80" fill="#FFFFFF" letter-spacing="2">${s.headline}</text>
      <text x="${SW / 2}" y="1270" text-anchor="middle" font-family="Impact, 'Arial Black', sans-serif" font-weight="900" font-size="80" fill="#FF7A00" letter-spacing="2">${s.headline2}</text>
      ${subLines.map((line, i) => `<text x="${SW / 2}" y="${1380 + i * 50}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="500" font-size="36" fill="#E5E7EB" opacity="0.9">${line}</text>`).join('\n      ')}
      <text x="${SW / 2}" y="1820" text-anchor="middle" font-family="Arial, sans-serif" font-weight="600" font-size="28" fill="#FFFFFF" opacity="0.6" letter-spacing="3">MEU RACHÃO PRO</text>
    </svg>`;

    const ssPath = path.join(OUT_DIR, s.file);
    await sharp(Buffer.from(ssSvg))
      .composite([{ input: screenshotLogoBuf, left: (SW - 280) / 2, top: 200 }])
      .png({ compressionLevel: 9 })
      .toFile(ssPath);
    console.log('  ->', ssPath, `(${(fs.statSync(ssPath).size / 1024).toFixed(0)} KB)`);
  }

  console.log('\nDone. Arquivos em', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
