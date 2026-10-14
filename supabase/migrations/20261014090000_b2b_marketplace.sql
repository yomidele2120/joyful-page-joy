-- =====================================================================
-- B2B marketplace upgrade
--   1. Product / vendor columns (MOQ, tiered pricing, specs, video)
--   2. Inquiries, RFQs and supplier quotes (with RLS)
--   3. Chat: product context on messages, security fixes, private media
--   4. Notifications for messages / inquiries / quotes
--   5. Server-side order pricing (tier price, MOQ, stock) + closing the
--      "client chooses the price" hole in checkout
-- Apply together with the matching frontend + edge function deploys.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Products & vendors
-- ---------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS moq integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'Piece',
  ADD COLUMN IF NOT EXISTS price_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS video_url text;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_moq_check;
ALTER TABLE public.products ADD CONSTRAINT products_moq_check CHECK (moq >= 1);
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_price_tiers_check;
ALTER TABLE public.products ADD CONSTRAINT products_price_tiers_check CHECK (jsonb_typeof(price_tiers) = 'array');
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_specs_check;
ALTER TABLE public.products ADD CONSTRAINT products_specs_check CHECK (jsonb_typeof(specs) = 'object');

-- price_tiers format: [{"min_qty": 10, "price": 2600}, {"min_qty": 20, "price": 2500}]
-- `price` is the unit price from the MOQ up to the first tier.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS year_established integer,
  ADD COLUMN IF NOT EXISTS location text;

CREATE INDEX IF NOT EXISTS idx_products_moq ON public.products (moq);

-- Unit price for a quantity: base price, overridden by the highest tier
-- whose min_qty has been reached.
CREATE OR REPLACE FUNCTION public.tier_price(_product_id uuid, _qty integer)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (t->>'price')::numeric
      FROM jsonb_array_elements(p.price_tiers) AS t
      WHERE (t->>'min_qty')::integer <= _qty
      ORDER BY (t->>'min_qty')::integer DESC
      LIMIT 1
    ),
    p.price
  )
  FROM public.products p
  WHERE p.id = _product_id;
$$;

-- ---------------------------------------------------------------------
-- 2. Inquiries
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'replied', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inquiries_buyer ON public.inquiries (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_vendor ON public.inquiries (vendor_id, created_at DESC);
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers can create own inquiries" ON public.inquiries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Buyers can view own inquiries" ON public.inquiries
  FOR SELECT TO authenticated USING (auth.uid() = buyer_id);
CREATE POLICY "Buyers can update own inquiries" ON public.inquiries
  FOR UPDATE TO authenticated USING (auth.uid() = buyer_id) WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Vendors can view inquiries sent to them" ON public.inquiries
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );
CREATE POLICY "Vendors can update inquiries sent to them" ON public.inquiries
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );
CREATE POLICY "Admins manage inquiries" ON public.inquiries
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Only the status may change on an existing inquiry.
CREATE OR REPLACE FUNCTION public.inquiries_status_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.buyer_id <> OLD.buyer_id OR NEW.vendor_id <> OLD.vendor_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.quantity <> OLD.quantity OR NEW.message <> OLD.message THEN
    RAISE EXCEPTION 'Only the inquiry status can be changed';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_inquiries_status_only ON public.inquiries;
CREATE TRIGGER trg_inquiries_status_only BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.inquiries_status_only();

-- ---------------------------------------------------------------------
-- 2b. RFQs and quotes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  description text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 4000),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'Piece',
  target_price numeric CHECK (target_price IS NULL OR target_price >= 0),
  destination text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);
CREATE INDEX IF NOT EXISTS idx_rfqs_status ON public.rfqs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfqs_buyer ON public.rfqs (buyer_id, created_at DESC);
ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers manage own RFQs" ON public.rfqs
  FOR ALL TO authenticated USING (auth.uid() = buyer_id) WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Approved vendors can view open RFQs" ON public.rfqs
  FOR SELECT TO authenticated USING (
    status = 'open' AND expires_at > now()
    AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.user_id = auth.uid() AND v.is_approved = true)
  );
CREATE POLICY "Admins manage RFQs" ON public.rfqs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.rfq_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  moq integer CHECK (moq IS NULL OR moq >= 1),
  lead_time text,
  message text CHECK (message IS NULL OR char_length(message) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, vendor_id)
);
CREATE INDEX IF NOT EXISTS idx_rfq_quotes_rfq ON public.rfq_quotes (rfq_id);
ALTER TABLE public.rfq_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors can quote open RFQs" ON public.rfq_quotes
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid() AND v.is_approved = true)
    AND EXISTS (SELECT 1 FROM public.rfqs r WHERE r.id = rfq_id AND r.status = 'open' AND r.expires_at > now())
  );
CREATE POLICY "Vendors can view own quotes" ON public.rfq_quotes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );
CREATE POLICY "Vendors can update own quotes" ON public.rfq_quotes
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );
CREATE POLICY "Buyers can view quotes on own RFQs" ON public.rfq_quotes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.rfqs r WHERE r.id = rfq_id AND r.buyer_id = auth.uid())
  );
CREATE POLICY "Admins manage quotes" ON public.rfq_quotes
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- 3. Chat
-- ---------------------------------------------------------------------
-- 3a. Product context on a message (shown as a product card in the thread)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

-- 3b. Only the recipient may update a message, and only is_read
DROP POLICY IF EXISTS "Recipients can mark as read" ON public.messages;
CREATE POLICY "Recipients can mark as read" ON public.messages
  FOR UPDATE
  USING (
    sender_id <> auth.uid() AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    )
  )
  WITH CHECK (
    sender_id <> auth.uid() AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.messages_only_read_flag()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content
     OR NEW.sender_id <> OLD.sender_id
     OR NEW.conversation_id <> OLD.conversation_id
     OR NEW.created_at <> OLD.created_at
     OR NEW.media_url IS DISTINCT FROM OLD.media_url
     OR NEW.media_type IS DISTINCT FROM OLD.media_type
     OR NEW.product_id IS DISTINCT FROM OLD.product_id THEN
    RAISE EXCEPTION 'Only is_read can be updated on a message';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_messages_only_read_flag ON public.messages;
CREATE TRIGGER trg_messages_only_read_flag BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_only_read_flag();

-- 3c. Private chat media: uploads go in the sender's own folder, and only
-- the owner or a participant of a conversation that references the file
-- can read it (the app serves it through short-lived signed URLs).
UPDATE storage.buckets SET public = false WHERE id = 'chat-media';
DROP POLICY IF EXISTS "Public can view chat media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chat media" ON storage.objects;

CREATE POLICY "Users upload chat media to own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Participants can view chat media" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.messages m
        JOIN public.conversations c ON c.id = m.conversation_id
        WHERE m.media_url IS NOT NULL
          AND position(storage.objects.name in m.media_url) > 0
          AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------
-- 4. Notifications
-- ---------------------------------------------------------------------
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow', 'like', 'comment', 'new_post', 'message', 'inquiry', 'quote'));

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _recipient uuid;
  _link text;
BEGIN
  SELECT CASE WHEN c.participant_1 = NEW.sender_id THEN c.participant_2 ELSE c.participant_1 END
    INTO _recipient
  FROM public.conversations c WHERE c.id = NEW.conversation_id;

  IF _recipient IS NULL THEN RETURN NEW; END IF;
  _link := '/messages?c=' || NEW.conversation_id::text;

  -- One unread notification per conversation is enough.
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.recipient_id = _recipient AND n.type = 'message' AND n.link = _link AND n.is_read = false
  ) THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, message, link)
    VALUES (_recipient, NEW.sender_id, 'message', 'You have a new message', _link);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_new_message ON public.messages;
CREATE TRIGGER trg_notify_new_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();

CREATE OR REPLACE FUNCTION public.notify_new_inquiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _vendor_user uuid;
BEGIN
  SELECT user_id INTO _vendor_user FROM public.vendors WHERE id = NEW.vendor_id;
  IF _vendor_user IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, vendor_id, message, link)
    VALUES (_vendor_user, NEW.buyer_id, 'inquiry', NEW.vendor_id, 'You received a new inquiry', '/inquiries');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_new_inquiry ON public.inquiries;
CREATE TRIGGER trg_notify_new_inquiry AFTER INSERT ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_inquiry();

CREATE OR REPLACE FUNCTION public.notify_new_quote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _buyer uuid; _title text; _vendor_user uuid;
BEGIN
  SELECT buyer_id, title INTO _buyer, _title FROM public.rfqs WHERE id = NEW.rfq_id;
  SELECT user_id INTO _vendor_user FROM public.vendors WHERE id = NEW.vendor_id;
  IF _buyer IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, vendor_id, message, link)
    VALUES (_buyer, _vendor_user, 'quote', NEW.vendor_id, 'New quote on your request: ' || left(_title, 80), '/rfq?id=' || NEW.rfq_id::text);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_new_quote ON public.rfq_quotes;
CREATE TRIGGER trg_notify_new_quote AFTER INSERT ON public.rfq_quotes
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_quote();

-- ---------------------------------------------------------------------
-- 5. Server-side order pricing
-- ---------------------------------------------------------------------
-- Previously the browser inserted the order total and item prices
-- directly, and the payment functions trusted them. Orders are now
-- created only through this function, which prices every line from the
-- database (tier price), enforces MOQ and stock, and applies VAT.
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
    VALUES (_order, _p.id, _qty, _price);
    _subtotal := _subtotal + (_price * _qty);
  END LOOP;

  _total := round(_subtotal * 1.075, 2); -- 7.5% VAT, same rate the checkout page shows
  UPDATE public.orders SET total = _total WHERE id = _order;

  RETURN jsonb_build_object('order_id', _order, 'subtotal', _subtotal, 'total', _total);
END $$;

REVOKE ALL ON FUNCTION public.create_order(jsonb, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(jsonb, text, text, text, text, text) TO authenticated;

-- Close direct client inserts so the total cannot be chosen by the buyer.
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create order items" ON public.order_items;
DROP POLICY IF EXISTS "Users can insert own order items" ON public.order_items;
