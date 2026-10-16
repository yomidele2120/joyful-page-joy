-- =====================================================================
-- BUY NOW, PAY LATER (Klump)
--   * products.bnpl_eligible  - the supplier / admin ticks this per product
--   * create_order() accepts _payment_method = 'bnpl' and enforces every rule on the server
--   * bnpl_transactions, webhook de-duplication, confirm / settle functions
-- Run AFTER 20261016090000_finance_foundation.sql. Safe to run more than once.
-- =====================================================================

-- 1. Per-product switch (default OFF) ---------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bnpl_eligible boolean NOT NULL DEFAULT false;

-- 2. Order columns ------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS bnpl_fee numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('card','bnpl'));

-- 3. Transactions (one per BNPL order) ---------------------------------
CREATE TABLE IF NOT EXISTS public.bnpl_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'klump',
  reference text NOT NULL UNIQUE,                -- our merchant_reference sent to Klump
  provider_reference text UNIQUE,                -- Klump's transaction id (one Klump payment can settle only one order)
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','successful','abandoned','failed')),
  is_live boolean,
  raw_verify jsonb,                              -- what Klump's verify call returned (for troubleshooting)
  fee_charged numeric(14,2),
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bnpl_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage bnpl transactions" ON public.bnpl_transactions;
CREATE POLICY "Admins manage bnpl transactions" ON public.bnpl_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS update_bnpl_transactions_updated_at ON public.bnpl_transactions;
CREATE TRIGGER update_bnpl_transactions_updated_at BEFORE UPDATE ON public.bnpl_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.bnpl_webhook_events (
  webhook_id text PRIMARY KEY,
  event text,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bnpl_webhook_events ENABLE ROW LEVEL SECURITY;   -- no policies: service role only

-- 4. create_order(): adds the payment method --------------------------
DROP FUNCTION IF EXISTS public.create_order(jsonb, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_order(
  _items jsonb,
  _email text,
  _phone text,
  _address text,
  _city text,
  _state text,
  _payment_method text DEFAULT 'card'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _order uuid;
  _item jsonb;
  _p public.products%ROWTYPE;
  _qty integer;
  _price numeric;
  _subtotal numeric := 0;
  _total numeric;
  _oi uuid;
  _rate numeric;
  _gross numeric;
  _comm numeric;
  _fs public.finance_settings%ROWTYPE;
  _fee numeric := 0;
  _outstanding numeric;
  _sum_gross numeric;
  _left numeric;
  _share numeric;
  _r record;
  _n integer;
  _i integer := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Your cart is empty';
  END IF;
  IF _payment_method NOT IN ('card','bnpl') THEN RAISE EXCEPTION 'Unknown payment method'; END IF;

  SELECT * INTO _fs FROM public.finance_settings WHERE id = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Finance settings are missing'; END IF;
  IF _payment_method = 'bnpl' AND NOT _fs.bnpl_enabled THEN
    RAISE EXCEPTION 'Pay later is not available right now';
  END IF;

  INSERT INTO public.orders (user_id, email, phone, shipping_address, shipping_city, shipping_state, total, status, payment_method)
  VALUES (_uid, _email, _phone, _address, _city, _state, 0, 'pending', _payment_method)
  RETURNING id INTO _order;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := (_item->>'quantity')::integer;
    IF _qty IS NULL OR _qty < 1 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;

    SELECT * INTO _p FROM public.products
    WHERE id = (_item->>'product_id')::uuid AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'A product in your cart is no longer available'; END IF;

    IF _qty < _p.moq THEN
      RAISE EXCEPTION 'Minimum order for "%" is % %', _p.name, _p.moq, _p.unit;
    END IF;
    IF _qty > _p.stock_quantity THEN
      RAISE EXCEPTION 'Only % available for "%"', _p.stock_quantity, _p.name;
    END IF;
    IF _payment_method = 'bnpl' AND NOT _p.bnpl_eligible THEN
      RAISE EXCEPTION 'Pay later is not available for "%"', _p.name;
    END IF;

    _price := public.tier_price(_p.id, _qty);
    INSERT INTO public.order_items (order_id, product_id, quantity, price)
    VALUES (_order, _p.id, _qty, _price)
    RETURNING id INTO _oi;
    _subtotal := _subtotal + (_price * _qty);

    IF _p.vendor_id IS NOT NULL THEN
      SELECT COALESCE(v.commission_percent, _fs.default_commission_percent) INTO _rate
      FROM (SELECT 1) x LEFT JOIN public.vendors v ON v.id = _p.vendor_id;

      _gross := round(_price * _qty, 2);
      _comm  := round(_gross * _rate / 100, 2);
      INSERT INTO public.order_item_payables
        (order_item_id, order_id, vendor_id, gross_amount, commission_percent, commission_amount, vendor_net)
      VALUES (_oi, _order, _p.vendor_id, _gross, _rate, _comm, _gross - _comm);
    END IF;
  END LOOP;

  IF _payment_method = 'bnpl' THEN
    -- Klump needs whole-naira amounts
    _total := round(_subtotal * 1.075, 0);
    IF _total < _fs.bnpl_min_order THEN
      RAISE EXCEPTION 'Pay later is available for orders from N%', to_char(_fs.bnpl_min_order, 'FM999,999,999,990');
    END IF;
    IF _total > _fs.bnpl_max_order THEN
      RAISE EXCEPTION 'Pay later is available for orders up to N%', to_char(_fs.bnpl_max_order, 'FM999,999,999,990');
    END IF;
    SELECT COALESCE(sum(total), 0) INTO _outstanding FROM public.orders
    WHERE user_id = _uid AND payment_method = 'bnpl' AND id <> _order
      AND status IN ('paid','processing','shipped');
    IF _outstanding + _total > _fs.bnpl_max_outstanding_per_customer THEN
      RAISE EXCEPTION 'This would take you over your Pay later limit. Complete your current Pay later orders first.';
    END IF;

    _fee := round(_total * _fs.bnpl_fee_percent / 100, 0);
    IF _fee > 0 AND _fs.bnpl_fee_bearer = 'customer' THEN
      _total := _total + _fee;
    ELSIF _fee > 0 AND _fs.bnpl_fee_bearer = 'supplier' THEN
      SELECT sum(gross_amount), count(*) INTO _sum_gross, _n FROM public.order_item_payables WHERE order_id = _order;
      IF _n > 0 THEN
        _left := _fee;
        FOR _r IN SELECT order_item_id, gross_amount FROM public.order_item_payables WHERE order_id = _order ORDER BY order_item_id LOOP
          _i := _i + 1;
          IF _i = _n THEN _share := _left; ELSE _share := round(_fee * _r.gross_amount / _sum_gross, 2); END IF;
          _left := _left - _share;
          UPDATE public.order_item_payables SET bnpl_fee_share = _share, vendor_net = vendor_net - _share
          WHERE order_item_id = _r.order_item_id;
        END LOOP;
        IF EXISTS (SELECT 1 FROM public.order_item_payables WHERE order_id = _order AND vendor_net < 0) THEN
          RAISE EXCEPTION 'The Pay later fee settings would leave a supplier with a negative share. Ask the admin to review them.';
        END IF;
      END IF;
    END IF;
  ELSE
    _total := round(_subtotal * 1.075, 2); -- 7.5% VAT, same rate the checkout page shows
  END IF;

  UPDATE public.orders SET total = _total, bnpl_fee = _fee WHERE id = _order;
  RETURN jsonb_build_object('order_id', _order, 'subtotal', _subtotal, 'total', _total, 'bnpl_fee', _fee);
END $$;

REVOKE ALL ON FUNCTION public.create_order(jsonb, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(jsonb, text, text, text, text, text, text) TO authenticated;

-- 5. Confirm a verified Klump payment (called only by the edge functions) ----
CREATE OR REPLACE FUNCTION public.confirm_bnpl_payment(_order_id uuid, _provider_reference text, _is_live boolean, _raw jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _o public.orders%ROWTYPE;
  _t public.bnpl_transactions%ROWTYPE;
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

  UPDATE public.orders SET status = 'paid' WHERE id = _order_id AND status = 'pending';
  INSERT INTO public.payments (order_id, user_id, amount, status, payment_method, transaction_reference, metadata)
  SELECT _order_id, _o.user_id, _o.total, 'success', 'klump_bnpl', _t.reference,
         jsonb_build_object('provider','klump','provider_reference',_provider_reference)
  WHERE NOT EXISTS (SELECT 1 FROM public.payments WHERE order_id = _order_id AND payment_method = 'klump_bnpl');
  RETURN 'confirmed';
END $$;
REVOKE ALL ON FUNCTION public.confirm_bnpl_payment(uuid, text, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_bnpl_payment(uuid, text, boolean, jsonb) TO service_role;

-- 6. Admin: money from Klump has reached you -> supplier funds can start their hold period
CREATE OR REPLACE FUNCTION public.mark_bnpl_settled(_order_id uuid, _fee_charged numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bnpl_transactions WHERE order_id = _order_id AND status = 'successful') THEN
    RAISE EXCEPTION 'This order has no confirmed Pay later payment';
  END IF;
  UPDATE public.bnpl_transactions SET settled_at = COALESCE(settled_at, now()),
         fee_charged = COALESCE(_fee_charged, fee_charged) WHERE order_id = _order_id;
  UPDATE public.orders SET settled_at = COALESCE(settled_at, now()) WHERE id = _order_id;
END $$;
REVOKE ALL ON FUNCTION public.mark_bnpl_settled(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_bnpl_settled(uuid, numeric) TO authenticated;

-- 7. Shoppers may read only the safe parts of the settings
CREATE OR REPLACE FUNCTION public.get_public_finance_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'bnpl_enabled', bnpl_enabled,
    'bnpl_min_order', bnpl_min_order,
    'bnpl_max_order', bnpl_max_order,
    'bnpl_fee_percent', bnpl_fee_percent,
    'bnpl_fee_bearer', bnpl_fee_bearer
  ) FROM public.finance_settings WHERE id = true;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_finance_settings() TO anon, authenticated;
