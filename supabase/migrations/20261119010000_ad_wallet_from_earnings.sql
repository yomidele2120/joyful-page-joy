-- =====================================================================
-- Fund the advertising balance from sales earnings.
-- An approved supplier can move money from "Ready to pay out" (earnings already released from the hold) into the advertising balance.
--   * It is recorded as a deduction (supplier_adjustments, negative) that the payout engine already honours, plus a
--     'topup' line in the ad wallet ledger. Both are written in one transaction, so money can never be counted twice or lost.
--   * Only RELEASED earnings can be used. Money still on hold, or already on its way to the bank, cannot.
--   * This is not a sale: it never touches orders, so it can never earn referral commission.
--   * A request id makes a double tap or a retry harmless.
-- Requires 20261115030000_ad_wallet.sql and 20261016090000_finance_foundation.sql. Safe to run more than once.
-- =====================================================================
ALTER TABLE public.ad_wallet_settings ADD COLUMN IF NOT EXISTS earnings_topup_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.ad_wallet_ledger ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'paystack';
ALTER TABLE public.ad_wallet_ledger ADD COLUMN IF NOT EXISTS earnings_adjustment_id uuid REFERENCES public.supplier_adjustments(id);
ALTER TABLE public.ad_wallet_ledger ADD COLUMN IF NOT EXISTS request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_wallet_ledger_request ON public.ad_wallet_ledger (vendor_id, request_id) WHERE request_id IS NOT NULL;

-- What the supplier could move right now (released earnings plus any pending corrections, never below zero).
CREATE OR REPLACE FUNCTION public.my_earnings_for_ads() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _s public.ad_wallet_settings%ROWTYPE; _avail numeric;
BEGIN
  SELECT * INTO _s FROM public.ad_wallet_settings WHERE id;
  SELECT COALESCE((SELECT sum(vendor_net) FROM public.order_item_payables WHERE vendor_id = _v AND payout_status = 'available'), 0)
       + COALESCE((SELECT sum(amount) FROM public.supplier_adjustments WHERE vendor_id = _v AND applied_payout_id IS NULL), 0)
    INTO _avail;
  RETURN jsonb_build_object('enabled', _s.enabled AND _s.earnings_topup_enabled, 'available_kobo', (greatest(floor(_avail), 0) * 100)::bigint,
                            'min_topup_kobo', _s.min_topup_kobo, 'max_topup_kobo', _s.max_topup_kobo);
END $$;
REVOKE ALL ON FUNCTION public.my_earnings_for_ads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_earnings_for_ads() TO authenticated;

CREATE OR REPLACE FUNCTION public.topup_ad_wallet_from_earnings(_amount_naira bigint, _request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _v uuid := public.ad_require_vendor(); _s public.ad_wallet_settings%ROWTYPE;
  _items numeric; _adj numeric; _avail numeric; _adj_id uuid; _kobo bigint;
BEGIN
  IF _request_id IS NULL THEN RAISE EXCEPTION 'Missing request id.'; END IF;
  IF EXISTS (SELECT 1 FROM public.ad_wallet_ledger WHERE vendor_id = _v AND request_id = _request_id) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'balance_kobo', public.ad_wallet_balance_kobo(_v));
  END IF;
  SELECT * INTO _s FROM public.ad_wallet_settings WHERE id;
  IF NOT (_s.enabled AND _s.earnings_topup_enabled) THEN RAISE EXCEPTION 'Paying for ads from your earnings is switched off right now.'; END IF;
  _kobo := _amount_naira * 100;
  IF _amount_naira IS NULL OR _amount_naira <= 0 THEN RAISE EXCEPTION 'Enter a whole amount in naira.'; END IF;
  IF _kobo < _s.min_topup_kobo OR _kobo > _s.max_topup_kobo THEN
    RAISE EXCEPTION 'Enter an amount between % and % naira.', _s.min_topup_kobo / 100, _s.max_topup_kobo / 100;
  END IF;

  -- Lock the released earnings (a payout run skips locked rows), then check the amount against them.
  SELECT COALESCE(sum(p.vendor_net), 0) INTO _items
    FROM (SELECT vendor_net FROM public.order_item_payables WHERE vendor_id = _v AND payout_status = 'available' FOR UPDATE) p;
  SELECT COALESCE(sum(a.amount), 0) INTO _adj
    FROM (SELECT amount FROM public.supplier_adjustments WHERE vendor_id = _v AND applied_payout_id IS NULL FOR UPDATE) a;
  _avail := _items + _adj;
  IF _amount_naira > _avail THEN
    RAISE EXCEPTION 'You can use up to % naira of released earnings right now.', greatest(floor(_avail), 0);
  END IF;

  INSERT INTO public.supplier_adjustments (vendor_id, amount, reason, created_by)
    VALUES (_v, -_amount_naira, 'Moved to advertising balance', auth.uid()) RETURNING id INTO _adj_id;
  INSERT INTO public.ad_wallet_ledger (vendor_id, kind, amount_kobo, note, source, earnings_adjustment_id, request_id, created_by)
    VALUES (_v, 'topup', _kobo, 'Moved from your earnings', 'earnings', _adj_id, _request_id, auth.uid());
  PERFORM public.ad_notify_vendor(_v, 'Your advertising balance was topped up from your earnings.');
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'balance_kobo', public.ad_wallet_balance_kobo(_v));
EXCEPTION WHEN unique_violation THEN   -- a parallel tap with the same request id won the race
  RETURN jsonb_build_object('ok', true, 'duplicate', true, 'balance_kobo', public.ad_wallet_balance_kobo(_v));
END $$;
REVOKE ALL ON FUNCTION public.topup_ad_wallet_from_earnings(bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.topup_ad_wallet_from_earnings(bigint, uuid) TO authenticated;
