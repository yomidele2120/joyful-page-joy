-- =====================================================================
-- FINANCE FOUNDATION  (supplier payables, payouts, admin-editable settings)
--   1. finance_settings  - one row the admin dashboard edits
--   2. order_item_payables - what each supplier earns per order line (PRIVATE:
--      buyers cannot see commission / net amounts)
--   3. payouts + supplier_adjustments
--   4. create_order() now records each supplier's exact share
--   5. release / claim / finish functions used by the payout engine
-- Safe to run more than once. Existing orders are NOT made payable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Settings (single row, admin only)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  default_commission_percent numeric(5,2) NOT NULL DEFAULT 5  CHECK (default_commission_percent BETWEEN 0 AND 100),
  payout_hold_days integer NOT NULL DEFAULT 3 CHECK (payout_hold_days >= 0),
  min_payout_amount numeric(14,2) NOT NULL DEFAULT 5000 CHECK (min_payout_amount >= 0),
  -- Buy-now-pay-later controls (used when BNPL is switched on in a later phase)
  bnpl_enabled boolean NOT NULL DEFAULT false,
  bnpl_fee_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (bnpl_fee_percent BETWEEN 0 AND 100),
  bnpl_fee_bearer text NOT NULL DEFAULT 'platform' CHECK (bnpl_fee_bearer IN ('platform','supplier','customer')),
  bnpl_min_order numeric(14,2) NOT NULL DEFAULT 50000 CHECK (bnpl_min_order >= 0),
  bnpl_max_order numeric(14,2) NOT NULL DEFAULT 1000000 CHECK (bnpl_max_order >= 0),
  bnpl_max_outstanding_per_customer numeric(14,2) NOT NULL DEFAULT 1000000 CHECK (bnpl_max_outstanding_per_customer >= 0),
  bnpl_down_payment_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (bnpl_down_payment_percent BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.finance_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage finance settings" ON public.finance_settings;
CREATE POLICY "Admins manage finance settings" ON public.finance_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_finance_settings_updated_at ON public.finance_settings;
CREATE TRIGGER update_finance_settings_updated_at BEFORE UPDATE ON public.finance_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Only the non-sensitive BNPL numbers are readable by shoppers (used at checkout later).
CREATE OR REPLACE FUNCTION public.get_public_finance_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'bnpl_enabled', bnpl_enabled,
    'bnpl_min_order', bnpl_min_order,
    'bnpl_max_order', bnpl_max_order,
    'bnpl_down_payment_percent', bnpl_down_payment_percent
  ) FROM public.finance_settings WHERE id = true;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_finance_settings() TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Supplier / order columns
-- ---------------------------------------------------------------------
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2);   -- NULL = use default
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_commission_percent_check;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_commission_percent_check
  CHECK (commission_percent IS NULL OR commission_percent BETWEEN 0 AND 100);

ALTER TABLE public.vendor_private
  ADD COLUMN IF NOT EXISTS transfer_recipient_code text,
  ADD COLUMN IF NOT EXISTS transfer_recipient_fingerprint text;   -- bank+account the recipient was verified for

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,     -- when the money actually reached you
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

UPDATE public.orders SET delivered_at = updated_at WHERE status = 'delivered' AND delivered_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_order_delivered_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_order_delivered_at ON public.orders;
CREATE TRIGGER trg_order_delivered_at BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_delivered_at();

-- ---------------------------------------------------------------------
-- 3. Payouts, payables, adjustments
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','paid','failed','reversed')),
  paystack_transfer_code text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_payouts_vendor ON public.payouts (vendor_id, created_at DESC);
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage payouts" ON public.payouts;
CREATE POLICY "Admins manage payouts" ON public.payouts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Suppliers see own payouts" ON public.payouts;
CREATE POLICY "Suppliers see own payouts" ON public.payouts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.order_item_payables (
  order_item_id uuid PRIMARY KEY REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  gross_amount numeric(14,2) NOT NULL,
  commission_percent numeric(5,2) NOT NULL,
  commission_amount numeric(14,2) NOT NULL,
  bnpl_fee_share numeric(14,2) NOT NULL DEFAULT 0,
  vendor_net numeric(14,2) NOT NULL,
  payout_status text NOT NULL DEFAULT 'held'
    CHECK (payout_status IN ('held','available','processing','paid','refunded')),
  payout_id uuid REFERENCES public.payouts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payables_vendor_status ON public.order_item_payables (vendor_id, payout_status);
CREATE INDEX IF NOT EXISTS idx_payables_order ON public.order_item_payables (order_id);
ALTER TABLE public.order_item_payables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage payables" ON public.order_item_payables;
CREATE POLICY "Admins manage payables" ON public.order_item_payables FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Suppliers see own payables" ON public.order_item_payables;
CREATE POLICY "Suppliers see own payables" ON public.order_item_payables FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));

-- Manual corrections (+ credit / - deduction). Applied to the supplier's next payout.
CREATE TABLE IF NOT EXISTS public.supplier_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  amount numeric(14,2) NOT NULL CHECK (amount <> 0),
  reason text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  applied_payout_id uuid REFERENCES public.payouts(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_adjustments_vendor ON public.supplier_adjustments (vendor_id, applied_payout_id);
ALTER TABLE public.supplier_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage adjustments" ON public.supplier_adjustments;
CREATE POLICY "Admins manage adjustments" ON public.supplier_adjustments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Suppliers see own adjustments" ON public.supplier_adjustments;
CREATE POLICY "Suppliers see own adjustments" ON public.supplier_adjustments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 4. create_order(): same pricing / MOQ / stock / VAT as before, plus the
--    supplier's exact share for every line (commission from settings).
--    VAT stays with the platform; suppliers earn on the pre-VAT line value.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(
  _items jsonb,
  _email text,
  _phone text,
  _address text,
  _city text,
  _state text
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
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Your cart is empty';
  END IF;

  INSERT INTO public.orders (user_id, email, phone, shipping_address, shipping_city, shipping_state, total, status)
  VALUES (_uid, _email, _phone, _address, _city, _state, 0, 'pending')
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

    _price := public.tier_price(_p.id, _qty);
    INSERT INTO public.order_items (order_id, product_id, quantity, price)
    VALUES (_order, _p.id, _qty, _price)
    RETURNING id INTO _oi;
    _subtotal := _subtotal + (_price * _qty);

    -- Record what the supplier earns on this line (products with no supplier owe nobody).
    IF _p.vendor_id IS NOT NULL THEN
      SELECT COALESCE(v.commission_percent, fs.default_commission_percent) INTO _rate
      FROM public.finance_settings fs
      LEFT JOIN public.vendors v ON v.id = _p.vendor_id
      WHERE fs.id = true;
      IF _rate IS NULL THEN RAISE EXCEPTION 'Finance settings are missing'; END IF;

      _gross := round(_price * _qty, 2);
      _comm  := round(_gross * _rate / 100, 2);
      INSERT INTO public.order_item_payables
        (order_item_id, order_id, vendor_id, gross_amount, commission_percent, commission_amount, vendor_net)
      VALUES (_oi, _order, _p.vendor_id, _gross, _rate, _comm, _gross - _comm);
    END IF;
  END LOOP;

  _total := round(_subtotal * 1.075, 2); -- 7.5% VAT, same rate the checkout page shows
  UPDATE public.orders SET total = _total WHERE id = _order;

  RETURN jsonb_build_object('order_id', _order, 'subtotal', _subtotal, 'total', _total);
END $$;

REVOKE ALL ON FUNCTION public.create_order(jsonb, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(jsonb, text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Cancelling an order cancels what the supplier would have earned
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_order_cancelled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF EXISTS (SELECT 1 FROM public.order_item_payables WHERE order_id = NEW.id AND payout_status = 'processing') THEN
      RAISE EXCEPTION 'A supplier payout for this order is in progress. Wait for it to finish, then cancel.';
    END IF;
    -- already paid out: deduct from the supplier's next payout
    INSERT INTO public.supplier_adjustments (vendor_id, amount, reason, order_id)
    SELECT vendor_id, -vendor_net, 'Order cancelled after payout (' || left(order_id::text, 8) || ')', order_id
    FROM public.order_item_payables WHERE order_id = NEW.id AND payout_status = 'paid';
    UPDATE public.order_item_payables SET payout_status = 'refunded'
    WHERE order_id = NEW.id AND payout_status IN ('held','available','paid');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_order_cancelled ON public.orders;
CREATE TRIGGER trg_order_cancelled AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_cancelled();

-- ---------------------------------------------------------------------
-- 6. Payout engine functions
-- ---------------------------------------------------------------------
-- held -> available once: delivered, money settled to you, and the hold period has passed.
CREATE OR REPLACE FUNCTION public.release_matured_payables()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE public.order_item_payables p SET payout_status = 'available'
  FROM public.orders o, public.finance_settings fs
  WHERE p.order_id = o.id AND fs.id = true
    AND p.payout_status = 'held'
    AND o.status = 'delivered'
    AND o.settled_at IS NOT NULL
    AND o.delivered_at + make_interval(days => fs.payout_hold_days) <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.release_matured_payables() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_matured_payables() TO authenticated, service_role;

-- Locks a supplier's available lines + pending adjustments and turns them into ONE payout
-- for the exact total. Returns nothing when there is nothing (or too little) to pay.
CREATE OR REPLACE FUNCTION public.claim_vendor_payout(_vendor_id uuid)
RETURNS TABLE (payout_id uuid, amount numeric) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _min numeric;
  _item_ids uuid[]; _item_total numeric;
  _adj_ids uuid[];  _adj_total numeric;
  _total numeric;
  _pid uuid;
BEGIN
  SELECT min_payout_amount INTO _min FROM public.finance_settings WHERE id = true;

  SELECT array_agg(s.order_item_id), COALESCE(sum(s.vendor_net), 0) INTO _item_ids, _item_total
  FROM (SELECT order_item_id, vendor_net FROM public.order_item_payables
        WHERE vendor_id = _vendor_id AND payout_status = 'available' FOR UPDATE SKIP LOCKED) s;
  IF _item_ids IS NULL THEN RETURN; END IF;

  SELECT array_agg(a.id), COALESCE(sum(a.amount), 0) INTO _adj_ids, _adj_total
  FROM (SELECT id, amount FROM public.supplier_adjustments
        WHERE vendor_id = _vendor_id AND applied_payout_id IS NULL FOR UPDATE SKIP LOCKED) a;

  _total := _item_total + _adj_total;
  IF _total <= 0 OR _total < _min THEN RETURN; END IF;

  INSERT INTO public.payouts (vendor_id, amount, status) VALUES (_vendor_id, _total, 'processing')
  RETURNING id INTO _pid;
  UPDATE public.order_item_payables SET payout_status = 'processing', payout_id = _pid
  WHERE order_item_id = ANY(_item_ids);
  IF _adj_ids IS NOT NULL THEN
    UPDATE public.supplier_adjustments SET applied_payout_id = _pid WHERE id = ANY(_adj_ids);
  END IF;

  payout_id := _pid; amount := _total;
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.claim_vendor_payout(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_vendor_payout(uuid) TO service_role;

-- Records the outcome of a transfer. Safe to call twice (webhook + manual check).
CREATE OR REPLACE FUNCTION public.finish_payout(_payout_id uuid, _outcome text, _transfer_code text DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _status text;
BEGIN
  IF _outcome NOT IN ('success','failed','reversed') THEN RAISE EXCEPTION 'Bad outcome'; END IF;
  SELECT status INTO _status FROM public.payouts WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF _outcome = 'success' THEN
    IF _status <> 'processing' THEN RETURN 'ignored_' || _status; END IF;
    UPDATE public.payouts SET status = 'paid', paid_at = now(),
           paystack_transfer_code = COALESCE(_transfer_code, paystack_transfer_code)
    WHERE id = _payout_id;
    UPDATE public.order_item_payables SET payout_status = 'paid'
    WHERE payout_id = _payout_id AND payout_status = 'processing';
    RETURN 'paid';
  END IF;

  -- failed / reversed: give the money back to the supplier's balance
  IF _status NOT IN ('processing','paid') THEN RETURN 'ignored_' || _status; END IF;
  UPDATE public.payouts SET status = CASE WHEN _outcome = 'reversed' THEN 'reversed' ELSE 'failed' END,
         failure_reason = COALESCE(_reason, failure_reason),
         paystack_transfer_code = COALESCE(_transfer_code, paystack_transfer_code)
  WHERE id = _payout_id;
  UPDATE public.order_item_payables SET payout_status = 'available', payout_id = NULL
  WHERE payout_id = _payout_id AND payout_status IN ('processing','paid');
  UPDATE public.supplier_adjustments SET applied_payout_id = NULL WHERE applied_payout_id = _payout_id;
  RETURN _outcome;
END $$;
REVOKE ALL ON FUNCTION public.finish_payout(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_payout(uuid, text, text, text) TO service_role;

-- One row per supplier for the admin Finance tab.
CREATE OR REPLACE FUNCTION public.finance_payables_summary()
RETURNS TABLE (
  vendor_id uuid, store_name text, is_approved boolean, commission_percent numeric,
  held numeric, available numeric, processing numeric, paid numeric, adjustments numeric,
  has_bank boolean, recipient_ready boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY
  SELECT v.id, v.store_name, COALESCE(v.is_approved, false), v.commission_percent,
    COALESCE(sum(p.vendor_net) FILTER (WHERE p.payout_status = 'held' AND o.settled_at IS NOT NULL), 0),
    COALESCE(sum(p.vendor_net) FILTER (WHERE p.payout_status = 'available'), 0),
    COALESCE(sum(p.vendor_net) FILTER (WHERE p.payout_status = 'processing'), 0),
    COALESCE(sum(p.vendor_net) FILTER (WHERE p.payout_status = 'paid'), 0),
    COALESCE((SELECT sum(a.amount) FROM public.supplier_adjustments a WHERE a.vendor_id = v.id AND a.applied_payout_id IS NULL), 0),
    (vp.bank_account_number IS NOT NULL AND vp.bank_name IS NOT NULL),
    (vp.transfer_recipient_code IS NOT NULL
       AND vp.transfer_recipient_fingerprint = lower(trim(COALESCE(vp.bank_name,''))) || '|' || trim(COALESCE(vp.bank_account_number,'')))
  FROM public.vendors v
  LEFT JOIN public.order_item_payables p ON p.vendor_id = v.id
  LEFT JOIN public.orders o ON o.id = p.order_id
  LEFT JOIN public.vendor_private vp ON vp.vendor_id = v.id
  GROUP BY v.id, v.store_name, v.is_approved, v.commission_percent,
           vp.bank_account_number, vp.bank_name, vp.transfer_recipient_code, vp.transfer_recipient_fingerprint
  ORDER BY v.store_name;
END $$;
REVOKE ALL ON FUNCTION public.finance_payables_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_payables_summary() TO authenticated;
