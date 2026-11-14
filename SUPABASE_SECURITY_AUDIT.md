# Supabase production security audit

## Scope and evidence

This is a repository review combined with production findings supplied by the
project owner. No production connection was made. Repository migrations are not
proof that production has the same schema, grants, policies, owners, or function
definitions.

Production findings reported by the owner:

- The 12 target tables listed below are owned by `postgres`, have RLS enabled,
  and do not have FORCE ROW LEVEL SECURITY.
- `anon` and `authenticated` have broad table privileges on the reported
  objects; the exact per-object ACLs must be retained with the preflight output.
- Reported effective `TRUNCATE` grants are:
  - `anon`: `flyers`, `marketplace_settings`, `payments`, `products`,
    `supplier_membership_plans`, `vendors`, `user_roles`.
  - `authenticated`: `flyers`, `marketplace_campaigns`,
    `marketplace_campaign_creatives`, `marketplace_ranking_weights`,
    `marketplace_settings`, `payments`, `products`,
    `supplier_membership_plans`, `vendors`, `user_roles`.
  - No effective `TRUNCATE` result was supplied for the remaining target tables;
    do not infer their status.
- Default ACLs for `postgres` and `supabase_admin` in `public` grant client roles
  broad table, sequence, and function permissions. The exact distinction between
  global and schema-scoped entries must be verified before remediation.
- `anon`, `authenticated`, and `service_role` have no reported role membership
  paths. This does not exclude direct `PUBLIC` grants.
- `public` schema CREATE was reported false for `anon`, `authenticated`, and
  `service_role`.

The previous supplied production report and repository findings do not include
the complete direct ACL, default ACL scope, or all deployed function bodies.
Accordingly, the draft migration is intentionally gated and is not certified
production-ready until its preconditions are met and the unresolved global
function-default issue is approved.

## Confirmed security findings

| Finding | Severity | Evidence and impact |
|---|---|---|
| Client roles have effective `TRUNCATE` privileges on production application tables. | Critical | Production audit supplied by owner. RLS does not protect against TRUNCATE. The application has no identified workflow requiring clients to truncate tables. |
| Future `public` tables/sequences/functions created by `postgres` and `supabase_admin` receive broad defaults for `anon` and `authenticated`. | High | Production default ACL results supplied by owner. New objects may be exposed unless privileges are explicitly controlled. |
| `has_role(uuid, app_role)` accepts an arbitrary user ID and is executable by client roles. | High | Production details supplied by owner; repository definition in `supabase/migrations/20260228094542_3ec7f6fa-8c4b-49b6-9221-b9c21051c85c.sql`. It can reveal role membership for another ID. |
| Vendor campaign RLS grants whole-row updates on owned campaigns and creatives. | High | Repository policy in `supabase/migrations/20261112130000_marketplace_foundation_extensions.sql`; a vendor can attempt to update moderation status fields unless a deployed trigger/function blocks it. The live policy and deployed campaign serving path remain unverified. |
| The preorder trigger trusts any request where `auth.uid()` is NULL. | Potentially high | Repository definition in `supabase/migrations/20261017090000_compliance_preorder_support.sql`. Anonymous RLS policies currently do not show product write access in the repository, but a permissive deployed ACL/policy combination could make this bypass meaningful. |

## Application operations and permission matrix

`SELECT`, `INSERT`, `UPDATE`, `DELETE` refer to SQL table privileges. RLS remains
necessary to restrict rows. No client-facing use of `TRUNCATE`, `REFERENCES`,
`TRIGGER`, or `MAINTAIN` was found.

| Table | anon | authenticated | service_role/backend | Repository evidence |
|---|---|---|---|---|
| `flyers` | SELECT | Admin UI SELECT/INSERT/UPDATE/DELETE | Not established as needed | `src/hooks/useFlyers.ts`; `src/components/admin/FlyersTab.tsx`; policy in `supabase/migrations/20261014120000_flyers.sql`. |
| `marketplace_campaigns` | No client operation found | Admin SELECT/UPDATE; vendor campaign operations are described in supplied production requirements, but no matching repository client call found | Advertising function use is production-reported; exact definitions/callers not supplied | `src/components/admin/CampaignManagerTab.tsx`; policies/grants in `supabase/migrations/20261112130000_marketplace_foundation_extensions.sql`. |
| `marketplace_campaign_creatives` | No client operation found | Vendor/admin CRUD is allowed by repository RLS; no matching repository client operation found | Production advertising RPC dependencies require verification | `supabase/migrations/20261112130000_marketplace_foundation_extensions.sql`. |
| `marketplace_ranking_weights` | None | Admin SELECT and UPSERT (requires INSERT and UPDATE) | No direct call found | `src/components/admin/SupplierPlansTab.tsx`; migration currently grants authenticated SELECT only in `supabase/migrations/20261112140000_subscription_ranking_weights.sql`. |
| `marketplace_settings` | SELECT of public flags/settings | SELECT and admin UPDATE | Edge Functions read settings | `src/hooks/useCallsEnabled.ts`, `src/hooks/useTikTokEnabled.ts`, `src/hooks/useMarketplace.ts`, `src/components/admin/MarketplaceAdminTab.tsx`, `supabase/functions/call-push/index.ts`, `supabase/functions/zego-token/index.ts`, `supabase/functions/tiktok/index.ts`; RLS in `supabase/migrations/20261017090000_compliance_preorder_support.sql`. |
| `payments` | None | Admin dashboard SELECT; no client DML found | INSERT/UPDATE/SELECT in payment Edge Functions | `src/pages/admin/AdminDashboard.tsx`; `supabase/functions/initialize-payment/index.ts`, `verify-payment/index.ts`, `paystack-webhook/index.ts`, `refund-order/index.ts`. Payment business logic must remain unchanged. |
| `vendors` | SELECT approved vendors | Vendor SELECT/INSERT/UPDATE; admin SELECT/UPDATE | Edge Functions read vendor rows | `src/hooks/useProducts.ts`, `src/pages/SupplierShop.tsx`, `src/pages/SupplierDashboard.tsx`, `src/pages/admin/AdminDashboard.tsx`, `src/components/admin/FinanceTab.tsx`; policies in the core migrations and `supabase/migrations/20261015090000_security_hardening.sql`. |
| `products` | Public catalog SELECT | Vendor/admin SELECT/INSERT/UPDATE; deletion through RPC | Edge Functions perform selected server-side operations | `src/hooks/useProducts.ts`, `src/hooks/usePagedProducts.ts`, `src/pages/SupplierDashboard.tsx`, `src/pages/admin/AdminDashboard.tsx`, `src/components/seller/ProductEditor.tsx`, `src/lib/removeProducts.ts`; RPC in `supabase/migrations/20261027090000_product_removal.sql`. |
| `supplier_membership_plans` | SELECT active plans | SELECT; admin UPDATE | Edge Functions read plans | `src/components/dashboard/SupplierMembershipTab.tsx`, `src/components/admin/SupplierPlansTab.tsx`, membership Edge Functions. |
| `vendor_memberships` | None | Vendor/admin SELECT; admin UPDATE for status | Finalization RPC and Edge Functions perform subscription writes | `src/components/dashboard/SupplierMembershipTab.tsx`, `src/components/admin/SupplierPlansTab.tsx`, `supabase/migrations/20261112090000_supplier_memberships.sql`. |
| `supplier_membership_payments` | None | Own/admin SELECT | Edge Functions insert/update; finalization RPC updates | `supabase/functions/initialize-supplier-subscription/index.ts`, `verify-supplier-subscription/index.ts`, `paystack-webhook/index.ts`; `supabase/migrations/20261112090000_supplier_memberships.sql`. |
| `user_roles` | None | Own-role SELECT; own vendor-role INSERT policy; admin role management policy | `setup-admin` writes with service role | `src/hooks/useAuth.ts`, `supabase/functions/setup-admin/index.ts`, policies in the initial migrations. Do not remove the vendor-role insert policy without validating signup flows. |

### Ranking-weight upsert

`SupplierPlansTab.tsx` calls `.upsert(..., { onConflict: 'id' })`. PostgreSQL
needs table-level INSERT and UPDATE privileges for that operation, plus the
admin RLS policy for the inserted/updated row. The repository migration only
grants authenticated SELECT, so the upsert depends on additional effective
production grants (potentially the reported defaults). Preserve admin
functionality by granting INSERT and UPDATE to `authenticated` while retaining
the admin-only `marketplace_ranking_weights` policy.

## Role management and authorization

- `src/hooks/useAuth.ts` reads the current user’s `user_roles` rows.
- `supabase/functions/setup-admin/index.ts` writes the initial admin role using
  the service-role client.
- The repository defines `has_role(uuid, app_role)` and
  `has_role(app_role)`, not the production-reported `has_role(uuid, text)`
  overload. Production signatures must be checked before applying any function
  change.
- A safe two-argument helper must permit checking the current user’s own roles
  and permit an already verified administrator to inspect other users; it must
  return false for non-admin cross-user lookups. Keep the one-argument helper
  for current-user checks and preserve RLS callers.
- Do not remove admin role writes from policies or the `setup-admin` backend
  path without a replacement and a verified rollout.

## SECURITY DEFINER and triggers

Repository scan found SECURITY DEFINER definitions across migrations, but the
complete deployed definitions, owners, search paths, ACLs, callers, and body
authorization checks have not all been supplied. The read-only preflight and
postflight files inventory deployed functions and the preorder trigger; a
separate production definition export is needed before changing EXECUTE grants.

Known functions:

| Function | Repository evidence | Review note |
|---|---|---|
| `has_role(uuid, app_role)` | `supabase/migrations/20260228094542_3ec7f6fa-8c4b-49b6-9221-b9c21051c85c.sql` | SECURITY DEFINER, `search_path = public`; arbitrary-user enumeration concern. |
| `has_role(app_role)` | Same file | SECURITY DEFINER, `search_path = public`; current-user lookup. |
| `effective_supplier_plan(uuid)` | `supabase/migrations/20261112090000_supplier_memberships.sql` | SECURITY DEFINER, `search_path = public`; used by UI RPC calls and functions listed below. |
| `supplier_visibility_boost(uuid)` | Same file | SECURITY DEFINER, `search_path = public`; directly calls `effective_supplier_plan`. |
| `call_quota_for_user(uuid)` | `supabase/migrations/20261112100000_call_usage_quotas.sql` | SECURITY DEFINER, `search_path = public`; calls `effective_supplier_plan`. |
| `marketplace_visibility_score(uuid)` | `supabase/migrations/20261112140000_subscription_ranking_weights.sql` | SECURITY DEFINER, `search_path = public`; calls `effective_supplier_plan`. |
| `product_ranking_score(uuid)` | Same file | SECURITY DEFINER, `search_path = public`; transitively calls `effective_supplier_plan`. |
| `finalize_supplier_membership_payment(text,bigint,text)` | `supabase/migrations/20261112090000_supplier_memberships.sql` | SECURITY DEFINER, service-role execution; preserve server payment finalization. |
| `remove_my_products(uuid[])` | `supabase/migrations/20261027090000_product_removal.sql` | SECURITY DEFINER ownership check; authenticated execution; preserve. |
| `products_guard_preorder()` | `supabase/migrations/20261017090000_compliance_preorder_support.sql` | SECURITY DEFINER trigger function; trusts NULL `auth.uid()` in current repository body. |

The repository preorder trigger is `BEFORE INSERT OR UPDATE ... FOR EACH ROW`.
It does not fire for DELETE. The proposed migration narrows its trusted-null
context to service-role or database-owner sessions; verify every deployed
trusted backend path before deployment.

## Default privileges

The reported table, sequence, and function defaults are too broad. The proposed
migration only changes `public` schema defaults and leaves global defaults
untouched. This is deliberate to avoid changing unrelated schemas.

There is a PostgreSQL limitation: schema-specific default ACLs are additive and
cannot revoke a privilege granted by a global default ACL. Also, new functions
inherit PostgreSQL’s built-in PUBLIC EXECUTE default. Fully removing that
exposure for future public functions requires changing global defaults for the
creator role, which affects future functions in other schemas. This conflicts
with the instruction not to change unrelated schemas. Therefore the migration
must not be deployed as fully resolving function defaults until this scope
conflict is decided. Preflight should identify global entries; function execute
access must be explicitly restricted in each function migration meanwhile.

The default ACL audit must include the actual migration execution role(s), not
just `postgres`, `supabase_admin`, and `service_role`. Use
`SUPABASE_SECURITY_PREFLIGHT.sql` Section 4 and compare against deployment
configuration and migration history. Do not invent role names.

The migration now fails closed unless both `postgres` and `supabase_admin`
already have an explicit global function default ACL without `PUBLIC`, `anon`,
or `authenticated` EXECUTE. That prerequisite must be addressed separately
after approving its cross-schema scope; a `public`-only default ACL cannot
remove PostgreSQL's built-in global function EXECUTE baseline.

## Proposed changes and preserved workflows

The gated migration:

1. Verifies target table existence, owner, and RLS before any DDL.
2. Removes client `TRUNCATE`, `REFERENCES`, and `TRIGGER` on target tables; on
   PostgreSQL 17+, removes `MAINTAIN` as well.
3. Applies table-specific client privileges while preserving public reads,
   vendor/product operations, admin flyer/settings/campaign workflows, ranking
   upsert, and membership/payment reads.
4. Retains service-role DML on existing tables and grants future public-table
   DML defaults to `service_role`; removes structural privileges not used by
   application workflows.
5. Restricts arbitrary cross-user role lookup in `has_role(uuid, app_role)`.
6. Hardens preorder trigger NULL-auth behavior while retaining admin and
   service-role operations.
7. Adds campaign/creative trigger guards so vendors cannot directly self-approve
   or publish; material edits to approved content return it to review.
8. Adjusts `public`-scoped future table/sequence defaults. Global default ACLs
   and built-in function PUBLIC EXECUTE remain a deployment blocker, as above.

No payment business logic, payment status, BNPL, refund, checkout, or membership
finalization logic is changed. No application source is changed. Campaign
moderation is tightened at the database layer; verify the deployed advertising
RPCs and UI behavior against the guards before rollout. The migration is a
review draft, not certified production-ready SQL: it does not resolve
PostgreSQL's built-in global PUBLIC EXECUTE default for future functions, and
must not be deployed until that scope decision and the production preflight are
reviewed.

## Prepared files

- `SUPABASE_SECURITY_PREFLIGHT.sql` — read-only production inventory of role
  privileges, direct ACLs, default ACLs, policies, functions, and triggers.
- `SUPABASE_SECURITY_POSTFLIGHT.sql` — read-only checks for the proposed
  effective table permissions, structural privilege denials, defaults, and
  trigger/policy state.
- `SUPABASE_SECURITY_ROLLBACK.sql` — read-only rollback evidence capture. It
  intentionally does not generate blanket or guessed restoration grants.
- `supabase/migrations/20261114100000_security_hardening.sql` — gated review
  draft; it has not been run or validated against production.

The preflight/postflight scripts use catalog inspection only. They are not
proof that application workflows work; verify those workflows in staging.

## Rollback

The rollback file intentionally refuses to issue broad grants. Exact rollback
requires the pre-remediation ACL/default-ACL export, including grantors and
grant options. Save the preflight results, and do not deploy until a reviewed
rollback set is derived from those exact values. Transactional DDL can be
rolled back by aborting the migration transaction; after commit, a separately
reviewed recovery migration is required.

## Deployment and testing

1. Run and save `SUPABASE_SECURITY_PREFLIGHT.sql` in production; resolve all
   STOP findings and export exact ACL/default ACL/function/trigger results.
2. Confirm the actual migration creator roles and the global-vs-schema default
   ACL issue. Do not proceed while the function-default scope conflict remains.
3. Review the migration and rollback against the saved preflight, then deploy to
   staging first.
4. Test anon catalog, vendor ownership, admin workflows, campaigns/creatives,
   preorder approval, rank-weight upsert, payment initialization/verification/
   webhooks, and membership finalization with real test accounts and provider
   sandbox credentials.
5. Run `SUPABASE_SECURITY_POSTFLIGHT.sql`; verify intended denials with
   privilege checks rather than issuing destructive statements.
6. Deploy production only after the staging pass, backup, approved rollback,
   maintenance window, and owner authorization.

No production SQL was run as part of this review. The SQL files have not been
executed against production or staging. A report, generated migration, or
passing static checks does not mean production has been remediated.
