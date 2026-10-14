-- =====================================================================
-- SECURITY HARDENING
--   1. Vendor bank details + verification documents move to a private table / bucket
--   2. Vendors can no longer approve themselves or edit their own subaccount code
--   3. Vendor rows are only public once approved (owner and admins always see theirs)
--   4. User profiles (phone, address, city) are no longer readable by everyone
--   5. Storage: uploads limited to your own folder, file types and sizes capped
-- Safe to run more than once. Run it BEFORE deploying the matching frontend.
-- After running it, move old verification documents with scripts/move-vendor-docs.mjs.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Private vendor details
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_private (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  bank_name text,
  bank_account_number text,
  bank_account_name text,
  verification_document_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_private ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors read own private details" ON public.vendor_private;
CREATE POLICY "Vendors read own private details" ON public.vendor_private
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Vendors insert own private details" ON public.vendor_private;
CREATE POLICY "Vendors insert own private details" ON public.vendor_private
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Vendors update own private details" ON public.vendor_private;
CREATE POLICY "Vendors update own private details" ON public.vendor_private
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage vendor private details" ON public.vendor_private;
CREATE POLICY "Admins manage vendor private details" ON public.vendor_private
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_vendor_private_updated_at ON public.vendor_private;
CREATE TRIGGER update_vendor_private_updated_at BEFORE UPDATE ON public.vendor_private
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Copy the old public columns over, then drop them (skipped on a second run).
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vendors' AND column_name = 'bank_name'
  ) THEN
    INSERT INTO public.vendor_private
      (vendor_id, user_id, bank_name, bank_account_number, bank_account_name, verification_document_path)
    SELECT id, user_id, bank_name, bank_account_number, bank_account_name,
           NULLIF(regexp_replace(COALESCE(verification_document_url, ''), '^.*/vendor-assets/', ''), '')
    FROM public.vendors
    ON CONFLICT (vendor_id) DO NOTHING;

    ALTER TABLE public.vendors
      DROP COLUMN bank_name,
      DROP COLUMN bank_account_number,
      DROP COLUMN bank_account_name,
      DROP COLUMN verification_document_url;
  END IF;
END
$mig$;

-- ---------------------------------------------------------------------
-- 2. Stop vendors approving themselves
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_vendor_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid() is null for the SQL editor and edge functions (service role): allowed.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_approved := false;
    NEW.paystack_subaccount_code := NULL;
  ELSE
    NEW.is_approved := OLD.is_approved;
    NEW.paystack_subaccount_code := OLD.paystack_subaccount_code;
    NEW.user_id := OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_vendor_privileged_columns ON public.vendors;
CREATE TRIGGER trg_guard_vendor_privileged_columns
  BEFORE INSERT OR UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_privileged_columns();

-- ---------------------------------------------------------------------
-- 3. Vendor visibility: approved vendors are public, the rest only to owner / admin
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Vendors are publicly viewable" ON public.vendors;
DROP POLICY IF EXISTS "Anyone can view approved vendors" ON public.vendors;
DROP POLICY IF EXISTS "Vendors can view own record" ON public.vendors;

CREATE POLICY "Anyone can view approved vendors" ON public.vendors
  FOR SELECT USING (is_approved = true);
CREATE POLICY "Vendors can view own record" ON public.vendors
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- (the existing "Admins manage all vendors" policy already lets admins see everything)

-- ---------------------------------------------------------------------
-- 4. Profiles hold phone / address / city: no longer public
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Chat partners can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Vendors can view profiles of their buyers" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- The chat screen shows the other person's name and city.
CREATE POLICY "Chat partners can view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE (c.participant_1 = auth.uid() AND c.participant_2 = profiles.user_id)
         OR (c.participant_2 = auth.uid() AND c.participant_1 = profiles.user_id)
    )
  );

-- The vendor inquiry inbox shows the buyer's name.
CREATE POLICY "Vendors can view profiles of their buyers" ON public.profiles
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.inquiries i
      JOIN public.vendors v ON v.id = i.vendor_id
      WHERE v.user_id = auth.uid() AND i.buyer_id = profiles.user_id
    )
  );

-- ---------------------------------------------------------------------
-- 5. Storage
-- ---------------------------------------------------------------------
-- vendor-assets stays public (logos, product photos) but only images, capped size,
-- and uploads must go into your own folder (your user id, or one of your shop ids).
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif']
WHERE id = 'vendor-assets';

DROP POLICY IF EXISTS "Authenticated users can upload vendor assets" ON storage.objects;
DROP POLICY IF EXISTS "Users upload vendor assets to own folder" ON storage.objects;
CREATE POLICY "Users upload vendor assets to own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vendor-assets'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] IN (SELECT v.id::text FROM public.vendors v WHERE v.user_id = auth.uid())
    )
  );

-- Private bucket for ID / business verification documents.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('vendor-docs', 'vendor-docs', false, 10485760, ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png'];

DROP POLICY IF EXISTS "Vendors upload own documents" ON storage.objects;
CREATE POLICY "Vendors upload own documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vendor-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Vendors read own documents" ON storage.objects;
CREATE POLICY "Vendors read own documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'vendor-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Admins read vendor documents" ON storage.objects;
CREATE POLICY "Admins read vendor documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'vendor-docs' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Vendors replace own documents" ON storage.objects;
CREATE POLICY "Vendors replace own documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'vendor-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Vendors delete own documents" ON storage.objects;
CREATE POLICY "Vendors delete own documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'vendor-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
