-- =====================================================================
-- ORDER INTEGRITY (Phase 0)
--   1. Stock is reserved when an order is placed, and given back if the order is cancelled
--   2. Unpaid orders expire after 30 minutes (stock returns to the shelf)
--   3. Late payments on expired orders are handled safely (revived, or flagged for refund)
--   4. Per-supplier shipments: supplier marks Shipped, buyer confirms or disputes, admin resolves
--   5. Suppliers can finally see their orders (and the delivery address once paid)
--   6. Refund records, so a cancelled or disputed order always has a refund to process
--   7. Supplier money is released from the shipment, not from the admin clicking "Delivered"
-- Run it AFTER the finance and BNPL migrations. Safe to run twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columns and settings
-- ---------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_reserved boolean NOT NULL DEFAULT false;

-- New orders get a 30 minute payment window. Old orders keep expires_at = NULL and never expire.
ALTER TABLE public.orders ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 minutes');

ALTER TABLE public.finance_settings
  ADD COLUMN IF NOT EXISTS delivery_confirm_days integer NOT NULL DEFAULT 5;
ALTER TABLE public.finance_settings DROP CONSTRAINT IF EXISTS finance_settings_delivery_confirm_days_check;
ALTER TABLE public.finance_settings ADD CONSTRAINT finance_settings_delivery_confirm_days_check
  CHECK (delivery_confirm_days BETWEEN 1 AND 60);

-- ---------------------------------------------------------------------
-- 2. Refund records
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.vendors(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'to_process' CHECK (status IN ('to_process','processing','processed','failed')),
  paystack_refund_id text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON public.refunds (order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds (status);
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage refunds" ON public.refunds;
CREATE POLICY "Admins manage refunds" ON public.refunds FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Buyers see own refunds" ON public.refunds;
CREATE POLICY "Buyers see own refunds" ON public.refunds FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 3. Reserve stock the moment an order line is created
--    (the whole order rolls back if anything is short, so two buyers can never share the last unit)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_stock_for_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text;
BEGIN
  UPDATE public.products SET stock_quantity = stock_quantity - NEW.quantity
  WHERE id = NEW.product_id AND stock_quantity >= NEW.quantity;
  IF NOT FOUND THEN
    SELECT name INTO _name FROM public.products WHERE id = NEW.product_id;
    RAISE EXCEPTION 'Sorry, someone just bought the last of "%". Please reduce the quantity.', COALESCE(_name, 'this product');
  END IF;
  UPDATE public.orders SET stock_reserved = true WHERE id = NEW.order_id AND NOT stock_reserved;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reserve_stock ON public.order_items;
CREATE TRIGGER trg_reserve_stock AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.reserve_stock_for_item();

-- Give the stock back when an order is cancelled; queue a refund if the buyer had already paid.
CREATE OR REPLACE FUNCTION public.restore_stock_on_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _already numeric;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF NEW.stock_reserved THEN
      UPDATE public.products p SET stock_quantity = p.stock_quantity + oi.q
      FROM (SELECT product_id, sum(quantity) AS q FROM public.order_items WHERE order_id = NEW.id GROUP BY product_id) oi
      WHERE p.id = oi.product_id;
      UPDATE public.orders SET stock_reserved = false WHERE id = NEW.id;
    END IF;

    IF EXISTS (SELECT 1 FROM public.payments WHERE order_id = NEW.id AND status = 'success') THEN
      SELECT COALESCE(sum(amount), 0) INTO _already FROM public.refunds WHERE order_id = NEW.id AND status <> 'failed';
      IF NEW.total - _already > 0 THEN
        INSERT INTO public.refunds (order_id, amount, reason)
        VALUES (NEW.id, NEW.total - _already, 'Order cancelled after payment');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_restore_stock_on_cancel ON public.orders;
CREATE TRIGGER trg_restore_stock_on_cancel AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.restore_stock_on_cancel();

-- ---------------------------------------------------------------------
-- 4. Expire unpaid orders (call every few minutes; admins can also press a button)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_unpaid_orders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE public.orders o
  SET status = 'cancelled',
      notes = trim(COALESCE(o.notes, '') || ' Auto-cancelled: not paid within 30 minutes.')
  WHERE o.status = 'pending'
    AND o.expires_at IS NOT NULL AND o.expires_at < now()
    AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id = o.id AND p.status = 'success')
    AND NOT EXISTS (SELECT 1 FROM public.bnpl_transactions b
                    WHERE b.order_id = o.id AND b.status = 'initiated' AND b.created_at > now() - interval '3 hours');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.expire_unpaid_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_orders() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Mark an order paid (card payments). Handles payments that arrive after the order expired.
--    Called only by the edge functions.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_order_paid(_order_id uuid, _method text DEFAULT 'card')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _o public.orders%ROWTYPE;
  _r record;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF _o.status IN ('paid','processing','shipped','delivered','needs_refund') THEN
    RETURN 'already_' || _o.status;
  END IF;

  IF _o.status = 'pending' THEN
    UPDATE public.orders SET status = 'paid', payment_method = _method WHERE id = _order_id;
    RETURN 'paid';
  END IF;

  IF _o.status = 'cancelled' THEN
    -- The order expired before the money arrived. Try to take the stock back.
    BEGIN
      FOR _r IN SELECT product_id, sum(quantity) AS q FROM public.order_items WHERE order_id = _order_id GROUP BY product_id LOOP
        UPDATE public.products SET stock_quantity = stock_quantity - _r.q
        WHERE id = _r.product_id AND stock_quantity >= _r.q;
        IF NOT FOUND THEN RAISE EXCEPTION 'out_of_stock'; END IF;
      END LOOP;
    EXCEPTION WHEN raise_exception THEN
      UPDATE public.orders SET status = 'needs_refund' WHERE id = _order_id;
      INSERT INTO public.refunds (order_id, amount, reason)
      VALUES (_order_id, _o.total, 'Paid after the order expired and the stock was already sold');
      RETURN 'needs_refund';
    END;
    UPDATE public.orders SET status = 'paid', payment_method = _method, stock_reserved = true WHERE id = _order_id;
    UPDATE public.order_item_payables SET payout_status = 'held'
    WHERE order_id = _order_id AND payout_status = 'refunded';
    RETURN 'revived';
  END IF;

  RETURN 'ignored_' || _o.status;
END $$;
REVOKE ALL ON FUNCTION public.mark_order_paid(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(uuid, text) TO service_role;

-- ---------------------------------------------------------------------
-- 6. Shipments: one per supplier per order
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','shipped','delivered','disputed','refunded')),
  courier text,
  waybill text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  confirmed_by text CHECK (confirmed_by IN ('buyer','auto','admin')),
  dispute_reason text,
  disputed_at timestamptz,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, vendor_id)
);
CREATE INDEX IF NOT EXISTS idx_shipments_vendor_status ON public.order_shipments (vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON public.order_shipments (status);
ALTER TABLE public.order_shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage shipments" ON public.order_shipments;
CREATE POLICY "Admins manage shipments" ON public.order_shipments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Suppliers see own shipments" ON public.order_shipments;
CREATE POLICY "Suppliers see own shipments" ON public.order_shipments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));

DROP POLICY IF EXISTS "Buyers see own shipments" ON public.order_shipments;
CREATE POLICY "Buyers see own shipments" ON public.order_shipments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
-- No insert/update/delete policies for suppliers or buyers: they change shipments only through the functions below.

-- Backfill shipments for orders that were already paid before this migration.
INSERT INTO public.order_shipments (order_id, vendor_id, status, shipped_at, delivered_at, confirmed_by)
SELECT DISTINCT ON (p.order_id, p.vendor_id)
  p.order_id, p.vendor_id,
  CASE o.status WHEN 'delivered' THEN 'delivered' WHEN 'shipped' THEN 'shipped' ELSE 'pending' END,
  CASE WHEN o.status IN ('shipped','delivered') THEN o.updated_at END,
  CASE WHEN o.status = 'delivered' THEN COALESCE(o.delivered_at, o.updated_at) END,
  CASE WHEN o.status = 'delivered' THEN 'admin' END
FROM public.order_item_payables p
JOIN public.orders o ON o.id = p.order_id
WHERE o.status IN ('paid','processing','shipped','delivered')
ON CONFLICT (order_id, vendor_id) DO NOTHING;

-- Create the shipments as soon as an order is paid.
CREATE OR REPLACE FUNCTION public.create_shipments_on_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    INSERT INTO public.order_shipments (order_id, vendor_id)
    SELECT DISTINCT order_id, vendor_id FROM public.order_item_payables WHERE order_id = NEW.id
    ON CONFLICT (order_id, vendor_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_create_shipments ON public.orders;
CREATE TRIGGER trg_create_shipments AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.create_shipments_on_paid();

-- If an admin marks a whole order Delivered, its open shipments become delivered too.
CREATE OR REPLACE FUNCTION public.sync_shipments_from_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    UPDATE public.order_shipments
    SET status = 'delivered', delivered_at = COALESCE(delivered_at, now()), confirmed_by = COALESCE(confirmed_by, 'admin')
    WHERE order_id = NEW.id AND status IN ('pending','shipped');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_shipments_from_order ON public.orders;
CREATE TRIGGER trg_sync_shipments_from_order AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_shipments_from_order();

-- Keep the order's own status (paid / shipped / delivered) in step with its shipments.
CREATE OR REPLACE FUNCTION public.sync_order_from_shipments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _live integer; _delivered integer; _moved integer;
BEGIN
  SELECT count(*) FILTER (WHERE status <> 'refunded'),
         count(*) FILTER (WHERE status = 'delivered'),
         count(*) FILTER (WHERE status IN ('shipped','delivered'))
  INTO _live, _delivered, _moved
  FROM public.order_shipments WHERE order_id = NEW.order_id;

  IF _live > 0 AND _delivered = _live THEN
    UPDATE public.orders SET status = 'delivered' WHERE id = NEW.order_id AND status IN ('paid','processing','shipped');
  ELSIF _moved > 0 THEN
    UPDATE public.orders SET status = 'shipped' WHERE id = NEW.order_id AND status IN ('paid','processing');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_order_from_shipments ON public.order_shipments;
CREATE TRIGGER trg_sync_order_from_shipments AFTER INSERT OR UPDATE OF status ON public.order_shipments
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_from_shipments();

-- ---------------------------------------------------------------------
-- 7. Supplier: see my orders (delivery address only after payment) and mark them shipped
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendor_order_list()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _vendor uuid;
BEGIN
  SELECT id INTO _vendor FROM public.vendors WHERE user_id = auth.uid();
  IF _vendor IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'order_id', t.order_id,
      'created_at', t.created_at,
      'order_status', t.order_status,
      'ship_status', t.ship_status,
      'courier', t.courier,
      'waybill', t.waybill,
      'shipped_at', t.shipped_at,
      'delivered_at', t.delivered_at,
      'dispute_reason', t.dispute_reason,
      'gross', t.gross,
      'net', t.net,
      'ship_to', CASE WHEN t.is_paid THEN jsonb_build_object(
          'address', t.shipping_address, 'city', t.shipping_city, 'state', t.shipping_state,
          'phone', t.phone, 'email', t.email) END,
      'items', t.items
    ) ORDER BY t.created_at DESC)
    FROM (
      SELECT o.id AS order_id, o.created_at, o.status AS order_status,
             (o.status IN ('paid','processing','shipped','delivered')) AS is_paid,
             o.shipping_address, o.shipping_city, o.shipping_state, o.phone, o.email,
             s.status AS ship_status, s.courier, s.waybill, s.shipped_at, s.delivered_at, s.dispute_reason,
             sum(p.gross_amount) AS gross, sum(p.vendor_net) AS net,
             jsonb_agg(jsonb_build_object('name', pr.name, 'quantity', oi.quantity, 'price', oi.price, 'unit', pr.unit)) AS items
      FROM public.order_item_payables p
      JOIN public.orders o ON o.id = p.order_id
      JOIN public.order_items oi ON oi.id = p.order_item_id
      LEFT JOIN public.products pr ON pr.id = oi.product_id
      LEFT JOIN public.order_shipments s ON s.order_id = p.order_id AND s.vendor_id = p.vendor_id
      WHERE p.vendor_id = _vendor
        AND (s.id IS NOT NULL OR o.status IN ('paid','processing','shipped','delivered'))
      GROUP BY o.id, s.id
      ORDER BY o.created_at DESC
      LIMIT 200
    ) t
  ), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.vendor_order_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_order_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.vendor_mark_shipped(_order_id uuid, _courier text, _waybill text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _vendor uuid;
BEGIN
  SELECT id INTO _vendor FROM public.vendors WHERE user_id = auth.uid() AND is_approved = true;
  IF _vendor IS NULL THEN RAISE EXCEPTION 'Only approved suppliers can ship orders'; END IF;
  IF length(trim(COALESCE(_courier, ''))) = 0 OR length(trim(COALESCE(_waybill, ''))) = 0 THEN
    RAISE EXCEPTION 'Enter the courier and the waybill or tracking number';
  END IF;

  UPDATE public.order_shipments
  SET status = 'shipped', courier = left(trim(_courier), 80), waybill = left(trim(_waybill), 80), shipped_at = now()
  WHERE order_id = _order_id AND vendor_id = _vendor AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This order cannot be shipped right now (it may be unpaid, already shipped, or cancelled)';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.vendor_mark_shipped(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_mark_shipped(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 8. Buyer: confirm receipt, or report a problem
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.buyer_confirm_receipt(_order_id uuid, _vendor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = _order_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  UPDATE public.order_shipments
  SET status = 'delivered', delivered_at = now(), confirmed_by = 'buyer'
  WHERE order_id = _order_id AND vendor_id = _vendor_id AND status = 'shipped';
  IF NOT FOUND THEN RAISE EXCEPTION 'This delivery cannot be confirmed right now'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.buyer_confirm_receipt(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buyer_confirm_receipt(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.buyer_open_dispute(_order_id uuid, _vendor_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.order_shipments%ROWTYPE; _hold integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = _order_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'Please describe the problem (at least 10 characters)';
  END IF;

  SELECT * INTO _s FROM public.order_shipments WHERE order_id = _order_id AND vendor_id = _vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;
  SELECT payout_hold_days INTO _hold FROM public.finance_settings WHERE id = true;

  IF _s.status = 'shipped'
     OR (_s.status = 'delivered' AND _s.delivered_at + make_interval(days => COALESCE(_hold, 3)) > now()) THEN
    UPDATE public.order_shipments
    SET status = 'disputed', dispute_reason = left(trim(_reason), 1000), disputed_at = now()
    WHERE id = _s.id;
    -- Freeze this supplier's money for the order while it is being looked at.
    UPDATE public.order_item_payables SET payout_status = 'held'
    WHERE order_id = _order_id AND vendor_id = _vendor_id AND payout_status = 'available';
  ELSE
    RAISE EXCEPTION 'The window to report a problem has closed. Please contact support.';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.buyer_open_dispute(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buyer_open_dispute(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 9. Admin: settle a dispute (release the money to the supplier, or refund the buyer)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(_order_id uuid, _vendor_id uuid, _resolution text, _note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.order_shipments%ROWTYPE; _gross numeric; _amount numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _resolution NOT IN ('release','refund') THEN RAISE EXCEPTION 'Resolution must be release or refund'; END IF;

  SELECT * INTO _s FROM public.order_shipments WHERE order_id = _order_id AND vendor_id = _vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;
  IF _s.status <> 'disputed' THEN RAISE EXCEPTION 'This shipment is not in dispute'; END IF;

  IF _resolution = 'release' THEN
    UPDATE public.order_shipments
    SET status = 'delivered', delivered_at = now(), confirmed_by = 'admin',
        resolution_note = left(_note, 1000), resolved_at = now()
    WHERE id = _s.id;
    RETURN 'released';
  END IF;

  -- refund the buyer for this supplier's share (items plus VAT)
  IF EXISTS (SELECT 1 FROM public.order_item_payables
             WHERE order_id = _order_id AND vendor_id = _vendor_id AND payout_status = 'processing') THEN
    RAISE EXCEPTION 'A payout for this supplier is in progress. Wait for it to finish, then resolve.';
  END IF;

  INSERT INTO public.supplier_adjustments (vendor_id, amount, reason, order_id)
  SELECT vendor_id, -vendor_net, 'Refunded to buyer after dispute (' || left(order_id::text, 8) || ')', order_id
  FROM public.order_item_payables
  WHERE order_id = _order_id AND vendor_id = _vendor_id AND payout_status = 'paid';

  UPDATE public.order_item_payables SET payout_status = 'refunded'
  WHERE order_id = _order_id AND vendor_id = _vendor_id AND payout_status IN ('held','available','paid');

  SELECT COALESCE(sum(gross_amount), 0) INTO _gross FROM public.order_item_payables
  WHERE order_id = _order_id AND vendor_id = _vendor_id;
  _amount := round(_gross * 1.075, 2);
  IF _amount > 0 THEN
    INSERT INTO public.refunds (order_id, vendor_id, amount, reason)
    VALUES (_order_id, _vendor_id, _amount, 'Dispute resolved in the buyer''s favour');
  END IF;

  UPDATE public.order_shipments
  SET status = 'refunded', resolution_note = left(_note, 1000), resolved_at = now()
  WHERE id = _s.id;
  RETURN 'refunded';
END $$;
REVOKE ALL ON FUNCTION public.admin_resolve_dispute(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_dispute(uuid, uuid, text, text) TO authenticated;

-- Admin: record the outcome of a refund (used after checking Paystack or Klump)
CREATE OR REPLACE FUNCTION public.admin_set_refund_status(_refund_id uuid, _status text, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _status NOT IN ('processed','failed','to_process') THEN RAISE EXCEPTION 'Bad status'; END IF;
  UPDATE public.refunds
  SET status = _status,
      processed_at = CASE WHEN _status = 'processed' THEN now() ELSE NULL END,
      failure_reason = CASE WHEN _status = 'failed' THEN COALESCE(_note, failure_reason) ELSE NULL END
  WHERE id = _refund_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_refund_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_refund_status(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 10. Release supplier money from the SHIPMENT (confirmed by buyer, auto-confirmed, or admin)
--     instead of waiting for an admin to click "Delivered" on every order.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_matured_payables()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- Buyers who never answer: shipments are confirmed automatically after the window.
  UPDATE public.order_shipments s
  SET status = 'delivered', delivered_at = now(), confirmed_by = 'auto'
  FROM public.finance_settings fs
  WHERE fs.id = true AND s.status = 'shipped'
    AND s.shipped_at + make_interval(days => fs.delivery_confirm_days) <= now();

  UPDATE public.order_item_payables p SET payout_status = 'available'
  FROM public.order_shipments s, public.orders o, public.finance_settings fs
  WHERE s.order_id = p.order_id AND s.vendor_id = p.vendor_id
    AND o.id = p.order_id AND fs.id = true
    AND p.payout_status = 'held'
    AND s.status = 'delivered'
    AND o.settled_at IS NOT NULL
    AND s.delivered_at + make_interval(days => fs.payout_hold_days) <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.release_matured_payables() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_matured_payables() TO authenticated, service_role;
