# Security headers and Content-Security-Policy

Scope: browser-side hardening for www.ithubafrica.com (Vite + React single-page app on Vercel, Supabase, Cloudinary).
This is header configuration. It is not a complete security audit.

## What was verified, and how

| Question | Answer | Where it came from |
|---|---|---|
| Framework | Vite + React SPA, no Next.js, no middleware | package.json, vite.config.ts |
| Where headers live | `vercel.json` (`headers` for `/(.*)`, which also covers `/api/*`) | vercel.json |
| Existing rewrites | Left exactly as they were | vercel.json |
| Inline scripts in the built page | None. The only `<script>` tags are the app bundle, Paystack and Klump | dist/index.html, index.html |
| `eval` / `new Function` in the app | None found | grep of src |
| Live Supabase project | `cgyzhkeliomwxwrpmnlh` (confirmed by the owner) | owner |

## Files changed

- `vercel.json`: removed the Report-Only CSP, added an enforced `Content-Security-Policy`, `X-Frame-Options` SAMEORIGIN to DENY, wider `Permissions-Policy`. Rewrites, cron and cache headers are untouched.
- `scripts/check-csp.mjs` (new) and `package.json` (`npm run check:csp`): offline check of the policy.
- `.gitignore`: now ignores `.env`, `.env.*` (except `.env.example`) and `dist`.
- `SECURITY_HEADERS_CSP.md` (this file).

No application code, UI, database schema, payment or auth logic was changed.

## Headers now sent on every route

| Header | Value | Note |
|---|---|---|
| Content-Security-Policy | see below | enforced, no Report-Only left |
| Strict-Transport-Security | `max-age=63072000; includeSubDomains` | unchanged (2 years, above the 1-year minimum). Not preloaded: see weaknesses |
| X-Content-Type-Options | `nosniff` | unchanged |
| X-Frame-Options | `DENY` | was SAMEORIGIN. The app never frames itself |
| Referrer-Policy | `strict-origin-when-cross-origin` | unchanged |
| Permissions-Policy | `accelerometer=(), bluetooth=(), browsing-topics=(), camera=(self), display-capture=(self), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(self), midi=(), payment=(self "https://checkout.paystack.com" "https://standard.paystack.co"), serial=(), usb=()` | camera, microphone and screen capture kept for ZEGOCLOUD calls and voice notes |

## Final CSP

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval' blob: https://js.paystack.co https://js.useklump.com https://connect.facebook.net https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://challenges.cloudflare.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.useklump.com;
font-src 'self' data: https://fonts.gstatic.com;
img-src 'self' data: blob: https:;
media-src 'self' blob: https://cgyzhkeliomwxwrpmnlh.supabase.co https://res.cloudinary.com https://videodelivery.net https://*.videodelivery.net https://*.cloudflarestream.com https://*.zego.im https://*.zegocloud.com;
connect-src 'self' blob: https://cgyzhkeliomwxwrpmnlh.supabase.co wss://cgyzhkeliomwxwrpmnlh.supabase.co https://api.cloudinary.com https://unpkg.com https://videodelivery.net https://*.videodelivery.net https://*.cloudflarestream.com https://api.paystack.co https://checkout.paystack.com https://*.useklump.com https://connect.facebook.net https://www.facebook.com/tr/ https://www.google.com/recaptcha/ https://challenges.cloudflare.com https://*.zego.im wss://*.zego.im https://*.zegocloud.com wss://*.zegocloud.com https://*.zegocdn.com;
frame-src https://checkout.paystack.com https://standard.paystack.co https://*.useklump.com https://www.tiktok.com/embed/ https://challenges.cloudflare.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://www.google.com/maps https://cgyzhkeliomwxwrpmnlh.supabase.co;
worker-src 'self' blob:;
manifest-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```

## Why each outside domain is allowed

| Domain | Directive | Why | Evidence |
|---|---|---|---|
| cgyzhkeliomwxwrpmnlh.supabase.co (https and wss) | connect, media, frame | database, sign-in, storage, edge functions, realtime. The old `*.supabase.co` wildcard is gone, so no other Supabase project can be reached. The frame entry is the admin PDF preview | src/integrations/supabase/client.ts, AdminDashboard.tsx |
| js.paystack.co | script | Paystack inline checkout script | index.html, Checkout.tsx |
| checkout.paystack.com, standard.paystack.co | frame (and checkout.paystack.com connect) | Paystack checkout window. Two hosts because I could not confirm which one the script uses | index.html preconnect; [third-party guide](https://mctaba.com/learn/paystack/paystack-checkout-blocked-by-content-security-policy) |
| api.paystack.co | connect | listed by the same guide; the app itself calls it only from server functions | supabase/functions |
| js.useklump.com, *.useklump.com | script / style, frame, connect | Klump pay-later script and checkout | index.html, Checkout.tsx; Klump publishes no CSP list, so the subdomain wildcard stays |
| api.cloudinary.com | connect | signed image uploads | api/cloudinary.ts |
| res.cloudinary.com | media (images come under img-src) | Cloudinary image and video delivery | src/lib/cloudinaryUrl.ts |
| videodelivery.net, *.videodelivery.net, *.cloudflarestream.com | connect, media | Cloudflare Stream playback (hls.js) and upload. The bare `videodelivery.net` is listed on purpose: `*.videodelivery.net` does not match it, and the old Report-Only policy missed it | src/lib/cloudflareStream.ts, PostMedia.tsx |
| unpkg.com | connect | downloads ffmpeg.wasm core for chat video conversion | src/lib/chatVideo.ts |
| connect.facebook.net, www.facebook.com/tr/ | script, connect | Meta Pixel, only after cookie consent | src/lib/metaPixel.ts, consent.ts |
| www.google.com/recaptcha/, www.gstatic.com/recaptcha/, recaptcha.google.com/recaptcha/ | script, frame, connect | reCAPTCHA, limited to its own path | Recaptcha.tsx; [reCAPTCHA CSP guide](https://next.centralcsp.com/en/blog/csp-for-google-services) |
| challenges.cloudflare.com | script, frame, connect | Turnstile captcha | Captcha.tsx; [Cloudflare docs](https://developers.cloudflare.com/turnstile/reference/content-security-policy/) |
| www.tiktok.com/embed/ | frame | embedded TikTok videos in the feed | PostMedia.tsx |
| www.google.com/maps | frame | store map | StoreVisit.tsx |
| *.zego.im, *.zegocloud.com, *.zegocdn.com (https and wss) | connect, media | ZEGOCLOUD voice and video calls | src/contexts/CallContext.tsx. ZEGOCLOUD publishes no domain list, so the wildcards are kept from the earlier policy and must be tested |
| fonts.googleapis.com, fonts.gstatic.com | style, font | Inter, Space Grotesk, Big Shoulders Display | index.html |

Removed from the old policy: `vercel.live` (only used by Vercel's preview toolbar), `unpkg.com` as a script source (it is only fetched, then run from a blob), `*.paystack.co`, `*.supabase.co`, whole-host access to `www.google.com`, `www.gstatic.com` and `www.facebook.com` (now limited to the reCAPTCHA and pixel paths), and `https:` in `media-src`.

## Weaknesses found and not fully fixed

1. **Secrets in project files that git does not ignore.** `.gitignore` held only `node_modules`. The project folder contains `.env.local` (a Vercel CLI token) and `.env.production` (TikTok client key and secret). I fixed `.gitignore`. If this folder was ever pushed to a repository or shared, treat the TikTok secret and the Vercel token as exposed and rotate them. Values were not read or copied; only the names were listed.
2. **Two Supabase projects in the repo.** The committed `.env` points at `dvjxavjuwwcpcpcrlsjf`, while your live project is `cgyzhkeliomwxwrpmnlh`. The old `dist/` folder was built against the wrong one (in my browser test it produced exactly 18 blocked requests to it, which is the CSP doing its job). Make sure Vercel's `VITE_SUPABASE_URL` is the live project, and delete `dist/` and the stale `.env` from the repo.
3. **`style-src 'unsafe-inline'`.** The UI libraries (charts, toasts, dialogs) write inline styles and the page has one inline style attribute. Scripts are strict; styles are not. Risk is lower than for scripts but not zero (CSS injection). Fixing it means nonces, which a static Vite site on Vercel cannot supply without adding middleware.
4. **`img-src https:`.** Kept on purpose, because product images can still be external links until they have all been copied to Cloudinary. Images cannot run code. To tighten it, run the SQL in the next section.
5. **ffmpeg.wasm from unpkg.com** needs `blob:` and `'wasm-unsafe-eval'` in script-src and unpkg in connect-src. The file is version-pinned but has no integrity check, so a compromise of that CDN would run code in your pages. Fix: copy `ffmpeg-core.js` and `ffmpeg-core.wasm` (version 0.12.6) into `public/ffmpeg/` and point `CORE_BASE` there; then remove `unpkg.com`, and `blob:` from script-src can be reviewed. I could not download them here (no network).
6. **Wildcards for vendors that publish no domain list** (ZEGOCLOUD, Klump, Cloudflare Stream). They are limited to the vendor's own domains.
7. **HSTS preload is not enabled.** Preloading needs the apex domain and every subdomain on HTTPS and is very hard to undo. I did not enable it.
8. **No CSP violation reporting endpoint.** Violations are only visible in a visitor's console, so a block that affects real customers would not reach you. A reporting service or an edge function would fix that.

## Tightening `img-src` later

Run this in the Supabase SQL editor. If every host it lists is one you recognise, replace `https:` in `img-src` with those hosts.

```sql
select host, count(*) from (
  select substring(u from '^https?://([^/]+)') as host from (
    select image_url as u from products union all select thumb_url from products
    union all select unnest(images) from products where images is not null
    union all select logo_url from vendors union all select image_url from categories
    union all select image_url from flyers union all select mobile_image_url from flyers
    union all select thumbnail_url from posts union all select unnest(image_urls) from posts where image_urls is not null
  ) x where u is not null and u ~ '^https?://'
) y group by host order by 2 desc;
```

## Test results

| Check | Result |
|---|---|
| `npm run check:csp` (84 checks: every known resource is allowed, other sites, another Supabase project, look-alike hosts, `http:` and the Vercel toolbar are blocked, no `unsafe-eval`, one of each header) | all passed |
| Chromium loaded the old `dist` build served with the exact headers from `vercel.json` | the app started; 18 CSP violations, all to the wrong Supabase project in that stale build; no inline script, style or font violations |
| `vite build` | not run: dependencies are not installed here and there is no network |
| Registration, login, database, uploads, marketplace, checkout, BNPL, calls, admin | not tested: these need your live project, test keys and a browser |

## Remaining risks (unverified)

These are the points where a block could still happen. The first four are where I could not confirm a vendor's real hostnames.
Paystack iframe host, Klump subdomains, the Cloudflare upload host, ZEGOCLOUD run-time hosts, and anything a vendor script loads after it starts.

## Deploy safely (Vercel)

1. Push the change on a branch, not to production. Vercel makes a Preview URL with the same headers.
2. Open the Preview with the browser console open (F12, Console). Look for lines starting `Refused to` or `Content Security Policy`. Vercel's own toolbar may add noise from `vercel.live`; ignore that on previews only.
3. On the Preview, work through: register, log in, browse and search products, open a product, upload a product image, upload a video, make a Paystack test payment, start a Klump pay-later checkout, place a test call between two accounts, a voice note, a TikTok post, the reCAPTCHA and Turnstile forms, the store map, the admin dashboard (including a PDF preview).
4. For each blocked item, copy the console line to me and I will add that exact host.
5. When the console is clean, merge to production.
6. Rollback if customers are affected: in `vercel.json` rename `"Content-Security-Policy"` to `"Content-Security-Policy-Report-Only"`, deploy, and nothing is blocked while we fix the list.

## Check the live site on SecurityHeaders.com

1. Go to https://securityheaders.com, enter `https://www.ithubafrica.com`, tick "Hide results" if you wish, and scan.
2. Expect the report to show Content-Security-Policy as present. The grade can rise; an A+ needs the policy to avoid `unsafe-inline` in scripts (it does) and the grader may still flag `style-src 'unsafe-inline'`. A grade says the headers exist and are well-formed. It does not say the site is secure.
3. Also open `https://csp-evaluator.withgoogle.com`, paste the CSP, and read the warnings. Expect notes on `unsafe-inline` for styles and the broad `blob:`.
