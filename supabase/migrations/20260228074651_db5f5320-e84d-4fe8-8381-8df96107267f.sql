
-- Add missing columns to vendors table
ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS whatsapp_number text,
ADD COLUMN IF NOT EXISTS company_name text,
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS bank_account_number text,
ADD COLUMN IF NOT EXISTS bank_account_name text,
ADD COLUMN IF NOT EXISTS product_categories text[],
ADD COLUMN IF NOT EXISTS verification_document_url text;

-- Create storage bucket for vendor assets
INSERT INTO storage.buckets (id, name, public) VALUES ('vendor-assets', 'vendor-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for vendor assets
CREATE POLICY "Anyone can view vendor assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'vendor-assets');

CREATE POLICY "Authenticated users can upload vendor assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'vendor-assets');

CREATE POLICY "Users can update own vendor assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'vendor-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own vendor assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'vendor-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
