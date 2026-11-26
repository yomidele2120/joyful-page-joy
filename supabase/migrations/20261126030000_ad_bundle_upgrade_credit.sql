-- =====================================================================
-- PART 24: upgrade credit for the all-inclusive subscription, and ad days that end with the plan. Needs PART 23. Safe to run twice.
-- Credit = the unused share of the PLAN (service) part the vendor actually paid for the current plan. Ad days are never credited.
-- A plan granted by hand has no payment, so it earns no credit.
-- =====================================================================
ALTER TABLE public.ad_bundle_orders ADD COLUMN IF NOT EXISTS credit_kobo bigint NOT NULL DEFAULT 0 CHECK (credit_kobo >= 0);

CREATE OR REPLACE FUNCTION public.ad_bundle_upgrade_credit(_vendor uuid, _plan text) RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _cur text := public.effective_supplier_plan(_vendor); _m public.vendor_memberships%ROWTYPE; _p public.supplier_membership_payments%ROWTYPE;
        _service bigint; _remaining numeric;
BEGIN
  SELECT * INTO _m FROM public.vendor_memberships WHERE vendor_id = _vendor AND status = 'active';
  IF NOT FOUND OR _m.expires_at IS NULL OR _m.expires_at <= now() OR _cur = 'free' THEN RETURN 0; END IF;
  SELECT * INTO _p FROM public.supplier_membership_payments
   WHERE vendor_id = _vendor AND plan_slug = _cur AND status = 'success' ORDER BY paid_at DESC NULLS LAST LIMIT 1;
  IF NOT FOUND OR _p.period_days <= 0 THEN RETURN 0; END IF;
  _service := COALESCE((SELECT o.service_kobo FROM public.ad_bundle_orders o WHERE o.payment_id = _p.id), _p.amount_kobo);
  _remaining := LEAST(GREATEST(EXTRACT(EPOCH FROM (_m.expires_at - now())) / 86400.0, 0), _p.period_days);
  RETURN floor(_service * _remaining / _p.period_days);
END $$;
REVOKE ALL ON FUNCTION public.ad_bundle_upgrade_credit(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ad_bundle_upgrade_credit(uuid, text) TO service_role;

-- One quote for a given vendor: the bundle price, what kind of purchase it is, the credit, and what is payable.
CREATE OR REPLACE FUNCTION public.quote_ad_bundle_for_vendor(_vendor uuid, _plan text, _months integer, _selections jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _q jsonb := public.quote_ad_bundle(_plan, _months, _selections); _kind text; _credit bigint := 0;
BEGIN
  IF _q ? 'error' THEN RETURN _q; END IF;
  _kind := public.ad_bundle_kind(_vendor, _plan);
  IF _kind = 'downgrade_not_allowed' THEN RETURN jsonb_build_object('error', 'downgrade_not_allowed'); END IF;
  IF _kind = 'upgrade' THEN
    _credit := LEAST(public.ad_bundle_upgrade_credit(_vendor, _plan), GREATEST((_q ->> 'service_kobo')::bigint - 10000, 0));
  END IF;
  RETURN _q || jsonb_build_object('kind', _kind, 'credit_kobo', _credit,
    'service_net_kobo', (_q ->> 'service_kobo')::bigint - _credit,
    'payable_kobo', (_q ->> 'total_kobo')::bigint - _credit);
END $$;
REVOKE ALL ON FUNCTION public.quote_ad_bundle_for_vendor(uuid, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_ad_bundle_for_vendor(uuid, text, integer, jsonb) TO service_role;

-- The vendor's live quote on screen now includes the upgrade credit.
CREATE OR REPLACE FUNCTION public.my_ad_bundle_quote(_plan text, _months integer, _selections jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('error', 'sign_in_required'); END IF;
  SELECT id INTO _v FROM public.vendors WHERE user_id = auth.uid() LIMIT 1;
  IF _v IS NULL THEN RETURN jsonb_build_object('error', 'supplier_required'); END IF;
  RETURN public.quote_ad_bundle_for_vendor(_v, _plan, _months, _selections);
END $$;
REVOKE ALL ON FUNCTION public.my_ad_bundle_quote(text, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_ad_bundle_quote(text, integer, jsonb) TO authenticated;

-- Ad days now end exactly when the plan ends (a renewal starts after the current end date, like the plan itself).
CREATE OR REPLACE FUNCTION public.ad_bundle_on_payment_success() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.ad_bundle_orders%ROWTYPE; _l jsonb; _cur_plan text; _cur_exp timestamptz; _start timestamptz := now(); _end timestamptz;
BEGIN
  SELECT * INTO _o FROM public.ad_bundle_orders WHERE payment_id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT plan_slug, expires_at INTO _cur_plan, _cur_exp FROM public.vendor_memberships WHERE vendor_id = NEW.vendor_id AND status = 'active';
  IF NEW.kind = 'renewal' AND _cur_plan = NEW.plan_slug AND _cur_exp IS NOT NULL AND _cur_exp > now() THEN _start := _cur_exp; END IF;
  _end := _start + make_interval(days => NEW.period_days);
  FOR _l IN SELECT * FROM jsonb_array_elements(_o.lines) LOOP
    INSERT INTO public.vendor_ad_allocations (vendor_id, payment_id, platform, days_per_month, days_total, starts_at, expires_at)
    VALUES (_o.vendor_id, NEW.id, _l ->> 'platform', (_l ->> 'days_per_month')::int, (_l ->> 'days')::int, _start, _end)
    ON CONFLICT (payment_id, platform) DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;

NOTIFY pgrst, 'reload schema';
