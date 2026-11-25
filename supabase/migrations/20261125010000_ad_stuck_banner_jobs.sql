-- A banner request that never finished used to block every later one ("A banner is already being generated for this campaign").
-- 1) Deleting a banner now also cancels any unfinished request for that campaign.
-- 2) A request that has been waiting too long is cancelled automatically when a new one is made.
-- Cancelled requests do not use up the vendor's banner allowance.

CREATE OR REPLACE FUNCTION public.ad_delete_campaign_banner(_campaign uuid, _by text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.vendor_advertising_campaigns%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO _c FROM public.vendor_advertising_campaigns WHERE id = _campaign FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found.'; END IF;
  IF _c.status IN ('cancelled', 'expired', 'rejected') THEN RAISE EXCEPTION 'This campaign has ended, so its banner cannot be changed.'; END IF;
  UPDATE public.advertising_generation_jobs SET status = 'cancelled', finished_at = now(), locked_at = NULL,
         error_code = 'banner_deleted', error = 'Cancelled because the banner was deleted.'
   WHERE campaign_id = _campaign AND status IN ('queued', 'running');
  IF _c.banner_id IS NULL AND _c.banner_image_url IS NULL AND NOT EXISTS (SELECT 1 FROM public.vendor_advertising_banners WHERE campaign_id = _campaign) THEN
    RETURN 0;      -- nothing to delete, but any stuck request has just been cleared
  END IF;
  UPDATE public.vendor_advertising_campaigns SET banner_id = NULL, banner_image_url = NULL, banner_public_id = NULL,
         status = CASE WHEN status IN ('active', 'pending_review') THEN 'paused' ELSE status END,
         paused_by = CASE WHEN status IN ('active', 'pending_review') THEN _by ELSE paused_by END
   WHERE id = _campaign;
  DELETE FROM public.vendor_advertising_banners WHERE campaign_id = _campaign;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.ad_enqueue_job(_campaign uuid, _vendor uuid, _kind text, _counts boolean, _key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _max smallint;
BEGIN
  -- Give up on a request nobody picked up for 10 minutes, or one whose worker stopped over 12 minutes ago.
  UPDATE public.advertising_generation_jobs SET status = 'cancelled', finished_at = now(), locked_at = NULL,
         error_code = 'stale', error = 'Cancelled automatically: no result after waiting too long.'
   WHERE campaign_id = _campaign
     AND ((status = 'queued' AND created_at < now() - interval '10 minutes')
       OR (status = 'running' AND coalesce(locked_at, created_at) < now() - interval '12 minutes'));
  SELECT ai_max_attempts INTO _max FROM public.advertising_settings WHERE id;
  INSERT INTO public.advertising_generation_jobs (campaign_id, vendor_id, kind, counts_toward_quota, max_attempts, idempotency_key)
  VALUES (_campaign, _vendor, _kind, _counts, coalesce(_max, 3), _key)
  ON CONFLICT DO NOTHING
  RETURNING id INTO _id;
  RETURN _id;   -- NULL when an identical or open job already exists
END $$;

-- Clear what is stuck right now.
UPDATE public.advertising_generation_jobs SET status = 'cancelled', finished_at = now(), locked_at = NULL,
       error_code = 'stale', error = 'Cancelled automatically: no result after waiting too long.'
 WHERE (status = 'queued' AND created_at < now() - interval '10 minutes')
    OR (status = 'running' AND coalesce(locked_at, created_at) < now() - interval '12 minutes');

NOTIFY pgrst, 'reload schema';
