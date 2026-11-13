CREATE TABLE IF NOT EXISTS public.site_seo_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  seo_indexing_enabled boolean NOT NULL DEFAULT true,
  sitemap_enabled boolean NOT NULL DEFAULT true,
  merchant_feed_enabled boolean NOT NULL DEFAULT false,
  canonical_host text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.site_seo_settings (id, seo_indexing_enabled, sitemap_enabled, merchant_feed_enabled)
VALUES (true, true, true, false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.social_integration_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  meta_enabled boolean NOT NULL DEFAULT false,
  instagram_enabled boolean NOT NULL DEFAULT false,
  tiktok_enabled boolean NOT NULL DEFAULT false,
  google_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.social_integration_settings (id, meta_enabled, instagram_enabled, tiktok_enabled, google_enabled)
VALUES (true, false, false, false, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_seo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_integration_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage SEO settings" ON public.site_seo_settings;
CREATE POLICY "Admins manage SEO settings" ON public.site_seo_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage social settings" ON public.social_integration_settings;
CREATE POLICY "Admins manage social settings" ON public.social_integration_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.site_seo_settings, public.social_integration_settings FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.site_seo_settings, public.social_integration_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_site_seo_defaults()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.site_seo_settings (id, seo_indexing_enabled, sitemap_enabled, merchant_feed_enabled)
  VALUES (true, true, true, false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.social_integration_settings (id, meta_enabled, instagram_enabled, tiktok_enabled, google_enabled)
  VALUES (true, false, false, false, false)
  ON CONFLICT (id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.ensure_site_seo_defaults() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_site_seo_defaults() TO service_role;
