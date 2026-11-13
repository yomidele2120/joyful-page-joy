ALTER TABLE public.google_merchant_settings
  ADD COLUMN IF NOT EXISTS data_source_id text;

ALTER TABLE public.google_merchant_products
  ADD COLUMN IF NOT EXISTS product_input_name text,
  ADD COLUMN IF NOT EXISTS google_product_name text,
  ADD COLUMN IF NOT EXISTS sync_hash text;

CREATE TABLE IF NOT EXISTS public.google_merchant_sync_queue (
  product_id uuid PRIMARY KEY,
  operation text NOT NULL CHECK (operation IN ('upsert', 'delete')),
  product_input_name text,
  google_product_name text,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_merchant_sync_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_merchant_sync_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_merchant_sync_queue TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_google_merchant_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_input_name text;
  existing_product_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT product_input_name, google_product_name
      INTO existing_input_name, existing_product_name
      FROM public.google_merchant_products
      WHERE product_id = OLD.id;

    INSERT INTO public.google_merchant_sync_queue (
      product_id, operation, product_input_name, google_product_name
    )
    VALUES (OLD.id, 'delete', existing_input_name, existing_product_name)
    ON CONFLICT (product_id) DO UPDATE SET
      operation = 'delete',
      product_input_name = COALESCE(EXCLUDED.product_input_name, google_merchant_sync_queue.product_input_name),
      google_product_name = COALESCE(EXCLUDED.google_product_name, google_merchant_sync_queue.google_product_name),
      attempts = 0,
      available_at = now(),
      locked_at = NULL,
      last_error = NULL,
      updated_at = now();
    RETURN OLD;
  END IF;

  INSERT INTO public.google_merchant_sync_queue (product_id, operation)
  VALUES (NEW.id, 'upsert')
  ON CONFLICT (product_id) DO UPDATE SET
    operation = 'upsert',
    attempts = 0,
    available_at = now(),
    locked_at = NULL,
    last_error = NULL,
    updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_google_merchant_product() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_google_merchant_vendor_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_vendor_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_vendor_id := OLD.id;
  ELSE
    target_vendor_id := NEW.id;
  END IF;

  INSERT INTO public.google_merchant_sync_queue (product_id, operation)
  SELECT p.id, 'upsert'
  FROM public.products p
  WHERE p.vendor_id = target_vendor_id
  ON CONFLICT (product_id) DO UPDATE SET
    operation = 'upsert',
    attempts = 0,
    available_at = now(),
    locked_at = NULL,
    last_error = NULL,
    updated_at = now();

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_google_merchant_vendor_products() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_google_merchant_category_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.google_merchant_sync_queue (product_id, operation)
  SELECT p.id, 'upsert'
  FROM public.products p
  WHERE p.category_id = NEW.id
  ON CONFLICT (product_id) DO UPDATE SET
    operation = 'upsert',
    attempts = 0,
    available_at = now(),
    locked_at = NULL,
    last_error = NULL,
    updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_google_merchant_category_products() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_google_merchant_product_insert ON public.products;
CREATE TRIGGER trg_google_merchant_product_insert
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_google_merchant_product();

DROP TRIGGER IF EXISTS trg_google_merchant_product_update ON public.products;
CREATE TRIGGER trg_google_merchant_product_update
  AFTER UPDATE OF vendor_id, category_id, name, slug, description, price, image_url, images, brand,
    specs, stock_quantity, is_preorder, preorder_approved, preorder_status, preorder_release_date,
    is_public, is_active
  ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_google_merchant_product();

DROP TRIGGER IF EXISTS trg_google_merchant_product_delete ON public.products;
CREATE TRIGGER trg_google_merchant_product_delete
  BEFORE DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_google_merchant_product();

DROP TRIGGER IF EXISTS trg_google_merchant_vendor_update ON public.vendors;
CREATE TRIGGER trg_google_merchant_vendor_update
  AFTER UPDATE OF is_approved ON public.vendors
  FOR EACH ROW
  WHEN (OLD.is_approved IS DISTINCT FROM NEW.is_approved)
  EXECUTE FUNCTION public.enqueue_google_merchant_vendor_products();

DROP TRIGGER IF EXISTS trg_google_merchant_vendor_delete ON public.vendors;
CREATE TRIGGER trg_google_merchant_vendor_delete
  BEFORE DELETE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_google_merchant_vendor_products();

DROP TRIGGER IF EXISTS trg_google_merchant_category_update ON public.categories;
CREATE TRIGGER trg_google_merchant_category_update
  AFTER UPDATE OF name ON public.categories
  FOR EACH ROW
  WHEN (OLD.name IS DISTINCT FROM NEW.name)
  EXECUTE FUNCTION public.enqueue_google_merchant_category_products();

CREATE INDEX IF NOT EXISTS idx_google_merchant_sync_queue_available
  ON public.google_merchant_sync_queue (available_at, product_id)
  WHERE attempts < 8;

CREATE OR REPLACE FUNCTION public.claim_google_merchant_sync_jobs(batch_limit integer)
RETURNS TABLE (
  product_id uuid,
  operation text,
  product_input_name text,
  google_product_name text,
  attempts integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT q.product_id
    FROM public.google_merchant_sync_queue q
    WHERE q.available_at <= now()
      AND q.attempts < 8
      AND (q.locked_at IS NULL OR q.locked_at < now() - interval '10 minutes')
    ORDER BY q.available_at, q.product_id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(batch_limit, 10))
  )
  UPDATE public.google_merchant_sync_queue q
  SET locked_at = now(), attempts = q.attempts + 1, updated_at = now()
  FROM candidates c
  WHERE q.product_id = c.product_id
  RETURNING q.product_id, q.operation, q.product_input_name, q.google_product_name, q.attempts;
$$;

REVOKE ALL ON FUNCTION public.claim_google_merchant_sync_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_google_merchant_sync_jobs(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.google_merchant_eligible_product_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)
  FROM public.products p
  JOIN public.vendors v ON v.id = p.vendor_id AND v.is_approved = true
  WHERE p.is_public = true
    AND p.is_active = true
    AND p.price > 0
    AND nullif(btrim(p.name), '') IS NOT NULL
    AND nullif(btrim(p.description), '') IS NOT NULL
    AND (
      p.image_url ~* '^https://res[.]cloudinary[.]com/[^[:space:]]+$'
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.images, ARRAY[]::text[])) AS images(url)
        WHERE images.url ~* '^https://res[.]cloudinary[.]com/[^[:space:]]+$'
      )
    );
$$;

REVOKE ALL ON FUNCTION public.google_merchant_eligible_product_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.google_merchant_eligible_product_count() TO service_role;

INSERT INTO public.google_merchant_sync_queue (product_id, operation)
SELECT p.id, 'upsert'
FROM public.products p
JOIN public.vendors v ON v.id = p.vendor_id AND v.is_approved = true
WHERE p.is_public = true
  AND p.is_active = true
  AND p.price > 0
  AND nullif(btrim(p.name), '') IS NOT NULL
  AND nullif(btrim(p.description), '') IS NOT NULL
  AND (
    p.image_url ~* '^https://res[.]cloudinary[.]com/[^[:space:]]+$'
    OR EXISTS (
      SELECT 1
      FROM unnest(COALESCE(p.images, ARRAY[]::text[])) AS images(url)
      WHERE images.url ~* '^https://res[.]cloudinary[.]com/[^[:space:]]+$'
    )
  )
ON CONFLICT (product_id) DO NOTHING;
