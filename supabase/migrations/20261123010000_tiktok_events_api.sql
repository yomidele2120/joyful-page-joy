-- TikTok Events API: attribution captured at checkout, an outbox of server-side events, and delivery logs.
-- Nothing here is readable by shoppers or suppliers. Only admins can read the log; only the server writes to it.

-- 1. What brought the buyer (TikTok click id, campaign tags) and whether they allowed marketing cookies.
CREATE TABLE IF NOT EXISTS public.order_attribution (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  marketing_consent boolean NOT NULL DEFAULT false,
  ttclid text, ttp text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text,
  ad_campaign_id uuid, ad_vendor_id uuid, ad_product_id uuid,
  user_agent text, page_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_attribution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read order attribution" ON public.order_attribution FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- The buyer's browser records the attribution for their own order, once, right after the order is created.
CREATE OR REPLACE FUNCTION public.record_order_attribution(
  _order_id uuid, _marketing_consent boolean, _ttclid text, _ttp text,
  _utm jsonb, _page_url text, _user_agent text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND OR _o.user_id IS DISTINCT FROM auth.uid() OR _o.status <> 'pending' THEN RETURN; END IF;
  INSERT INTO public.order_attribution (order_id, marketing_consent, ttclid, ttp, utm_source, utm_medium, utm_campaign, utm_content,
                                        ad_campaign_id, ad_vendor_id, ad_product_id, user_agent, page_url)
  VALUES (_order_id, COALESCE(_marketing_consent, false), left(_ttclid, 300), left(_ttp, 300),
          left(_utm->>'utm_source', 100), left(_utm->>'utm_medium', 100), left(_utm->>'utm_campaign', 200), left(_utm->>'utm_content', 200),
          CASE WHEN (_utm->>'ad_campaign') ~ '^[0-9a-f-]{36}$' THEN (_utm->>'ad_campaign')::uuid END,
          CASE WHEN (_utm->>'ad_vendor')   ~ '^[0-9a-f-]{36}$' THEN (_utm->>'ad_vendor')::uuid END,
          CASE WHEN (_utm->>'ad_product')  ~ '^[0-9a-f-]{36}$' THEN (_utm->>'ad_product')::uuid END,
          left(_user_agent, 400), left(_page_url, 500))
  ON CONFLICT (order_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.record_order_attribution(uuid, boolean, text, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_order_attribution(uuid, boolean, text, text, jsonb, text, text) TO authenticated;

-- 2. Outbox + delivery log. One row per event; (event_name, event_id) is unique so an event is never queued twice.
CREATE TABLE IF NOT EXISTS public.tiktok_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  event_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  attempts int NOT NULL DEFAULT 0,
  http_status int,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (event_name, event_id)
);
CREATE INDEX IF NOT EXISTS tiktok_event_log_status_idx ON public.tiktok_event_log (status, created_at);
ALTER TABLE public.tiktok_event_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read tiktok event log" ON public.tiktok_event_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. A payment the server has confirmed (any provider) queues CompletePayment; a paid preorder also queues SubmitForm.
--    Pending, failed, cancelled and refunded orders never reach 'paid', so they are never queued.
CREATE OR REPLACE FUNCTION public.queue_tiktok_payment_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    INSERT INTO public.tiktok_event_log (order_id, event_name, event_id)
    VALUES (NEW.id, 'CompletePayment', NEW.id::text) ON CONFLICT DO NOTHING;
    IF EXISTS (SELECT 1 FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id
               WHERE oi.order_id = NEW.id AND p.is_preorder) THEN
      INSERT INTO public.tiktok_event_log (order_id, event_name, event_id)
      VALUES (NEW.id, 'SubmitForm', NEW.id::text || ':preorder') ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_queue_tiktok_payment_event ON public.orders;
CREATE TRIGGER trg_queue_tiktok_payment_event AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.queue_tiktok_payment_event();
