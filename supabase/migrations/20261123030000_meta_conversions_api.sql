-- Meta Conversions API: outbox + delivery log for confirmed purchases. Same design as the TikTok one.
-- The buyer's Meta browser ids (fbp, fbc) are stored with the order's attribution, only with marketing consent.
ALTER TABLE public.order_attribution ADD COLUMN IF NOT EXISTS fbp text, ADD COLUMN IF NOT EXISTS fbc text;

DROP FUNCTION IF EXISTS public.record_order_attribution(uuid, boolean, text, text, jsonb, text, text);
CREATE OR REPLACE FUNCTION public.record_order_attribution(
  _order_id uuid, _marketing_consent boolean, _ttclid text, _ttp text,
  _utm jsonb, _page_url text, _user_agent text, _fbp text DEFAULT NULL, _fbc text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND OR _o.user_id IS DISTINCT FROM auth.uid() OR _o.status <> 'pending' THEN RETURN; END IF;
  INSERT INTO public.order_attribution (order_id, marketing_consent, ttclid, ttp, fbp, fbc, utm_source, utm_medium, utm_campaign, utm_content,
                                        ad_campaign_id, ad_vendor_id, ad_product_id, user_agent, page_url)
  VALUES (_order_id, COALESCE(_marketing_consent, false), left(_ttclid, 300), left(_ttp, 300), left(_fbp, 300), left(_fbc, 300),
          left(_utm->>'utm_source', 100), left(_utm->>'utm_medium', 100), left(_utm->>'utm_campaign', 200), left(_utm->>'utm_content', 200),
          CASE WHEN (_utm->>'ad_campaign') ~ '^[0-9a-f-]{36}$' THEN (_utm->>'ad_campaign')::uuid END,
          CASE WHEN (_utm->>'ad_vendor')   ~ '^[0-9a-f-]{36}$' THEN (_utm->>'ad_vendor')::uuid END,
          CASE WHEN (_utm->>'ad_product')  ~ '^[0-9a-f-]{36}$' THEN (_utm->>'ad_product')::uuid END,
          left(_user_agent, 400), left(_page_url, 500))
  ON CONFLICT (order_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.record_order_attribution(uuid, boolean, text, text, jsonb, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_order_attribution(uuid, boolean, text, text, jsonb, text, text, text, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.meta_event_log (
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
CREATE INDEX IF NOT EXISTS meta_event_log_status_idx ON public.meta_event_log (status, created_at);
ALTER TABLE public.meta_event_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read meta event log" ON public.meta_event_log;
CREATE POLICY "Admins read meta event log" ON public.meta_event_log FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.queue_meta_purchase_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    INSERT INTO public.meta_event_log (order_id, event_name, event_id) VALUES (NEW.id, 'Purchase', NEW.id::text) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_queue_meta_purchase_event ON public.orders;
CREATE TRIGGER trg_queue_meta_purchase_event AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.queue_meta_purchase_event();
