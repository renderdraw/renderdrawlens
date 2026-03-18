// Run with: npx tsx src/icons/generate-icons.ts
// Generates SVG icons for the extension
import { writeFileSync } from "fs";

const sizes = [16, 32, 48, 128];

function generateSVG(size: number): string {
  const r = size / 2;
  const strokeWidth = Math.max(1, size / 16);
  const innerR = r * 0.35;
  const crosshairLen = r * 0.2;
  const ringR = r * 0.65;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FFD700"/>
      <stop offset="100%" style="stop-color:#f59e0b"/>
    </linearGradient>
  </defs>
  <circle cx="${r}" cy="${r}" r="${r - 1}" fill="#0a0a0f"/>
  <circle cx="${r}" cy="${r}" r="${ringR}" fill="none" stroke="url(#gold)" stroke-width="${strokeWidth}"/>
  <circle cx="${r}" cy="${r}" r="${innerR}" fill="url(#gold)" opacity="0.9"/>
  <line x1="${r}" y1="${r - ringR - crosshairLen}" x2="${r}" y2="${r - ringR + crosshairLen}" stroke="url(#gold)" stroke-width="${strokeWidth * 0.8}" stroke-linecap="round"/>
  <line x1="${r}" y1="${r + ringR - crosshairLen}" x2="${r}" y2="${r + ringR + crosshairLen}" stroke="url(#gold)" stroke-width="${strokeWidth * 0.8}" stroke-linecap="round"/>
  <line x1="${r - ringR - crosshairLen}" y1="${r}" x2="${r - ringR + crosshairLen}" y2="${r}" stroke="url(#gold)" stroke-width="${strokeWidth * 0.8}" stroke-linecap="round"/>
  <line x1="${r + ringR - crosshairLen}" y1="${r}" x2="${r + ringR + crosshairLen}" y2="${r}" stroke="url(#gold)" stroke-width="${strokeWidth * 0.8}" stroke-linecap="round"/>
</svg>`;
}

for (const size of sizes) {
  writeFileSync(`public/icons/lens-${size}.svg`, generateSVG(size));
  console.log(`Generated lens-${size}.svg`);
}
