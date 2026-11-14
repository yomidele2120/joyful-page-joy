-- Production security hardening.
--
-- Preconditions:
--   * Review SUPABASE_SECURITY_PREFLIGHT.sql output for this exact database.
--   * Run as postgres after confirming the deployed table/function definitions.
--   * This migration changes defaults only in public. PostgreSQL's built-in
--     PUBLIC EXECUTE default for future functions is global; a schema-only
--     REVOKE cannot cancel it. See SUPABASE_SECURITY_AUDIT.md before deployment.
--
-- This migration does not change payment business logic or ownership, disable
-- RLS, or use FORCE ROW LEVEL SECURITY.

BEGIN;

DO $preflight$
DECLARE
  _missing text;
  _bad text;
  _missing_columns text;
  _creator text;
  _creator_oid oid;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Security migration must run as postgres; current_user=%',
      current_user;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'Required Supabase roles are missing';
  END IF;

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
  SELECT string_agg(target.table_name, ', ' ORDER BY target.table_name)
    INTO _missing
  FROM target
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = target.table_name
      AND c.relkind IN ('r', 'p')
  );
  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'Required public tables are missing: %', _missing;
  END IF;

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
  SELECT string_agg(target.table_name, ', ' ORDER BY target.table_name)
    INTO _bad
  FROM target
  JOIN pg_namespace n ON n.nspname = 'public'
  JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = target.table_name
  JOIN pg_roles owner_role ON owner_role.oid = c.relowner
  WHERE owner_role.rolname <> 'postgres'
     OR NOT c.relrowsecurity
     OR c.relforcerowsecurity;
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION
      'Unexpected owner/RLS/FORCE RLS state on public tables: %', _bad;
  END IF;

  WITH required(table_name, column_name) AS (
    VALUES
      ('products', 'is_preorder'),
      ('products', 'preorder_approved'),
      ('products', 'preorder_due_notified'),
      ('products', 'preorder_release_date'),
      ('marketplace_settings', 'id'),
      ('marketplace_settings', 'preorder_requires_approval'),
      ('marketplace_campaigns', 'vendor_id'),
      ('marketplace_campaigns', 'status'),
      ('marketplace_campaigns', 'admin_note'),
      ('marketplace_campaign_creatives', 'campaign_id'),
      ('marketplace_campaign_creatives', 'status')
  )
  SELECT string_agg(required.table_name || '.' || required.column_name, ', '
                    ORDER BY required.table_name, required.column_name)
    INTO _missing_columns
  FROM required
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = required.table_name
      AND column_info.column_name = required.column_name
  );
  IF _missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Required columns are missing: %', _missing_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_role'
      AND e.enumlabel = 'admin'
  ) THEN
    RAISE EXCEPTION 'Expected public.app_role enum value admin is missing';
  END IF;

  IF has_schema_privilege('anon', 'public', 'CREATE')
     OR has_schema_privilege('authenticated', 'public', 'CREATE')
     OR has_schema_privilege('service_role', 'public', 'CREATE') THEN
    RAISE EXCEPTION
      'Unexpected CREATE privilege on public schema; inspect before proceeding';
  END IF;

  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL
     OR to_regprocedure('public.has_role(public.app_role)') IS NULL
     OR to_regprocedure('public.products_guard_preorder()') IS NULL THEN
    RAISE EXCEPTION
      'Expected role-check or preorder-trigger function signature is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'products'
      AND t.tgname = 'trg_products_guard_preorder'
      AND NOT t.tgisinternal
      AND t.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION
      'Expected enabled products preorder guard trigger is missing';
  END IF;

  -- Schema-scoped defaults cannot subtract global defaults. Stop rather than
  -- claiming this migration has secured public if a global table, sequence, or
  -- function ACL grants client roles privileges that this migration cannot
  -- cancel locally.
  FOREACH _creator IN ARRAY ARRAY['postgres', 'supabase_admin'] LOOP
    SELECT oid INTO _creator_oid FROM pg_roles WHERE rolname = _creator;
    IF _creator_oid IS NULL THEN
      RAISE EXCEPTION 'Expected default-ACL creator role % is missing', _creator;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
      WHERE d.defaclrole = _creator_oid
        AND d.defaclnamespace = 0::oid
        AND (
          (d.defaclobjtype IN ('r', 'S', 'f')
            AND a.grantee IN (
              0::oid,
              (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
              (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
            ))
        )
    ) THEN
      RAISE EXCEPTION
        'Global default ACL exists for creator %. It may affect schemas outside public; review separately before proceeding.',
        _creator;
    END IF;

    -- Public-schema function defaults are additive; they cannot remove the
    -- built-in global PUBLIC EXECUTE grant. Require a reviewed global creator
    -- default ACL with no client/PUBLIC EXECUTE before allowing this migration.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_default_acl d
        WHERE d.defaclrole = _creator_oid
          AND d.defaclnamespace = 0::oid
          AND d.defaclobjtype = 'f'
          AND NOT EXISTS (
            SELECT 1
            FROM aclexplode(d.defaclacl) a
            WHERE a.grantee IN (
              0::oid,
              (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
              (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
            )
              AND a.privilege_type = 'EXECUTE'
          )
    ) THEN
        RAISE EXCEPTION
          'Creator role % still has the built-in or explicit global PUBLIC/client EXECUTE default; resolve its global function default scope before running this migration.',
          _creator;
    END IF;
  END LOOP;
END;
$preflight$;

-- Remove non-row application privileges from client roles on the reviewed
-- business tables. Service-role DML is retained for existing backend flows.
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON TABLE
    public.flyers,
    public.marketplace_campaigns,
    public.marketplace_campaign_creatives,
    public.marketplace_ranking_weights,
    public.marketplace_settings,
    public.payments,
    public.products,
    public.supplier_membership_payments,
    public.supplier_membership_plans,
    public.vendor_memberships,
    public.vendors,
    public.user_roles
  FROM PUBLIC, anon, authenticated, service_role;

DO $maintain$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE
      'REVOKE MAINTAIN ON TABLE '
      || 'public.flyers, public.marketplace_campaigns, '
      || 'public.marketplace_campaign_creatives, '
      || 'public.marketplace_ranking_weights, public.marketplace_settings, '
      || 'public.payments, public.products, '
      || 'public.supplier_membership_payments, '
      || 'public.supplier_membership_plans, public.vendor_memberships, '
      || 'public.vendors, public.user_roles '
      || 'FROM PUBLIC, anon, authenticated, service_role';
  END IF;
END;
$maintain$;

-- Reset client table privileges on this explicit set, then restore the
-- operations currently required by repository workflows and RLS policies.
REVOKE ALL ON TABLE
  public.flyers,
  public.marketplace_campaigns,
  public.marketplace_campaign_creatives,
  public.marketplace_ranking_weights,
  public.marketplace_settings,
  public.payments,
  public.products,
  public.supplier_membership_payments,
  public.supplier_membership_plans,
  public.vendor_memberships,
  public.vendors,
  public.user_roles
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.flyers,
  public.marketplace_settings,
  public.products,
  public.supplier_membership_plans,
  public.vendors
TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.flyers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.marketplace_campaigns,
  public.marketplace_campaign_creatives
TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.marketplace_ranking_weights TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.marketplace_settings TO authenticated;
GRANT SELECT ON TABLE public.payments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.products TO authenticated;
GRANT SELECT ON TABLE public.supplier_membership_payments TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.supplier_membership_plans TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.vendor_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.vendors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_roles TO authenticated;

-- Secure role lookup: users may inspect their own role assignments; only an
-- already-authenticated administrator may inspect another user's roles.
CREATE OR REPLACE FUNCTION public.has_role(
  _user_id uuid,
  _role public.app_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE
    WHEN _user_id = auth.uid() THEN EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role = _role
    )
    WHEN auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_roles current_admin
        WHERE current_admin.user_id = auth.uid()
          AND current_admin.role = 'admin'::public.app_role
      )
      THEN EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = _user_id
          AND ur.role = _role
      )
    ELSE false
  END
$function$;

-- Keep the existing preorder guard, but do not treat an anonymous NULL UID as
-- a trusted backend identity.
CREATE OR REPLACE FUNCTION public.products_guard_preorder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  _requires boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    IF COALESCE(auth.role(), '') = 'service_role'
       OR session_user IN ('postgres', 'supabase_admin') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'A signed-in user or trusted backend is required';
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  SELECT preorder_requires_approval
    INTO _requires
  FROM public.marketplace_settings
  WHERE id = true;
  _requires := COALESCE(_requires, true);

  IF TG_OP = 'INSERT' THEN
    NEW.preorder_approved := CASE
      WHEN NEW.is_preorder THEN NOT _requires
      ELSE false
    END;
    NEW.preorder_due_notified := false;
  ELSE
    IF NEW.is_preorder AND NOT OLD.is_preorder THEN
      NEW.preorder_approved := NOT _requires;
    ELSE
      NEW.preorder_approved := OLD.preorder_approved;
    END IF;

    IF NEW.preorder_release_date IS DISTINCT FROM OLD.preorder_release_date THEN
      NEW.preorder_due_notified := false;
    ELSE
      NEW.preorder_due_notified := OLD.preorder_due_notified;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Protect moderation-controlled campaign fields while permitting vendor
-- editing, pausing, and review submission. Approved material edits go back to
-- pending_review. JSON record handling also tolerates deployment-only columns.
CREATE OR REPLACE FUNCTION public.guard_campaign_vendor_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  _old jsonb;
  _new jsonb;
  _field text;
  _material_fields text[] := ARRAY[
    'title', 'message', 'body', 'promotional_message', 'promotion_scope',
    'scope', 'product_id', 'product_ids', 'selected_products',
    'destination', 'destination_url', 'cta', 'cta_label', 'cta_url',
    'image_url', 'artwork_url', 'creative_url', 'start_at', 'end_at',
    'starts_at', 'ends_at', 'placement', 'placement_requests'
  ];
  _material_changed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    IF COALESCE(auth.role(), '') = 'service_role'
       OR session_user IN ('postgres', 'supabase_admin') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'A signed-in user or trusted backend is required';
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  _new := to_jsonb(NEW);
  IF TG_OP = 'INSERT' THEN
    _new := jsonb_set(_new, '{status}', to_jsonb('pending_review'::text), true);
    _new := jsonb_set(_new, '{admin_note}', 'null'::jsonb, false);
    RETURN jsonb_populate_record(NEW, _new);
  END IF;

  _old := to_jsonb(OLD);

  FOREACH _field IN ARRAY ARRAY[
    'vendor_id', 'priority', 'admin_note', 'billing_source', 'spend'
  ] LOOP
    IF _old ? _field AND _new -> _field IS DISTINCT FROM _old -> _field THEN
      _new := jsonb_set(_new, ARRAY[_field], _old -> _field, true);
    END IF;
  END LOOP;

  FOREACH _field IN ARRAY _material_fields LOOP
    IF _old ? _field AND _new -> _field IS DISTINCT FROM _old -> _field THEN
      _material_changed := true;
    END IF;
  END LOOP;

  IF _new ->> 'status' IN ('approved', 'active', 'ended', 'rejected') THEN
    _new := jsonb_set(_new, '{status}', _old -> 'status', true);
  END IF;

  IF _material_changed
     AND _old ->> 'status' IN ('approved', 'active') THEN
    _new := jsonb_set(_new, '{status}', to_jsonb('pending_review'::text), true);
  END IF;

  RETURN jsonb_populate_record(NEW, _new);
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_creative_vendor_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  _old jsonb;
  _new jsonb;
  _field text;
  _material_fields text[] := ARRAY[
    'image_url', 'mobile_image_url', 'artwork_url', 'creative_url',
    'headline', 'body', 'caption', 'message', 'cta_label', 'cta_url',
    'destination', 'destination_url', 'link_url'
  ];
  _material_changed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    IF COALESCE(auth.role(), '') = 'service_role'
       OR session_user IN ('postgres', 'supabase_admin') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'A signed-in user or trusted backend is required';
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  _new := to_jsonb(NEW);
  IF TG_OP = 'INSERT' THEN
    _new := jsonb_set(_new, '{status}', to_jsonb('pending_review'::text), true);
    RETURN jsonb_populate_record(NEW, _new);
  END IF;

  _old := to_jsonb(OLD);
  IF _old ? 'campaign_id'
     AND _new -> 'campaign_id' IS DISTINCT FROM _old -> 'campaign_id' THEN
    _new := jsonb_set(_new, '{campaign_id}', _old -> 'campaign_id', true);
  END IF;

  FOREACH _field IN ARRAY _material_fields LOOP
    IF _old ? _field AND _new -> _field IS DISTINCT FROM _old -> _field THEN
      _material_changed := true;
    END IF;
  END LOOP;

  IF _new ->> 'status' IN ('approved', 'published', 'rejected') THEN
    _new := jsonb_set(_new, '{status}', _old -> 'status', true);
  END IF;

  IF _material_changed
     AND _old ->> 'status' IN ('approved', 'published') THEN
    _new := jsonb_set(_new, '{status}', to_jsonb('pending_review'::text), true);
  END IF;

  RETURN jsonb_populate_record(NEW, _new);
END;
$function$;

DO $triggers$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.marketplace_campaigns'::regclass
      AND tgname = 'trg_guard_campaign_vendor_changes'
      AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_guard_campaign_vendor_changes
      BEFORE INSERT OR UPDATE ON public.marketplace_campaigns
      FOR EACH ROW EXECUTE FUNCTION public.guard_campaign_vendor_changes()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.marketplace_campaign_creatives'::regclass
      AND tgname = 'trg_guard_creative_vendor_changes'
      AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_guard_creative_vendor_changes
      BEFORE INSERT OR UPDATE ON public.marketplace_campaign_creatives
      FOR EACH ROW EXECUTE FUNCTION public.guard_creative_vendor_changes()';
  END IF;
END;
$triggers$;

REVOKE ALL ON FUNCTION public.guard_campaign_vendor_changes()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_creative_vendor_changes()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.products_guard_preorder()
  FROM PUBLIC, anon, authenticated, service_role;

-- Public-schema defaults only. Explicit grants are required for new objects.
-- The PUBLIC EXECUTE built-in global function default cannot be canceled by a
-- schema-specific REVOKE; see the audit report and postflight.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

COMMIT;
