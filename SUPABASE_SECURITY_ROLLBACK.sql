-- READ-ONLY rollback planning aid.
--
-- This file intentionally does not issue GRANT, REVOKE, ALTER, or other
-- modifying statements. A safe restoration cannot be generated from repository
-- migrations because production ACLs/default ACLs may differ and each ACL
-- entry has a grantor and grant-option state.
--
-- Before deployment, preserve the complete SUPABASE_SECURITY_PREFLIGHT.sql
-- output. If rollback is needed after COMMIT:
--   1. Compare these current catalog results with the saved preflight snapshot.
--   2. Derive a separately reviewed recovery migration containing only the
--      exact original grants/default ACLs and function/trigger definitions.
--   3. Restore only entries changed by the hardening migration; preserve
--      unrelated grants and never use blanket grants.
--   4. Validate the recovery migration in staging, then run postflight checks.
--
-- Before COMMIT, aborting the migration transaction rolls back transactional
-- DDL. This read-only script does not perform that abort.

-- A. Current direct ACLs for reviewed tables.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
  grantor.rolname AS grantor,
  a.privilege_type,
  a.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) a
LEFT JOIN pg_roles grantee ON grantee.oid = a.grantee AND a.grantee <> 0::oid
LEFT JOIN pg_roles grantor ON grantor.oid = a.grantor
WHERE n.nspname = 'public'
  AND c.relname IN (
    'flyers', 'marketplace_campaigns', 'marketplace_campaign_creatives',
    'marketplace_ranking_weights', 'marketplace_settings', 'payments',
    'products', 'supplier_membership_payments', 'supplier_membership_plans',
    'vendor_memberships', 'vendors', 'user_roles'
  )
ORDER BY c.relname, grantee, a.privilege_type, grantor;

-- B. Current default ACLs. The preflight has corresponding global/schema scope
-- labels and includes explicit grantees, grantors, and grant options.
SELECT
  creator.rolname AS object_creator,
  CASE d.defaclobjtype
    WHEN 'r' THEN 'tables'
    WHEN 'S' THEN 'sequences'
    WHEN 'f' THEN 'functions'
    ELSE d.defaclobjtype::text
  END AS object_type,
  CASE WHEN d.defaclnamespace = 0::oid THEN 'GLOBAL' ELSE schema_name.nspname END AS scope,
  CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
  grantor.rolname AS grantor,
  a.privilege_type,
  a.is_grantable
FROM pg_default_acl d
JOIN pg_roles creator ON creator.oid = d.defaclrole
LEFT JOIN pg_namespace schema_name ON schema_name.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) a
LEFT JOIN pg_roles grantee ON grantee.oid = a.grantee AND a.grantee <> 0::oid
LEFT JOIN pg_roles grantor ON grantor.oid = a.grantor
WHERE creator.rolname IN ('postgres', 'supabase_admin', 'service_role')
  AND (d.defaclnamespace = 0::oid OR schema_name.nspname = 'public')
ORDER BY creator.rolname, object_type, scope, grantee, a.privilege_type;

-- C. Current relevant function source and trigger attachment inventory. Save
-- and compare with the exact deployed definitions collected before migration.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  owner_role.rolname AS function_owner,
  p.prosecdef AS security_definer,
  p.proconfig AS function_configuration,
  p.proacl IS NULL AS uses_builtin_function_acl,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles owner_role ON owner_role.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname IN (
    'has_role',
    'products_guard_preorder',
    'guard_campaign_vendor_changes',
    'guard_creative_vendor_changes'
  )
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  tr.tgname AS trigger_name,
  tr.tgenabled,
  pg_get_triggerdef(tr.oid, true) AS trigger_definition,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS function_identity_arguments
FROM pg_trigger tr
JOIN pg_class c ON c.oid = tr.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = tr.tgfoid
WHERE n.nspname = 'public'
  AND c.relname IN ('products', 'marketplace_campaigns', 'marketplace_campaign_creatives')
ORDER BY c.relname, tr.tgname;
