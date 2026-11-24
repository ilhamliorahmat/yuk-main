import type { UlarHeroClassId } from '../types';
import type { UlarScenarioPack } from './packs';

const pawnArtCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 96;

function normalizeHex(hex: string | undefined, fallback = '#F59E0B'): string {
  if (!hex || typeof hex !== 'string') return fallback;
  const clean = hex.trim();
  return /^#[0-9a-fA-F]{6}$/.test(clean) ? clean : fallback;
}

function adjustHex(hex: string, delta: number): string {
  const safe = normalizeHex(hex);
  const r = Math.max(0, Math.min(255, parseInt(safe.slice(1, 3), 16) + delta));
  const g = Math.max(0, Math.min(255, parseInt(safe.slice(3, 5), 16) + delta));
  const b = Math.max(0, Math.min(255, parseInt(safe.slice(5, 7), 16) + delta));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function drawOutlinedPath(
  ctx: CanvasRenderingContext2D,
  fill: string | CanvasGradient,
  stroke = '#090D16',
  lineWidth = 4.5,
) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function drawKsatria(
  ctx: CanvasRenderingContext2D,
  accent: string,
  accentDark: string,
  accentLight: string,
) {
  // Broadsword blade rising behind right shoulder
  ctx.save();
  ctx.translate(168, 86);
  ctx.rotate(0.42);
  const bladeGrad = ctx.createLinearGradient(-8, -56, 8, 20);
  bladeGrad.addColorStop(0, '#F8FAFC');
  bladeGrad.addColorStop(0.5, '#CBD5E1');
  bladeGrad.addColorStop(1, '#64748B');
  ctx.beginPath();
  ctx.moveTo(0, -64);
  ctx.lineTo(9, -46);
  ctx.lineTo(7, 26);
  ctx.lineTo(-7, 26);
  ctx.lineTo(-9, -46);
  ctx.closePath();
  drawOutlinedPath(ctx, bladeGrad, '#0F172A', 4);
  // Crossguard
  ctx.beginPath();
  ctx.roundRect(-18, 22, 36, 9, 4);
  drawOutlinedPath(ctx, '#F59E0B', '#0F172A', 3.5);
  ctx.restore();

  // Flowing helmet plume (player avatarColor)
  const plumeGrad = ctx.createLinearGradient(86, 16, 152, 72);
  plumeGrad.addColorStop(0, accentLight);
  plumeGrad.addColorStop(0.55, accent);
  plumeGrad.addColorStop(1, accentDark);
  ctx.beginPath();
  ctx.moveTo(118, 44);
  ctx.bezierCurveTo(106, 12, 164, 14, 178, 48);
  ctx.bezierCurveTo(164, 52, 146, 56, 134, 62);
  ctx.closePath();
  drawOutlinedPath(ctx, plumeGrad);

  // Armored chest & tabard
  const armorGrad = ctx.createLinearGradient(76, 136, 180, 222);
  armorGrad.addColorStop(0, '#94A3B8');
  armorGrad.addColorStop(0.5, '#64748B');
  armorGrad.addColorStop(1, '#334155');
  ctx.beginPath();
  ctx.moveTo(64, 214);
  ctx.quadraticCurveTo(68, 146, 128, 140);
  ctx.quadraticCurveTo(188, 146, 192, 214);
  ctx.closePath();
  drawOutlinedPath(ctx, armorGrad);

  // Diagonal heraldic sash in avatarColor
  ctx.beginPath();
  ctx.moveTo(92, 148);
  ctx.lineTo(118, 143);
  ctx.lineTo(176, 212);
  ctx.lineTo(148, 214);
  ctx.closePath();
  drawOutlinedPath(ctx, accent, '#090D16', 3.5);

  // Riveted left & right shoulder pauldrons
  for (const [cx, tilt] of [
    [78, -0.2],
    [176, 0.2],
  ] as const) {
    ctx.save();
    ctx.translate(cx, 158);
    ctx.rotate(tilt);
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 16, 0, Math.PI * 0.9, Math.PI * 2.15);
    ctx.closePath();
    drawOutlinedPath(ctx, '#CBD5E1');
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.arc(0, -3, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Sallet Great-Helm
  const helmGrad = ctx.createLinearGradient(88, 52, 164, 146);
  helmGrad.addColorStop(0, '#F1F5F9');
  helmGrad.addColorStop(0.45, '#94A3B8');
  helmGrad.addColorStop(1, '#475569');
  ctx.beginPath();
  ctx.moveTo(90, 114);
  ctx.bezierCurveTo(86, 62, 108, 44, 128, 44);
  ctx.bezierCurveTo(148, 44, 170, 62, 166, 114);
  ctx.lineTo(154, 146);
  ctx.lineTo(128, 154);
  ctx.lineTo(102, 146);
  ctx.closePath();
  drawOutlinedPath(ctx, helmGrad);

  // T-visor slit + golden nose ridge
  ctx.fillStyle = '#0B1018';
  ctx.beginPath();
  ctx.roundRect(102, 92, 52, 11, 4);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(123, 96, 10, 34, 4);
  ctx.fill();
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(108, 95, 11, 4);
  ctx.fillRect(137, 95, 11, 4);

  // Foreground Kite Shield (left-front)
  ctx.save();
  ctx.translate(78, 178);
  ctx.rotate(-0.14);
  const shieldGrad = ctx.createLinearGradient(-26, -34, 26, 38);
  shieldGrad.addColorStop(0, accentLight);
  shieldGrad.addColorStop(0.6, accent);
  shieldGrad.addColorStop(1, accentDark);
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(28, -22);
  ctx.quadraticCurveTo(28, 16, 0, 38);
  ctx.quadraticCurveTo(-28, 16, -28, -22);
  ctx.closePath();
  drawOutlinedPath(ctx, shieldGrad, '#FBBF24', 5);
  // Shield center boss
  ctx.beginPath();
  ctx.arc(0, -2, 8, 0, Math.PI * 2);
  drawOutlinedPath(ctx, '#FDE68A', '#0F172A', 3);
  ctx.restore();
}

function drawPencuri(
  ctx: CanvasRenderingContext2D,
  accent: string,
  accentDark: string,
  accentLight: string,
) {
  // Twin curved keris/rogue daggers behind shoulders
  for (const [x, ang] of [
    [66, -0.58],
    [190, 0.58],
  ] as const) {
    ctx.save();
    ctx.translate(x, 128);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, -56);
    ctx.quadraticCurveTo(13, -24, 5, 16);
    ctx.lineTo(-5, 16);
    ctx.quadraticCurveTo(-4, -22, 0, -56);
    ctx.closePath();
    drawOutlinedPath(ctx, '#E2E8F0', '#090D16', 4);
    ctx.beginPath();
    ctx.roundRect(-11, 14, 22, 7, 3);
    drawOutlinedPath(ctx, '#F59E0B', '#090D16', 3);
    ctx.restore();
  }

  // Leather brigandine cloak
  const leatherGrad = ctx.createLinearGradient(74, 134, 180, 220);
  leatherGrad.addColorStop(0, '#334155');
  leatherGrad.addColorStop(0.6, '#1E293B');
  leatherGrad.addColorStop(1, '#0F172A');
  ctx.beginPath();
  ctx.moveTo(64, 214);
  ctx.quadraticCurveTo(72, 140, 128, 136);
  ctx.quadraticCurveTo(184, 140, 192, 214);
  ctx.closePath();
  drawOutlinedPath(ctx, leatherGrad);

  // Crossed leather belt straps + gold coin pouch
  ctx.strokeStyle = '#92400E';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(86, 152);
  ctx.lineTo(166, 206);
  ctx.moveTo(168, 152);
  ctx.lineTo(88, 206);
  ctx.stroke();

  // Coin pouch at hip
  ctx.beginPath();
  ctx.arc(160, 194, 15, 0, Math.PI * 2);
  drawOutlinedPath(ctx, '#F59E0B', '#090D16', 3.5);
  ctx.fillStyle = '#FEF3C7';
  ctx.beginPath();
  ctx.arc(156, 189, 4, 0, Math.PI * 2);
  ctx.fill();

  // Rogue pointed hood
  const hoodGrad = ctx.createLinearGradient(84, 42, 168, 148);
  hoodGrad.addColorStop(0, '#475569');
  hoodGrad.addColorStop(0.5, '#1E293B');
  hoodGrad.addColorStop(1, '#090D16');
  ctx.beginPath();
  ctx.moveTo(82, 132);
  ctx.bezierCurveTo(78, 72, 108, 36, 136, 34);
  ctx.bezierCurveTo(156, 34, 178, 72, 174, 132);
  ctx.quadraticCurveTo(128, 148, 82, 132);
  ctx.closePath();
  drawOutlinedPath(ctx, hoodGrad);

  // Shadowed face void + glinting eyes
  ctx.beginPath();
  ctx.ellipse(128, 104, 29, 26, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#060911';
  ctx.fill();

  // Sharp glowing rogue eyes
  ctx.fillStyle = '#FBBF24';
  ctx.beginPath();
  ctx.moveTo(108, 97);
  ctx.lineTo(122, 101);
  ctx.lineTo(111, 106);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(148, 97);
  ctx.lineTo(134, 101);
  ctx.lineTo(145, 106);
  ctx.closePath();
  ctx.fill();

  // Dynamic neck scarf & trailing tail in avatarColor
  const scarfGrad = ctx.createLinearGradient(84, 114, 184, 166);
  scarfGrad.addColorStop(0, accentLight);
  scarfGrad.addColorStop(0.5, accent);
  scarfGrad.addColorStop(1, accentDark);
  ctx.beginPath();
  ctx.moveTo(156, 128);
  ctx.bezierCurveTo(186, 124, 206, 142, 198, 164);
  ctx.bezierCurveTo(180, 156, 166, 148, 148, 148);
  ctx.closePath();
  drawOutlinedPath(ctx, scarfGrad);

  ctx.beginPath();
  ctx.roundRect(92, 116, 72, 30, 14);
  drawOutlinedPath(ctx, scarfGrad);
}

function drawPenyihir(
  ctx: CanvasRenderingContext2D,
  accent: string,
  accentDark: string,
  accentLight: string,
) {
  // Ornate Arcane Staff + Crystal Orb (right side)
  ctx.strokeStyle = '#78350F';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(180, 216);
  ctx.lineTo(186, 78);
  ctx.stroke();
  ctx.strokeStyle = '#090D16';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Crystal cradle & orb
  const orbGlow = ctx.createRadialGradient(186, 62, 3, 186, 62, 24);
  orbGlow.addColorStop(0, '#FFFFFF');
  orbGlow.addColorStop(0.35, accentLight);
  orbGlow.addColorStop(0.75, accent);
  orbGlow.addColorStop(1, 'rgba(139, 92, 246, 0)');
  ctx.fillStyle = orbGlow;
  ctx.beginPath();
  ctx.arc(186, 62, 26, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(186, 62, 12, 0, Math.PI * 2);
  drawOutlinedPath(ctx, accentLight, '#0F172A', 3.5);

  // Flowing wizard cloak
  const robeGrad = ctx.createLinearGradient(68, 134, 174, 220);
  robeGrad.addColorStop(0, '#4C1D95');
  robeGrad.addColorStop(0.55, '#312E81');
  robeGrad.addColorStop(1, '#1E1B4B');
  ctx.beginPath();
  ctx.moveTo(64, 214);
  ctx.quadraticCurveTo(72, 142, 124, 136);
  ctx.quadraticCurveTo(176, 142, 184, 214);
  ctx.closePath();
  drawOutlinedPath(ctx, robeGrad);

  // Mantle collar in avatarColor
  const collarGrad = ctx.createLinearGradient(82, 132, 166, 174);
  collarGrad.addColorStop(0, accentLight);
  collarGrad.addColorStop(0.5, accent);
  collarGrad.addColorStop(1, accentDark);
  ctx.beginPath();
  ctx.moveTo(84, 152);
  ctx.quadraticCurveTo(124, 184, 164, 152);
  ctx.lineTo(148, 136);
  ctx.quadraticCurveTo(124, 150, 100, 136);
  ctx.closePath();
  drawOutlinedPath(ctx, collarGrad);

  // Face & arcane beard/shadow
  ctx.beginPath();
  ctx.arc(124, 114, 26, 0, Math.PI * 2);
  drawOutlinedPath(ctx, '#1E1B4B');
  ctx.fillStyle = '#38BDF8';
  ctx.beginPath();
  ctx.arc(114, 112, 4, 0, Math.PI * 2);
  ctx.arc(134, 112, 4, 0, Math.PI * 2);
  ctx.fill();

  // Tall crooked wizard hat
  const hatGrad = ctx.createLinearGradient(76, 20, 168, 104);
  hatGrad.addColorStop(0, '#6D28D9');
  hatGrad.addColorStop(0.6, '#3B0764');
  hatGrad.addColorStop(1, '#1E1B4B');
  ctx.beginPath();
  ctx.moveTo(82, 94);
  ctx.bezierCurveTo(96, 54, 114, 18, 156, 24);
  ctx.bezierCurveTo(140, 44, 152, 68, 162, 94);
  ctx.closePath();
  drawOutlinedPath(ctx, hatGrad);

  // Hat band (avatarColor) + gem buckle
  ctx.beginPath();
  ctx.roundRect(88, 78, 72, 14, 5);
  drawOutlinedPath(ctx, accent);
  ctx.beginPath();
  ctx.arc(124, 85, 6, 0, Math.PI * 2);
  drawOutlinedPath(ctx, '#FDE047', '#0F172A', 2.5);

  // Wide curved hat brim
  ctx.beginPath();
  ctx.ellipse(124, 96, 56, 12, -0.05, 0, Math.PI * 2);
  drawOutlinedPath(ctx, '#4C1D95');
}

function drawTabib(
  ctx: CanvasRenderingContext2D,
  accent: string,
  accentDark: string,
  accentLight: string,
) {
  // Apothecary Lantern-Staff (left side)
  ctx.strokeStyle = '#92400E';
  ctx.lineWidth = 7.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(64, 214);
  ctx.lineTo(64, 82);
  ctx.quadraticCurveTo(64, 56, 86, 58);
  ctx.stroke();
  ctx.strokeStyle = '#090D16';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Hanging glowing sanctuary lantern
  const lanternGlow = ctx.createRadialGradient(86, 84, 3, 86, 84, 24);
  lanternGlow.addColorStop(0, '#FEF08A');
  lanternGlow.addColorStop(0.45, '#34D399');
  lanternGlow.addColorStop(1, 'rgba(52, 211, 153, 0)');
  ctx.fillStyle = lanternGlow;
  ctx.beginPath();
  ctx.arc(86, 84, 24, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(76, 70, 20, 26, 6);
  drawOutlinedPath(ctx, '#6EE7B7', '#0F172A', 3.5);

  // Layered healer vestments
  const vestGrad = ctx.createLinearGradient(76, 134, 184, 220);
  vestGrad.addColorStop(0, '#E2E8F0');
  vestGrad.addColorStop(0.55, '#94A3B8');
  vestGrad.addColorStop(1, '#475569');
  ctx.beginPath();
  ctx.moveTo(74, 214);
  ctx.quadraticCurveTo(80, 140, 132, 136);
  ctx.quadraticCurveTo(184, 140, 192, 214);
  ctx.closePath();
  drawOutlinedPath(ctx, vestGrad);

  // Draped capelet in avatarColor
  const capeGrad = ctx.createLinearGradient(84, 134, 184, 186);
  capeGrad.addColorStop(0, accentLight);
  capeGrad.addColorStop(0.55, accent);
  capeGrad.addColorStop(1, accentDark);
  ctx.beginPath();
  ctx.moveTo(86, 156);
  ctx.quadraticCurveTo(132, 188, 178, 156);
  ctx.lineTo(164, 136);
  ctx.quadraticCurveTo(132, 148, 100, 136);
  ctx.closePath();
  drawOutlinedPath(ctx, capeGrad);

  // Emerald cross clasp on chest
  ctx.fillStyle = '#34D399';
  ctx.strokeStyle = '#090D16';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(128, 154, 8, 22, 2);
  ctx.roundRect(121, 161, 22, 8, 2);
  ctx.fill();
  ctx.stroke();

  // Serene Healer Hood + Brow Circlet
  const cowlGrad = ctx.createLinearGradient(90, 48, 172, 144);
  cowlGrad.addColorStop(0, '#0F766E');
  cowlGrad.addColorStop(0.55, '#115E59');
  cowlGrad.addColorStop(1, '#134E4A');
  ctx.beginPath();
  ctx.moveTo(88, 128);
  ctx.bezierCurveTo(86, 66, 110, 44, 132, 44);
  ctx.bezierCurveTo(154, 44, 178, 66, 176, 128);
  ctx.quadraticCurveTo(132, 146, 88, 128);
  ctx.closePath();
  drawOutlinedPath(ctx, cowlGrad);

  // Warm face & calm expression
  ctx.beginPath();
  ctx.ellipse(132, 104, 24, 25, 0, 0, Math.PI * 2);
  drawOutlinedPath(ctx, '#FDE68A', '#0F172A', 3.5);
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.arc(123, 102, 3, 0, Math.PI * 2);
  ctx.arc(141, 102, 3, 0, Math.PI * 2);
  ctx.fill();

  // Brass & Emerald Forehead Circlet
  ctx.beginPath();
  ctx.arc(132, 82, 22, Math.PI * 1.12, Math.PI * 1.88);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#FBBF24';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(132, 74, 5.5, 0, Math.PI * 2);
  drawOutlinedPath(ctx, '#34D399', '#090D16', 2.5);
}

export function getUlarPawnArtworkUrl(
  heroClass: UlarHeroClassId,
  avatarColor: string,
  artStyle: UlarScenarioPack['artStyle'] = 'nusantara',
): string {
  const safeColor = normalizeHex(avatarColor);
  const key = `${heroClass}:${safeColor}:${artStyle}`;
  const cached = pawnArtCache.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Subtle ambient backlight halo tuned by artStyle + avatarColor
  const haloHex =
    artStyle === 'cyber'
      ? '#22D3EE'
      : artStyle === 'mistis'
        ? '#C084FC'
        : '#FBBF24';
  const bgHalo = ctx.createRadialGradient(128, 136, 16, 128, 136, 104);
  bgHalo.addColorStop(0, `${haloHex}33`);
  bgHalo.addColorStop(0.6, `${safeColor}1A`);
  bgHalo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bgHalo;
  ctx.fillRect(0, 0, 256, 256);

  const accentDark = adjustHex(safeColor, -48);
  const accentLight = adjustHex(safeColor, 48);

  if (heroClass === 'ksatria') {
    drawKsatria(ctx, safeColor, accentDark, accentLight);
  } else if (heroClass === 'pencuri') {
    drawPencuri(ctx, safeColor, accentDark, accentLight);
  } else if (heroClass === 'penyihir') {
    drawPenyihir(ctx, safeColor, accentDark, accentLight);
  } else {
    drawTabib(ctx, safeColor, accentDark, accentLight);
  }

  const dataUrl = canvas.toDataURL('image/png');
  if (pawnArtCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = pawnArtCache.keys().next().value;
    if (firstKey) pawnArtCache.delete(firstKey);
  }
  pawnArtCache.set(key, dataUrl);
  return dataUrl;
}
