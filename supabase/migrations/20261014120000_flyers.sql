-- =====================================================================
-- Admin-managed flyers (promo images)
--   * public.flyers  : one row per flyer image, with placement + schedule
--   * storage bucket : "flyers" (public read, admin-only write)
-- Shoppers can only read flyers that are active and inside their
-- start/end window. Only admins can create, change or delete flyers.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.flyers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  placement        text NOT NULL,
  image_url        text NOT NULL,
  mobile_image_url text,
  link_url         text,
  sort_order       integer NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  starts_at        timestamptz,
  ends_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flyers DROP CONSTRAINT IF EXISTS flyers_placement_check;
ALTER TABLE public.flyers ADD CONSTRAINT flyers_placement_check
  CHECK (placement IN ('header_strip', 'hero_slide', 'hero_side', 'row_banner', 'feed_banner', 'feed_card'));

-- A link must be a site path ("/products") or an https URL. Blocks
-- javascript: links and protocol-relative "//host" links.
ALTER TABLE public.flyers DROP CONSTRAINT IF EXISTS flyers_link_check;
ALTER TABLE public.flyers ADD CONSTRAINT flyers_link_check
  CHECK (link_url IS NULL OR link_url ~ '^(/($|[^/])|https://)');

ALTER TABLE public.flyers DROP CONSTRAINT IF EXISTS flyers_window_check;
ALTER TABLE public.flyers ADD CONSTRAINT flyers_window_check
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at);

CREATE INDEX IF NOT EXISTS idx_flyers_placement ON public.flyers (placement, sort_order);

DROP TRIGGER IF EXISTS update_flyers_updated_at ON public.flyers;
CREATE TRIGGER update_flyers_updated_at
  BEFORE UPDATE ON public.flyers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.flyers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view live flyers" ON public.flyers;
CREATE POLICY "Anyone can view live flyers" ON public.flyers
  FOR SELECT
  USING (
    is_active
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );

DROP POLICY IF EXISTS "Admins manage flyers" ON public.flyers;
CREATE POLICY "Admins manage flyers" ON public.flyers
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- Storage: public bucket, only admins may upload / replace / delete
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('flyers', 'flyers', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

DROP POLICY IF EXISTS "Anyone can view flyer images" ON storage.objects;
CREATE POLICY "Anyone can view flyer images" ON storage.objects
  FOR SELECT USING (bucket_id = 'flyers');

DROP POLICY IF EXISTS "Admins upload flyer images" ON storage.objects;
CREATE POLICY "Admins upload flyer images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'flyers' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update flyer images" ON storage.objects;
CREATE POLICY "Admins update flyer images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'flyers' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete flyer images" ON storage.objects;
CREATE POLICY "Admins delete flyer images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'flyers' AND public.has_role(auth.uid(), 'admin'));
