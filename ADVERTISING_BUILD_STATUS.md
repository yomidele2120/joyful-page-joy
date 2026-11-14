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
| 2. Edge functions | `ad-process-jobs` worker (Gemini image, moderation, Cloudinary), hooks after payment, config | Not started |
| 3. Frontend logic | Pure TS libs (rotation, social validation, social schedule, image URLs, tracking) + unit tests | Not started |
| 4. Public UI | Featured banner, sponsored rows, rotating ads, social banner, attribution on shop/product pages | Not started |
| 5. Dashboards | Vendor advertising tab, admin advertising tab | Not started |
| 6. Docs & final report | Setup guide, env vars, final test report | Not started |

## Environment limits that shaped the work
The build sandbox has **no Postgres, no Deno, no network, no `node_modules`**. So:
- SQL, RLS, edge functions, Paystack, Cloudinary, Gemini and UI rendering **cannot be executed there**.
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
-> Gemini image generation (reuse `GEMINI_API_KEY`; model name from env `AD_IMAGE_MODEL`; verify the current model name in Google's docs, it changes) -> validate
(PNG/JPEG magic bytes, size, dimensions) -> moderation (reject images with legible text or unsafe content) -> copy: headline/description via template by art category,
validated with the same rules as `ad_copy_is_safe` (no digits/prices/claims) -> upload to Cloudinary under `marketplace/vendors/<vendor>/ads/` (reuse `_shared/cloudinary.ts`)
-> `finish_advertising_job_success` / `finish_advertising_job_failure`. Cost recorded per attempt is an **estimate** (`ai_cost_per_image_usd`), not billing.
Trigger points: call the worker (fire-and-forget) after `finalize_supplier_membership_payment` succeeds in `verify-supplier-subscription` and `paystack-webhook`, plus a
cron (every ~5 min) as the safety net. Add `[functions.ad-process-jobs] verify_jwt = false` to `supabase/config.toml`.

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
