CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE ROLE authenticated; CREATE ROLE anon;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('t.uid', true), '')::uuid $$;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
CREATE FUNCTION storage.foldername(n text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(n,'/') $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.vendors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, store_name text);
CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id uuid, is_active boolean DEFAULT true);
CREATE FUNCTION public.has_role(u uuid, r text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE public.external_ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  platform text NOT NULL, scope text NOT NULL, product_ids uuid[] NOT NULL DEFAULT '{}', objective text NOT NULL,
  budget_amount numeric(14,2), duration_days integer NOT NULL, spend_authorized boolean NOT NULL DEFAULT false,
  spend_authorized_at timestamptz, status text NOT NULL DEFAULT 'draft', status_detail text, created_at timestamptz DEFAULT now());
CREATE FUNCTION public.ad_require_vendor() RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.vendors WHERE user_id = auth.uid() $$;
CREATE FUNCTION public.ad_entitlement(v uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"active":true,"features":{"external_ads_enabled":true,"max_advertised_products":5}}'::jsonb $$;
CREATE FUNCTION public.vendor_request_external_campaign(text,text,uuid[],text,numeric,integer,boolean) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
