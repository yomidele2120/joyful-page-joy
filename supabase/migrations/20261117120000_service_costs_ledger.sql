-- Subscription & API usage: fixed service records (read-only) + a ledger of every AI call.
-- Run after 20261114180000_ai_product_assist.sql and 20261116070000_ai_ad_images.sql. Safe to run twice.
-- Nothing here changes existing subscriptions, plans, ad wallets or payment tables.

-- 1. Fixed records. Only admins can read; nobody can change them from the app (no INSERT/UPDATE/DELETE grants at all).
CREATE TABLE IF NOT EXISTS public.service_allocations (
  service_key text PRIMARY KEY,
  service_name text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('NGN', 'USD')),
  monthly_allocation numeric(14,2),                       -- NGN services only
  billing_months integer,
  annual_allocation numeric(14,2),                        -- monthly x months (NGN) or the displayed USD credit
  payment_status text NOT NULL,
  actual_amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  funded_balance numeric(14,2),                           -- OpenAI: what was really paid in (USD)
  sort_order integer NOT NULL DEFAULT 0,
  note text
);
ALTER TABLE public.service_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read service allocations" ON public.service_allocations;
CREATE POLICY "Admins read service allocations" ON public.service_allocations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.service_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_allocations TO authenticated;

INSERT INTO public.service_allocations
  (service_key, service_name, currency, monthly_allocation, billing_months, annual_allocation, payment_status, actual_amount_paid, funded_balance, sort_order, note)
VALUES
  ('cloudinary', 'Cloudinary', 'NGN', 7000, 12, 84000, 'Free tier', 0, NULL, 1, 'Allocation is a budget line; nothing is being charged.'),
  ('resend', 'Resend', 'NGN', 7000, 12, 84000, 'Free tier', 0, NULL, 2, 'Allocation is a budget line; nothing is being charged.'),
  ('openai', 'OpenAI API', 'USD', NULL, NULL, 170, 'Prepaid credit', 0, 170, 3, 'One funded amount: $170. Actual API cost is deducted from it.')
ON CONFLICT (service_key) DO UPDATE
  SET funded_balance = 170, annual_allocation = 170, note = EXCLUDED.note
  WHERE public.service_allocations.service_key = 'openai';   -- also fixes the earlier $99 figure if this file was already run

-- 2. Rates used to turn token counts into dollars (text models only). Server-side, admin-readable.
--    These are ESTIMATES: OpenAI's reply carries token counts, not dollars. Check them against OpenAI's pricing page.
CREATE TABLE IF NOT EXISTS public.ai_model_pricing (
  model_prefix text PRIMARY KEY,                           -- '*' is the fallback
  input_usd_per_million numeric(10,4) NOT NULL CHECK (input_usd_per_million >= 0),
  output_usd_per_million numeric(10,4) NOT NULL CHECK (output_usd_per_million >= 0)
);
ALTER TABLE public.ai_model_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read ai pricing" ON public.ai_model_pricing;
CREATE POLICY "Admins read ai pricing" ON public.ai_model_pricing FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.ai_model_pricing FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_model_pricing TO authenticated;
INSERT INTO public.ai_model_pricing (model_prefix, input_usd_per_million, output_usd_per_million) VALUES ('*', 0.50, 2.00)
ON CONFLICT (model_prefix) DO NOTHING;

-- 3. The ledger. One row per OpenAI request. The 2x service charge is a generated column, so it cannot drift from the cost.
CREATE TABLE IF NOT EXISTS public.ai_cost_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,                    -- OpenAI's x-request-id: the same call can never be booked twice
  created_at timestamptz NOT NULL DEFAULT now(),
  service text NOT NULL CHECK (service IN ('image_generation', 'text_generation', 'image_review', 'prompt_moderation')),
  feature text,                                            -- which product feature asked (listing_assist, seasonal_hero, ...)
  model text,
  status text NOT NULL CHECK (status IN ('succeeded', 'failed')),
  user_id uuid,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  input_tokens integer,
  output_tokens integer,
  images integer NOT NULL DEFAULT 0,
  actual_cost_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK (actual_cost_usd >= 0),
  billing_multiplier numeric(4,2) NOT NULL DEFAULT 2 CHECK (billing_multiplier = 2),
  service_charge_usd numeric(12,6) GENERATED ALWAYS AS (actual_cost_usd * billing_multiplier) STORED
);
CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_time ON public.ai_cost_ledger (created_at DESC);
ALTER TABLE public.ai_cost_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read ai ledger" ON public.ai_cost_ledger;
CREATE POLICY "Admins read ai ledger" ON public.ai_cost_ledger FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.ai_cost_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_cost_ledger TO authenticated;

-- 4. Write path: only the edge functions (service role) can call this. Cost and charge are worked out here, never in a browser.
CREATE OR REPLACE FUNCTION public.record_ai_usage(
  _key text, _service text, _feature text, _model text, _status text,
  _user uuid, _vendor uuid, _input_tokens integer, _output_tokens integer, _images integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cost numeric := 0; _in numeric; _out numeric; _uid uuid := _user; _id uuid;
BEGIN
  IF _status NOT IN ('succeeded', 'failed') THEN RAISE EXCEPTION 'bad status'; END IF;
  IF _status = 'succeeded' THEN               -- a failed request is not billed by OpenAI
    IF _service = 'image_generation' THEN
      SELECT coalesce(ai_cost_per_image_usd, 0.04) INTO _cost FROM public.advertising_settings WHERE id;
      _cost := coalesce(_cost, 0.04) * greatest(coalesce(_images, 1), 1);
    ELSIF _service IN ('text_generation', 'image_review') THEN
      SELECT input_usd_per_million, output_usd_per_million INTO _in, _out FROM public.ai_model_pricing
       WHERE model_prefix <> '*' AND _model LIKE model_prefix || '%' ORDER BY length(model_prefix) DESC LIMIT 1;
      IF _in IS NULL THEN SELECT input_usd_per_million, output_usd_per_million INTO _in, _out FROM public.ai_model_pricing WHERE model_prefix = '*'; END IF;
      _cost := (coalesce(_input_tokens, 0) * coalesce(_in, 0) + coalesce(_output_tokens, 0) * coalesce(_out, 0)) / 1000000.0;
    END IF;                                    -- prompt_moderation: OpenAI's moderation endpoint is free
  END IF;
  IF _uid IS NULL AND _vendor IS NOT NULL THEN SELECT user_id INTO _uid FROM public.vendors WHERE id = _vendor; END IF;
  INSERT INTO public.ai_cost_ledger (idempotency_key, service, feature, model, status, user_id, vendor_id, input_tokens, output_tokens, images, actual_cost_usd)
  VALUES (left(_key, 120), _service, left(_feature, 60), left(_model, 80), _status, _uid, _vendor, _input_tokens, _output_tokens, coalesce(_images, 0), round(_cost, 6))
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO _id;
  RETURN _id;                                  -- NULL means this call was already booked
END $$;
REVOKE ALL ON FUNCTION public.record_ai_usage(text, text, text, text, text, uuid, uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_usage(text, text, text, text, text, uuid, uuid, integer, integer, integer) TO service_role;

-- 5. Read path for the admin dashboard.
CREATE OR REPLACE FUNCTION public.admin_service_costs_summary() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _funded numeric; _alloc numeric; _spent numeric; _charges numeric; _n bigint; _since timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT funded_balance, annual_allocation INTO _funded, _alloc FROM public.service_allocations WHERE service_key = 'openai';
  SELECT coalesce(sum(actual_cost_usd), 0), coalesce(sum(service_charge_usd), 0), count(*), min(created_at)
    INTO _spent, _charges, _n, _since FROM public.ai_cost_ledger WHERE status = 'succeeded';
  RETURN jsonb_build_object(
    'services', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.sort_order), '[]'::jsonb) FROM public.service_allocations s),
    'openai_allocation_usd', _alloc,
    'openai_funded_usd', _funded,
    'actual_spend_usd', round(_spent, 4),
    'remaining_actual_usd', round(coalesce(_funded, 0) - _charges, 4),   -- the single $170 balance falls by the 2x charge
    'service_charges_usd', round(_charges, 4),
    'billed_calls', _n,
    'tracking_since', _since);
END $$;
REVOKE ALL ON FUNCTION public.admin_service_costs_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_service_costs_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_ai_ledger(_limit integer DEFAULT 50, _offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM public.ai_cost_ledger),
    'rows', (SELECT coalesce(jsonb_agg(r), '[]'::jsonb) FROM (
      SELECT l.id, l.created_at, l.service, l.feature, l.model, l.status, l.actual_cost_usd, l.service_charge_usd,
             coalesce(nullif(p.full_name, ''), v.store_name, 'System') AS user_label
        FROM public.ai_cost_ledger l
        LEFT JOIN public.profiles p ON p.user_id = l.user_id
        LEFT JOIN public.vendors v ON v.id = l.vendor_id
       ORDER BY l.created_at DESC LIMIT least(greatest(_limit, 1), 200) OFFSET greatest(_offset, 0)) r));
END $$;
REVOKE ALL ON FUNCTION public.admin_ai_ledger(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_ledger(integer, integer) TO authenticated;
