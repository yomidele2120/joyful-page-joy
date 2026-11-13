# ITHUBAFRICA Implementation Roadmap

## Phase 1: Audit and preparation
Status: complete for the repo audit and safe sequencing step.

### Completed in this phase
- reviewed the current application structure
- checked the main routes and admin shell
- reviewed database migration patterns and live feature foundations
- recognized the repo already contains substantial working functionality
- documented the safe, extension-first path

### Immediate next phase
Phase 2 should target subscription/payment entitlements and ranking controls before moving to AI features.

---

## Phase 2: Subscriptions, payments and ranking
Goal: harden entitlement logic and ensure only server-side validated payments and active subscription states unlock privileges.

### Planned work
- finalize the subscription plan entitlement model
- verify Paystack initialization and verification steps
- enforce tier-based visibility and ranking rules server-side
- add admin controls for plan configuration and payments
- add subscription history and expired/downgraded handling

### Risk
Frontend-only checks are not acceptable here.

---

## Phase 3: AI product intelligence
Goal: add AI-assisted listing, categorization and search using real product metadata.

### Planned work
- product description generation with vendor review
- listing enhancement suggestions
- categorization suggestions and admin review queue
- natural-language search with fallback keywords
- recommendation system respecting consent and availability
- marketing assistant for campaigns and social copy

### Guardrails
- AI must not invent product facts, prices or photographs.
- generated copy must remain editable and reviewable before publishing.

---

## Phase 4: Advertising manager
Goal: support vendor-created campaigns and admin review of sponsored placements.

### Planned work
- campaign creation, creatives, dates, budgets and placements
- admin approval, rejection, pause and removal states
- performance tracking and reporting
- external ad provider integration structure only when approved

---

## Phase 5: Social, Google and SEO
Goal: integrate approved social and search ecosystems without breaking current vendor flows.

### Planned work
- Meta / Instagram OAuth connection management
- TikTok improvement built around the current implementation
- Google Merchant feed generation
- SEO metadata improvements and sitemap/robots support
- approved Google Ads integration structure only when access is available

---

## Phase 6: ZEGOCLOUD calling
Goal: enforce server-side quotas and secure call management.

### Planned work
- secure token generation and validation
- call queue and usage tracking
- configurable per-tier limits
- admin monitoring of usage and failures
- live enforcement on the backend

---

## Phase 7: Payment protection and anti-fraud
Goal: protect buyer funds and detect suspicious marketplace behavior.

### Planned work
- server-side validation and idempotency
- risk flags and investigation cases
- admin review queue with audit trail
- buyer-facing safety policy and payment warnings

---

## Phase 8: Final admin integration and release
Goal: complete release readiness.

### Planned work
- unify admin widgets and controls
- run regression, lint and build checks
- validate migration ordering and environment variables
- finalize documentation and deploy checklist

## Phase 1 status summary
- Repo audit: complete
- Implementation plan: established
- Safe next step: begin Phase 2
