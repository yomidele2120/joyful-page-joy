-- Complete the buyer/supplier workflows that build on the existing marketplace.

-- RFQ quote negotiation is append-only so both parties can see the full history.
CREATE TABLE IF NOT EXISTS public.rfq_negotiation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.rfq_quotes(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  action text NOT NULL CHECK (action IN ('counter', 'accepted', 'rejected', 'message')),
  unit_price numeric CHECK (unit_price IS NULL OR unit_price >= 0),
  quantity integer CHECK (quantity IS NULL OR quantity > 0),
  message text CHECK (message IS NULL OR char_length(message) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rfq_negotiation_quote ON public.rfq_negotiation_events (quote_id, created_at);
ALTER TABLE public.rfq_negotiation_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rfq_negotiation_event_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _buyer uuid;
  _vendor_user uuid;
  _rfq_status text;
  _expires_at timestamptz;
  _terminal boolean;
  _last_actor uuid;
  _last_action text;
BEGIN
  IF auth.uid() IS NULL OR NEW.actor_id <> auth.uid() THEN
    RAISE EXCEPTION 'Sign in to negotiate this quotation';
  END IF;

  PERFORM 1 FROM public.rfq_quotes WHERE id = NEW.quote_id FOR UPDATE;
  SELECT r.buyer_id, v.user_id, r.status, r.expires_at
    INTO _buyer, _vendor_user, _rfq_status, _expires_at
  FROM public.rfq_quotes q
  JOIN public.rfqs r ON r.id = q.rfq_id
  JOIN public.vendors v ON v.id = q.vendor_id
  WHERE q.id = NEW.quote_id;
  IF NOT FOUND OR auth.uid() NOT IN (_buyer, _vendor_user) THEN
    RAISE EXCEPTION 'You are not a participant in this negotiation';
  END IF;
  IF _rfq_status <> 'open' OR _expires_at <= now() THEN
    RAISE EXCEPTION 'This request is closed and can no longer be negotiated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.rfq_negotiation_events e
    WHERE e.quote_id = NEW.quote_id AND e.action IN ('accepted', 'rejected')
  ) INTO _terminal;
  IF _terminal THEN RAISE EXCEPTION 'This quotation negotiation has ended'; END IF;

  IF NEW.action = 'counter' AND (NEW.unit_price IS NULL OR NEW.quantity IS NULL) THEN
    RAISE EXCEPTION 'A counteroffer needs a price and quantity';
  END IF;
  IF NEW.action = 'rejected' AND auth.uid() <> _buyer THEN
    RAISE EXCEPTION 'Only the buyer can decline a supplier quotation';
  END IF;
  IF NEW.action = 'accepted' AND auth.uid() = _vendor_user THEN
    SELECT e.actor_id, e.action INTO _last_actor, _last_action
    FROM public.rfq_negotiation_events e
    WHERE e.quote_id = NEW.quote_id
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1;
    IF _last_actor IS DISTINCT FROM _buyer OR _last_action <> 'counter' THEN
      RAISE EXCEPTION 'A supplier can accept only a buyer counteroffer';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_rfq_negotiation_event_guard ON public.rfq_negotiation_events;
CREATE TRIGGER trg_rfq_negotiation_event_guard
  BEFORE INSERT ON public.rfq_negotiation_events
  FOR EACH ROW EXECUTE FUNCTION public.rfq_negotiation_event_guard();

DROP POLICY IF EXISTS "Negotiation participants read history" ON public.rfq_negotiation_events;
CREATE POLICY "Negotiation participants read history" ON public.rfq_negotiation_events
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.rfq_quotes q
      JOIN public.rfqs r ON r.id = q.rfq_id
      JOIN public.vendors v ON v.id = q.vendor_id
      WHERE q.id = quote_id AND (r.buyer_id = auth.uid() OR v.user_id = auth.uid())
    ) OR public.has_role(auth.uid(), 'admin')
  );
DROP POLICY IF EXISTS "Negotiation participants add history" ON public.rfq_negotiation_events;
CREATE POLICY "Negotiation participants add history" ON public.rfq_negotiation_events
  FOR INSERT TO authenticated WITH CHECK (
    actor_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.rfq_quotes q
      JOIN public.rfqs r ON r.id = q.rfq_id
      JOIN public.vendors v ON v.id = q.vendor_id
      WHERE q.id = quote_id AND (r.buyer_id = auth.uid() OR v.user_id = auth.uid())
    )
  );
REVOKE ALL ON public.rfq_negotiation_events FROM PUBLIC, anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.rfq_negotiation_events FROM authenticated;
REVOKE ALL ON FUNCTION public.rfq_negotiation_event_guard() FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.rfq_negotiation_events TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_rfq_negotiation_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rfq uuid;
  _buyer uuid;
  _vendor_user uuid;
  _recipient uuid;
  _link text;
  _notice text;
BEGIN
  SELECT r.id, r.buyer_id, v.user_id INTO _rfq, _buyer, _vendor_user
  FROM public.rfq_quotes q
  JOIN public.rfqs r ON r.id = q.rfq_id
  JOIN public.vendors v ON v.id = q.vendor_id
  WHERE q.id = NEW.quote_id;
  IF NEW.actor_id = _buyer THEN
    _recipient := _vendor_user;
    _link := '/rfq?tab=open';
    _notice := CASE NEW.action
      WHEN 'counter' THEN 'A buyer sent a counteroffer on your quotation.'
      WHEN 'accepted' THEN 'A buyer accepted your quotation.'
      WHEN 'rejected' THEN 'A buyer declined your quotation.'
      ELSE 'A buyer sent a message about your quotation.' END;
  ELSE
    _recipient := _buyer;
    _link := '/rfq?tab=mine&id=' || _rfq::text;
    _notice := CASE NEW.action
      WHEN 'counter' THEN 'A supplier sent a counteroffer on your request.'
      WHEN 'accepted' THEN 'A supplier accepted your counteroffer.'
      WHEN 'rejected' THEN 'A supplier declined your counteroffer.'
      ELSE 'A supplier sent a message about your quotation.' END;
  END IF;
  PERFORM public.notify_user(_recipient, 'quote', _notice, _link, NULL, NEW.actor_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_rfq_negotiation_event ON public.rfq_negotiation_events;
CREATE TRIGGER trg_notify_rfq_negotiation_event
  AFTER INSERT ON public.rfq_negotiation_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_rfq_negotiation_event();
REVOKE ALL ON FUNCTION public.notify_rfq_negotiation_event() FROM PUBLIC, anon, authenticated;

-- Mark product inquiries that are specifically requests for a sample; they use the
-- existing, permission-checked inquiry and supplier response workflow.
ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS inquiry_type text NOT NULL DEFAULT 'general'
  CHECK (inquiry_type IN ('general', 'sample'));
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS first_response_at timestamptz;
UPDATE public.inquiries SET first_response_at = updated_at WHERE status = 'replied' AND first_response_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inquiries_vendor_response
  ON public.inquiries (vendor_id, first_response_at) WHERE first_response_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews (product_id);

CREATE OR REPLACE FUNCTION public.inquiries_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN NEW.buyer_id := auth.uid(); END IF;
  NEW.status := 'open';
  NEW.first_response_at := NULL;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_inquiries_before_insert ON public.inquiries;
CREATE TRIGGER trg_inquiries_before_insert
  BEFORE INSERT ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.inquiries_before_insert();

CREATE OR REPLACE FUNCTION public.inquiries_status_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.buyer_id <> OLD.buyer_id OR NEW.vendor_id <> OLD.vendor_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.quantity <> OLD.quantity OR NEW.message <> OLD.message
     OR NEW.inquiry_type IS DISTINCT FROM OLD.inquiry_type THEN
    RAISE EXCEPTION 'Only the inquiry status can be changed';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = OLD.vendor_id AND v.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the supplier can update inquiry status';
  END IF;
  IF NEW.status = 'replied' AND OLD.status IS DISTINCT FROM 'replied' THEN
    NEW.first_response_at := COALESCE(NEW.first_response_at, OLD.first_response_at, now());
  ELSE
    NEW.first_response_at := OLD.first_response_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.inquiries_on_supplier_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _vendor uuid;
  _buyer uuid;
  _inquiry uuid;
BEGIN
  IF NEW.content ~ '^(Voice|Video) call( · [0-9]+:[0-9]{2}| declined| cancelled| · line busy| could not connect)$'
     OR NEW.content ~ '^Missed (voice|video) call$' THEN
    RETURN NEW;
  END IF;

  SELECT v.id, CASE WHEN c.participant_1 = NEW.sender_id THEN c.participant_2 ELSE c.participant_1 END
    INTO _vendor, _buyer
  FROM public.conversations c
  JOIN public.vendors v ON v.user_id = NEW.sender_id
  WHERE c.id = NEW.conversation_id
    AND NEW.sender_id IN (c.participant_1, c.participant_2);
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT i.id INTO _inquiry
  FROM public.inquiries i
  WHERE i.vendor_id = _vendor AND i.buyer_id = _buyer
    AND i.status = 'open' AND i.created_at <= NEW.created_at
  ORDER BY i.created_at DESC
  LIMIT 1;
  IF _inquiry IS NOT NULL THEN
    UPDATE public.inquiries
    SET status = 'replied', first_response_at = NEW.created_at
    WHERE id = _inquiry;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_inquiries_on_supplier_message ON public.messages;
CREATE TRIGGER trg_inquiries_on_supplier_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.inquiries_on_supplier_message();
REVOKE ALL ON FUNCTION public.inquiries_on_supplier_message() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_vendor_reputation(_vendor uuid)
RETURNS TABLE (average_rating numeric, review_count bigint, average_response_minutes integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT round(avg(rv.rating)::numeric, 1)
       FROM public.reviews rv
       JOIN public.products p ON p.id = rv.product_id
      WHERE p.vendor_id = _vendor),
    (SELECT count(*)
       FROM public.reviews rv
       JOIN public.products p ON p.id = rv.product_id
      WHERE p.vendor_id = _vendor),
    (SELECT round(avg(extract(epoch FROM (i.first_response_at - i.created_at)) / 60))::integer
       FROM public.inquiries i
      WHERE i.vendor_id = _vendor AND i.first_response_at IS NOT NULL AND i.first_response_at >= i.created_at);
$$;
REVOKE ALL ON FUNCTION public.get_vendor_reputation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_reputation(uuid) TO anon, authenticated;

-- Keep dispute evidence private while allowing the buyer, seller, and admins to review it.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dispute-evidence', 'dispute-evidence', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

DROP POLICY IF EXISTS "Dispute parties upload evidence" ON storage.objects;
CREATE POLICY "Dispute parties upload evidence" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'dispute-evidence'
    AND EXISTS (
      SELECT 1 FROM public.disputes d
      WHERE d.id::text = (storage.foldername(name))[1]
        AND d.buyer_id = auth.uid()
        AND (storage.foldername(name))[2] = auth.uid()::text
    )
  );
DROP POLICY IF EXISTS "Dispute parties read evidence" ON storage.objects;
CREATE POLICY "Dispute parties read evidence" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'dispute-evidence'
    AND EXISTS (
      SELECT 1 FROM public.disputes d
      JOIN public.vendors v ON v.id = d.vendor_id
      WHERE d.id::text = (storage.foldername(name))[1]
        AND (
          d.buyer_id = auth.uid()
          OR v.user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );
