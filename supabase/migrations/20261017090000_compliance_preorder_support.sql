-- =====================================================================
-- COMPLIANCE, PREORDERS, SUPPORT, DISPUTES, NOTIFICATIONS
--   1. Marketplace settings (section visibility, preorder rules)
--   2. Preorder fields on products + approval guard
--   3. create_order(): preorder rules, terms acceptance (server side)
--   4. Notifications: new types + automatic order / preorder / account alerts
--   5. Support tickets (contact + complaint / report forms)
--   6. Buyer-seller disputes
--   7. Cancellation and refund requests
--   8. Helper functions for the pages (preorder places left, Pay later status)
-- Run AFTER 20261016120000_bnpl.sql. Safe to run twice.
-- Not run against a real database by its author: read the notes in COMPLIANCE_SETUP.md first.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Marketplace settings (one row)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  bnpl_section_visible boolean NOT NULL DEFAULT true,
  preorder_enabled boolean NOT NULL DEFAULT true,
  preorder_requires_approval boolean NOT NULL DEFAULT true,
  preorder_delay_cancel_days integer NOT NULL DEFAULT 14 CHECK (preorder_delay_cancel_days >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.marketplace_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.marketplace_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read marketplace settings" ON public.marketplace_settings;
CREATE POLICY "Anyone can read marketplace settings" ON public.marketplace_settings
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins update marketplace settings" ON public.marketplace_settings;
CREATE POLICY "Admins update marketplace settings" ON public.marketplace_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS update_marketplace_settings_updated_at ON public.marketplace_settings;
CREATE TRIGGER update_marketplace_settings_updated_at BEFORE UPDATE ON public.marketplace_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 2. Preorder fields on products
-- ---------------------------------------------------------------------
-- A preorder product is one the buyer pays for now and receives once it is available.
-- Payment is in full: deposits and part-payments are NOT supported by the current
-- payment flow (one Paystack charge per order), so there is no deposit field.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_preorder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preorder_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preorder_status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS preorder_release_date date,
  ADD COLUMN IF NOT EXISTS preorder_delivery_estimate date,
  ADD COLUMN IF NOT EXISTS preorder_quantity_limit integer,
  ADD COLUMN IF NOT EXISTS preorder_max_per_order integer,
  ADD COLUMN IF NOT EXISTS preorder_terms text,
  ADD COLUMN IF NOT EXISTS preorder_due_notified boolean NOT NULL DEFAULT false;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_preorder_status_check;
ALTER TABLE public.products ADD CONSTRAINT products_preorder_status_check
  CHECK (preorder_status IN ('open', 'ready', 'closed'));
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_preorder_dates_check;
ALTER TABLE public.products ADD CONSTRAINT products_preorder_dates_check
  CHECK ((NOT is_preorder OR preorder_release_date IS NOT NULL)
         AND (preorder_delivery_estimate IS NULL OR preorder_release_date IS NULL OR preorder_delivery_estimate >= preorder_release_date));
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_preorder_limits_check;
ALTER TABLE public.products ADD CONSTRAINT products_preorder_limits_check
  CHECK ((preorder_quantity_limit IS NULL OR preorder_quantity_limit >= 1)
         AND (preorder_max_per_order IS NULL OR preorder_max_per_order >= 1)
         AND (preorder_terms IS NULL OR char_length(preorder_terms) <= 2000));
-- Pay later is never offered on preorders.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_preorder_not_bnpl_check;
ALTER TABLE public.products ADD CONSTRAINT products_preorder_not_bnpl_check
  CHECK (NOT (is_preorder AND bnpl_eligible));

CREATE INDEX IF NOT EXISTS idx_products_preorder ON public.products (is_preorder, preorder_approved, preorder_status);

-- Sellers can switch preorder on for their own products, but only an admin can approve the listing.
CREATE OR REPLACE FUNCTION public.products_guard_preorder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _requires boolean;
BEGIN
  -- Backend contexts (no signed-in user) and admins are trusted.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  SELECT preorder_requires_approval INTO _requires FROM public.marketplace_settings WHERE id = true;
  _requires := COALESCE(_requires, true);

  IF TG_OP = 'INSERT' THEN
    NEW.preorder_approved := CASE WHEN NEW.is_preorder THEN NOT _requires ELSE false END;
    NEW.preorder_due_notified := false;
  ELSE
    IF NEW.is_preorder AND NOT OLD.is_preorder THEN
      NEW.preorder_approved := NOT _requires;   -- newly listed as a preorder: goes to review
    ELSE
      NEW.preorder_approved := OLD.preorder_approved;
    END IF;
    IF NEW.preorder_release_date IS DISTINCT FROM OLD.preorder_release_date THEN
      NEW.preorder_due_notified := false;
    ELSE
      NEW.preorder_due_notified := OLD.preorder_due_notified;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_products_guard_preorder ON public.products;
CREATE TRIGGER trg_products_guard_preorder BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_guard_preorder();

-- ---------------------------------------------------------------------
-- 3. Orders: preorder flag + proof the buyer accepted the terms
-- ---------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_preorder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

-- create_order() now (a) refuses to run unless the buyer accepted the terms, (b) enforces the
-- preorder rules (approved, open, per-order limit, places left) and (c) keeps preorders and
-- in-stock items in separate orders. Everything else is exactly as before.
DROP FUNCTION IF EXISTS public.create_order(jsonb, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_order(
  _items jsonb,
  _email text,
  _phone text,
  _address text,
  _city text,
  _state text,
  _payment_method text DEFAULT 'card',
  _accepted_terms boolean DEFAULT false
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
  _ms public.marketplace_settings%ROWTYPE;
  _has_pre boolean := false;
  _has_reg boolean := false;
  _taken integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Your cart is empty';
  END IF;
  IF _payment_method NOT IN ('card','bnpl') THEN RAISE EXCEPTION 'Unknown payment method'; END IF;
  IF COALESCE(_accepted_terms, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Please accept the terms and conditions to continue';
  END IF;
  SELECT * INTO _ms FROM public.marketplace_settings WHERE id = true;

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
    IF _p.is_preorder THEN
      IF NOT COALESCE(_ms.preorder_enabled, true) THEN RAISE EXCEPTION 'Preorders are not available right now'; END IF;
      IF NOT _p.preorder_approved OR _p.preorder_status <> 'open' THEN
        RAISE EXCEPTION '"%" is not open for preorder', _p.name;
      END IF;
      IF _payment_method = 'bnpl' THEN RAISE EXCEPTION 'Pay later cannot be used for preorders'; END IF;
      IF _p.preorder_max_per_order IS NOT NULL AND _qty > _p.preorder_max_per_order THEN
        RAISE EXCEPTION 'You can preorder up to % of "%" per order', _p.preorder_max_per_order, _p.name;
      END IF;
      IF _p.preorder_quantity_limit IS NOT NULL THEN
        -- lock the product row so two buyers cannot take the last places at the same time
        PERFORM 1 FROM public.products WHERE id = _p.id FOR UPDATE;
        SELECT COALESCE(sum(oi.quantity), 0) INTO _taken
        FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.product_id = _p.id AND o.id <> _order
          AND (o.status IN ('paid','processing','shipped','delivered')
               OR (o.status = 'pending' AND o.created_at > now() - interval '60 minutes'));
        IF _taken + _qty > _p.preorder_quantity_limit THEN
          RAISE EXCEPTION 'Only % preorder places are left for "%"', GREATEST(_p.preorder_quantity_limit - _taken, 0), _p.name;
        END IF;
      END IF;
      _has_pre := true;
    ELSE
      IF _qty > _p.stock_quantity THEN
        RAISE EXCEPTION 'Only % available for "%"', _p.stock_quantity, _p.name;
      END IF;
      _has_reg := true;
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

  IF _has_pre AND _has_reg THEN
    RAISE EXCEPTION 'Preorder items must be ordered separately from in-stock items. Please check out one type at a time.';
  END IF;

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

  UPDATE public.orders SET total = _total, bnpl_fee = _fee, is_preorder = _has_pre, terms_accepted_at = now() WHERE id = _order;
  RETURN jsonb_build_object('order_id', _order, 'subtotal', _subtotal, 'total', _total, 'bnpl_fee', _fee);
END $$;

REVOKE ALL ON FUNCTION public.create_order(jsonb, text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(jsonb, text, text, text, text, text, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Notifications
-- ---------------------------------------------------------------------
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow', 'like', 'comment', 'new_post', 'message', 'inquiry', 'quote', 'review',
                  'order', 'payment', 'bnpl', 'preorder', 'dispute', 'support', 'account'));

-- Internal helper. Nobody can call it from the browser (it would let anyone spam anyone).
CREATE OR REPLACE FUNCTION public.notify_user(
  _recipient uuid, _type text, _message text, _link text DEFAULT NULL, _vendor uuid DEFAULT NULL, _actor uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _recipient IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (recipient_id, actor_id, type, vendor_id, message, link)
  VALUES (_recipient, _actor, _type, _vendor, left(_message, 500), _link);
END $$;
REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 4a. Order and payment updates (buyer) + new / cancelled orders (sellers)
CREATE OR REPLACE FUNCTION public.notify_order_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _short text := upper(left(NEW.id::text, 8));
  _msg text;
  _type text := 'order';
  _v record;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  _msg := CASE
    WHEN NEW.status = 'paid' AND NEW.is_preorder THEN 'Preorder #' || _short || ' is confirmed. We will tell you if the expected date changes.'
    WHEN NEW.status = 'paid' AND NEW.payment_method = 'bnpl' THEN 'Your Pay later payment was approved and order #' || _short || ' is confirmed.'
    WHEN NEW.status = 'paid' THEN 'Payment received. Order #' || _short || ' is confirmed.'
    WHEN NEW.status = 'processing' THEN 'Order #' || _short || ' is being prepared.'
    WHEN NEW.status = 'shipped' THEN 'Order #' || _short || ' has been shipped.'
    WHEN NEW.status = 'delivered' THEN 'Order #' || _short || ' was delivered.'
    WHEN NEW.status = 'cancelled' THEN 'Order #' || _short || ' was cancelled.'
    WHEN NEW.status = 'failed' THEN 'Payment failed for order #' || _short || '. You can try again.'
    ELSE NULL END;

  IF _msg IS NOT NULL AND NEW.user_id IS NOT NULL THEN
    IF NEW.status IN ('paid', 'failed') THEN _type := 'payment'; END IF;
    IF NEW.status = 'paid' AND NEW.payment_method = 'bnpl' THEN _type := 'bnpl'; END IF;
    IF NEW.status = 'paid' AND NEW.is_preorder THEN _type := 'preorder'; END IF;
    PERFORM public.notify_user(NEW.user_id, _type, _msg, '/my-orders');
  END IF;

  IF NEW.status IN ('paid', 'cancelled') THEN
    FOR _v IN
      SELECT DISTINCT v.user_id, v.id AS vendor_id
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      JOIN public.vendors v ON v.id = p.vendor_id
      WHERE oi.order_id = NEW.id
    LOOP
      PERFORM public.notify_user(
        _v.user_id, 'order',
        CASE WHEN NEW.status = 'cancelled' THEN 'Order #' || _short || ' was cancelled.'
             WHEN NEW.is_preorder THEN 'New preorder #' || _short || ' has been paid.'
             ELSE 'New paid order #' || _short || '.' END,
        '/supplier-dashboard', _v.vendor_id);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_order_status ON public.orders;
CREATE TRIGGER trg_notify_order_status AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_status();

-- 4b. Preorder: expected date or availability changed -> tell the buyers who already paid
CREATE OR REPLACE FUNCTION public.notify_preorder_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _msg text;
  _b record;
  _name text := left(NEW.name, 60);
BEGIN
  _msg := CASE
    WHEN NEW.preorder_status = 'ready' AND OLD.preorder_status <> 'ready'
      THEN '"' || _name || '" is now available and is being prepared for delivery.'
    WHEN NEW.preorder_release_date IS DISTINCT FROM OLD.preorder_release_date AND NEW.preorder_release_date > OLD.preorder_release_date
      THEN 'The expected date for "' || _name || '" moved to ' || to_char(NEW.preorder_release_date, 'DD Mon YYYY')
           || '. If that no longer suits you, you can ask to cancel under My orders.'
    WHEN NEW.preorder_release_date IS DISTINCT FROM OLD.preorder_release_date
      THEN 'Good news: the expected date for "' || _name || '" is now ' || to_char(NEW.preorder_release_date, 'DD Mon YYYY') || '.'
    WHEN NEW.preorder_delivery_estimate IS DISTINCT FROM OLD.preorder_delivery_estimate
      THEN 'The estimated delivery date for "' || _name || '" was updated.'
    ELSE NULL END;
  IF _msg IS NULL THEN RETURN NEW; END IF;

  FOR _b IN
    SELECT DISTINCT o.user_id
    FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id = NEW.id AND o.user_id IS NOT NULL AND o.is_preorder
      AND o.status IN ('paid', 'processing')
  LOOP
    PERFORM public.notify_user(_b.user_id, 'preorder', _msg, '/my-orders');
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_preorder_changes ON public.products;
CREATE TRIGGER trg_notify_preorder_changes AFTER UPDATE ON public.products
  FOR EACH ROW WHEN (OLD.is_preorder AND NEW.is_preorder)
  EXECUTE FUNCTION public.notify_preorder_changes();

-- 4c. Welcome message for new accounts
CREATE OR REPLACE FUNCTION public.notify_account_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_user(NEW.user_id, 'account', 'Welcome to IT Hub Africa! Your account is ready.', '/');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_account_created ON public.profiles;
CREATE TRIGGER trg_notify_account_created AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_account_created();

-- 4d. Scheduled: remind sellers when a preorder date has arrived. Run daily (see seed/preorder_daily.sql).
CREATE OR REPLACE FUNCTION public.notify_preorders_due()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p record; _n integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  FOR _p IN
    SELECT p.id, p.name, v.user_id AS vendor_user, v.id AS vendor_id
    FROM public.products p JOIN public.vendors v ON v.id = p.vendor_id
    WHERE p.is_preorder AND p.preorder_approved AND p.preorder_status = 'open'
      AND p.preorder_release_date <= current_date AND NOT p.preorder_due_notified
  LOOP
    PERFORM public.notify_user(_p.vendor_user, 'preorder',
      'The expected date for "' || left(_p.name, 60) || '" has arrived. Mark it ready when it is in stock, or update the date.',
      '/supplier-dashboard', _p.vendor_id);
    UPDATE public.products SET preorder_due_notified = true WHERE id = _p.id;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.notify_preorders_due() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_preorders_due() TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Support tickets (Contact Us, complaints, reports about sellers / listings)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 200),
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'order', 'payment', 'account', 'complaint', 'seller_report', 'listing_report', 'other')),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 200),
  message text NOT NULL CHECK (char_length(message) BETWEEN 3 AND 4000),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_reply text CHECK (admin_reply IS NULL OR char_length(admin_reply) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets (user_id, created_at DESC);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit a support ticket" ON public.support_tickets;
CREATE POLICY "Anyone can submit a support ticket" ON public.support_tickets
  FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Users read own tickets" ON public.support_tickets;
CREATE POLICY "Users read own tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins manage tickets" ON public.support_tickets;
CREATE POLICY "Admins manage tickets" ON public.support_tickets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- The owner is set by the database (never trusted from the form), and a simple limit stops form spam.
CREATE OR REPLACE FUNCTION public.support_tickets_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _recent integer;
BEGIN
  NEW.user_id := auth.uid();
  NEW.status := 'open';
  NEW.admin_reply := NULL;
  SELECT count(*) INTO _recent FROM public.support_tickets t
  WHERE t.created_at > now() - interval '1 hour'
    AND ((NEW.user_id IS NOT NULL AND t.user_id = NEW.user_id) OR lower(t.email) = lower(NEW.email));
  IF _recent >= 5 THEN
    RAISE EXCEPTION 'Too many requests. Please try again in an hour, or email us.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_support_tickets_before_insert ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_before_insert BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_before_insert();

CREATE OR REPLACE FUNCTION public.support_tickets_after_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_support_tickets_touch ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_touch BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_after_update();

CREATE OR REPLACE FUNCTION public.notify_support_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.admin_reply IS DISTINCT FROM OLD.admin_reply) THEN
    PERFORM public.notify_user(NEW.user_id, 'support',
      CASE WHEN NEW.admin_reply IS DISTINCT FROM OLD.admin_reply AND NEW.admin_reply IS NOT NULL
           THEN 'We replied to your request: "' || left(NEW.subject, 60) || '".'
           ELSE 'Your request "' || left(NEW.subject, 60) || '" is now ' || replace(NEW.status, '_', ' ') || '.' END,
      '/contact');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_support_update ON public.support_tickets;
CREATE TRIGGER trg_notify_support_update AFTER UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_support_update();

-- ---------------------------------------------------------------------
-- 6. Buyer-seller disputes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('not_received', 'not_as_described', 'damaged', 'late_preorder', 'refund_not_received', 'other')),
  desired_outcome text NOT NULL DEFAULT 'refund' CHECK (desired_outcome IN ('refund', 'replacement', 'other')),
  details text NOT NULL CHECK (char_length(details) BETWEEN 10 AND 4000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'seller_responded', 'under_review', 'resolved', 'closed')),
  seller_response text CHECK (seller_response IS NULL OR char_length(seller_response) <= 4000),
  resolution text CHECK (resolution IS NULL OR char_length(resolution) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_disputes_one_open
  ON public.disputes (order_id, vendor_id) WHERE status IN ('open', 'seller_responded', 'under_review');
CREATE INDEX IF NOT EXISTS idx_disputes_vendor ON public.disputes (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_buyer ON public.disputes (buyer_id, created_at DESC);
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyers open disputes" ON public.disputes;
CREATE POLICY "Buyers open disputes" ON public.disputes
  FOR INSERT TO authenticated WITH CHECK (buyer_id = auth.uid());
DROP POLICY IF EXISTS "Parties read disputes" ON public.disputes;
CREATE POLICY "Parties read disputes" ON public.disputes
  FOR SELECT TO authenticated USING (
    buyer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));
DROP POLICY IF EXISTS "Parties update disputes" ON public.disputes;
CREATE POLICY "Parties update disputes" ON public.disputes
  FOR UPDATE TO authenticated
  USING (buyer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()))
  WITH CHECK (buyer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));
DROP POLICY IF EXISTS "Admins manage disputes" ON public.disputes;
CREATE POLICY "Admins manage disputes" ON public.disputes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.disputes_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN NEW.buyer_id := auth.uid(); END IF;
  NEW.status := 'open';
  NEW.seller_response := NULL;
  NEW.resolution := NULL;
  NEW.resolved_at := NULL;
  IF NOT EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    JOIN public.products p ON p.id = oi.product_id
    WHERE o.id = NEW.order_id AND o.user_id = NEW.buyer_id AND p.vendor_id = NEW.vendor_id
      AND o.status IN ('paid', 'processing', 'shipped', 'delivered')
  ) THEN
    RAISE EXCEPTION 'You can only open a dispute on a paid order that includes this seller''s products';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_disputes_before_insert ON public.disputes;
CREATE TRIGGER trg_disputes_before_insert BEFORE INSERT ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.disputes_before_insert();

-- Who may change what: the seller can only write a response, the buyer can only withdraw, the admin decides.
CREATE OR REPLACE FUNCTION public.disputes_guard_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _is_vendor boolean;
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    IF NEW.status IN ('resolved', 'closed') AND OLD.status NOT IN ('resolved', 'closed') THEN NEW.resolved_at := now(); END IF;
    RETURN NEW;
  END IF;

  NEW.order_id := OLD.order_id;
  NEW.buyer_id := OLD.buyer_id;
  NEW.vendor_id := OLD.vendor_id;
  NEW.reason := OLD.reason;
  NEW.desired_outcome := OLD.desired_outcome;
  NEW.details := OLD.details;
  NEW.resolution := OLD.resolution;
  NEW.created_at := OLD.created_at;
  NEW.resolved_at := OLD.resolved_at;

  SELECT EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = OLD.vendor_id AND v.user_id = auth.uid()) INTO _is_vendor;

  IF _is_vendor THEN
    IF OLD.status IN ('resolved', 'closed') THEN RAISE EXCEPTION 'This dispute is already closed'; END IF;
    NEW.status := CASE WHEN NEW.seller_response IS DISTINCT FROM OLD.seller_response AND OLD.status = 'open'
                       THEN 'seller_responded' ELSE OLD.status END;
  ELSIF auth.uid() = OLD.buyer_id THEN
    NEW.seller_response := OLD.seller_response;
    NEW.status := CASE WHEN NEW.status = 'closed' AND OLD.status NOT IN ('resolved', 'closed') THEN 'closed' ELSE OLD.status END;
    IF NEW.status = 'closed' THEN NEW.resolved_at := now(); END IF;
  ELSE
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_disputes_guard_update ON public.disputes;
CREATE TRIGGER trg_disputes_guard_update BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.disputes_guard_update();

CREATE OR REPLACE FUNCTION public.notify_dispute_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _vendor_user uuid;
BEGIN
  SELECT user_id INTO _vendor_user FROM public.vendors WHERE id = NEW.vendor_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(_vendor_user, 'dispute', 'A buyer opened a dispute on order #' || upper(left(NEW.order_id::text, 8)) || '. Please respond.', '/supplier-dashboard', NEW.vendor_id, NEW.buyer_id);
    PERFORM public.notify_user(NEW.buyer_id, 'dispute', 'Your dispute was received. The seller has been asked to respond.', '/my-orders');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.notify_user(NEW.buyer_id, 'dispute', 'Your dispute is now ' || replace(NEW.status, '_', ' ') || '.', '/my-orders');
    IF NEW.status IN ('under_review', 'resolved', 'closed') THEN
      PERFORM public.notify_user(_vendor_user, 'dispute', 'A dispute on order #' || upper(left(NEW.order_id::text, 8)) || ' is now ' || replace(NEW.status, '_', ' ') || '.', '/supplier-dashboard', NEW.vendor_id);
    END IF;
    IF NEW.status = 'seller_responded' THEN
      PERFORM public.notify_user(NEW.buyer_id, 'dispute', 'The seller responded to your dispute.', '/my-orders');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_dispute_events ON public.disputes;
CREATE TRIGGER trg_notify_dispute_events AFTER INSERT OR UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.notify_dispute_events();

-- ---------------------------------------------------------------------
-- 7. Cancellation and refund requests
-- ---------------------------------------------------------------------
-- The buyer asks; an admin decides. When a cancellation is approved the order is cancelled (which
-- also reverses the seller's earnings, see handle_order_cancelled). Money is sent back by you in
-- the Paystack / Klump dashboard; marking the request "refunded" records that you did it.
CREATE TABLE IF NOT EXISTS public.order_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cancel', 'refund')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 2000),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'refunded')),
  admin_note text CHECK (admin_note IS NULL OR char_length(admin_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_requests_open ON public.order_requests (order_id, kind) WHERE status = 'requested';
CREATE INDEX IF NOT EXISTS idx_order_requests_status ON public.order_requests (status, created_at DESC);
ALTER TABLE public.order_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyers request cancellation or refund" ON public.order_requests;
CREATE POLICY "Buyers request cancellation or refund" ON public.order_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Buyers read own requests" ON public.order_requests;
CREATE POLICY "Buyers read own requests" ON public.order_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins manage order requests" ON public.order_requests;
CREATE POLICY "Admins manage order requests" ON public.order_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.order_requests_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _status text;
BEGIN
  IF auth.uid() IS NOT NULL THEN NEW.user_id := auth.uid(); END IF;
  NEW.status := 'requested';
  NEW.admin_note := NULL;
  SELECT status INTO _status FROM public.orders WHERE id = NEW.order_id AND user_id = NEW.user_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NEW.kind = 'cancel' AND _status NOT IN ('pending', 'paid', 'processing') THEN
    RAISE EXCEPTION 'This order can no longer be cancelled. You can ask for a refund or open a dispute instead.';
  END IF;
  IF NEW.kind = 'refund' AND _status NOT IN ('paid', 'processing', 'shipped', 'delivered') THEN
    RAISE EXCEPTION 'A refund can only be requested for a paid order';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_order_requests_before_insert ON public.order_requests;
CREATE TRIGGER trg_order_requests_before_insert BEFORE INSERT ON public.order_requests
  FOR EACH ROW EXECUTE FUNCTION public.order_requests_before_insert();

CREATE OR REPLACE FUNCTION public.order_requests_after_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF NEW.status IN ('approved', 'refunded') THEN
    -- approved cancellation, or a refund that has been paid out: the order is cancelled.
    UPDATE public.orders SET status = 'cancelled'
    WHERE id = NEW.order_id AND status NOT IN ('cancelled');
  END IF;

  PERFORM public.notify_user(NEW.user_id, 'order',
    CASE NEW.status
      WHEN 'approved' THEN 'Your ' || NEW.kind || ' request for order #' || upper(left(NEW.order_id::text, 8)) || ' was approved.'
      WHEN 'rejected' THEN 'Your ' || NEW.kind || ' request for order #' || upper(left(NEW.order_id::text, 8)) || ' was not approved. See the note under My orders.'
      WHEN 'refunded' THEN 'Your refund for order #' || upper(left(NEW.order_id::text, 8)) || ' has been sent.'
      ELSE 'Your request was updated.' END,
    '/my-orders');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_order_requests_after_update ON public.order_requests;
CREATE TRIGGER trg_order_requests_after_update AFTER UPDATE ON public.order_requests
  FOR EACH ROW EXECUTE FUNCTION public.order_requests_after_update();

DROP TRIGGER IF EXISTS update_order_requests_updated_at ON public.order_requests;
CREATE TRIGGER update_order_requests_updated_at BEFORE UPDATE ON public.order_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 8. Helpers for the pages
-- ---------------------------------------------------------------------
-- Preorder places already taken per product (counts only, no buyer data).
CREATE OR REPLACE FUNCTION public.get_preorder_taken(_product_ids uuid[])
RETURNS TABLE (product_id uuid, taken integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT oi.product_id, COALESCE(sum(oi.quantity), 0)::integer
  FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.product_id = ANY(_product_ids)
    AND (o.status IN ('paid', 'processing', 'shipped', 'delivered')
         OR (o.status = 'pending' AND o.created_at > now() - interval '60 minutes'))
  GROUP BY oi.product_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_preorder_taken(uuid[]) TO anon, authenticated;

-- The signed-in buyer's own Pay later status per order (the raw provider data stays private).
CREATE OR REPLACE FUNCTION public.get_my_bnpl_status(_order_ids uuid[])
RETURNS TABLE (order_id uuid, status text, amount numeric, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.order_id, t.status, t.amount, t.updated_at
  FROM public.bnpl_transactions t
  WHERE t.user_id = auth.uid() AND t.order_id = ANY(_order_ids);
$$;
REVOKE ALL ON FUNCTION public.get_my_bnpl_status(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_bnpl_status(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------
-- 9. Pay later: tell the buyer when Klump did not complete the payment
-- ---------------------------------------------------------------------
-- (A successful payment already notifies through the order turning "paid".)
CREATE OR REPLACE FUNCTION public.notify_bnpl_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('failed', 'abandoned') THEN
    PERFORM public.notify_user(
      NEW.user_id, 'bnpl',
      CASE WHEN NEW.status = 'failed'
           THEN 'Your Pay later payment for order #' || upper(left(NEW.order_id::text, 8)) || ' did not go through. You can try again or pay by card.'
           ELSE 'Your Pay later application for order #' || upper(left(NEW.order_id::text, 8)) || ' was not completed. You can try again or pay by card.' END,
      '/my-orders');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_bnpl_status ON public.bnpl_transactions;
CREATE TRIGGER trg_notify_bnpl_status AFTER UPDATE OF status ON public.bnpl_transactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_bnpl_status();

-- ---------------------------------------------------------------------
-- 10. Category visibility (admin can hide a category from menus and filters)
-- ---------------------------------------------------------------------
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------
-- 11. Tell sellers when an admin approves their preorder listing
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_preorder_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _vendor_user uuid;
BEGIN
  IF NEW.preorder_approved AND NOT OLD.preorder_approved AND NEW.is_preorder THEN
    SELECT user_id INTO _vendor_user FROM public.vendors WHERE id = NEW.vendor_id;
    PERFORM public.notify_user(_vendor_user, 'preorder', 'Your preorder listing "' || left(NEW.name, 60) || '" was approved and is now live.', '/supplier-dashboard', NEW.vendor_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_preorder_approval ON public.products;
CREATE TRIGGER trg_notify_preorder_approval AFTER UPDATE OF preorder_approved ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.notify_preorder_approval();
