# ITHUBAFRICA Vendor Advertising: Build Status & Handoff

**Read this first if you are continuing the build** (on another account, or with a fresh assistant). It records what exists,
what was decided, exact contracts between layers, and what is and is not verified.

Spec: the 14-module "AI-powered vendor advertising & homepage promotion" document. Rule from the spec: *do not mark an
integration complete unless it has been implemented AND tested.* Statuses below follow that rule strictly.

---

## Phase plan and status

| Phase | Scope | Status |
|---|---|---|
| **1. Database** | Migration, RLS, server-side functions, SQL tests, static lint | **Written + statically linted. NOT yet run against Postgres.** |
| **2. Edge functions** | `ad-process-jobs` worker (OpenAI image, moderation, Cloudinary), hooks after payment, config | **Written; logic executed in Node tests (41 passing, mocked providers). NOT deployed, NOT run against live OpenAI/Cloudinary/Supabase.** |
| 3. Frontend logic | Pure TS libs (rotation, social validation, social schedule, image URLs, tracking) + unit tests | Not started |
| 4. Public UI | Featured banner, sponsored rows, rotating ads, social banner, attribution on shop/product pages | Not started |
| 5. Dashboards | Vendor advertising tab, admin advertising tab | Not started |
| 6. Docs & final report | Setup guide, env vars, final test report | Not started |

## Environment limits that shaped the work
The build sandbox has **no Postgres, no Deno, no network, no `node_modules`**. So:
- SQL, RLS, edge functions, Paystack, Cloudinary, OpenAI and UI rendering **cannot be executed there**.
- Pure TypeScript logic (phase 3) can be unit-tested with Node. Nothing else can.
- Therefore every SQL/edge/UI item is "implemented, not yet tested" until you run the checks listed under *How to verify*.

---

## What exists after Phase 1

Files added:
- `supabase/migrations/20261114090000_vendor_advertising.sql` (tables, RLS, 50 functions, grants)
- `supabase/tests/vendor_advertising_test.sql` (16 scenario groups; ends with "ALL VENDOR ADVERTISING TESTS PASSED")
- `scripts/check-advertising-migration.py` (static lint; run `python3 scripts/check-advertising-migration.py`)
- this file

No existing file was modified. Existing payment, plan, flyer and campaign code is untouched.

### How it extends the existing system (no duplicate payment/plan system)
`supplier_membership_plans` -> `vendor_memberships` -> `supplier_membership_payments` -> `finalize_supplier_membership_payment`
already handle plans, Paystack verification (amount-checked, idempotent) and expiry. Phase 1 adds:
- `advertising_plan_features` keyed by `plan_slug` (ad benefits per plan).
- A trigger `trg_membership_grants_ads` on `vendor_memberships`. When trusted server code finalises a verified payment, the
  membership row changes and the trigger calls `ensure_ad_campaign_for_vendor()` **in the same transaction**: it verifies the
  plan includes homepage promotion, creates the campaign and queues the generation job. The frontend can never trigger this.
  The trigger swallows its own errors (logs a WARNING) so an advertising fault can never roll back a customer's payment.
- Expiry is **derived at read time** (same philosophy as `effective_supplier_plan`): public reads join the live membership, so an
  expired plan stops ads immediately. `expire_advertising_campaigns()` then makes stored status match (history is kept).

### Decisions made (revisit if you disagree)
1. **New tables, not `marketplace_campaigns`.** That table is a thin admin budget scaffold, is absent from the generated
   Supabase types (may not exist in production), and has no subscription/banner/analytics model. Left untouched.
2. **New `vendor_social_profiles`, not `vendor_social_accounts`.** The existing table stores OAuth tokens and lets vendors write
   their own rows including token/status columns; unsafe for public profile links. Left untouched.
3. **Approval is ON by default** (`advertising_settings.require_approval = true`): AI banners wait in `pending_review` until an
   admin approves. Admin can switch to auto-activate.
4. **Seed benefits are placeholders** (admin edits them): free = none; silver = homepage promotion, 10 products, 3 generations,
   2 social profiles; premium = + featured + sponsored rows + external ads, 50 products, 6 generations, weight 3. A plan still
   cannot be bought until its price is set and `purchase_enabled` is on in the existing Supplier plans admin tab.
5. **"Advertising credits"** = `impression_allocation` (max impressions per campaign; NULL = unlimited). **"Banner generation
   allowance"** = `banner_generations_allowed` per membership period (initial + regenerations; failed jobs do not count; admin
   revisions never count).
6. **Banner composition happens at render time in the frontend** (spec allows "frontend or server-side image composition"):
   the AI produces **text-free artwork only**; shop name, logo, headline, description and CTA are real DB data drawn by React over
   the artwork. Responsive crops come from Cloudinary transformations (desktop 16:5, tablet 2:1, mobile 4:3, `c_fill,g_auto`).
7. **A campaign's destination is always `/shop/<own vendor id>`**, enforced by CHECK constraints (`target_shop_id = vendor_id`,
   `destination_url` pattern). Attribution is added at click time as `?ad=<campaign id>`.
8. **External ads only RECORD requests.** No ad-platform API exists in the code; requests stay `pending_integration`, and admins
   are blocked from marking them `active`. Vendor ad budget is stored separately and never charged by ITHUBAFRICA.
9. **Social links only; no OAuth, no passwords/tokens.** Verification is admin-set. OAuth is NOT implemented.

### Security model
- Vendors have **read-only** table access to their own rows (RLS). Every vendor write is a `SECURITY DEFINER` function that checks
  ownership, plan, limits, quota and input.
- Anonymous/browser callers can execute only: `get_public_ad_settings`, `get_homepage_ads`, `get_shop_social_banner`,
  `record_ad_event`. Internals (`ad_entitlement`, `claim_advertising_job`, `finish_advertising_job_*`, `ensure_ad_campaign_for_vendor`,
  `expire_advertising_campaigns`...) are **service-role only**. The lint script fails if any function is missing from a permission list.
- Priority, verification status, moderation and campaign status are admin-only.

### Function contracts (for phases 2-5)

**Public (anon + signed-in)**
- `get_public_ad_settings() -> jsonb` `{ads_enabled, featured_banner_limit, sponsored_banner_limit, sponsored_row_interval, rotating_limit, rotation_minutes, social_banner_enabled}`
- `get_homepage_ads(_placement 'featured'|'sponsored_row'|'rotating', _limit int=30) -> jsonb[]` each:
  `{id, vendor_id, campaign_type, headline, description, cta_text, banner_image_url, priority, destination_url, impressions_count, clicks_count, start_date, end_date, store_name, logo_url, category, priority_weight, impression_allocation, products:[{id,slug,name,image}]}`.
  Eligibility is decided in SQL; **ordering/fairness is meant to be done client-side** from these counters (`src/lib/ads/adRotation.ts`, phase 3).
- `get_shop_social_banner(_vendor_id) -> jsonb|null` `{vendor:{id,store_name,logo_url}, accounts:[{id,platform,handle,display_name,profile_url,verified}], settings:{display_minutes,rotation_minutes,max_per_day,dismiss_hours}}`; null when no plan/profile.
- `record_ad_event(_event, _campaign, _placement, _visitor, _social=null, _product=null, _device=null) -> boolean`
  events: `impression | banner_click | shop_visit | product_visit | social_click`; placements: `featured | sponsored_row | rotating | social_banner`.
  `_visitor` must match `^[A-Za-z0-9_-]{8,64}$`. Dedupe: impressions 30 min, clicks 10 min, visits 30 min; 300 events/visitor/hour cap;
  vendor's own views ignored. Returns false (silently) when dropped.

**Vendor (signed-in, approved vendor)**
`my_advertising_overview()` (everything for the dashboard in one call), `vendor_set_campaign_products(_campaign,_product_ids[])`,
`vendor_create_product_campaign(_product_ids[])`, `vendor_update_campaign_message(_campaign,_headline,_description)` (returns `applied|pending_review`),
`vendor_request_banner_regeneration(_campaign)`, `vendor_set_campaign_paused(_campaign,_paused)`,
`vendor_upsert_social_profile(_platform,_url,_handle,_display_name,_enabled)`, `vendor_delete_social_profile(_id)`,
`vendor_request_external_campaign(_platform,_scope,_product_ids[],_objective,_budget,_duration_days,_authorize_spend)`,
`vendor_cancel_external_campaign(_id)`, `vendor_ad_analytics(_days)`.
Plans to display: `select * from advertising_plan_features` joined to `supplier_membership_plans` (public read).

**Admin (signed-in; each re-checks `has_role(admin)`)**
`admin_list_ad_campaigns(_status,_limit)`, `admin_list_ad_vendors()`, `admin_set_campaign_status(_campaign,'active'|'paused'|'rejected'|'cancelled',_note)`,
`admin_set_campaign_priority(_campaign,0..100)`, `admin_review_banner(_banner,_approve,_note)`, `admin_review_message(_campaign,_approve)`,
`admin_request_banner_revision(_campaign,_note)`, `admin_list_generation_jobs(_status,_limit)`, `admin_ai_usage_summary()`,
`admin_ad_analytics(_days)`, `admin_set_social_verification(_profile,'unverified'|'verified'|'rejected')`, `admin_list_social_profiles()`,
`admin_list_external_campaigns(_status)`, `admin_set_external_status(_id,_status,_note)`, `admin_sweep_expired_campaigns()`, `admin_purge_ad_events(_older_than_days)`.
Settings and plan benefits are edited with direct table writes (admin-only RLS): `advertising_settings` (single row `id = true`), `advertising_plan_features`.

**Service role only (the phase-2 worker calls these)**
- `claim_advertising_job(_worker) -> jsonb|null` job row (`id, campaign_id, vendor_id, kind, attempts, max_attempts...`). Honours admin daily/monthly limits (jobs wait, they do not fail).
- `finish_advertising_job_success(_job, _image_url, _public_id, _width, _height, _headline, _description, _art_category, _provider, _model, _prompt_hash, _meta jsonb, _cost numeric, _flags text[]) -> banner id`
  (inserts a banner version; auto-activates or sets `pending_review` per `require_approval`).
- `finish_advertising_job_failure(_job, _error, _code, _retryable, _cost) -> 'retry'|'failed'` (exponential back-off; final failure marks the campaign `failed` and notifies).
- `expire_advertising_campaigns() -> int`.

### Phase 2 specification (edge function `ad-process-jobs`)
Auth: service-role bearer or `x-ad-worker-secret` header (not a user JWT). Loop: `claim_advertising_job` -> load vendor (`store_name, store_description,
business_type, product_categories, logo_url`) + up to 4 campaign products (`name, thumb_url/image_url, category`) -> build prompt (**no text, no logos, no prices in the art**)
-> OpenAI image generation (`OPENAI_API_KEY`; model from env `AD_IMAGE_MODEL`; verify the current model name in OpenAI's docs, it changes) -> validate
(PNG/JPEG magic bytes, size, dimensions) -> moderation (reject images with legible text or unsafe content) -> copy: headline/description via template by art category,
validated with the same rules as `ad_copy_is_safe` (no digits/prices/claims) -> upload to Cloudinary under `marketplace/vendors/<vendor>/ads/` (reuse `_shared/cloudinary.ts`)
-> `finish_advertising_job_success` / `finish_advertising_job_failure`. Cost recorded per attempt is an **estimate** (`ai_cost_per_image_usd`), not billing.
Trigger points: call the worker (fire-and-forget) after `finalize_supplier_membership_payment` succeeds in `verify-supplier-subscription` and `paystack-webhook`, plus a
cron (every ~5 min) as the safety net. Add `[functions.ad-process-jobs] verify_jwt = false` to `supabase/config.toml`.

---

## Phase 2: generation worker

Added: `supabase/functions/ad-process-jobs/index.ts` (worker), `_shared/adBannerCore.ts` (pure logic), `_shared/adAI.ts` (OpenAI calls: `/v1/images/generations`, `/v1/responses`),
`_shared/adKick.ts` (starts the worker after a payment), tests (`_shared/adBannerCore.test.ts`, `ad-process-jobs/worker.test.ts`, `ad-process-jobs/testing/*`).
Changed (additive only): `_shared/cloudinary.ts` (new `uploadAdArtwork`), `verify-supplier-subscription/index.ts` and `paystack-webhook/index.ts`
(one import + one `kickAdWorker()` call after a payment is verified AND finalised), `supabase/config.toml` (`[functions.ad-process-jobs] verify_jwt = false`).

### What the worker does per queued job
1. Refuses to run unless called with the service-role key or a 16+ character `AD_WORKER_SECRET` (never a user login).
2. Claims a job (`claim_advertising_job`; honours admin daily/monthly limits; jobs wait rather than fail).
3. Cancels it, with no AI spend, if its campaign already ended.
4. Reads real shop data and picks one of 7 art categories.
5. Builds a text-free art prompt. Shop name, product names and brand names are never in the prompt; only generic category words. Vendor hints are reduced to harmless words.
6. Generates wide artwork with OpenAI (`2016x864`, falling back to `1536x1024` if the model refuses the size; Cloudinary crops per device); checks real file signature, size and shape.
7. A second OpenAI call (vision model) reviews the image (safe? text? logo? face?). If the review cannot run or be read, nothing is published.
8. Writes headline/description with AI, validated by the same rules as the database; falls back to vetted templates.
9. Uploads to Cloudinary (`marketplace/vendors/<vendor>/ads/...`), then `finish_advertising_job_success`. The database activates the campaign or queues it for admin approval.
10. Failures back off (2, 4 min...). Bad credentials / missing config do not retry. Final failure marks the campaign `failed` and notifies admins and the vendor.

### Environment variables
| Name | Needed | Notes |
|---|---|---|
| `OPENAI_API_KEY` | yes | server secret only; never in the browser or a `VITE_` variable |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | yes | already used for product images |
| `AD_IMAGE_MODEL` | recommended | model id, or comma list tried in order on "not found". Default `gpt-image-2`, then `gpt-image-1.5`. `gpt-image-1` was shut down on 2026-10-23, so it is not a default. Model names change: check OpenAI's docs. |
| `AD_TEXT_MODEL`, `AD_MODERATION_MODEL` | no | default `gpt-6-luna` (text + image input, Responses API). Moderation model must accept images. Check OpenAI's docs if the default is unavailable on your account. |
| `AD_IMAGE_QUALITY` | no | `low` / `medium` (default) / `high`; affects cost |
| `AD_WORKER_SECRET` | only for the scheduler | 16+ random characters |

### Deploy
```
supabase functions deploy ad-process-jobs
supabase functions deploy verify-supplier-subscription paystack-webhook
supabase secrets set OPENAI_API_KEY=<key> AD_IMAGE_MODEL=gpt-image-2 AD_WORKER_SECRET=<long random string>
```
Scheduler safety net (needs pg_cron + pg_net; project ref is `project_id` in `supabase/config.toml`):
```sql
select cron.schedule('ad-worker', '*/5 * * * *', $$
  select net.http_post(url := 'https://<project-ref>.supabase.co/functions/v1/ad-process-jobs',
    headers := jsonb_build_object('Content-Type','application/json','x-ad-worker-secret','<AD_WORKER_SECRET>'),
    body := '{"max": 2}'::jsonb);
$$);
```

### Verified by execution (Node, mocked providers)
`node --test supabase/functions/_shared/adBannerCore.test.ts` (19) and
`node --import ./supabase/functions/ad-process-jobs/testing/loader.mjs --test supabase/functions/ad-process-jobs/worker.test.ts` (24): all passing.
Covers auth, happy path, prompt contents, review-before-upload ordering, refusal of images with text/logos/faces/unsafe content, nothing published when review fails,
bad-file rejection, unsafe wording replaced by templates, missing config, model fallback, retry classification, API key never stored (incl. network errors),
Cloudinary failure, ended campaigns, per-call job cap. A mutation check (disabling the moderation gate) makes a test fail, as it should.
Also: strict TypeScript compile of the new edge code, and RPC parameter names match the SQL signatures.

### NOT verified (needs a live smoke test)
Real OpenAI responses, model ids (including whether `/v1/responses` accepts the default text model and image input on your account, and whether `2016x864` is accepted), the Cloudinary upload, Supabase RPC round-trips, deployment, and the post-payment kick end to end.
Smoke test: set secrets, deploy, give a staging vendor a paid plan, watch `advertising_generation_jobs` go `queued -> running -> succeeded`,
then `vendor_advertising_banners` and the campaign (`pending_review` with approval on, `active` with it off).

### Known gaps
- Product photos are not sent to the AI (only generic category words), to avoid copying brand marks. Product promotions will show real thumbnails in the banner (Phase 4).
- Vendors have no brand-colour field, so artwork uses a per-category palette.
- Cost figures are estimates, not Google's billing. Daily/monthly limits count attempts.

---

## How to verify Phase 1 (do this on a STAGING database)

1. `python3 scripts/check-advertising-migration.py` -> expect `OK`. (Verified in the build sandbox; the script was also confirmed to fail on injected mistakes.)
2. Apply the migration (`supabase db push` or the SQL editor). **This has not been done yet. Expect to possibly fix small syntax slips.**
3. Run `supabase/tests/vendor_advertising_test.sql`. A pass ends with the error text `ALL VENDOR ADVERTISING TESTS PASSED` (everything rolls back). Any `FAIL n:` message names the broken scenario.
4. Optional cron (needs pg_cron): `select cron.schedule('ad-expire', '*/15 * * * *', $$select public.expire_advertising_campaigns()$$);`

## Known limitations / follow-ups
- Hot-row counters: `impressions_count` etc. are updated per unique counted event. Fine at current scale; shard or batch if one campaign gets very heavy traffic.
- Events recorded after a plan lapses but before the sweep still count in analytics for a still-"active" row (the ad itself is already hidden by the live plan join).
- Product-promotion campaigns link to the shop page (the spec only requires shop redirection); individual product tiles can deep-link with `?ad=` (phase 4).


---

## Phase 3: frontend logic (pure, tested) - `src/lib/ads/`
| File | Purpose |
|---|---|
| `adRotation.ts` | seeded weighted rotation: plan tier weight x admin priority x fairness (under-served ads boosted) x bounded CTR nudge; one ad per vendor; recently shown ads down-weighted; exhausted allocations skipped; `rotationIndex`; `sponsoredRowSlots` (sponsored row after every N product rows) |
| `socialValidation.ts` | mirror of SQL `ad_normalize_social` (instant vendor feedback; the database still re-validates) |
| `socialBannerSchedule.ts` | floating social banner: display minutes, rotation gap, max per day, dismiss hours, corrupt-state safe |
| `adMedia.ts` | Cloudinary responsive crops: desktop 16:5, tablet 2:1, mobile 4:3, `c_fill,g_auto`; no stacked transforms; non-Cloudinary URLs untouched |
| `adTracking.ts` | visitor id, device bucket, `/shop/<vendor>?ad=<campaign>` links, UUID-only attribution, impression once per campaign+placement, never throws |
| `adsApi.ts` | thin RPC wrapper (`get_public_ad_settings`, `get_homepage_ads`, `get_shop_social_banner`, `record_ad_event`); any failure means "show no ads" |
| `ads.test.ts` | 23 tests (vitest style) |

Verified: 23/23 pass (run with a local `vitest` shim because the sandbox has no node_modules: `npx tsx --test src/lib/ads/ads.test.ts` after providing a `vitest` module; in your repo simply `npx vitest run src/lib/ads`).
Mutation checks (removing the exhausted-ad filter; allowing a lookalike Instagram host) each make a test fail. Strict `tsc` clean on the pure modules.
Not verified: `adsApi.ts` against a live database (needs the migration applied).


---

## Phase 4: public UI
New: `src/components/ads/AdBanner.tsx`, `HomepageAds.tsx` (`FeaturedAds`, `useSponsoredRows` + `SponsoredRowBanner`, `RotatingAds`), `ShopSocialBanner.tsx`, `useAdAttribution.ts`.
Edited (small, additive): `src/pages/Index.tsx` (featured banner under the trust strip; a sponsored banner after every N-th visible product row, N and the cap from admin settings; a rotating banner after the last row; existing rows/flyers untouched),
`src/pages/SupplierShop.tsx` (social banner + `?ad=` shop-visit attribution), `src/pages/ProductDetail.tsx` (product-visit attribution for visitors who arrived via an ad).
Behaviour: artwork is text-free; shop name, logo, headline, description and the button are drawn by `AdBanner`; every banner is labelled "Sponsored", is one link to `/shop/<vendor>?ad=<campaign>`, lazy-loads (the first featured banner is eager), and counts an impression only when at least half of it is visible.
Ads fail closed: any RPC error, ads switched off, or no eligible campaign renders nothing and the marketplace looks exactly as before.
The vendor's own browsing never counts (the database ignores it); the social banner is not shown to the shop's owner.
Verified: syntax-parse of all edited/new files; strict `tsc` of the new components against stubbed React/router/query types (no errors besides the stubbed project files).
NOT verified: a real build (`npm run build`), visual layout at phone/tablet/desktop widths, and live data. Please run `npm run build` and look at the homepage with one test campaign (admin approval off).
Known limitation: a shop visit is attributed from the `?ad=` value without proving the campaign belongs to that shop (product visits ARE checked by the database). The server de-duplicates and rate-limits, but a determined person could add a few fake shop visits to an ad of another shop.


---

## Phase 5: dashboards
New: `src/components/dashboard/VendorAdvertisingTab.tsx`, `src/components/admin/AdminAdvertisingTab.tsx`, `src/components/ads/adUi.tsx`, `src/lib/ads/adStatus.ts` (plain-language statuses + client mirror of the database wording rule), `call()` helper in `adsApi.ts`.
Edited (additive): `SupplierDashboard.tsx` (new "Advertising" tab under Grow), `admin/AdminDashboard.tsx` (new "Vendor advertising" tab; the existing "Campaign manager" is untouched).
Vendor tab: plan/expiry/quota; promotions with banner preview ("Sponsored" label), status explanations, edit wording (instant validation, approval if the admin requires it), product picker (limit from plan), new banner (confirm, quota shown), pause/resume; measured analytics (impressions, clicks, rate, shop visits, product views, daily bars, social banner); social links (validated, enable/disable, remove; never passwords/OAuth); external ad requests with the "nothing is published, no money spent" notice and the authorise-budget checkbox.
Admin tab: campaigns (filter, approve/reject banner, approve/reject vendor wording, pause/activate/reject, request new banner without using vendor quota, note, priority), vendors with paid plans, AI usage + generation jobs (failed jobs and errors visible), social link verification, external requests (cannot be set running), analytics + data-retention purge, settings (all `advertising_settings`) and per-plan benefits (`advertising_plan_features`), saved through the admin-only RLS policies.
Verified: 26 Node tests (wording rule cases, status text), strict `tsc` shows no errors in the new files other than stub noise (the sandbox has no node_modules), syntax parse of all edited files.
NOT verified: a real build, rendering, and every RPC against a live database (the migration has never been run).


---

## Phase 6 and extras
Added: `VENDOR_ADVERTISING_SETUP.md`, `ADVERTISING_FINAL_REPORT.md`, `supabase/migrations/20261114120000_call_queue_and_audit.sql`, `supabase/tests/call_queue_and_audit_test.sql`,
`src/lib/calls/callQueue.ts`, `src/hooks/useCallQueue.ts`, `src/components/calls/CallQueueTracker.tsx`, `src/components/admin/CallQueueAuditTab.tsx`.
Edited (additive): `CallButtons.tsx` (buyers calling a supplier go through the waiting list; falls back to the normal call if the queue is unreachable), `App.tsx` (tracker mounted inside CallProvider), `AdminDashboard.tsx` (Call waiting list, Audit log).


---

## Extra A: ad boost payments (paid extra views)
SQL `20261114150000_ad_boost_payments.sql` (run AFTER the two earlier migrations): `ad_boost_packages` (admin-priced, off by default, none preset), `ad_boost_payments`, `finalize_ad_boost_payment` (service role, idempotent, amount+currency checked, flags `needs_review` if money arrived but the promotion ended), boost-aware `get_homepage_ads`, `my_ad_boosts`, `admin_ad_boost_summary`.
Edge functions: `initialize-ad-boost`, `verify-ad-boost` (new), `paystack-webhook` (additive branch + failed-charge branch). Deploy all three. References are `itha_boost_<32 hex>`, separate from `itha_sub_`.
UI: "Get more views" in each promotion (vendor), "Ad boosts" panel in admin (packages, revenue, payments needing attention). Rotation weights boosted ads x2 and a boost lifts the plan's impression cap.
Tests: `supabase/tests/ad_boost_payments_test.sql` (not executed), 30 Node tests pass. Not verified: Paystack round trip, edge functions, UI rendering.

## Extra B: external ad creative exports (manual publishing)
- `src/lib/ads/adExports.ts`: platform-sized crops (Google, Facebook, Instagram, TikTok) of the SAME approved artwork via Cloudinary `c_fill,g_auto`, text layers from database fields, download links, UTM destination, copy-paste brief. 4 tests passing.
- `src/components/admin/ExternalExportPanel.tsx`, shown on each request in Admin > Advertising > External requests.
- Not built: any real Google/Facebook/Instagram/TikTok API integration. Admins publish by hand; a request can never be marked "running" from here.
- Not run: the UI was syntax-checked only. Sizes are common published ones and platforms change them.

## Extra C: AI product assistant
- `supabase/functions/_shared/aiProductCore.ts` (+6 passing tests): prompt building, strict validation (drops invented prices, warranties, certifications, stock claims and any attribute the vendor did not write), duplicate detection, search-sentence parsing with allowed-category checks.
- `supabase/functions/ai-product-assist/index.ts`: `listing` and `search` actions; login required; admin switch (`ai_feature_settings`) and daily per-user limits; usage logged. Results are suggestions only and nothing is saved.
- `supabase/migrations/20261114180000_ai_product_assist.sql`: `ai_assist_settings`, `ai_usage_logs`, `ai_assist_begin/finish`, `admin_ai_usage_summary`.
- UI: `AiListingAssist` in the supplier product form.
- Not run: edge function, SQL and UI were not executed here (only the core logic has tests).
- Not built: wiring natural-language search into the Products page (`parseSearchText` exists in `src/lib/aiAssistApi.ts`), admin UI for the new limits (edit `ai_assist_settings` in the table editor), bulk/automatic listing enrichment.

## Google Ads connection, step 1 (connection test only)
- `supabase/functions/_shared/googleAds.ts` (+5 passing tests): REST client, token exchange, accessible accounts, search, secret scrubbing. API version is `GOOGLE_ADS_API_VERSION` (default v25).
- `supabase/functions/google-ads-check`: admin-only; signs in, lists reachable accounts, reads the manager account. Changes nothing in Google Ads.
- Not built yet: campaign creation, pausing, reporting sync, per-vendor accounts. Build these only after the check passes.
