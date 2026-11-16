// Offline check of the Content-Security-Policy in vercel.json. No packages and no network needed:  node scripts/check-csp.mjs
// 1) every resource the code is known to load is allowed by the right directive, and
// 2) obviously wrong things (other sites, other Supabase projects, http:, look-alike hosts) are blocked, and
// 3) the dangerous keywords are absent.
// It checks the POLICY TEXT against a list I built by reading the code. It cannot see what a third-party script does at run time,
// so it does not replace loading the site in a browser and watching the console (see SECURITY_HEADERS_CSP.md).
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const all = cfg.headers.flatMap(h => h.headers.map(x => ({ source: h.source, ...x })));
const find = k => all.filter(h => h.key.toLowerCase() === k.toLowerCase());
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

const csp = find('Content-Security-Policy');
ok(csp.length === 1, 'exactly one enforced Content-Security-Policy header');
ok(find('Content-Security-Policy-Report-Only').length === 0, 'no leftover Report-Only header');
const dirs = Object.fromEntries(csp[0].value.split(';').map(s => s.trim()).filter(Boolean).map(s => { const [n, ...v] = s.split(/\s+/); return [n, v]; }));

function sourceMatches(src, url) {
  if (src === "'self'") return url.origin === 'https://www.ithubafrica.com';
  if (src.startsWith("'")) return false;
  if (src === 'blob:') return url.protocol === 'blob:';
  if (src === 'data:') return url.protocol === 'data:';
  if (src === 'https:') return url.protocol === 'https:';
  const m = src.match(/^(?:([a-z]+):\/\/)?(\*\.)?([a-z0-9.-]+)(?::(\d+|\*))?(\/.*)?$/i);
  if (!m) return false;
  const [, scheme, wild, host, , path] = m;
  const s = scheme || 'https';
  if (s === 'https' && !['https:'].includes(url.protocol)) return false;
  if (s === 'wss' && url.protocol !== 'wss:') return false;
  if (s === 'wss' || s === 'https') { /* scheme ok */ }
  const h = url.hostname.toLowerCase();
  if (wild ? !(h.endsWith('.' + host.toLowerCase())) : h !== host.toLowerCase()) return false;
  if (path) {
    if (path.endsWith('/')) { if (!url.pathname.startsWith(path)) return false; }
    else if (url.pathname !== path) return false;
  }
  return true;
}
const allowed = (dir, u) => {
  const url = new URL(u);
  const list = dirs[dir] ?? dirs['default-src'] ?? [];
  return list.some(s => sourceMatches(s, url));
};

const SUPA = 'https://cgyzhkeliomwxwrpmnlh.supabase.co';
const MUST_ALLOW = [
  // scripts (index.html, Checkout.tsx, Recaptcha.tsx, Captcha.tsx, metaPixel.ts)
  ['script-src', 'https://www.ithubafrica.com/assets/index-abc.js'],
  ['script-src', 'https://js.paystack.co/v2/inline.js'],
  ['script-src', 'https://js.useklump.com/klump.js'],
  ['script-src', 'https://www.google.com/recaptcha/api.js?render=explicit'],
  ['script-src', 'https://www.gstatic.com/recaptcha/releases/abc/recaptcha__en.js'],
  ['script-src', 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'],
  ['script-src', 'https://connect.facebook.net/en_US/fbevents.js'],
  ['script-src', 'blob:https://www.ithubafrica.com/x'],            // ffmpeg core is run from a blob: URL (chatVideo.ts)
  // data / API traffic
  ['connect-src', `${SUPA}/rest/v1/products?select=*`],
  ['connect-src', `${SUPA}/functions/v1/zego-token`],
  ['connect-src', `${SUPA}/auth/v1/token?grant_type=password`],
  ['connect-src', `${SUPA}/storage/v1/object/vendor-docs/a.pdf`],
  ['connect-src', 'wss://cgyzhkeliomwxwrpmnlh.supabase.co/realtime/v1/websocket'],
  ['connect-src', 'https://www.ithubafrica.com/api/cloudinary'],
  ['connect-src', 'https://api.cloudinary.com/v1_1/demo/image/upload'],
  ['connect-src', 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm'],
  ['connect-src', 'https://videodelivery.net/abc/manifest/video.m3u8'],
  ['connect-src', 'https://customer-xyz.cloudflarestream.com/abc/manifest/video.m3u8'],
  ['connect-src', 'https://upload.videodelivery.net/tus/abc'],
  ['connect-src', 'https://api.paystack.co/transaction/initialize'],
  ['connect-src', 'https://api.useklump.com/v1/x'],
  ['connect-src', 'https://www.facebook.com/tr/?id=1'],
  ['connect-src', 'wss://webliveroom123-api.zego.im/ws'],
  ['connect-src', 'https://www.google.com/recaptcha/api2/clr'],
  // frames
  ['frame-src', 'https://checkout.paystack.com/abc'],
  ['frame-src', 'https://standard.paystack.co/abc'],
  ['frame-src', 'https://www.tiktok.com/embed/v2/7123'],
  ['frame-src', 'https://www.google.com/maps?q=Ikeja&output=embed'],
  ['frame-src', 'https://www.google.com/recaptcha/api2/anchor'],
  ['frame-src', 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/turnstile/if/x'],
  ['frame-src', `${SUPA}/storage/v1/object/sign/docs/a.pdf?token=1`],
  // pictures, fonts, styles, media, workers
  ['img-src', 'https://res.cloudinary.com/demo/image/upload/w_400/a.jpg'],
  ['img-src', `${SUPA}/storage/v1/object/public/products/a.jpg`],
  ['img-src', 'data:image/png;base64,AAAA'],
  ['img-src', 'blob:https://www.ithubafrica.com/x'],
  ['font-src', 'https://fonts.gstatic.com/s/inter/v1/a.woff2'],
  ['style-src', 'https://fonts.googleapis.com/css2?family=Inter'],
  ['media-src', 'https://res.cloudinary.com/demo/video/upload/a.mp4'],
  ['media-src', 'https://videodelivery.net/abc/manifest/video.m3u8'],
  ['media-src', 'blob:https://www.ithubafrica.com/x'],
  ['worker-src', 'blob:https://www.ithubafrica.com/x'],
  ['worker-src', 'https://www.ithubafrica.com/assets/worker-abc.js'],
];
const MUST_BLOCK = [
  ['script-src', 'https://evil.example/x.js'],
  ['script-src', 'https://unpkg.com/some-package/x.js'],
  ['script-src', 'https://cdn.jsdelivr.net/x.js'],
  ['script-src', 'https://www.google.com/jsapi'],                    // only the recaptcha path of google.com may run
  ['script-src', 'https://js.paystack.co.evil.example/x.js'],
  ['script-src', 'http://js.paystack.co/v2/inline.js'],
  ['script-src', 'https://vercel.live/_next-live/feedback/feedback.js'],
  ['connect-src', 'https://evil.example/steal'],
  ['connect-src', 'https://abcdefghijklmnopqrst.supabase.co/rest/v1/x'],   // another Supabase project
  ['connect-src', `${SUPA}.evil.example/rest/v1/x`],
  ['connect-src', 'wss://abcdefghijklmnopqrst.supabase.co/realtime/v1/websocket'],
  ['connect-src', 'https://api.paystack.co.evil.example/x'],
  ['frame-src', 'https://evil.example/'],
  ['frame-src', 'https://www.google.com/search?q=x'],
  ['frame-src', 'https://www.tiktok.com/login'],
  ['object-src', 'https://www.ithubafrica.com/x.swf'],
  ['font-src', 'https://evil.example/f.woff2'],
  ['style-src', 'https://evil.example/s.css'],
  ['media-src', 'https://evil.example/v.mp4'],
];
for (const [d, u] of MUST_ALLOW) ok(allowed(d, u), `${d} allows ${u}`);
for (const [d, u] of MUST_BLOCK) ok(!allowed(d, u), `${d} blocks ${u}`);

const text = csp[0].value;
ok(!/'unsafe-eval'/.test(text), "no 'unsafe-eval'");
ok(!/script-src[^;]*'unsafe-inline'/.test(text), "script-src has no 'unsafe-inline'");
ok(!/(^|[\s;])\*([\s;]|$)/.test(text), 'no bare * source');
ok(!/script-src[^;]*\bhttps:(?=[\s;]|$)/.test(text) && !/connect-src[^;]*\bhttps:(?=[\s;]|$)/.test(text) && !/frame-src[^;]*\bhttps:(?=[\s;]|$)/.test(text), 'no bare https: in script-src, connect-src or frame-src');
ok(dirs['object-src']?.join() === "'none'", "object-src 'none'");
ok(dirs['base-uri']?.join() === "'self'", "base-uri 'self'");
ok(dirs['form-action']?.join() === "'self'", "form-action 'self'");
ok(dirs['frame-ancestors']?.join() === "'none'", "frame-ancestors 'none'");
ok('upgrade-insecure-requests' in dirs, 'upgrade-insecure-requests present');
ok(!/supabase\.co/.test(text.replace(/cgyzhkeliomwxwrpmnlh\.supabase\.co/g, '')), 'only the one Supabase project is named (no *.supabase.co)');
const one = k => { const h = find(k); ok(h.length === 1, `exactly one ${k} header`); return h[0]?.value; };
ok(one('X-Frame-Options') === 'DENY', 'X-Frame-Options DENY');
ok(one('X-Content-Type-Options') === 'nosniff', 'X-Content-Type-Options nosniff');
ok(one('Referrer-Policy') === 'strict-origin-when-cross-origin', 'Referrer-Policy strict-origin-when-cross-origin');
ok(/max-age=(\d+)/.test(one('Strict-Transport-Security') ?? '') && Number(RegExp.$1) >= 31536000, 'HSTS max-age is at least one year');
const pp = one('Permissions-Policy') ?? '';
ok(/camera=\(self\)/.test(pp) && /microphone=\(self\)/.test(pp), 'camera and microphone kept for calls');
ok(/geolocation=\(\)/.test(pp), 'geolocation off');
console.log(fails ? `\n${fails} check(s) failed` : '\nAll CSP checks passed');
process.exit(fails ? 1 : 0);
