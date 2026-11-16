CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('t.uid', true), '')::uuid $$;
CREATE TABLE public.vendors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, store_name text);
CREATE TABLE public.advertising_settings (id boolean PRIMARY KEY DEFAULT true, ai_cost_per_image_usd numeric(8,4) DEFAULT 0.04);
INSERT INTO public.advertising_settings VALUES (true);
CREATE TABLE public.ad_wallet_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id), enabled boolean NOT NULL DEFAULT true);
INSERT INTO public.ad_wallet_settings (id) VALUES (true);
CREATE TABLE public.ad_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  kind text NOT NULL CHECK (kind IN ('topup', 'spend', 'adjustment')), amount_kobo bigint NOT NULL CHECK (amount_kobo <> 0),
  platform text, note text, topup_id uuid, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_sign CHECK ((kind = 'topup' AND amount_kobo > 0) OR (kind = 'spend' AND amount_kobo < 0) OR kind = 'adjustment'));
CREATE FUNCTION public.ad_wallet_balance_kobo(_vendor uuid) RETURNS bigint LANGUAGE sql STABLE AS $$ SELECT COALESCE(sum(amount_kobo),0)::bigint FROM public.ad_wallet_ledger WHERE vendor_id=_vendor $$;
CREATE FUNCTION public.ad_require_vendor() RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.vendors WHERE user_id = auth.uid() $$;
CREATE FUNCTION public.ad_require_admin() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
CREATE FUNCTION public.ad_entitlement(v uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"active":true,"features":{"external_ads_enabled":true}}'::jsonb $$;
