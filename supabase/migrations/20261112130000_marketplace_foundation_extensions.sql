CREATE TABLE IF NOT EXISTS public.ai_feature_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  description_generation_enabled boolean NOT NULL DEFAULT false,
  listing_enhancement_enabled boolean NOT NULL DEFAULT false,
  categorization_enabled boolean NOT NULL DEFAULT false,
  search_enhancement_enabled boolean NOT NULL DEFAULT false,
  recommendation_enabled boolean NOT NULL DEFAULT false,
  creative_generation_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ai_feature_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.marketplace_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) > 0),
  placement text NOT NULL DEFAULT 'homepage' CHECK (placement IN ('homepage','category','search','recommendations')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','approved','active','paused','rejected','ended')),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  start_at timestamptz,
  end_at timestamptz,
  budget numeric(14,2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
  spend numeric(14,2) NOT NULL DEFAULT 0 CHECK (spend >= 0),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_campaign_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketplace_campaigns(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'banner' CHECK (kind IN ('banner','product','story','social_post')),
  image_url text,
  headline text,
  body text,
  cta_label text,
  cta_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','approved','rejected','published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('meta','facebook','instagram','tiktok','google')),
  account_id text NOT NULL,
  account_name text,
  account_username text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected','expired','revoked','disconnected','pending')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, provider, account_id)
);

CREATE TABLE IF NOT EXISTS public.risk_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('user','vendor','order','listing','payment','message','report')),
  reason text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.risk_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_flag_id uuid NOT NULL REFERENCES public.risk_flags(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_note text,
  case_status text NOT NULL DEFAULT 'open' CHECK (case_status IN ('open','under_review','action_taken','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.legal_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (char_length(slug) BETWEEN 2 AND 80),
  title text NOT NULL,
  summary text,
  body_markdown text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_feature_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_campaign_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage AI settings" ON public.ai_feature_settings;
CREATE POLICY "Admins manage AI settings" ON public.ai_feature_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Vendors manage own campaigns" ON public.marketplace_campaigns;
CREATE POLICY "Vendors manage own campaigns" ON public.marketplace_campaigns
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Admins manage campaigns" ON public.marketplace_campaigns;
CREATE POLICY "Admins manage campaigns" ON public.marketplace_campaigns
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Vendors manage own campaign creatives" ON public.marketplace_campaign_creatives;
CREATE POLICY "Vendors manage own campaign creatives" ON public.marketplace_campaign_creatives
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_campaigns c
      JOIN public.vendors v ON v.id = c.vendor_id
      WHERE c.id = campaign_id AND v.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplace_campaigns c
      JOIN public.vendors v ON v.id = c.vendor_id
      WHERE c.id = campaign_id AND v.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Admins manage campaign creatives" ON public.marketplace_campaign_creatives;
CREATE POLICY "Admins manage campaign creatives" ON public.marketplace_campaign_creatives
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Vendors see own social accounts" ON public.vendor_social_accounts;
CREATE POLICY "Vendors see own social accounts" ON public.vendor_social_accounts
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Vendors manage own social accounts" ON public.vendor_social_accounts;
CREATE POLICY "Vendors manage own social accounts" ON public.vendor_social_accounts
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Admins manage social accounts" ON public.vendor_social_accounts;
CREATE POLICY "Admins manage social accounts" ON public.vendor_social_accounts
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read risk flags" ON public.risk_flags;
CREATE POLICY "Admins read risk flags" ON public.risk_flags
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage risk flags" ON public.risk_flags;
CREATE POLICY "Admins manage risk flags" ON public.risk_flags
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read risk cases" ON public.risk_cases;
CREATE POLICY "Admins read risk cases" ON public.risk_cases
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage risk cases" ON public.risk_cases;
CREATE POLICY "Admins manage risk cases" ON public.risk_cases
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Public read published legal pages" ON public.legal_pages;
CREATE POLICY "Public read published legal pages" ON public.legal_pages
  FOR SELECT USING (status = 'published');
DROP POLICY IF EXISTS "Admins manage legal pages" ON public.legal_pages;
CREATE POLICY "Admins manage legal pages" ON public.legal_pages
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.ai_feature_settings, public.marketplace_campaigns, public.marketplace_campaign_creatives,
  public.vendor_social_accounts, public.risk_flags, public.risk_cases, public.legal_pages
  FROM PUBLIC, anon;
GRANT SELECT ON public.legal_pages TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_feature_settings, public.marketplace_campaigns,
  public.marketplace_campaign_creatives, public.vendor_social_accounts, public.risk_flags,
  public.risk_cases TO authenticated;

INSERT INTO public.legal_pages (slug, title, summary, body_markdown, status)
VALUES
  ('terms', 'Terms of Service', 'Marketplace terms for account use, listing rules, buyer and seller obligations.', '# Terms of Service\n\nThis is a placeholder for the legal marketplace terms. Final wording must be reviewed by legal counsel before launch.', 'draft'),
  ('privacy-policy', 'Privacy Policy', 'How buyer, vendor and marketplace data is handled.', '# Privacy Policy\n\nThis is a placeholder for the privacy policy. Final wording must be reviewed by legal counsel before launch.', 'draft'),
  ('vendor-agreement', 'Vendor Agreement', 'Supplier responsibilities for product accuracy, fulfillment and prohibited activity.', '# Vendor Agreement\n\nThis is a placeholder for the vendor agreement. Final wording must be reviewed by legal counsel before launch.', 'draft'),
  ('refund-policy', 'Refunds, Returns and Dispute Policy', 'Marketplace refund and dispute handling expectations.', '# Refunds, Returns and Dispute Policy\n\nThis is a placeholder for the refund and dispute policy. Final wording must be reviewed by legal counsel before launch.', 'draft'),
  ('advertising-policy', 'Advertising and Sponsored Content Policy', 'Rules for sponsored placement disclosures and campaign adherence.', '# Advertising and Sponsored Content Policy\n\nThis is a placeholder for the advertising policy. Final wording must be reviewed by legal counsel before launch.', 'draft'),
  ('ai-disclosure', 'AI Disclosure', 'How AI-generated content is used and where vendor review is required.', '# AI Disclosure\n\nAI-generated listing content must be reviewed by the vendor for accuracy before publication. This placeholder must be reviewed by legal counsel before launch.', 'draft')
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_default_legal_pages()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _count integer;
BEGIN
  INSERT INTO public.legal_pages (slug, title, summary, body_markdown, status)
  VALUES
    ('terms', 'Terms of Service', 'Marketplace terms for account use, listing rules, buyer and seller obligations.', '# Terms of Service\n\nThis is a placeholder for the legal marketplace terms. Final wording must be reviewed by legal counsel before launch.', 'draft'),
    ('privacy-policy', 'Privacy Policy', 'How buyer, vendor and marketplace data is handled.', '# Privacy Policy\n\nThis is a placeholder for the privacy policy. Final wording must be reviewed by legal counsel before launch.', 'draft'),
    ('vendor-agreement', 'Vendor Agreement', 'Supplier responsibilities for product accuracy, fulfillment and prohibited activity.', '# Vendor Agreement\n\nThis is a placeholder for the vendor agreement. Final wording must be reviewed by legal counsel before launch.', 'draft'),
    ('refund-policy', 'Refunds, Returns and Dispute Policy', 'Marketplace refund and dispute handling expectations.', '# Refunds, Returns and Dispute Policy\n\nThis is a placeholder for the refund and dispute policy. Final wording must be reviewed by legal counsel before launch.', 'draft'),
    ('advertising-policy', 'Advertising and Sponsored Content Policy', 'Rules for sponsored placement disclosures and campaign adherence.', '# Advertising and Sponsored Content Policy\n\nThis is a placeholder for the advertising policy. Final wording must be reviewed by legal counsel before launch.', 'draft'),
    ('ai-disclosure', 'AI Disclosure', 'How AI-generated content is used and where vendor review is required.', '# AI Disclosure\n\nAI-generated listing content must be reviewed by the vendor for accuracy before publication. This placeholder must be reviewed by legal counsel before launch.', 'draft')
  ON CONFLICT (slug) DO NOTHING;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END $$;
REVOKE ALL ON FUNCTION public.ensure_default_legal_pages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_default_legal_pages() TO service_role;

CREATE OR REPLACE FUNCTION public.create_risk_flag(
  _user_id uuid,
  _vendor_id uuid,
  _order_id uuid,
  _entity_type text,
  _reason text,
  _severity text,
  _evidence jsonb DEFAULT '{}'::jsonb,
  _created_by uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.risk_flags (user_id, vendor_id, order_id, entity_type, reason, severity, evidence, created_by)
  VALUES (_user_id, _vendor_id, _order_id, _entity_type, _reason, _severity, COALESCE(_evidence, '{}'::jsonb), _created_by)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.create_risk_flag(uuid, uuid, uuid, text, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_risk_flag(uuid, uuid, uuid, text, text, text, jsonb, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.open_risk_case(_risk_flag_id uuid, _assigned_to uuid DEFAULT NULL, _admin_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.risk_cases (risk_flag_id, assigned_to, admin_note, case_status)
  VALUES (_risk_flag_id, _assigned_to, _admin_note, 'open')
  RETURNING id INTO _id;
  UPDATE public.risk_flags SET status = 'reviewing', updated_at = now() WHERE id = _risk_flag_id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.open_risk_case(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_risk_case(uuid, uuid, text) TO service_role;
