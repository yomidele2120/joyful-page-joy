-- Supplier plans are separate from platform_subscriptions, which tracks the
-- services the marketplace itself pays for.
CREATE TABLE IF NOT EXISTS public.supplier_membership_plans (
  slug text PRIMARY KEY CHECK (slug IN ('free', 'silver', 'premium')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  price_kobo bigint CHECK (price_kobo IS NULL OR price_kobo >= 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  period_days integer CHECK (period_days IS NULL OR period_days BETWEEN 1 AND 366),
  visibility_boost smallint NOT NULL DEFAULT 0 CHECK (visibility_boost BETWEEN 0 AND 100),
  features jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(features) = 'object'),
  is_active boolean NOT NULL DEFAULT true,
  purchase_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT free_plan_has_no_price CHECK (slug <> 'free' OR price_kobo = 0),
  CONSTRAINT paid_plan_has_billing_period CHECK (slug = 'free' OR period_days IS NOT NULL)
);

INSERT INTO public.supplier_membership_plans
  (slug, name, price_kobo, period_days, visibility_boost, features, purchase_enabled)
VALUES
  ('free', 'Free', 0, NULL, 0, '{}'::jsonb, true),
  ('silver', 'Silver', NULL, 30, 10, '{}'::jsonb, false),
  ('premium', 'Premium', NULL, 30, 20, '{}'::jsonb, false)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.supplier_membership_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read active supplier plans" ON public.supplier_membership_plans;
CREATE POLICY "Anyone can read active supplier plans" ON public.supplier_membership_plans
  FOR SELECT TO anon, authenticated USING (is_active OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage supplier plans" ON public.supplier_membership_plans;
CREATE POLICY "Admins manage supplier plans" ON public.supplier_membership_plans
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.supplier_membership_plans FROM PUBLIC;
GRANT SELECT ON public.supplier_membership_plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.supplier_membership_plans TO authenticated;

CREATE TABLE IF NOT EXISTS public.vendor_memberships (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  plan_slug text NOT NULL DEFAULT 'free' REFERENCES public.supplier_membership_plans(slug),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  period_started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (plan_slug <> 'free' OR expires_at IS NULL)
);

CREATE TABLE IF NOT EXISTS public.supplier_membership_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  plan_slug text NOT NULL REFERENCES public.supplier_membership_plans(slug),
  paystack_reference text NOT NULL UNIQUE,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  period_days integer NOT NULL CHECK (period_days BETWEEN 1 AND 366),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_supplier_membership_payments_vendor
  ON public.supplier_membership_payments (vendor_id, created_at DESC);

ALTER TABLE public.vendor_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_membership_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors read own membership" ON public.vendor_memberships;
CREATE POLICY "Vendors read own membership" ON public.vendor_memberships
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
DROP POLICY IF EXISTS "Vendors read own membership payments" ON public.supplier_membership_payments;
CREATE POLICY "Vendors read own membership payments" ON public.supplier_membership_payments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
DROP POLICY IF EXISTS "Admins manage vendor memberships" ON public.vendor_memberships;
CREATE POLICY "Admins manage vendor memberships" ON public.vendor_memberships
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.vendor_memberships, public.supplier_membership_payments FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.vendor_memberships, public.supplier_membership_payments FROM authenticated;
GRANT SELECT ON public.vendor_memberships, public.supplier_membership_payments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vendor_memberships TO authenticated;

-- The effective tier is derived at read time, so expiry always falls back to
-- Free without relying on a scheduled job.
CREATE OR REPLACE FUNCTION public.effective_supplier_plan(_vendor_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN m.status = 'active' AND (m.expires_at IS NULL OR m.expires_at > now())
         AND p.is_active THEN m.plan_slug
    ELSE 'free'
  END
  FROM public.vendor_memberships m
  JOIN public.supplier_membership_plans p ON p.slug = m.plan_slug
  WHERE m.vendor_id = _vendor_id
  UNION ALL
  SELECT 'free'
  WHERE NOT EXISTS (SELECT 1 FROM public.vendor_memberships WHERE vendor_id = _vendor_id)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.supplier_visibility_boost(_vendor_id uuid)
RETURNS smallint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT p.visibility_boost
    FROM public.supplier_membership_plans p
    WHERE p.slug = public.effective_supplier_plan(_vendor_id)
  ), 0)::smallint;
$$;
REVOKE ALL ON FUNCTION public.effective_supplier_plan(uuid), public.supplier_visibility_boost(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_supplier_plan(uuid), public.supplier_visibility_boost(uuid) TO anon, authenticated;

-- Only trusted server code can mark a provider payment successful. The amount
-- and currency are compared against the immutable checkout record, and repeat
-- webhooks are harmless.
CREATE OR REPLACE FUNCTION public.finalize_supplier_membership_payment(
  _reference text,
  _amount_kobo bigint,
  _currency text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _payment public.supplier_membership_payments%ROWTYPE;
  _period_start timestamptz := now();
  _expires_at timestamptz;
BEGIN
  SELECT * INTO _payment
  FROM public.supplier_membership_payments
  WHERE paystack_reference = _reference
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;
  IF _payment.status = 'success' THEN RETURN true; END IF;
  IF _payment.status <> 'pending'
     OR _payment.amount_kobo <> _amount_kobo
     OR _payment.currency <> _currency THEN
    RETURN false;
  END IF;

  PERFORM 1 FROM public.vendors WHERE id = _payment.vendor_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.supplier_membership_payments
  SET status = 'success', paid_at = now()
  WHERE id = _payment.id;

  SELECT GREATEST(COALESCE(expires_at, now()), now()) INTO _period_start
  FROM public.vendor_memberships
  WHERE vendor_id = _payment.vendor_id AND status = 'active'
  FOR UPDATE;
  _period_start := COALESCE(_period_start, now());
  _expires_at := _period_start + make_interval(days => _payment.period_days);

  INSERT INTO public.vendor_memberships
    (vendor_id, plan_slug, status, period_started_at, expires_at, updated_at)
  VALUES (_payment.vendor_id, _payment.plan_slug, 'active', _period_start, _expires_at, now())
  ON CONFLICT (vendor_id) DO UPDATE SET
    plan_slug = EXCLUDED.plan_slug,
    status = 'active',
    period_started_at = EXCLUDED.period_started_at,
    expires_at = EXCLUDED.expires_at,
    updated_at = now();

  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finalize_supplier_membership_payment(text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_supplier_membership_payment(text, bigint, text) TO service_role;