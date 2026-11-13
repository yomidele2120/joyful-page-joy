CREATE TABLE IF NOT EXISTS public.product_ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
  suggestion_type text NOT NULL CHECK (suggestion_type IN (
    'listing_description',
    'category',
    'keywords',
    'search',
    'marketing_copy',
    'pricing'
  )),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'rejected', 'published')),
  suggested_text text,
  rationale text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_ai_suggestions_vendor_status_idx
  ON public.product_ai_suggestions (vendor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS product_ai_suggestions_product_idx
  ON public.product_ai_suggestions (product_id, created_at DESC);

ALTER TABLE public.product_ai_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors manage own AI suggestions" ON public.product_ai_suggestions;
CREATE POLICY "Vendors manage own AI suggestions" ON public.product_ai_suggestions
  FOR ALL TO authenticated USING (
    vendor_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()
    )
  )
  WITH CHECK (
    vendor_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Admins manage AI suggestions" ON public.product_ai_suggestions;
CREATE POLICY "Admins manage AI suggestions" ON public.product_ai_suggestions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.product_ai_suggestions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_ai_suggestions TO authenticated;

CREATE OR REPLACE FUNCTION public.create_product_ai_suggestion(
  _product_id uuid,
  _vendor_id uuid,
  _suggestion_type text,
  _suggested_text text,
  _rationale text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.product_ai_suggestions (
    product_id, vendor_id, suggestion_type, status, suggested_text, rationale, metadata
  ) VALUES (
    _product_id, _vendor_id, _suggestion_type, 'draft', _suggested_text, _rationale, COALESCE(_metadata, '{}'::jsonb)
  ) RETURNING id INTO _id;

  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.create_product_ai_suggestion(uuid, uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_product_ai_suggestion(uuid, uuid, text, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_product_ai_suggestion_ready(_suggestion_id uuid, _status text DEFAULT 'review')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _status NOT IN ('draft', 'review', 'approved', 'rejected', 'published') THEN
    RAISE EXCEPTION 'Unknown suggestion status';
  END IF;

  UPDATE public.product_ai_suggestions
  SET status = _status,
      updated_at = now()
  WHERE id = _suggestion_id;
END $$;
REVOKE ALL ON FUNCTION public.mark_product_ai_suggestion_ready(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_product_ai_suggestion_ready(uuid, text) TO service_role;
