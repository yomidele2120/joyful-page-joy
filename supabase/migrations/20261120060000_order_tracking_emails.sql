-- Order tracking emails: the buyer gets one "your order has shipped" email PER SUPPLIER PARCEL, with the courier and waybill.
-- The old order-level "shipped" email is switched off so nobody gets two. Requires 20261112110000_email_notification_outbox.sql.
-- Safe to run twice.

CREATE OR REPLACE FUNCTION public.email_order_status_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _vendor record;
  _event_type text;
  _short text := upper(left(NEW.id::text, 8));
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF NEW.status = 'paid' THEN
    PERFORM public.enqueue_email_notification(
      'order:' || NEW.id::text || ':paid:buyer', 'buyer.order_paid', NEW.user_id,
      jsonb_build_object('order_id', NEW.id, 'order_number', _short, 'payment_method', NEW.payment_method,
        'payment_reference', (SELECT COALESCE(p.paystack_reference, p.transaction_reference)
          FROM public.payments p WHERE p.order_id = NEW.id AND p.status = 'success'
          ORDER BY p.created_at DESC LIMIT 1)), NEW.email);
    FOR _vendor IN
      SELECT DISTINCT v.id AS vendor_id, v.user_id
      FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id
      JOIN public.vendors v ON v.id = p.vendor_id WHERE oi.order_id = NEW.id
    LOOP
      PERFORM public.enqueue_email_notification(
        'order:' || NEW.id::text || ':paid:vendor:' || _vendor.vendor_id::text,
        'vendor.order_received', _vendor.user_id,
        jsonb_build_object('order_id', NEW.id, 'vendor_id', _vendor.vendor_id, 'order_number', _short));
    END LOOP;
    RETURN NEW;
  END IF;

  _event_type := CASE NEW.status
    WHEN 'processing' THEN 'buyer.order_processing'
    WHEN 'delivered' THEN 'buyer.order_delivered'
    WHEN 'cancelled' THEN 'buyer.order_cancelled'
    ELSE NULL END;
  IF _event_type IS NOT NULL THEN
    PERFORM public.enqueue_email_notification(
      'order:' || NEW.id::text || ':' || NEW.status || ':buyer', _event_type,
      NEW.user_id, jsonb_build_object('order_id', NEW.id, 'order_number', _short), NEW.email);
  END IF;

  IF NEW.status = 'cancelled' THEN
    FOR _vendor IN
      SELECT DISTINCT v.id AS vendor_id, v.user_id
      FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id
      JOIN public.vendors v ON v.id = p.vendor_id WHERE oi.order_id = NEW.id
    LOOP
      PERFORM public.enqueue_email_notification(
        'order:' || NEW.id::text || ':cancelled:vendor:' || _vendor.vendor_id::text,
        'vendor.order_cancelled', _vendor.user_id,
        jsonb_build_object('order_id', NEW.id, 'vendor_id', _vendor.vendor_id, 'order_number', _short));
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.email_shipment_shipped_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.orders%ROWTYPE;
BEGIN
  IF NEW.status IS DISTINCT FROM 'shipped' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  SELECT * INTO _o FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  PERFORM public.enqueue_email_notification(
    'shipment:' || NEW.id::text || ':shipped:buyer', 'buyer.order_shipped', _o.user_id,
    jsonb_build_object('order_id', NEW.order_id, 'vendor_id', NEW.vendor_id, 'order_number', upper(left(NEW.order_id::text, 8)),
                       'courier', NEW.courier, 'waybill', NEW.waybill), _o.email);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_email_shipment_shipped ON public.order_shipments;
CREATE TRIGGER trg_email_shipment_shipped AFTER UPDATE OF status ON public.order_shipments
  FOR EACH ROW EXECUTE FUNCTION public.email_shipment_shipped_event();
