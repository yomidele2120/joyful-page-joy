CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('t.uid', true), '')::uuid $$;
CREATE FUNCTION public.has_role(u uuid, r text) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('t.admin', true) = 'on' $$;
CREATE TABLE public.vendors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, store_name text);
CREATE TABLE public.categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, description text, image_url text, images text[],
  category_id uuid, vendor_id uuid, brand text, is_active boolean DEFAULT true);
