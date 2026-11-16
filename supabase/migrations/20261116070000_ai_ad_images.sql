-- =====================================================================
-- PHASE 8: vendors can generate an ad image from a text prompt instead of uploading one. Paid from the ad balance.
-- Run after 20261116060000_external_ad_creatives.sql. Safe to run twice.
--   * The price is an admin setting (default 200 naira). The balance is checked and the price is deducted in ONE locked step
--     when generation starts, so two clicks at once cannot spend the same money.
--   * If the image cannot be delivered (provider error, timeout, blocked by safety review) the charge is refunded exactly once.
--   * Every charge and refund is a line in the ad wallet ledger. This is ad-balance spend, never subscription money, so it has
--     no effect on referral commissions.
-- =====================================================================

ALTER TABLE public.ad_wallet_settings ADD COLUMN IF NOT EXISTS ai_image_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.ad_wallet_settings ADD COLUMN IF NOT EXISTS ai_image_price_kobo bigint NOT NULL DEFAULT 20000 CHECK (ai_image_price_kobo BETWEEN 1000 AND 10000000);
ALTER TABLE public.ad_wallet_settings ADD COLUMN IF NOT EXISTS ai_image_hourly_limit integer NOT NULL DEFAULT 10 CHECK (ai_image_hourly_limit BETWEEN 1 AND 200);
ALTER TABLE public.ad_wallet_settings ADD COLUMN IF NOT EXISTS ai_image_daily_limit integer NOT NULL DEFAULT 500 CHECK (ai_image_daily_limit BETWEEN 1 AND 100000);

CREATE TABLE IF NOT EXISTS public.ad_ai_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  prompt text NOT NULL CHECK (char_length(prompt) BETWEEN 10 AND 400),
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'done', 'failed')),
  price_kobo bigint NOT NULL CHECK (price_kobo > 0),
  refunded boolean NOT NULL DEFAULT false,
  storage_path text,
  error_code text CHECK (error_code IS NULL OR char_length(error_code) <= 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ad_ai_images_vendor ON public.ad_ai_images (vendor_id, created_at DESC);
ALTER TABLE public.ad_ai_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ad_ai_images FROM PUBLIC, anon, authenticated;   -- no direct access: functions only

-- ledger: two new kinds, each tied to the image so a charge or refund can be recorded only once
ALTER TABLE public.ad_wallet_ledger DROP CONSTRAINT IF EXISTS ad_wallet_ledger_kind_check;
ALTER TABLE public.ad_wallet_ledger ADD CONSTRAINT ad_wallet_ledger_kind_check CHECK (kind IN ('topup', 'spend', 'adjustment', 'ai_image', 'ai_image_refund'));
ALTER TABLE public.ad_wallet_ledger DROP CONSTRAINT IF EXISTS ledger_sign;
ALTER TABLE public.ad_wallet_ledger ADD CONSTRAINT ledger_sign CHECK (
  (kind = 'topup' AND amount_kobo > 0) OR (kind = 'spend' AND amount_kobo < 0) OR kind = 'adjustment'
  OR (kind = 'ai_image' AND amount_kobo < 0) OR (kind = 'ai_image_refund' AND amount_kobo > 0));
ALTER TABLE public.ad_wallet_ledger ADD COLUMN IF NOT EXISTS ai_image_id uuid REFERENCES public.ad_ai_images(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_ledger_ai_image ON public.ad_wallet_ledger (ai_image_id, kind) WHERE ai_image_id IS NOT NULL;

-- what the vendor screen shows before they press Generate
CREATE OR REPLACE FUNCTION public.ai_image_info() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _s public.ad_wallet_settings%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.ad_wallet_settings WHERE id;
  RETURN jsonb_build_object('enabled', _s.ai_image_enabled AND _s.enabled, 'price_kobo', _s.ai_image_price_kobo,
    'balance_kobo', public.ad_wallet_balance_kobo(_v),
    'left_this_hour', GREATEST(0, _s.ai_image_hourly_limit - (SELECT count(*) FROM public.ad_ai_images WHERE vendor_id = _v AND created_at > now() - interval '1 hour')));
END $$;
REVOKE ALL ON FUNCTION public.ai_image_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_image_info() TO authenticated;

-- START: check everything, deduct the price, create the job. Called with the vendor's own login.
CREATE OR REPLACE FUNCTION public.vendor_start_ai_image(_prompt text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _e jsonb; _s public.ad_wallet_settings%ROWTYPE; _p text := btrim(coalesce(_prompt, ''));
        _bal bigint; _id uuid;
BEGIN
  _e := public.ad_entitlement(_v);
  IF NOT (_e ->> 'active')::boolean OR NOT coalesce((_e -> 'features' ->> 'external_ads_enabled')::boolean, false) THEN
    RAISE EXCEPTION 'Your plan does not include external advertising.'; END IF;
  SELECT * INTO _s FROM public.ad_wallet_settings WHERE id;
  IF NOT _s.enabled OR NOT _s.ai_image_enabled THEN RAISE EXCEPTION 'AI image generation is switched off right now.'; END IF;
  IF char_length(_p) < 10 OR char_length(_p) > 400 THEN RAISE EXCEPTION 'Describe the picture in 10 to 400 characters.'; END IF;
  IF _p ~* '(https?://|www\.|@)' THEN RAISE EXCEPTION 'Do not put links or @handles in the description.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ai_image:' || _v::text, 0));   -- one purchase at a time per vendor
  IF (SELECT count(*) FROM public.ad_ai_images WHERE vendor_id = _v AND status = 'generating' AND created_at > now() - interval '10 minutes') >= 2 THEN
    RAISE EXCEPTION 'Two images are already being made. Wait for them to finish.'; END IF;
  IF (SELECT count(*) FROM public.ad_ai_images WHERE vendor_id = _v AND created_at > now() - interval '1 hour') >= _s.ai_image_hourly_limit THEN
    RAISE EXCEPTION 'You have reached the hourly limit for AI images. Try again later.'; END IF;
  IF (SELECT count(*) FROM public.ad_ai_images WHERE created_at > now() - interval '1 day') >= _s.ai_image_daily_limit THEN
    RAISE EXCEPTION 'AI image generation is busy today. Please try again tomorrow or upload your own photo.'; END IF;

  _bal := public.ad_wallet_balance_kobo(_v);
  IF _bal < _s.ai_image_price_kobo THEN
    RAISE EXCEPTION 'Not enough advertising balance. An AI image costs % naira and your balance is % naira. Add funds first.',
      (_s.ai_image_price_kobo / 100), (_bal / 100); END IF;

  INSERT INTO public.ad_ai_images (vendor_id, prompt, price_kobo) VALUES (_v, _p, _s.ai_image_price_kobo) RETURNING id INTO _id;
  INSERT INTO public.ad_wallet_ledger (vendor_id, kind, amount_kobo, note, ai_image_id)
    VALUES (_v, 'ai_image', -_s.ai_image_price_kobo, 'AI ad image', _id);
  RETURN jsonb_build_object('id', _id, 'price_kobo', _s.ai_image_price_kobo, 'balance_kobo', _bal - _s.ai_image_price_kobo);
END $$;
REVOKE ALL ON FUNCTION public.vendor_start_ai_image(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_start_ai_image(text) TO authenticated;

-- FINISH (service role only, called by the edge function)
CREATE OR REPLACE FUNCTION public.finish_ai_image_success(_id uuid, _path text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.ad_ai_images%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM public.ad_ai_images WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _r.status <> 'generating' THEN RETURN false; END IF;
  IF _path IS NULL OR _path !~ ('^' || _r.vendor_id::text || '/[A-Za-z0-9._-]{1,120}$') THEN RAISE EXCEPTION 'Bad storage path'; END IF;
  UPDATE public.ad_ai_images SET status = 'done', storage_path = _path, finished_at = now() WHERE id = _id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_ai_image_success(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_ai_image_success(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_ai_image_failure(_id uuid, _code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.ad_ai_images%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM public.ad_ai_images WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _r.status <> 'generating' OR _r.refunded THEN RETURN false; END IF;
  UPDATE public.ad_ai_images SET status = 'failed', refunded = true, error_code = left(coalesce(_code, 'failed'), 60), finished_at = now() WHERE id = _id;
  INSERT INTO public.ad_wallet_ledger (vendor_id, kind, amount_kobo, note, ai_image_id)
    VALUES (_r.vendor_id, 'ai_image_refund', _r.price_kobo, 'Refund: the AI image could not be made', _id) ON CONFLICT DO NOTHING;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_ai_image_failure(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_ai_image_failure(uuid, text) TO service_role;

-- safety net: a job stuck for 10 minutes (function crashed or timed out) is refunded
CREATE OR REPLACE FUNCTION public.refund_stuck_ai_images() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record; _n integer := 0;
BEGIN
  FOR _r IN SELECT id FROM public.ad_ai_images WHERE status = 'generating' AND created_at < now() - interval '10 minutes' LOOP
    IF public.finish_ai_image_failure(_r.id, 'timed_out') THEN _n := _n + 1; END IF;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.refund_stuck_ai_images() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_stuck_ai_images() TO service_role;

-- admin: how the feature is doing (charged vs refunded vs estimated provider cost)
CREATE OR REPLACE FUNCTION public.admin_ai_image_summary(_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  RETURN (SELECT jsonb_build_object(
    'delivered', count(*) FILTER (WHERE status = 'done'),
    'refunded', count(*) FILTER (WHERE refunded),
    'revenue_kobo', COALESCE(sum(price_kobo) FILTER (WHERE status = 'done'), 0),
    'est_provider_cost_usd', round((count(*) FILTER (WHERE status = 'done') * (SELECT ai_cost_per_image_usd FROM public.advertising_settings WHERE id))::numeric, 2))
    FROM public.ad_ai_images WHERE created_at > now() - make_interval(days => GREATEST(1, LEAST(COALESCE(_days, 30), 365))));
END $$;
REVOKE ALL ON FUNCTION public.admin_ai_image_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_image_summary(integer) TO authenticated;
