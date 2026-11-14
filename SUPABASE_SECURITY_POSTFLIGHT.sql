-- READ-ONLY Supabase security postflight.
-- Run only after the reviewed remediation has been applied to the intended
-- database. Save these results and compare them with the saved preflight.
-- This script never modifies database state.

-- 1. Expected effective table privileges. Effective checks include direct
-- grants, PUBLIC grants, and inherited role privileges.
WITH expected(table_name, role_name, privilege_name, should_have) AS (
  VALUES
    ('flyers', 'anon', 'SELECT', true),
    ('flyers', 'authenticated', 'SELECT', true),
    ('flyers', 'authenticated', 'INSERT', true),
    ('flyers', 'authenticated', 'UPDATE', true),
    ('flyers', 'authenticated', 'DELETE', true),

    ('marketplace_campaigns', 'authenticated', 'SELECT', true),
    ('marketplace_campaigns', 'authenticated', 'INSERT', true),
    ('marketplace_campaigns', 'authenticated', 'UPDATE', true),
    ('marketplace_campaigns', 'authenticated', 'DELETE', true),

    ('marketplace_campaign_creatives', 'authenticated', 'SELECT', true),
    ('marketplace_campaign_creatives', 'authenticated', 'INSERT', true),
    ('marketplace_campaign_creatives', 'authenticated', 'UPDATE', true),
    ('marketplace_campaign_creatives', 'authenticated', 'DELETE', true),

    ('marketplace_ranking_weights', 'authenticated', 'SELECT', true),
    ('marketplace_ranking_weights', 'authenticated', 'INSERT', true),
    ('marketplace_ranking_weights', 'authenticated', 'UPDATE', true),

    ('marketplace_settings', 'anon', 'SELECT', true),
    ('marketplace_settings', 'authenticated', 'SELECT', true),
    ('marketplace_settings', 'authenticated', 'UPDATE', true),

    ('payments', 'authenticated', 'SELECT', true),

    ('products', 'anon', 'SELECT', true),
    ('products', 'authenticated', 'SELECT', true),
    ('products', 'authenticated', 'INSERT', true),
    ('products', 'authenticated', 'UPDATE', true),

    ('supplier_membership_payments', 'authenticated', 'SELECT', true),

    ('supplier_membership_plans', 'anon', 'SELECT', true),
    ('supplier_membership_plans', 'authenticated', 'SELECT', true),
    ('supplier_membership_plans', 'authenticated', 'UPDATE', true),

    ('vendor_memberships', 'authenticated', 'SELECT', true),
    ('vendor_memberships', 'authenticated', 'UPDATE', true),

    ('vendors', 'anon', 'SELECT', true),
    ('vendors', 'authenticated', 'SELECT', true),
    ('vendors', 'authenticated', 'INSERT', true),
    ('vendors', 'authenticated', 'UPDATE', true),

    ('user_roles', 'authenticated', 'SELECT', true),
    ('user_roles', 'authenticated', 'INSERT', true),
    ('user_roles', 'authenticated', 'UPDATE', true),
    ('user_roles', 'authenticated', 'DELETE', true)
),
all_checks AS (
  SELECT
    t.table_name,
    principal.role_name,
    privilege_check.privilege_name,
    COALESCE(e.should_have, false) AS should_have
  FROM (
    VALUES
      ('flyers'), ('marketplace_campaigns'), ('marketplace_campaign_creatives'),
      ('marketplace_ranking_weights'), ('marketplace_settings'), ('payments'),
      ('products'), ('supplier_membership_payments'), ('supplier_membership_plans'),
      ('vendor_memberships'), ('vendors'), ('user_roles')
  ) AS t(table_name)
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS principal(role_name)
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS privilege_check(privilege_name)
  LEFT JOIN expected e
    ON e.table_name = t.table_name
   AND e.role_name = principal.role_name
   AND e.privilege_name = privilege_check.privilege_name
)
SELECT
  c.table_name,
  c.role_name,
  c.privilege_name,
  c.should_have AS expected,
  has_table_privilege(c.role_name, format('%I.%I', 'public', c.table_name), c.privilege_name) AS actual,
  CASE
    WHEN has_table_privilege(c.role_name, format('%I.%I', 'public', c.table_name), c.privilege_name)
      = c.should_have THEN 'PASS'
    ELSE 'FAIL'
  END AS result
FROM all_checks c
ORDER BY c.table_name, c.role_name, c.privilege_name;

-- 1B. Service-role row privileges are intentionally retained by the migration.
-- Compare these effective results with the saved preflight; repository evidence
-- does not establish one exact privilege set for every target table.
WITH target(table_name) AS (
  VALUES
    ('flyers'), ('marketplace_campaigns'), ('marketplace_campaign_creatives'),
    ('marketplace_ranking_weights'), ('marketplace_settings'), ('payments'),
    ('products'), ('supplier_membership_payments'), ('supplier_membership_plans'),
    ('vendor_memberships'), ('vendors'), ('user_roles')
)
SELECT
  t.table_name,
  has_table_privilege('service_role', format('%I.%I', 'public', t.table_name), 'SELECT') AS select_privilege,
  has_table_privilege('service_role', format('%I.%I', 'public', t.table_name), 'INSERT') AS insert_privilege,
  has_table_privilege('service_role', format('%I.%I', 'public', t.table_name), 'UPDATE') AS update_privilege,
  has_table_privilege('service_role', format('%I.%I', 'public', t.table_name), 'DELETE') AS delete_privilege,
  'COMPARE WITH SAVED PREFLIGHT' AS interpretation
FROM target t
ORDER BY t.table_name;

-- 2. Structural privileges must not be effective for the client roles or
-- service_role on these application tables. MAINTAIN is checked only on PG17+.
WITH target(table_name) AS (
  VALUES
    ('flyers'), ('marketplace_campaigns'), ('marketplace_campaign_creatives'),
    ('marketplace_ranking_weights'), ('marketplace_settings'), ('payments'),
    ('products'), ('supplier_membership_payments'), ('supplier_membership_plans'),
    ('vendor_memberships'), ('vendors'), ('user_roles')
),
principals(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
)
SELECT
  t.table_name,
  p.role_name,
  has_table_privilege(p.role_name, format('%I.%I', 'public', t.table_name), 'TRUNCATE') AS truncate_privilege,
  has_table_privilege(p.role_name, format('%I.%I', 'public', t.table_name), 'REFERENCES') AS references_privilege,
  has_table_privilege(p.role_name, format('%I.%I', 'public', t.table_name), 'TRIGGER') AS trigger_privilege,
  CASE
    WHEN current_setting('server_version_num')::integer >= 170000
      THEN has_table_privilege(p.role_name, format('%I.%I', 'public', t.table_name), 'MAINTAIN')
    ELSE NULL
  END AS maintain_privilege_pg17_plus,
  CASE
    WHEN has_table_privilege(p.role_name, format('%I.%I', 'public', t.table_name), 'TRUNCATE')
      OR has_table_privilege(p.role_name, format('%I.%I', 'public', t.table_name), 'REFERENCES')
      OR has_table_privilege(p.role_name, format('%I.%I', 'public', t.table_name), 'TRIGGER')
      OR COALESCE(
        CASE
          WHEN current_setting('server_version_num')::integer >= 170000
            THEN has_table_privilege(p.role_name, format('%I.%I', 'public', t.table_name), 'MAINTAIN')
          ELSE false
        END,
        false
      ) THEN 'FAIL'
    ELSE 'PASS'
  END AS result
FROM target t
CROSS JOIN principals p
ORDER BY t.table_name, p.role_name;

-- 3. Direct PUBLIC table ACL entries are reported separately from effective
-- role checks above. This should return no structural grants.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  a.privilege_type,
  a.is_grantable,
  grantor.rolname AS grantor
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) a
LEFT JOIN pg_roles grantor ON grantor.oid = a.grantor
WHERE n.nspname = 'public'
  AND c.relname IN (
    'flyers', 'marketplace_campaigns', 'marketplace_campaign_creatives',
    'marketplace_ranking_weights', 'marketplace_settings', 'payments',
    'products', 'supplier_membership_payments', 'supplier_membership_plans',
    'vendor_memberships', 'vendors', 'user_roles'
  )
  AND a.grantee = 0::oid
  AND a.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
ORDER BY c.relname, a.privilege_type;

-- 4. Default ACL status for known creator roles. A schema-scoped row is
-- additive; it cannot cancel global defaults. Additional creators must be
-- identified from deployment configuration and Section 4B of the preflight.
WITH creators(role_name) AS (
  VALUES ('postgres'), ('supabase_admin'), ('service_role')
),
object_kinds(object_type, object_code) AS (
  VALUES ('tables', 'r'::"char"), ('sequences', 'S'::"char"), ('functions', 'f'::"char")
),
scopes(scope_name, schema_oid) AS (
  SELECT 'GLOBAL', 0::oid
  UNION ALL
  SELECT 'SCHEMA public', n.oid FROM pg_namespace n WHERE n.nspname = 'public'
)
SELECT
  creator.role_name AS object_creator,
  kind.object_type,
  scope.scope_name AS scope,
  CASE
    WHEN d.oid IS NULL AND scope.schema_oid = 0::oid AND kind.object_code = 'f'
      THEN 'NO EXPLICIT GLOBAL ACL; BUILT-IN PUBLIC EXECUTE BASELINE APPLIES'
    WHEN d.oid IS NULL AND scope.schema_oid = 0::oid
      THEN 'NO EXPLICIT GLOBAL ACL; BUILT-IN TABLE/SEQUENCE BASELINE APPLIES'
    WHEN d.oid IS NULL
      THEN 'NO EXPLICIT public-SCHEMA ACL; GLOBAL DEFAULTS REMAIN ADDITIVE'
    WHEN scope.schema_oid = 0::oid
      THEN 'EXPLICIT GLOBAL DEFAULT ACL; REVIEW EFFECTIVE GRANTS'
    ELSE 'EXPLICIT SCHEMA DEFAULT ACL; ADDITIVE TO GLOBAL DEFAULTS'
  END AS default_acl_status,
  CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
  a.privilege_type,
  a.is_grantable
FROM creators creator
JOIN pg_roles creator_role ON creator_role.rolname = creator.role_name
CROSS JOIN object_kinds kind
CROSS JOIN scopes scope
LEFT JOIN pg_default_acl d
  ON d.defaclrole = creator_role.oid
 AND d.defaclobjtype = kind.object_code
 AND d.defaclnamespace = scope.schema_oid
LEFT JOIN LATERAL aclexplode(d.defaclacl) a ON true
LEFT JOIN pg_roles grantee ON grantee.oid = a.grantee AND a.grantee <> 0::oid
WHERE a.grantee = 0::oid
   OR grantee.rolname IN ('anon', 'authenticated', 'service_role')
   OR d.oid IS NULL
ORDER BY creator.role_name, kind.object_type, scope.schema_oid, grantee, a.privilege_type;

-- 5. RLS and expected guard trigger presence. Review the policies and trigger
-- definitions against the approved preflight; presence alone does not prove a
-- policy expression or function body is correct.
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  owner_role.rolname AS owner,
  CASE
    WHEN c.relrowsecurity AND NOT c.relforcerowsecurity
      AND owner_role.rolname = 'postgres' THEN 'PASS'
    ELSE 'REVIEW'
  END AS state_result
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_roles owner_role ON owner_role.oid = c.relowner
WHERE n.nspname = 'public'
  AND c.relname IN (
    'flyers', 'marketplace_campaigns', 'marketplace_campaign_creatives',
    'marketplace_ranking_weights', 'marketplace_settings', 'payments',
    'products', 'supplier_membership_payments', 'supplier_membership_plans',
    'vendor_memberships', 'vendors', 'user_roles'
  )
ORDER BY c.relname;

SELECT
  c.relname AS table_name,
  tr.tgname AS trigger_name,
  tr.tgenabled,
  p.proname AS trigger_function,
  p.prosecdef AS function_security_definer,
  p.proconfig AS function_configuration,
  pg_get_triggerdef(tr.oid, true) AS trigger_definition
FROM pg_trigger tr
JOIN pg_class c ON c.oid = tr.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = tr.tgfoid
WHERE n.nspname = 'public'
  AND (
    (c.relname = 'products' AND tr.tgname = 'trg_products_guard_preorder')
    OR (c.relname = 'marketplace_campaigns' AND tr.tgname = 'trg_guard_campaign_vendor_changes')
    OR (c.relname = 'marketplace_campaign_creatives' AND tr.tgname = 'trg_guard_creative_vendor_changes')
  )
ORDER BY c.relname, tr.tgname;

-- Deployed RLS policies are repeated here for convenient comparison with the
-- saved preflight. Compare expressions, roles, and commands, not just names.
SELECT
  c.relname AS table_name,
  p.polname AS policy_name,
  CASE p.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
    ELSE p.polcmd::text
  END AS command,
  ARRAY(
    SELECT CASE WHEN policy_role.role_oid = 0 THEN 'PUBLIC' ELSE role_name.rolname END
    FROM unnest(p.polroles) AS policy_role(role_oid)
    LEFT JOIN pg_roles role_name
      ON role_name.oid = policy_role.role_oid AND policy_role.role_oid <> 0::oid::oid
    ORDER BY 1
  ) AS roles,
  pg_get_expr(p.polqual, p.polrelid) AS using_expression,
  pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expression
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'flyers', 'marketplace_campaigns', 'marketplace_campaign_creatives',
    'marketplace_ranking_weights', 'marketplace_settings', 'payments',
    'products', 'supplier_membership_payments', 'supplier_membership_plans',
    'vendor_memberships', 'vendors', 'user_roles'
  )
ORDER BY c.relname, p.polname;

-- 6. Function execution remains per-function and overload-specific. Pay
-- particular attention to any PUBLIC effective EXECUTE privilege; the
-- PostgreSQL built-in default cannot be canceled with a schema-only default.
-- Function definitions are intentionally omitted; use the preflight query if
-- a post-deployment body change is suspected.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  owner_role.rolname AS function_owner,
  p.prosecdef AS security_definer,
  p.proconfig AS function_configuration,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_effective_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_effective_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_effective_execute,
  p.proacl IS NULL AS uses_builtin_function_acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles owner_role ON owner_role.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname IN (
    'has_role',
    'effective_supplier_plan',
    'finalize_supplier_membership_payment',
    'remove_my_products',
    'products_guard_preorder',
    'guard_campaign_vendor_changes',
    'guard_creative_vendor_changes',
    'admin_list_ad_campaigns',
    'admin_list_external_campaigns',
    'admin_set_campaign_priority',
    'admin_set_campaign_status',
    'admin_sweep_expired_campaigns',
    'ensure_ad_campaign_for_vendor',
    'vendor_cancel_external_campaign',
    'vendor_create_product_campaign',
    'vendor_request_external_campaign',
    'vendor_set_campaign_paused',
    'vendor_set_campaign_products',
    'vendor_update_campaign_message',
    'ad_require_admin',
    'ad_require_vendor',
    'ad_entitlement',
    'ad_apply_banner',
    'ad_enqueue_job',
    'ad_notify_vendor',
    'ad_placements_for',
    'ad_copy_is_safe',
    'marketplace_visibility_score',
    'product_ranking_score',
    'call_quota_for_user'
  )
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);
