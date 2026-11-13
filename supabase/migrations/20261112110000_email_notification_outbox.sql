CREATE TABLE IF NOT EXISTS public.email_notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 80),
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  resend_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_email_jobs_claim
  ON public.email_notification_jobs (next_attempt_at, created_at)
  WHERE status IN ('pending', 'sending');
CREATE INDEX IF NOT EXISTS idx_email_jobs_recipient
  ON public.email_notification_jobs (recipient_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.email_delivery_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  notify_admin_new_buyers boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.email_delivery_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.email_notification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_delivery_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read email notification logs" ON public.email_notification_jobs;
CREATE POLICY "Admins read email notification logs" ON public.email_notification_jobs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage email delivery settings" ON public.email_delivery_settings;
CREATE POLICY "Admins manage email delivery settings" ON public.email_delivery_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.email_notification_jobs, public.email_delivery_settings FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.email_notification_jobs FROM authenticated;
GRANT SELECT ON public.email_notification_jobs TO authenticated;
GRANT SELECT, UPDATE ON public.email_delivery_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_email_notification(
  _event_key text,
  _event_type text,
  _recipient_user_id uuid,
  _payload jsonb DEFAULT '{}'::jsonb,
  _recipient_email text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _event_key IS NULL OR _event_key = '' OR (_recipient_user_id IS NULL AND NULLIF(trim(_recipient_email), '') IS NULL) THEN
    RETURN;
  END IF;
  INSERT INTO public.email_notification_jobs
    (event_key, event_type, recipient_user_id, recipient_email, payload)
  VALUES (_event_key, _event_type, _recipient_user_id, NULLIF(trim(_recipient_email), ''), COALESCE(_payload, '{}'::jsonb))
  ON CONFLICT (event_key) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_email_notification(text, text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_email_notification_jobs(_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  event_key text,
  event_type text,
  recipient_user_id uuid,
  recipient_email text,
  payload jsonb,
  attempts integer,
  max_attempts integer
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM public.email_notification_jobs j
    WHERE j.attempts < j.max_attempts
      AND ((j.status = 'pending' AND j.next_attempt_at <= now())
        OR (j.status = 'sending' AND j.locked_at < now() - interval '10 minutes'))
    ORDER BY j.next_attempt_at, j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(_limit, 20), 100))
  )
  UPDATE public.email_notification_jobs j
  SET status = 'sending', attempts = j.attempts + 1,
      locked_at = now(), updated_at = now(), last_error = NULL
  FROM candidates c
  WHERE j.id = c.id
  RETURNING j.id, j.event_key, j.event_type, j.recipient_user_id, j.recipient_email,
            j.payload, j.attempts, j.max_attempts;
END $$;
REVOKE ALL ON FUNCTION public.claim_email_notification_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_notification_jobs(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_email_notification_job(_id uuid, _recipient_email text, _resend_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _changed integer;
BEGIN
  UPDATE public.email_notification_jobs
  SET status = 'sent', recipient_email = COALESCE(NULLIF(trim(_recipient_email), ''), recipient_email),
      resend_id = _resend_id, sent_at = now(), locked_at = NULL, last_error = NULL, updated_at = now()
  WHERE id = _id AND status = 'sending';
  GET DIAGNOSTICS _changed = ROW_COUNT;
  RETURN _changed = 1;
END $$;
REVOKE ALL ON FUNCTION public.complete_email_notification_job(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_email_notification_job(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_email_notification_job(_id uuid, _error text, _permanent boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _changed integer;
BEGIN
  UPDATE public.email_notification_jobs
  SET status = CASE WHEN _permanent OR attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
      next_attempt_at = now() + make_interval(secs => LEAST(3600, 30 * (2 ^ LEAST(GREATEST(attempts - 1, 0), 7))::integer)),
      locked_at = NULL, last_error = left(COALESCE(_error, 'Delivery failed'), 2000), updated_at = now()
  WHERE id = _id AND status = 'sending';
  GET DIAGNOSTICS _changed = ROW_COUNT;
  RETURN _changed = 1;
END $$;
REVOKE ALL ON FUNCTION public.fail_email_notification_job(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_email_notification_job(uuid, text, boolean) TO service_role;

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
    WHEN 'shipped' THEN 'buyer.order_shipped'
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
DROP TRIGGER IF EXISTS trg_email_order_status ON public.orders;
CREATE TRIGGER trg_email_order_status AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.email_order_status_event();

CREATE OR REPLACE FUNCTION public.email_payment_status_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _order public.orders%ROWTYPE; _admin record;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('failed', 'reversed', 'review_required') THEN RETURN NEW; END IF;
  SELECT * INTO _order FROM public.orders WHERE id = NEW.order_id;
  PERFORM public.enqueue_email_notification(
    'payment:' || NEW.id::text || ':' || NEW.status || ':buyer', 'buyer.payment_issue',
    COALESCE(NEW.user_id, _order.user_id), jsonb_build_object('payment_id', NEW.id, 'order_id', NEW.order_id, 'status', NEW.status), _order.email);
  IF NEW.status IN ('failed', 'reversed', 'review_required') THEN
    FOR _admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      PERFORM public.enqueue_email_notification(
        'payment:' || NEW.id::text || ':' || NEW.status || ':admin:' || _admin.user_id::text,
        'admin.payment_alert', _admin.user_id,
        jsonb_build_object('payment_id', NEW.id, 'order_id', NEW.order_id, 'status', NEW.status, 'amount', NEW.amount, 'currency', NEW.currency));
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_email_payment_status ON public.payments;
CREATE TRIGGER trg_email_payment_status AFTER INSERT OR UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.email_payment_status_event();

CREATE OR REPLACE FUNCTION public.email_inquiry_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _vendor_user uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT user_id INTO _vendor_user FROM public.vendors WHERE id = NEW.vendor_id;
    PERFORM public.enqueue_email_notification(
      'inquiry:' || NEW.id::text || ':created:vendor', 'vendor.new_inquiry', _vendor_user,
      jsonb_build_object('inquiry_id', NEW.id, 'vendor_id', NEW.vendor_id, 'product_id', NEW.product_id));
  ELSIF NEW.status = 'replied' AND OLD.status IS DISTINCT FROM 'replied' THEN
    PERFORM public.enqueue_email_notification(
      'inquiry:' || NEW.id::text || ':replied:buyer', 'buyer.inquiry_replied', NEW.buyer_id,
      jsonb_build_object('inquiry_id', NEW.id, 'vendor_id', NEW.vendor_id, 'product_id', NEW.product_id));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_email_inquiry_event ON public.inquiries;
CREATE TRIGGER trg_email_inquiry_event AFTER INSERT OR UPDATE OF status ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.email_inquiry_event();

CREATE OR REPLACE FUNCTION public.email_rfq_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _vendor record; _category text;
BEGIN
  IF TG_TABLE_NAME = 'rfq_quotes' THEN
    PERFORM public.enqueue_email_notification(
      'rfq:' || NEW.rfq_id::text || ':quote:' || NEW.id::text || ':buyer', 'buyer.rfq_quote',
      (SELECT buyer_id FROM public.rfqs WHERE id = NEW.rfq_id),
      jsonb_build_object('rfq_id', NEW.rfq_id, 'quote_id', NEW.id, 'vendor_id', NEW.vendor_id));
    RETURN NEW;
  END IF;

  SELECT name INTO _category FROM public.categories WHERE id = NEW.category_id;
  IF _category IS NULL THEN RETURN NEW; END IF;
  FOR _vendor IN
    SELECT v.id, v.user_id FROM public.vendors v
    WHERE v.is_approved = true AND v.product_categories @> ARRAY[_category]::text[]
  LOOP
    PERFORM public.enqueue_email_notification(
      'rfq:' || NEW.id::text || ':vendor:' || _vendor.id::text,
      'vendor.new_rfq', _vendor.user_id,
      jsonb_build_object('rfq_id', NEW.id, 'vendor_id', _vendor.id));
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_email_new_rfq ON public.rfqs;
CREATE TRIGGER trg_email_new_rfq AFTER INSERT ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION public.email_rfq_event();
DROP TRIGGER IF EXISTS trg_email_rfq_quote ON public.rfq_quotes;
CREATE TRIGGER trg_email_rfq_quote AFTER INSERT ON public.rfq_quotes
  FOR EACH ROW EXECUTE FUNCTION public.email_rfq_event();

CREATE OR REPLACE FUNCTION public.email_vendor_registration_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _admin record;
BEGIN
  FOR _admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    PERFORM public.enqueue_email_notification(
      'vendor:' || NEW.id::text || ':registered:admin:' || _admin.user_id::text,
      'admin.new_vendor', _admin.user_id,
      jsonb_build_object('vendor_id', NEW.id, 'user_id', NEW.user_id, 'store_name', NEW.store_name));
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_email_vendor_registration ON public.vendors;
CREATE TRIGGER trg_email_vendor_registration AFTER INSERT ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.email_vendor_registration_event();

CREATE OR REPLACE FUNCTION public.email_buyer_registration_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _enabled boolean; _admin record;
BEGIN
  SELECT notify_admin_new_buyers INTO _enabled FROM public.email_delivery_settings WHERE id = true;
  IF NOT COALESCE(_enabled, false) OR EXISTS (SELECT 1 FROM public.vendors WHERE user_id = NEW.user_id) THEN RETURN NEW; END IF;
  FOR _admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    PERFORM public.enqueue_email_notification(
      'buyer:' || NEW.user_id::text || ':registered:admin:' || _admin.user_id::text,
      'admin.new_buyer', _admin.user_id, jsonb_build_object('buyer_id', NEW.user_id));
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_email_buyer_registration ON public.profiles;
CREATE TRIGGER trg_email_buyer_registration AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.email_buyer_registration_event();

CREATE OR REPLACE FUNCTION public.email_report_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _admin record;
BEGIN
  FOR _admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    PERFORM public.enqueue_email_notification(
      'report:' || NEW.id::text || ':admin:' || _admin.user_id::text,
      'admin.content_report', _admin.user_id,
      jsonb_build_object('report_id', NEW.id, 'reporter_id', NEW.reporter_id, 'reason', NEW.reason,
                         'post_id', NEW.post_id, 'comment_id', NEW.comment_id));
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_email_content_report ON public.reports;
CREATE TRIGGER trg_email_content_report AFTER INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.email_report_event();

CREATE OR REPLACE FUNCTION public.email_support_update_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.admin_reply IS DISTINCT FROM OLD.admin_reply AND NEW.admin_reply IS NOT NULL THEN
    PERFORM public.enqueue_email_notification(
      'support:' || NEW.id::text || ':reply:' || NEW.updated_at::text,
      'user.support_reply', NEW.user_id,
      jsonb_build_object('ticket_id', NEW.id, 'subject', NEW.subject), NEW.email);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_email_support_update ON public.support_tickets;
CREATE TRIGGER trg_email_support_update AFTER UPDATE OF admin_reply ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.email_support_update_event();

CREATE OR REPLACE FUNCTION public.email_membership_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user_id uuid;
BEGIN
  IF NEW.status <> 'active' OR NEW.plan_slug NOT IN ('silver', 'premium') OR (TG_OP = 'UPDATE' AND NEW.plan_slug IS NOT DISTINCT FROM OLD.plan_slug
      AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at AND OLD.status = 'active') THEN RETURN NEW; END IF;
  SELECT user_id INTO _user_id FROM public.vendors WHERE id = NEW.vendor_id;
  PERFORM public.enqueue_email_notification(
    'supplier-membership:' || NEW.vendor_id::text || ':' || NEW.plan_slug || ':' || COALESCE(NEW.expires_at::text, 'no-expiry'),
    'vendor.membership_activated', _user_id,
    jsonb_build_object('vendor_id', NEW.vendor_id, 'plan_slug', NEW.plan_slug, 'expires_at', NEW.expires_at));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_email_membership_payment ON public.supplier_membership_payments;
DROP TRIGGER IF EXISTS trg_email_membership ON public.vendor_memberships;
CREATE TRIGGER trg_email_membership AFTER INSERT OR UPDATE OF plan_slug, status, expires_at ON public.vendor_memberships
  FOR EACH ROW EXECUTE FUNCTION public.email_membership_event();

CREATE OR REPLACE FUNCTION public.email_membership_payment_failure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user_id uuid;
BEGIN
  IF NEW.status <> 'failed' OR (TG_OP = 'UPDATE' AND OLD.status = 'failed') THEN RETURN NEW; END IF;
  SELECT user_id INTO _user_id FROM public.vendors WHERE id = NEW.vendor_id;
  PERFORM public.enqueue_email_notification(
    'supplier-membership:' || NEW.paystack_reference || ':failed',
    'vendor.membership_payment_failed', _user_id,
    jsonb_build_object('vendor_id', NEW.vendor_id, 'plan_slug', NEW.plan_slug,
                       'payment_id', NEW.id, 'payment_reference', NEW.paystack_reference));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_email_membership_payment_failure ON public.supplier_membership_payments;
CREATE TRIGGER trg_email_membership_payment_failure AFTER INSERT OR UPDATE OF status ON public.supplier_membership_payments
  FOR EACH ROW EXECUTE FUNCTION public.email_membership_payment_failure();

CREATE OR REPLACE FUNCTION public.queue_supplier_membership_expiry_emails()
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE _membership record; _queued integer := 0; _offset integer;
BEGIN
  FOR _membership IN
    SELECT m.vendor_id, m.plan_slug, m.expires_at, v.user_id
    FROM public.vendor_memberships m JOIN public.vendors v ON v.id = m.vendor_id
    WHERE m.status = 'active' AND m.plan_slug IN ('silver', 'premium')
      AND m.expires_at > now() AND m.expires_at <= now() + interval '7 days'
  LOOP
    _offset := CASE WHEN _membership.expires_at <= now() + interval '1 day' THEN 1 ELSE 7 END;
    PERFORM public.enqueue_email_notification(
      'membership-expiry:' || _membership.vendor_id::text || ':' || _membership.expires_at::text || ':' || _offset,
      'vendor.membership_expiring', _membership.user_id,
      jsonb_build_object('vendor_id', _membership.vendor_id, 'plan_slug', _membership.plan_slug,
                         'expires_at', _membership.expires_at, 'days_left', _offset));
    _queued := _queued + 1;
  END LOOP;
  RETURN _queued;
END $$;
REVOKE ALL ON FUNCTION public.queue_supplier_membership_expiry_emails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_supplier_membership_expiry_emails() TO service_role;

CREATE OR REPLACE FUNCTION public.email_dispute_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _vendor_user uuid; _admin record; _event_type text;
BEGIN
  SELECT user_id INTO _vendor_user FROM public.vendors WHERE id = NEW.vendor_id;
  _event_type := CASE WHEN TG_OP = 'INSERT' THEN 'opened' ELSE NEW.status END;
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.enqueue_email_notification(
      'dispute:' || NEW.id::text || ':' || _event_type || ':buyer', 'buyer.dispute_update', NEW.buyer_id,
      jsonb_build_object('dispute_id', NEW.id, 'order_id', NEW.order_id, 'status', _event_type));
    PERFORM public.enqueue_email_notification(
      'dispute:' || NEW.id::text || ':' || _event_type || ':vendor', 'vendor.dispute_update', _vendor_user,
      jsonb_build_object('dispute_id', NEW.id, 'order_id', NEW.order_id, 'status', _event_type));
    IF TG_OP = 'INSERT' THEN
      FOR _admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
        PERFORM public.enqueue_email_notification(
          'dispute:' || NEW.id::text || ':opened:admin:' || _admin.user_id::text,
          'admin.dispute_opened', _admin.user_id,
          jsonb_build_object('dispute_id', NEW.id, 'order_id', NEW.order_id, 'vendor_id', NEW.vendor_id));
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_email_dispute_event ON public.disputes;
CREATE TRIGGER trg_email_dispute_event AFTER INSERT OR UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.email_dispute_event();

CREATE OR REPLACE FUNCTION public.queue_email_refund_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user_id uuid; _email text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('processed', 'failed') THEN RETURN NEW; END IF;
  SELECT user_id, email INTO _user_id, _email FROM public.orders WHERE id = NEW.order_id;
  PERFORM public.enqueue_email_notification(
    'refund:' || NEW.id::text || ':' || NEW.status,
    CASE NEW.status WHEN 'processed' THEN 'buyer.refund_processed' ELSE 'buyer.refund_failed' END,
    _user_id, jsonb_build_object('refund_id', NEW.id, 'order_id', NEW.order_id, 'amount', NEW.amount,
                                 'reason', NEW.reason, 'status', NEW.status), _email);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_email_refund_event ON public.refunds;
CREATE TRIGGER trg_email_refund_event AFTER UPDATE OF status ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.queue_email_refund_event();

CREATE OR REPLACE FUNCTION public.email_vendor_payout_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user_id uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('paid', 'failed', 'reversed') THEN RETURN NEW; END IF;
  SELECT user_id INTO _user_id FROM public.vendors WHERE id = NEW.vendor_id;
  PERFORM public.enqueue_email_notification(
    'payout:' || NEW.id::text || ':' || NEW.status,
    CASE NEW.status WHEN 'paid' THEN 'vendor.payout_paid' ELSE 'vendor.payout_issue' END,
    _user_id,
    jsonb_build_object('payout_id', NEW.id, 'amount', NEW.amount, 'status', NEW.status, 'reason', NEW.failure_reason));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_email_vendor_payout ON public.payouts;
CREATE TRIGGER trg_email_vendor_payout AFTER UPDATE OF status ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.email_vendor_payout_event();

