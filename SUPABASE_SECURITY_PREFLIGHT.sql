-- READ-ONLY Supabase security preflight.
-- Run in the Supabase SQL Editor against the intended database and save every
-- result set before reviewing or applying a remediation migration.
-- Catalog/privilege functions below inspect metadata; no application function
-- is called and no database state is changed.

-- 0. Server and principal context. SQL Editor privileges are not evidence of
-- anon/authenticated access; later sections check those roles explicitly.
SELECT
  current_database() AS database_name,
  current_user AS current_user_name,
  session_user AS session_user_name,
  current_setting('server_version') AS server_version,
  current_setting('server_version_num')::integer AS server_version_num;

SELECT
  r.rolname,
  r.rolsuper,
  r.rolinherit,
  has_schema_privilege(r.oid, 'public', 'USAGE') AS public_schema_usage,
  has_schema_privilege(r.oid, 'public', 'CREATE') AS public_schema_create
FROM pg_roles r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'postgres', 'supabase_admin')
ORDER BY r.rolname;

-- 1. Target tables, ownership, and RLS state.
WITH target(table_name) AS (
  VALUES
    ('flyers'),
    ('marketplace_campaigns'),
    ('marketplace_campaign_creatives'),
    ('marketplace_ranking_weights'),
    ('marketplace_settings'),
    ('payments'),
    ('products'),
    ('supplier_membership_payments'),
    ('supplier_membership_plans'),
    ('vendor_memberships'),
    ('vendors'),
    ('user_roles')
)
SELECT
  t.table_name,
  c.oid IS NOT NULL AS exists_in_public,
  owner_role.rolname AS owner,
  c.relkind,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  c.relacl IS NULL AS uses_builtin_owner_acl
FROM target t
LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_class c
  ON c.relnamespace = n.oid
 AND c.relname = t.table_name
 AND c.relkind IN ('r', 'p')
LEFT JOIN pg_roles owner_role ON owner_role.oid = c.relowner
ORDER BY t.table_name;

-- 2. EFFECTIVE table privileges. PUBLIC is not a login role: its direct ACL
-- entries are shown in Section 3, while these role checks include privileges
-- inherited through PUBLIC and role memberships. The owner is shown separately.
WITH target(table_name) AS (
  VALUES
    ('flyers'),
    ('marketplace_campaigns'),
    ('marketplace_campaign_creatives'),
    ('marketplace_ranking_weights'),
    ('marketplace_settings'),
    ('payments'),
    ('products'),
    ('supplier_membership_payments'),
    ('supplier_membership_plans'),
    ('vendor_memberships'),
    ('vendors'),
    ('user_roles')
),
principals(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
)
SELECT
  t.table_name,
  p.role_name,
  r.rolname AS table_owner,
  has_table_privilege(p.role_name, c.oid, 'SELECT') AS select_privilege,
  has_table_privilege(p.role_name, c.oid, 'INSERT') AS insert_privilege,
  has_table_privilege(p.role_name, c.oid, 'UPDATE') AS update_privilege,
  has_table_privilege(p.role_name, c.oid, 'DELETE') AS delete_privilege,
  has_table_privilege(p.role_name, c.oid, 'TRUNCATE') AS truncate_privilege,
  has_table_privilege(p.role_name, c.oid, 'REFERENCES') AS references_privilege,
  has_table_privilege(p.role_name, c.oid, 'TRIGGER') AS trigger_privilege,
  CASE
    WHEN current_setting('server_version_num')::integer >= 170000
      THEN has_table_privilege(p.role_name, c.oid, 'MAINTAIN')
    ELSE NULL
  END AS maintain_privilege_pg17_plus,
  current_setting('server_version_num')::integer >= 170000 AS maintain_supported
FROM target t
JOIN pg_namespace n ON n.nspname = 'public'
JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = t.table_name
  AND c.relkind IN ('r', 'p')
CROSS JOIN principals p
JOIN pg_roles r ON r.oid = c.relowner
ORDER BY t.table_name, p.role_name;

-- 3. DIRECT table ACLs, including explicit PUBLIC entries. These are not
-- effective permissions and do not list owner privileges implicit in ownership.
WITH target(table_name) AS (
  VALUES
    ('flyers'),
    ('marketplace_campaigns'),
    ('marketplace_campaign_creatives'),
    ('marketplace_ranking_weights'),
    ('marketplace_settings'),
    ('payments'),
    ('products'),
    ('supplier_membership_payments'),
    ('supplier_membership_plans'),
    ('vendor_memberships'),
    ('vendors'),
    ('user_roles')
)
SELECT
  t.table_name,
  CASE WHEN acl.grantee = 0::oid THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
  grantor.rolname AS grantor,
  acl.privilege_type,
  acl.is_grantable
FROM target t
JOIN pg_namespace n ON n.nspname = 'public'
JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = t.table_name
  AND c.relkind IN ('r', 'p')
CROSS JOIN LATERAL aclexplode(c.relacl) acl
LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee AND acl.grantee <> 0::oid
LEFT JOIN pg_roles grantor ON grantor.oid = acl.grantor
ORDER BY t.table_name, grantee, acl.privilege_type, grantor;

-- 4. DEFAULT PRIVILEGES. A missing row is not "no defaults": global defaults
-- then use PostgreSQL's built-in baseline. Per-schema ACLs are additive to
-- global defaults and cannot revoke global privileges. No creator roles beyond
-- these are assumed; compare Section 4B with migration/deployment identities.
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
  scope.scope_name,
  CASE
    WHEN d.oid IS NULL AND scope.schema_oid = 0::oid
      THEN 'NO EXPLICIT GLOBAL ACL; BUILT-IN DEFAULT BASELINE APPLIES'
    WHEN d.oid IS NULL
      THEN 'NO EXPLICIT public-SCHEMA ACL; GLOBAL DEFAULTS REMAIN ADDITIVE'
    WHEN scope.schema_oid = 0::oid
      THEN 'EXPLICIT GLOBAL DEFAULT ACL OVERRIDES BUILT-IN BASELINE'
    ELSE 'EXPLICIT SCHEMA DEFAULT ACL; ADDITIVE TO GLOBAL DEFAULTS'
  END AS default_acl_status,
  CASE WHEN acl.grantee = 0::oid THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
  grantor.rolname AS grantor,
  acl.privilege_type,
  acl.is_grantable
FROM creators creator
JOIN pg_roles creator_role ON creator_role.rolname = creator.role_name
CROSS JOIN object_kinds kind
CROSS JOIN scopes scope
LEFT JOIN pg_default_acl d
  ON d.defaclrole = creator_role.oid
 AND d.defaclobjtype = kind.object_code
 AND d.defaclnamespace = scope.schema_oid
LEFT JOIN LATERAL aclexplode(d.defaclacl) acl ON true
LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee AND acl.grantee <> 0::oid
LEFT JOIN pg_roles grantor ON grantor.oid = acl.grantor
ORDER BY creator.role_name, kind.object_type, scope.schema_oid, grantee, acl.privilege_type;

-- 4B. Potential additional table creators: roles that can CREATE in public,
-- superusers, and memberships that may permit SET ROLE. This is a lead only;
-- compare it with the actual migration/deployment identity. Do not infer the
-- creator of an existing object from its current owner alone.
SELECT
  r.rolname,
  r.rolsuper,
  has_schema_privilege(r.oid, 'public', 'CREATE') AS can_create_in_public,
  r.rolinherit
FROM pg_roles r
WHERE r.rolsuper
   OR has_schema_privilege(r.oid, 'public', 'CREATE')
ORDER BY r.rolname;

WITH RECURSIVE role_paths(start_role, inherited_role, path) AS (
  SELECT
    member.rolname,
    parent.rolname,
    ARRAY[member.rolname, parent.rolname]::text[]
  FROM pg_auth_members m
  JOIN pg_roles member ON member.oid = m.member
  JOIN pg_roles parent ON parent.oid = m.roleid
  WHERE member.rolname IN ('anon', 'authenticated', 'service_role')

  UNION ALL

  SELECT
    rp.start_role,
    parent.rolname,
    rp.path || parent.rolname
  FROM role_paths rp
  JOIN pg_roles role_to_expand ON role_to_expand.rolname = rp.inherited_role
  JOIN pg_auth_members m ON m.member = role_to_expand.oid
  JOIN pg_roles parent ON parent.oid = m.roleid
  WHERE NOT parent.rolname = ANY(rp.path)
)
SELECT start_role, inherited_role, path
FROM role_paths
ORDER BY start_role, path;

-- 5. Deployed RLS policies for target tables.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  p.polname AS policy_name,
  p.polcmd AS command_code,
  CASE p.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
    ELSE p.polcmd::text
  END AS command,
  ARRAY(
    SELECT CASE WHEN role_oid = 0::oid THEN 'PUBLIC' ELSE role_name.rolname END
    FROM unnest(p.polroles) AS policy_role(role_oid)
    LEFT JOIN pg_roles role_name ON role_name.oid = policy_role.role_oid
      AND policy_role.role_oid <> 0::oid
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

-- 6. Relevant SECURITY DEFINER functions, triggers, and EXECUTE privileges.
-- Each overload is returned independently by exact identity arguments.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_identity_result(p.oid) AS result_type,
  owner_role.rolname AS function_owner,
  p.prosecdef AS security_definer,
  p.proconfig AS function_configuration,
  l.lanname AS language,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_effective_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_effective_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_effective_execute,
  EXISTS (
    SELECT 1 FROM pg_trigger tr
    WHERE tr.tgfoid = p.oid AND NOT tr.tgisinternal
  ) AS referenced_by_trigger,
  p.proacl IS NULL AS uses_builtin_function_acl,
  pg_get_functiondef(p.oid) AS function_definition,
  (
    SELECT string_agg(
      concat_ws(':',
        CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE grantee.rolname END,
        a.privilege_type,
        'grantor=' || grantor.rolname,
        'grantable=' || a.is_grantable
      ),
      '; ' ORDER BY a.grantee, a.privilege_type, a.grantor
    )
    FROM aclexplode(p.proacl) a
    LEFT JOIN pg_roles grantee ON grantee.oid = a.grantee AND a.grantee <> 0::oid
    LEFT JOIN pg_roles grantor ON grantor.oid = a.grantor
  ) AS direct_execute_acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles owner_role ON owner_role.oid = p.proowner
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname IN (
    'has_role',
    'effective_supplier_plan',
    'finalize_supplier_membership_payment',
    'remove_my_products',
    'products_guard_preorder',
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

-- 7. Trigger inventory for products and campaign tables.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  tr.tgname AS trigger_name,
  pg_get_triggerdef(tr.oid, true) AS trigger_definition,
  CASE tr.tgenabled
    WHEN 'O' THEN 'enabled'
    WHEN 'D' THEN 'disabled'
    WHEN 'R' THEN 'replica'
    WHEN 'A' THEN 'always'
  END AS enabled_state,
  tr.tgisinternal AS is_internal,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS function_identity_arguments,
  fn_owner.rolname AS function_owner,
  p.prosecdef AS function_security_definer,
  p.proconfig AS function_configuration
FROM pg_trigger tr
JOIN pg_class c ON c.oid = tr.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = tr.tgfoid
JOIN pg_roles fn_owner ON fn_owner.oid = p.proowner
WHERE n.nspname = 'public'
  AND c.relname IN ('products', 'marketplace_campaigns', 'marketplace_campaign_creatives')
ORDER BY c.relname, tr.tgname;
