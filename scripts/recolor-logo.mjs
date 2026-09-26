import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(root, 'src', 'assets', 'prodct logo.png');

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function clamp(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

const png = PNG.sync.read(fs.readFileSync(srcPath));
const { width, height, data } = png;

for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const a = data[i + 3];
  if (a < 8) continue;

  const [h, s, l] = rgbToHsl(r, g, b);

  // Keep near-white paper background
  if (l > 0.88 && s < 0.18) continue;
  // Keep yellow school bus
  if (h >= 28 && h <= 72 && s > 0.35 && l > 0.28 && l < 0.85) continue;
  // Keep skin / hair warm tones
  if (h >= 8 && h <= 50 && s > 0.18 && s < 0.7 && l > 0.2 && l < 0.78) continue;

  // Blue shield → emerald
  if (h >= 175 && h <= 260 && s > 0.18) {
    const [nr, ng, nb] = hslToRgb(160, Math.min(0.78, s * 1.05 + 0.08), l * 0.96);
    data[i] = clamp(nr);
    data[i + 1] = clamp(ng);
    data[i + 2] = clamp(nb);
    continue;
  }

  // Silver / grey metal wordmark and rim → emerald metal
  if (s < 0.22 && l > 0.22 && l < 0.86) {
    const mix = 0.42;
    data[i] = clamp(r * (1 - mix) + 5 * mix);
    data[i + 1] = clamp(g * (1 - mix) + 150 * mix);
    data[i + 2] = clamp(b * (1 - mix) + 105 * mix);
  }
}

const fullBuf = PNG.sync.write(png);
const dests = [
  path.join(root, 'src', 'assets', 'prodct logo.png'),
  path.join(root, 'src', 'assets', 'product-logo.png'),
  path.join(root, 'public', 'product-logo.png'),
];
for (const dest of dests) fs.writeFileSync(dest, fullBuf);

// Square app icon from the lower shield (bus) region
const iconSize = 512;
const cx = Math.floor(width / 2);
const cy = Math.floor(height * 0.72);
const half = Math.floor(Math.min(width, height) * 0.28);
const x0 = Math.max(0, cx - half);
const y0 = Math.max(0, cy - half);
const side = Math.min(half * 2, width - x0, height - y0);

const icon = new PNG({ width: iconSize, height: iconSize });
for (let y = 0; y < iconSize; y += 1) {
  const sy = y0 + Math.min(side - 1, Math.floor((y / iconSize) * side));
  for (let x = 0; x < iconSize; x += 1) {
    const sx = x0 + Math.min(side - 1, Math.floor((x / iconSize) * side));
    const si = (sy * width + sx) * 4;
    const di = (y * iconSize + x) * 4;
    icon.data[di] = data[si];
    icon.data[di + 1] = data[si + 1];
    icon.data[di + 2] = data[si + 2];
    icon.data[di + 3] = data[si + 3];
  }
}
const iconBuf = PNG.sync.write(icon);
fs.writeFileSync(path.join(root, 'public', 'app-icon.png'), iconBuf);
fs.writeFileSync(path.join(root, 'public', 'apple-touch-icon.png'), iconBuf);

console.log(`recolored ${width}x${height} → product-logo.png, app-icon ${iconSize}px`);
