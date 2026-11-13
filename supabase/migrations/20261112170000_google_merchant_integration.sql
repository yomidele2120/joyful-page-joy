CREATE TABLE IF NOT EXISTS public.google_merchant_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  merchant_id text,
  account_email text,
  website_url text,
  target_country text NOT NULL DEFAULT 'NG',
  language text NOT NULL DEFAULT 'en',
  auto_sync boolean NOT NULL DEFAULT true,
  is_connected boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.google_merchant_settings (
  id, merchant_id, account_email, website_url, target_country, language, auto_sync, is_connected
)
VALUES (true, NULL, NULL, NULL, 'NG', 'en', true, false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.google_merchant_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  merchant_product_id text,
  external_product_id text,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  approval_status text NOT NULL DEFAULT 'pending',
  rejection_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.google_merchant_sync_logs (
  id bigserial PRIMARY KEY,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_merchant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_merchant_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_merchant_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage Google Merchant settings" ON public.google_merchant_settings;
CREATE POLICY "Admins manage Google Merchant settings" ON public.google_merchant_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage Google Merchant products" ON public.google_merchant_products;
CREATE POLICY "Admins manage Google Merchant products" ON public.google_merchant_products
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read Google Merchant logs" ON public.google_merchant_sync_logs;
CREATE POLICY "Admins read Google Merchant logs" ON public.google_merchant_sync_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins insert Google Merchant logs" ON public.google_merchant_sync_logs;
CREATE POLICY "Admins insert Google Merchant logs" ON public.google_merchant_sync_logs
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.google_merchant_settings, public.google_merchant_products, public.google_merchant_sync_logs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_merchant_settings, public.google_merchant_products, public.google_merchant_sync_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_google_merchant_defaults()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.google_merchant_settings (id, merchant_id, account_email, website_url, target_country, language, auto_sync, is_connected)
  VALUES (true, NULL, NULL, NULL, 'NG', 'en', true, false)
  ON CONFLICT (id) DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.ensure_google_merchant_defaults() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_google_merchant_defaults() TO service_role;
