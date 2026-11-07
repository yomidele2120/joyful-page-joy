-- =====================================================================
-- PAY LATER PROVIDERS (Klump or Credit Direct), chosen by the admin
--   * finance_settings.bnpl_provider   - which provider checkout uses right now
--   * bnpl_transactions.provider       - which provider handled each order (never changes after the order)
--   * bnpl_transactions.checkout_url   - hosted checkout link (Credit Direct redirect flow)
--   * confirm_bnpl_payment()           - now records the real provider on the payment row
--   * get_public_finance_settings()    - also tells the checkout which provider is active
-- Run AFTER 20261016120000_bnpl.sql. Safe to run more than once.
-- Existing Klump orders and settings are untouched: the default provider stays 'klump'.
-- =====================================================================

-- 1. Admin's choice -----------------------------------------------------
ALTER TABLE public.finance_settings ADD COLUMN IF NOT EXISTS bnpl_provider text NOT NULL DEFAULT 'klump';
ALTER TABLE public.finance_settings DROP CONSTRAINT IF EXISTS finance_settings_bnpl_provider_check;
ALTER TABLE public.finance_settings ADD CONSTRAINT finance_settings_bnpl_provider_check
  CHECK (bnpl_provider IN ('klump','creditdirect'));

-- 2. Per-transaction provider -------------------------------------------
ALTER TABLE public.bnpl_transactions ADD COLUMN IF NOT EXISTS checkout_url text;
ALTER TABLE public.bnpl_transactions DROP CONSTRAINT IF EXISTS bnpl_transactions_provider_check;
ALTER TABLE public.bnpl_transactions ADD CONSTRAINT bnpl_transactions_provider_check
  CHECK (provider IN ('klump','creditdirect'));

-- 3. Confirm a verified payment (called only by the edge functions) -------
-- Same rules as before; the only change is that the payment row says which provider was paid
-- ('klump_bnpl' or 'creditdirect_bnpl') instead of always saying klump.
CREATE OR REPLACE FUNCTION public.confirm_bnpl_payment(_order_id uuid, _provider_reference text, _is_live boolean, _raw jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _o public.orders%ROWTYPE;
  _t public.bnpl_transactions%ROWTYPE;
  _method text;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR _o.payment_method <> 'bnpl' THEN RETURN 'not_a_bnpl_order'; END IF;
  SELECT * INTO _t FROM public.bnpl_transactions WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'no_transaction'; END IF;

  IF _t.status = 'successful' THEN
    RETURN CASE WHEN _t.provider_reference = _provider_reference THEN 'already_confirmed' ELSE 'different_reference' END;
  END IF;
  IF _o.status = 'cancelled' THEN RETURN 'order_cancelled'; END IF;

  BEGIN
    UPDATE public.bnpl_transactions
    SET status = 'successful', provider_reference = _provider_reference, is_live = _is_live, raw_verify = _raw
    WHERE order_id = _order_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN 'reference_in_use';
  END;

  _method := _t.provider || '_bnpl';
  UPDATE public.orders SET status = 'paid' WHERE id = _order_id AND status = 'pending';
  INSERT INTO public.payments (order_id, user_id, amount, status, payment_method, transaction_reference, metadata)
  SELECT _order_id, _o.user_id, _o.total, 'success', _method, _t.reference,
         jsonb_build_object('provider', _t.provider, 'provider_reference', _provider_reference)
  WHERE NOT EXISTS (SELECT 1 FROM public.payments WHERE order_id = _order_id AND payment_method LIKE '%\_bnpl');
  RETURN 'confirmed';
END $$;
REVOKE ALL ON FUNCTION public.confirm_bnpl_payment(uuid, text, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_bnpl_payment(uuid, text, boolean, jsonb) TO service_role;

-- 4. Shoppers read only the safe parts of the settings -------------------
CREATE OR REPLACE FUNCTION public.get_public_finance_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'bnpl_enabled', bnpl_enabled,
    'bnpl_provider', bnpl_provider,
    'bnpl_min_order', bnpl_min_order,
    'bnpl_max_order', bnpl_max_order,
    'bnpl_fee_percent', bnpl_fee_percent,
    'bnpl_fee_bearer', bnpl_fee_bearer
  ) FROM public.finance_settings WHERE id = true;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_finance_settings() TO anon, authenticated;

-- 5. The buyer's own status also says which provider (raw provider data stays private) ----
DROP FUNCTION IF EXISTS public.get_my_bnpl_status(uuid[]);
CREATE OR REPLACE FUNCTION public.get_my_bnpl_status(_order_ids uuid[])
RETURNS TABLE (order_id uuid, status text, amount numeric, updated_at timestamptz, provider text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.order_id, t.status, t.amount, t.updated_at, t.provider
  FROM public.bnpl_transactions t
  WHERE t.user_id = auth.uid() AND t.order_id = ANY(_order_ids);
$$;
REVOKE ALL ON FUNCTION public.get_my_bnpl_status(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_bnpl_status(uuid[]) TO authenticated;
