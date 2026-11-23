-- An admin can mark an external ad request as RUNNING after the team has really started it in the platform's own ads manager.
-- To keep the status truthful it needs the platform's campaign ID (or link), the vendor must have authorised the spend,
-- and the request must be in review or paused. The vendor is told when it starts running.
DROP FUNCTION IF EXISTS public.admin_set_external_status(uuid, text, text);
CREATE OR REPLACE FUNCTION public.admin_set_external_status(_id uuid, _status text, _note text DEFAULT NULL, _external_id text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.external_ad_campaigns%ROWTYPE;
BEGIN
  PERFORM public.ad_require_admin();
  IF _status NOT IN ('pending_review', 'rejected', 'cancelled', 'paused', 'ended', 'failed', 'active') THEN
    RAISE EXCEPTION 'Unsupported status.'; END IF;
  SELECT * INTO _r FROM public.external_ad_campaigns WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;

  IF _status = 'active' THEN
    IF _r.status NOT IN ('pending_review', 'paused') THEN RAISE EXCEPTION 'Only a request that is in review or paused can be marked running.'; END IF;
    IF COALESCE(_r.budget_amount, 0) > 0 AND NOT _r.spend_authorized THEN RAISE EXCEPTION 'The vendor has not authorised this spend yet.'; END IF;
    IF _external_id IS NULL OR char_length(btrim(_external_id)) < 3 THEN
      RAISE EXCEPTION 'Enter the campaign ID or link from the platform''s ads manager, so the status is genuine.'; END IF;
    UPDATE public.external_ad_campaigns SET status = 'active', external_campaign_id = left(btrim(_external_id), 200),
      status_detail = left(COALESCE(_note, status_detail), 500) WHERE id = _id;
    PERFORM public.ad_notify_vendor(_r.vendor_id, 'Your ad request is now running on ' ||
      CASE _r.platform WHEN 'tiktok_ads' THEN 'TikTok' WHEN 'facebook_ads' THEN 'Facebook' WHEN 'instagram_ads' THEN 'Instagram' ELSE 'Google' END || '.');
    RETURN;
  END IF;

  UPDATE public.external_ad_campaigns SET status = _status, status_detail = left(COALESCE(_note, status_detail), 500) WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_external_status(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_external_status(uuid, text, text, text) TO authenticated;
