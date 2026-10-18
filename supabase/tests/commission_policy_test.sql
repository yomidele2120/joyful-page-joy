-- =====================================================================
-- COMMISSION POLICY TEST (run in the Supabase SQL Editor; it cleans up after itself)
--
-- It checks, with throwaway data:
--   * calendar-month maths in Nigeria time (month ends, leap years)
--   * activation date and free-period end are set on approval, and only once
--   * 0% inside the free period, the default rate from the exact end moment onwards
--   * a custom per-supplier rate only applies after the free period
--   * commission is computed by the database whatever the caller supplies (and on the subtotal only)
--   * an order created in the free period but PAID after it ends is charged at payment time
--   * a duplicate "paid" call changes nothing
--   * cancelling an order reverses the commission
--
-- Every run ends with an intentional error, which rolls everything back.
-- Success looks like:  ERROR: ALL COMMISSION TESTS PASSED (this error is intentional...)
-- Any other message names the check that failed.
-- =====================================================================
DO $test$
DECLARE
  _uid uuid := gen_random_uuid();
  _vendor uuid;
  _product uuid;
  _order uuid;
  _item uuid;
  _fs public.finance_settings%ROWTYPE;
  _t public.supplier_commercial_terms%ROWTYPE;
  _p public.order_item_payables%ROWTYPE;
  _expected_end timestamptz;
  _rate numeric;
  _res text;
BEGIN
  SELECT * INTO _fs FROM public.finance_settings WHERE id = true;

  -- 1. Calendar months, Nigeria time ------------------------------------------------
  IF ((TIMESTAMP '2026-12-31 10:00') + make_interval(months => 2)) <> TIMESTAMP '2027-02-28 10:00' THEN
    RAISE EXCEPTION 'FAIL: 31 Dec + 2 months should be 28 Feb';
  END IF;
  IF ((TIMESTAMP '2027-12-31 10:00') + make_interval(months => 2)) <> TIMESTAMP '2028-02-29 10:00' THEN
    RAISE EXCEPTION 'FAIL: leap year clamp should give 29 Feb 2028';
  END IF;
  IF (((TIMESTAMPTZ '2026-10-17 18:59:00+01' AT TIME ZONE 'Africa/Lagos') + make_interval(months => 2)) AT TIME ZONE 'Africa/Lagos')
     <> TIMESTAMPTZ '2026-12-17 18:59:00+01' THEN
    RAISE EXCEPTION 'FAIL: 17 Oct 18:59 WAT + 2 months should be 17 Dec 18:59 WAT';
  END IF;

  -- fixtures: a supplier who has accepted the terms but is not approved yet
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token,
                          recovery_token, email_change, email_change_token_new, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'commission-test-' || _uid || '@example.invalid',
          '', now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Commission Test"}', now(), now());
  INSERT INTO public.vendors (user_id, store_name, is_approved) VALUES (_uid, 'COMMISSION TEST SUPPLIER', false) RETURNING id INTO _vendor;
  INSERT INTO public.supplier_commercial_terms (vendor_id, user_id, terms_version, terms_accepted_at)
  VALUES (_vendor, _uid, '1.0', now());

  -- 2. Approval sets activation + free-period end ----------------------------------
  UPDATE public.vendors SET is_approved = true WHERE id = _vendor;
  SELECT * INTO _t FROM public.supplier_commercial_terms WHERE vendor_id = _vendor;
  IF _t.activated_at IS NULL OR _t.commission_free_until IS NULL THEN RAISE EXCEPTION 'FAIL: approval did not set the dates'; END IF;
  _expected_end := ((_t.activated_at AT TIME ZONE 'Africa/Lagos') + make_interval(months => _fs.free_period_months)) AT TIME ZONE 'Africa/Lagos';
  IF _t.commission_free_until <> _expected_end THEN RAISE EXCEPTION 'FAIL: free period end is % but expected %', _t.commission_free_until, _expected_end; END IF;

  -- 3. Rates inside and outside the free period --------------------------------------
  IF public.vendor_commission_rate(_vendor, now()) <> 0 THEN RAISE EXCEPTION 'FAIL: rate should be 0 inside the free period'; END IF;
  IF public.vendor_commission_rate(_vendor, _t.commission_free_until - interval '1 second') <> 0 THEN
    RAISE EXCEPTION 'FAIL: rate should still be 0 one second before the end';
  END IF;
  IF public.vendor_commission_rate(_vendor, _t.commission_free_until) <> _fs.default_commission_percent THEN
    RAISE EXCEPTION 'FAIL: default rate should apply from the end moment';
  END IF;
  IF public.vendor_commission_rate(_vendor, _t.commission_free_until + interval '1 day') <> _fs.default_commission_percent THEN
    RAISE EXCEPTION 'FAIL: default rate should apply after the free period';
  END IF;
  UPDATE public.vendors SET commission_percent = 3 WHERE id = _vendor;
  IF public.vendor_commission_rate(_vendor, now()) <> 0 THEN RAISE EXCEPTION 'FAIL: a custom rate must not override the free period'; END IF;
  IF public.vendor_commission_rate(_vendor, _t.commission_free_until + interval '1 day') <> 3 THEN
    RAISE EXCEPTION 'FAIL: the custom rate should apply after the free period';
  END IF;
  UPDATE public.vendors SET commission_percent = NULL WHERE id = _vendor;

  -- 4. Approving again does not give a second free period -----------------------------
  UPDATE public.vendors SET is_approved = false WHERE id = _vendor;
  UPDATE public.vendors SET is_approved = true WHERE id = _vendor;
  IF (SELECT activated_at FROM public.supplier_commercial_terms WHERE vendor_id = _vendor) <> _t.activated_at THEN
    RAISE EXCEPTION 'FAIL: re-approval restarted the free period';
  END IF;

  -- 5. The database computes commission, on the product subtotal only ------------------
  INSERT INTO public.products (name, slug, price, stock_quantity, vendor_id)
  VALUES ('Commission test product', 'commission-test-' || _uid, 1000, 100, _vendor) RETURNING id INTO _product;
  INSERT INTO public.orders (status, total, email) VALUES ('pending', 10750, 'test@example.invalid') RETURNING id INTO _order;  -- 10,000 + 7.5% VAT
  INSERT INTO public.order_items (order_id, product_id, quantity, price) VALUES (_order, _product, 10, 1000) RETURNING id INTO _item;

  -- Pretend create_order passed in a wrong 99% commission: the trigger must overrule it.
  INSERT INTO public.order_item_payables (order_item_id, order_id, vendor_id, gross_amount, commission_percent, commission_amount, vendor_net)
  VALUES (_item, _order, _vendor, 10000, 99, 9900, 100);
  SELECT * INTO _p FROM public.order_item_payables WHERE order_item_id = _item;
  IF _p.commission_percent <> 0 OR _p.commission_amount <> 0 OR _p.vendor_net <> 10000 THEN
    RAISE EXCEPTION 'FAIL (free period): commission % amount % net %', _p.commission_percent, _p.commission_amount, _p.vendor_net;
  END IF;

  -- 6. Created inside the free period, PAID after it ended: charged at payment time -----
  UPDATE public.supplier_commercial_terms SET commission_free_until = now() - interval '1 day' WHERE vendor_id = _vendor;
  _rate := _fs.default_commission_percent;
  _res := public.mark_order_paid(_order, 'card');
  IF _res <> 'paid' THEN RAISE EXCEPTION 'FAIL: mark_order_paid returned %', _res; END IF;
  SELECT * INTO _p FROM public.order_item_payables WHERE order_item_id = _item;
  IF _p.commission_percent <> _rate OR _p.commission_amount <> round(10000 * _rate / 100, 2)
     OR _p.vendor_net <> 10000 - round(10000 * _rate / 100, 2) THEN
    RAISE EXCEPTION 'FAIL (after free period): commission % amount % net % (VAT must not be included)', _p.commission_percent, _p.commission_amount, _p.vendor_net;
  END IF;

  -- 7. A duplicate payment confirmation changes nothing ---------------------------------
  _res := public.mark_order_paid(_order, 'card');
  IF _res <> 'already_paid' THEN RAISE EXCEPTION 'FAIL: duplicate confirmation returned %', _res; END IF;
  IF (SELECT commission_amount FROM public.order_item_payables WHERE order_item_id = _item) <> _p.commission_amount THEN
    RAISE EXCEPTION 'FAIL: a duplicate confirmation changed the commission';
  END IF;

  -- 8. Cancelling reverses the commission ------------------------------------------------
  UPDATE public.orders SET status = 'cancelled' WHERE id = _order;
  IF (SELECT payout_status FROM public.order_item_payables WHERE order_item_id = _item) <> 'refunded' THEN
    RAISE EXCEPTION 'FAIL: a cancelled order must mark the supplier earnings as refunded (commission reversed)';
  END IF;

  RAISE EXCEPTION 'ALL COMMISSION TESTS PASSED (this error is intentional, it rolls back the test data)';
END
$test$;
