ALTER TABLE public.merchant_center_sync_queue
  ADD COLUMN IF NOT EXISTS bulk_sync boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.merchant_center_sync_control (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  bulk_sync_paused boolean NOT NULL DEFAULT false,
  initial_batch_ready boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.merchant_center_sync_control (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.merchant_center_sync_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_center_sync_control FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.merchant_center_sync_control TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_merchant_product_sync(_product_id uuid, _operation text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.merchant_center_sync_queue (
    product_id, operation, status, attempts, next_attempt_at, locked_until,
    last_error, bulk_sync, updated_at
  )
  VALUES (_product_id, _operation, 'pending', 0, now(), NULL, NULL, false, now())
  ON CONFLICT (product_id) DO UPDATE SET
    operation = EXCLUDED.operation,
    status = 'pending',
    attempts = 0,
    next_attempt_at = now(),
    locked_until = NULL,
    last_error = NULL,
    bulk_sync = false,
    updated_at = now(),
    version = merchant_center_sync_queue.version + 1;
$$;
REVOKE ALL ON FUNCTION public.enqueue_merchant_product_sync(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_merchant_product_sync(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.queue_merchant_category_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    INSERT INTO public.merchant_center_sync_queue (
      product_id, operation, status, attempts, next_attempt_at, bulk_sync, updated_at
    )
    SELECT p.id, 'upsert', 'pending', 0, now(), false, now()
    FROM public.products p
    WHERE p.category_id = NEW.id
    ON CONFLICT (product_id) DO UPDATE SET
      operation = 'upsert',
      status = 'pending',
      attempts = 0,
      next_attempt_at = now(),
      locked_until = NULL,
      last_error = NULL,
      bulk_sync = false,
      updated_at = now(),
      version = merchant_center_sync_queue.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_merchant_vendor_approval_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
    INSERT INTO public.merchant_center_sync_queue (
      product_id, operation, status, attempts, next_attempt_at, bulk_sync, updated_at
    )
    SELECT p.id, 'upsert', 'pending', 0, now(), false, now()
    FROM public.products p
    WHERE p.vendor_id = NEW.id
    ON CONFLICT (product_id) DO UPDATE SET
      operation = 'upsert',
      status = 'pending',
      attempts = 0,
      next_attempt_at = now(),
      locked_until = NULL,
      last_error = NULL,
      bulk_sync = false,
      updated_at = now(),
      version = merchant_center_sync_queue.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.merchant_queue_all_eligible_products()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  INSERT INTO public.merchant_center_sync_queue (
    product_id, operation, status, attempts, next_attempt_at, locked_until,
    last_error, bulk_sync, updated_at
  )
  SELECT candidates.product_id, candidates.operation, 'pending', 0, now(), NULL, NULL, true, now()
  FROM (
    SELECT p.id AS product_id, 'upsert'::text AS operation
    FROM public.products p
    LEFT JOIN public.vendors v ON v.id = p.vendor_id
    WHERE p.is_active IS TRUE AND p.is_public IS TRUE
      AND (p.vendor_id IS NULL OR v.is_approved IS TRUE)
      AND p.is_preorder IS NOT TRUE
      AND NULLIF(trim(p.name), '') IS NOT NULL
      AND NULLIF(trim(p.description), '') IS NOT NULL
      AND NULLIF(trim(p.brand), '') IS NOT NULL
      AND p.price > 0 AND p.stock_quantity >= 0
      AND p.image_url ~ '^https://res\.cloudinary\.com/[^/]+/image/upload/'
    UNION
    SELECT s.product_id, 'delete'::text
    FROM public.merchant_center_product_status s
    LEFT JOIN public.products p ON p.id = s.product_id
    LEFT JOIN public.vendors v ON v.id = p.vendor_id
    WHERE s.sync_status IN ('submitted', 'failed', 'pending')
      AND (p.id IS NULL OR p.is_active IS NOT TRUE OR p.is_public IS NOT TRUE
        OR (p.vendor_id IS NOT NULL AND v.is_approved IS NOT TRUE) OR p.is_preorder IS TRUE
        OR NULLIF(trim(p.name), '') IS NULL OR NULLIF(trim(p.description), '') IS NULL
        OR NULLIF(trim(p.brand), '') IS NULL OR p.price <= 0 OR p.stock_quantity < 0
        OR COALESCE(p.image_url !~ '^https://res\.cloudinary\.com/[^/]+/image/upload/', true))
  ) candidates
  ON CONFLICT (product_id) DO UPDATE SET
    operation = EXCLUDED.operation,
    status = 'pending',
    attempts = 0,
    next_attempt_at = now(),
    locked_until = NULL,
    last_error = NULL,
    bulk_sync = true,
    updated_at = now(),
    version = merchant_center_sync_queue.version + 1;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;
REVOKE ALL ON FUNCTION public.merchant_queue_all_eligible_products() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_queue_all_eligible_products() TO service_role;

CREATE OR REPLACE FUNCTION public.merchant_claim_product_sync_jobs(
  _limit integer,
  _product_id uuid DEFAULT NULL,
  _bulk_only boolean DEFAULT NULL
)
RETURNS SETOF public.merchant_center_sync_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT q.product_id
    FROM public.merchant_center_sync_queue q
    WHERE q.status <> 'failed'
      AND q.next_attempt_at <= now()
      AND (q.locked_until IS NULL OR q.locked_until < now())
      AND (_product_id IS NULL OR q.product_id = _product_id)
      AND (_bulk_only IS NULL OR q.bulk_sync = _bulk_only)
    ORDER BY CASE WHEN q.operation = 'upsert' THEN 0 ELSE 1 END, q.created_at
    LIMIT GREATEST(1, LEAST(_limit, 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.merchant_center_sync_queue q
  SET status = 'processing', attempts = q.attempts + 1,
      locked_until = now() + interval '3 minutes', updated_at = now()
  FROM due
  WHERE q.product_id = due.product_id
  RETURNING q.*;
END;
$$;
REVOKE ALL ON FUNCTION public.merchant_claim_product_sync_jobs(integer, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_claim_product_sync_jobs(integer, uuid, boolean) TO service_role;
