-- A vendor can run up to two product promotions at once (limit = advertising_settings.max_banners_per_vendor).
CREATE OR REPLACE FUNCTION public.vendor_create_product_campaign(_product_ids uuid[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _v uuid := public.ad_require_vendor(); _e jsonb; _f jsonb; _max integer; _ids uuid[]; _id uuid; _end timestamptz; _exp timestamptz; _sub uuid;
  _s public.advertising_settings%ROWTYPE; _slot smallint;
BEGIN
  SELECT * INTO _s FROM public.advertising_settings WHERE id;
  IF NOT _s.ads_enabled THEN RAISE EXCEPTION 'Advertising is temporarily unavailable.'; END IF;
  _e := public.ad_entitlement(_v); _f := _e -> 'features';
  IF NOT (_e ->> 'active')::boolean OR NOT coalesce((_f ->> 'homepage_promotion_enabled')::boolean, false) THEN
    RAISE EXCEPTION 'Your plan does not include homepage promotion.'; END IF;
  IF (_e ->> 'generations_used')::integer >= (_e ->> 'generations_allowed')::integer THEN
    RAISE EXCEPTION 'You have used all banner generations included in your plan.'; END IF;
  _max := (_f ->> 'max_advertised_products')::integer;
  _ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(_product_ids, '{}'::uuid[])) AS x);
  IF cardinality(_ids) = 0 THEN RAISE EXCEPTION 'Select at least one product.'; END IF;
  IF cardinality(_ids) > _max THEN RAISE EXCEPTION 'Your plan allows up to % advertised products.', _max; END IF;
  IF (SELECT count(*) FROM public.products WHERE id = ANY (_ids) AND vendor_id = _v AND is_active) <> cardinality(_ids) THEN
    RAISE EXCEPTION 'You can only advertise your own active products.'; END IF;
  PERFORM 1 FROM public.vendors WHERE id = _v FOR UPDATE;  -- serialise concurrent clicks
  SELECT s INTO _slot FROM generate_series(1, _s.max_banners_per_vendor) s
   WHERE NOT EXISTS (SELECT 1 FROM public.vendor_advertising_campaigns c WHERE c.vendor_id = _v AND c.campaign_type = 'product_promotion'
                      AND c.slot = s AND c.status IN ('pending_generation', 'generating', 'pending_review', 'active', 'paused'))
   ORDER BY s LIMIT 1;
  IF _slot IS NULL THEN
    RAISE EXCEPTION 'You already have % open product promotion(s), which is the most allowed. Edit one or wait for it to end.', _s.max_banners_per_vendor; END IF;
  _exp := (_e ->> 'expires_at')::timestamptz;
  _end := now() + make_interval(days => (_f ->> 'campaign_duration_days')::integer);
  IF _exp IS NOT NULL AND _exp < _end THEN _end := _exp; END IF;
  SELECT id INTO _sub FROM public.supplier_membership_payments WHERE vendor_id = _v AND status = 'success'
   ORDER BY paid_at DESC NULLS LAST LIMIT 1;
  INSERT INTO public.vendor_advertising_campaigns
    (vendor_id, campaign_type, slot, subscription_id, status, start_date, end_date, placements, target_shop_id, destination_url, target_product_ids)
  VALUES (_v, 'product_promotion', _slot, _sub, 'pending_generation', now(), _end, public.ad_placements_for(_f), _v, '/shop/' || _v::text, _ids)
  RETURNING id INTO _id;
  INSERT INTO public.vendor_advertising_products (campaign_id, vendor_id, product_id, position)
    SELECT _id, _v, t.id, t.ord::smallint FROM unnest(_ids) WITH ORDINALITY AS t(id, ord);
  PERFORM public.ad_enqueue_job(_id, _v, 'product', true, 'initial:' || _id::text);
  RETURN _id;
END $$;
NOTIFY pgrst, 'reload schema';
