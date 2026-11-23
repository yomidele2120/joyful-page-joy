// Poster layouts drawn on a canvas, so a vendor can turn one photo into a designed ad picture with no design software.
// The drawing code only uses plain canvas calls, so it also runs against a recording stand-in in tests.
export interface PosterInput { image: { width: number; height: number } | null; shop: string; headline: string; cta: string; accent: string }
export interface PosterDesign { id: string; label: string; draw: (c: any, w: number, h: number, i: PosterInput, img: any) => void }

export const POSTER_SIZE = 1080;
export const POSTER_ACCENTS = ['#ff7a00', '#e11d48', '#2563eb', '#059669', '#7c3aed', '#0f172a'];

/** Breaks text into lines no wider than maxWidth, using the supplied measuring function. Never returns more than maxLines. */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number, maxLines = 3): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = []; let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (measure(t) <= maxWidth || !line) line = t; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { const kept = lines.slice(0, maxLines); kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S*$/, '') + '…'; return kept; }
  return lines;
}

function rgba(hex: string, a: number) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function cover(c: any, img: any, x: number, y: number, w: number, h: number) {
  if (!img) { c.fillStyle = '#d4d4d8'; c.fillRect(x, y, w, h); return; }
  const r = Math.max(w / img.width, h / img.height); const dw = img.width * r, dh = img.height * r;
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); c.restore();
}
function roundRect(c: any, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function text(c: any, s: string, x: number, y: number, size: number, color: string, opts: { weight?: number; align?: 'left' | 'center' | 'right'; maxWidth?: number; maxLines?: number; lineHeight?: number } = {}) {
  c.font = `${opts.weight ?? 800} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; c.fillStyle = color; c.textAlign = opts.align ?? 'left'; c.textBaseline = 'alphabetic';
  const lines = opts.maxWidth ? wrapLines(s, opts.maxWidth, (t) => c.measureText(t).width, opts.maxLines ?? 3) : [s];
  const lh = (opts.lineHeight ?? 1.1) * size;
  lines.forEach((l, i) => c.fillText(l, x, y + i * lh));
  return y + lines.length * lh;
}
function pill(c: any, label: string, x: number, y: number, size: number, bg: string, fg: string, align: 'left' | 'center' = 'left') {
  c.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const w = c.measureText(label).width + size * 2, h = size * 2.1, left = align === 'center' ? x - w / 2 : x;
  c.fillStyle = bg; roundRect(c, left, y, w, h, h / 2); c.fill();
  text(c, label, left + w / 2, y + h / 2 + size * 0.35, size, fg, { align: 'center' });
}

export const POSTER_DESIGNS: PosterDesign[] = [
  { id: 'spotlight', label: 'Spotlight', draw(c, w, h, i, img) {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#111827'); g.addColorStop(1, i.accent); c.fillStyle = g; c.fillRect(0, 0, w, h);
    const r = w * 0.26, cx = w / 2, cy = h * 0.32;
    const glow = c.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.7); glow.addColorStop(0, rgba('#ffffff', 0.35)); glow.addColorStop(1, rgba('#ffffff', 0)); c.fillStyle = glow; c.fillRect(0, 0, w, h);
    c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip(); cover(c, img, cx - r, cy - r, r * 2, r * 2); c.restore();
    c.lineWidth = 12; c.strokeStyle = '#fff'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    text(c, i.headline, cx, h * 0.69, 80, '#fff', { align: 'center', maxWidth: w * 0.84, maxLines: 2 });
    text(c, i.shop, cx, h * 0.86, 38, 'rgba(255,255,255,.85)', { align: 'center', weight: 600, maxWidth: w * 0.8, maxLines: 1 });
    pill(c, i.cta, cx, h * 0.89, 38, '#fff', '#111827', 'center');
  } },
  { id: 'split', label: 'Split', draw(c, w, h, i, img) {
    c.fillStyle = i.accent; c.fillRect(0, 0, w, h);
    cover(c, img, w * 0.46, 0, w * 0.54, h);
    c.fillStyle = i.accent; c.beginPath(); c.moveTo(w * 0.45, 0); c.lineTo(w * 0.56, 0); c.lineTo(w * 0.45, h); c.closePath(); c.fill();
    text(c, i.shop, 64, 120, 30, 'rgba(255,255,255,.85)', { weight: 600, maxWidth: w * 0.42, maxLines: 2, lineHeight: 1.2 });
    text(c, i.headline, 64, h * 0.34, 82, '#fff', { maxWidth: w * 0.4, maxLines: 5, lineHeight: 1.08 });
    pill(c, i.cta, 64, h - 190, 38, '#fff', i.accent);
  } },
  { id: 'diagonal', label: 'Diagonal band', draw(c, w, h, i, img) {
    cover(c, img, 0, 0, w, h);
    c.fillStyle = rgba('#000000', 0.18); c.fillRect(0, 0, w, h);
    c.fillStyle = i.accent; c.beginPath(); c.moveTo(0, h * 0.62); c.lineTo(w, h * 0.5); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
    text(c, i.headline, 64, h * 0.74, 78, '#fff', { maxWidth: w - 128, maxLines: 2 });
    text(c, i.shop, 64, h - 92, 36, 'rgba(255,255,255,.9)', { weight: 600, maxWidth: w * 0.5, maxLines: 1 });
    pill(c, i.cta, w - 64 - 300, h - 150, 34, '#fff', i.accent);
  } },
  { id: 'polaroid', label: 'Polaroid', draw(c, w, h, i, img) {
    c.fillStyle = '#f7f1e6'; c.fillRect(0, 0, w, h);
    c.fillStyle = rgba(i.accent, 0.18); c.beginPath(); c.arc(w * 0.88, h * 0.1, w * 0.3, 0, Math.PI * 2); c.fill();
    c.save(); c.translate(w / 2, h * 0.43); c.rotate(-0.05);
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(-w * 0.36 + 14, -h * 0.34 + 18, w * 0.72, h * 0.66);
    c.fillStyle = '#fff'; c.fillRect(-w * 0.36, -h * 0.34, w * 0.72, h * 0.66);
    cover(c, img, -w * 0.33, -h * 0.31, w * 0.66, h * 0.46);
    text(c, i.headline, 0, h * 0.245, 44, '#1f2937', { align: 'center', maxWidth: w * 0.62, maxLines: 2, lineHeight: 1.15 });
    c.restore();
    text(c, i.shop, w / 2, h * 0.86, 40, '#1f2937', { align: 'center', weight: 700, maxWidth: w * 0.8, maxLines: 1 });
    pill(c, i.cta, w / 2, h * 0.9, 34, i.accent, '#fff', 'center');
  } },
  { id: 'bold', label: 'Bold type', draw(c, w, h, i, img) {
    cover(c, img, 0, 0, w, h);
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, rgba('#000000', 0.78)); g.addColorStop(0.55, rgba('#000000', 0.15)); g.addColorStop(1, rgba('#000000', 0.7)); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = i.accent; c.fillRect(64, 70, 120, 14);
    text(c, i.headline.toUpperCase(), 64, 190, 112, '#fff', { maxWidth: w - 128, maxLines: 3, lineHeight: 1.02 });
    text(c, i.shop, 64, h - 150, 40, 'rgba(255,255,255,.9)', { weight: 600, maxWidth: w * 0.6, maxLines: 1 });
    pill(c, i.cta, 64, h - 120, 36, i.accent, '#fff');
  } },
  { id: 'burst', label: 'Sunburst', draw(c, w, h, i, img) {
    c.fillStyle = i.accent; c.fillRect(0, 0, w, h);
    c.fillStyle = rgba('#ffffff', 0.12);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, b = a + Math.PI / 16; c.beginPath(); c.moveTo(w / 2, h * 0.42); c.lineTo(w / 2 + Math.cos(a) * w, h * 0.42 + Math.sin(a) * w); c.lineTo(w / 2 + Math.cos(b) * w, h * 0.42 + Math.sin(b) * w); c.closePath(); c.fill(); }
    c.save(); roundRect(c, w * 0.22, h * 0.07, w * 0.56, w * 0.56, 56); c.clip(); cover(c, img, w * 0.22, h * 0.07, w * 0.56, w * 0.56); c.restore();
    c.lineWidth = 14; c.strokeStyle = '#fff'; roundRect(c, w * 0.22, h * 0.07, w * 0.56, w * 0.56, 56); c.stroke();
    text(c, i.headline, w / 2, h * 0.74, 66, '#fff', { align: 'center', maxWidth: w * 0.86, maxLines: 2 });
    pill(c, i.cta, w / 2, h * 0.835, 34, '#fff', i.accent, 'center');
    text(c, i.shop, w / 2, h * 0.965, 30, 'rgba(255,255,255,.85)', { align: 'center', weight: 600, maxWidth: w * 0.8, maxLines: 1 });
  } },
];

/** A different layout from the one shown now. */
export function nextDesignIndex(current: number, rand: () => number = Math.random): number {
  const n = POSTER_DESIGNS.length; if (n < 2) return 0;
  let k = Math.floor(rand() * (n - 1)); if (k >= current) k += 1; return k % n;
}
