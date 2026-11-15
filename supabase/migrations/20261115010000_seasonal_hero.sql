-- Monthly seasonal hero banners. Each month the AI paints five text-free pictures (three slider slides, two side tiles).
-- The words on them come from a fixed, hand-written list in the edge function and are drawn by the website, never by the AI.
-- The pictures are stored as ordinary rows in public.flyers (placements hero_slide / hero_side), so the existing hero
-- slider shows them with no other change.
-- Run after 20261014120000_flyers.sql and 20261114090000_vendor_advertising.sql (this uses ad_require_admin, ad_copy_is_safe, ad_notify_admins).

-- ---- words drawn over a generated picture
ALTER TABLE public.flyers
  ADD COLUMN IF NOT EXISTS headline text,
  ADD COLUMN IF NOT EXISTS subline text,
  ADD COLUMN IF NOT EXISTS cta_label text,
  ADD COLUMN IF NOT EXISTS season_key text,
  ADD COLUMN IF NOT EXISTS slot text,
  ADD COLUMN IF NOT EXISTS generated boolean NOT NULL DEFAULT false;
ALTER TABLE public.flyers DROP CONSTRAINT IF EXISTS flyers_copy_check;
ALTER TABLE public.flyers ADD CONSTRAINT flyers_copy_check CHECK (
  (headline IS NULL OR char_length(headline) BETWEEN 3 AND 80)
  AND (subline IS NULL OR char_length(subline) BETWEEN 3 AND 140)
  AND (cta_label IS NULL OR char_length(cta_label) BETWEEN 2 AND 30));
CREATE INDEX IF NOT EXISTS idx_flyers_generated ON public.flyers (season_key) WHERE generated;

-- ---- settings and run log
CREATE TABLE IF NOT EXISTS public.seasonal_hero_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  auto_publish boolean NOT NULL DEFAULT true,        -- true: the new set goes live by itself; false: it waits as switched-off flyers
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.seasonal_hero_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.seasonal_hero_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_key text NOT NULL UNIQUE CHECK (season_key ~ '^20[0-9][0-9]-(0[1-9]|1[0-2])$'),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  slots jsonb NOT NULL DEFAULT '[]'::jsonb,           -- finished pictures: [{slot, url, public_id, variant, model}]
  failures integer NOT NULL DEFAULT 0,
  error text CHECK (error IS NULL OR char_length(error) <= 500),
  cost_estimate_usd numeric(10,4) NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
ALTER TABLE public.seasonal_hero_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasonal_hero_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read seasonal hero settings" ON public.seasonal_hero_settings;
CREATE POLICY "Admins read seasonal hero settings" ON public.seasonal_hero_settings FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins read seasonal hero runs" ON public.seasonal_hero_runs;
CREATE POLICY "Admins read seasonal hero runs" ON public.seasonal_hero_runs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
-- no insert/update/delete policies: only the functions below (service role) change these tables

-- ---- start (or resume) the run for a month
CREATE OR REPLACE FUNCTION public.seasonal_hero_begin(_season text, _force boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.seasonal_hero_settings%ROWTYPE; _r public.seasonal_hero_runs%ROWTYPE;
BEGIN
  IF _season !~ '^20[0-9][0-9]-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Bad season.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('seasonal_hero'));
  SELECT * INTO _s FROM public.seasonal_hero_settings WHERE id;
  IF NOT _s.enabled AND NOT coalesce(_force, false) THEN RETURN jsonb_build_object('status', 'disabled'); END IF;
  SELECT * INTO _r FROM public.seasonal_hero_runs WHERE season_key = _season;
  IF FOUND THEN
    IF _r.status = 'succeeded' AND NOT coalesce(_force, false) THEN RETURN jsonb_build_object('status', 'already_done', 'run', _r.id); END IF;
    IF _r.status = 'failed' AND NOT coalesce(_force, false) THEN RETURN jsonb_build_object('status', 'failed', 'run', _r.id, 'error', _r.error); END IF;
    IF _r.status = 'running' AND _r.updated_at > now() - interval '8 minutes' AND NOT coalesce(_force, false) THEN
      RETURN jsonb_build_object('status', 'busy', 'run', _r.id); END IF;
    IF coalesce(_force, false) AND _r.status <> 'running' THEN
      UPDATE public.seasonal_hero_runs SET status = 'running', slots = '[]'::jsonb, failures = 0, error = NULL, published = false,
             started_at = now(), updated_at = now(), finished_at = NULL WHERE id = _r.id RETURNING * INTO _r;
    ELSE
      UPDATE public.seasonal_hero_runs SET status = 'running', updated_at = now() WHERE id = _r.id RETURNING * INTO _r;
    END IF;
  ELSE
    INSERT INTO public.seasonal_hero_runs (season_key) VALUES (_season) RETURNING * INTO _r;
  END IF;
  RETURN jsonb_build_object('status', 'started', 'run', _r.id, 'done', _r.slots, 'failures', _r.failures, 'cost', _r.cost_estimate_usd);
END $$;

-- ---- remember one finished picture (safe to repeat)
CREATE OR REPLACE FUNCTION public.seasonal_hero_save_slot(_run uuid, _slot jsonb, _cost numeric DEFAULT 0) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  IF coalesce(_slot ->> 'slot', '') !~ '^(slide|tile)-[1-3]$' OR coalesce(_slot ->> 'url', '') !~ '^https://' THEN RAISE EXCEPTION 'Bad slot.'; END IF;
  UPDATE public.seasonal_hero_runs
     SET slots = (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(slots) e WHERE e ->> 'slot' <> _slot ->> 'slot') || jsonb_build_array(_slot),
         cost_estimate_usd = cost_estimate_usd + greatest(0, coalesce(_cost, 0)), updated_at = now()
   WHERE id = _run AND status = 'running'
   RETURNING jsonb_array_length(slots) INTO _n;
  IF _n IS NULL THEN RAISE EXCEPTION 'Run is not open.'; END IF;
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.seasonal_hero_note_failure(_run uuid, _error text, _cost numeric DEFAULT 0) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _f integer;
BEGIN
  UPDATE public.seasonal_hero_runs
     SET failures = failures + 1, error = left(coalesce(_error, 'Unknown error'), 500), updated_at = now(),
         cost_estimate_usd = cost_estimate_usd + greatest(0, coalesce(_cost, 0))
   WHERE id = _run AND status = 'running' RETURNING failures INTO _f;
  RETURN coalesce(_f, 0);
END $$;

-- ---- give up on a run (too many failures): the previous month's banners stay on until their end date
CREATE OR REPLACE FUNCTION public.seasonal_hero_fail(_run uuid, _error text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _season text;
BEGIN
  UPDATE public.seasonal_hero_runs SET status = 'failed', error = left(coalesce(_error, 'Unknown error'), 500), finished_at = now(), updated_at = now()
   WHERE id = _run AND status = 'running' RETURNING season_key INTO _season;
  IF _season IS NOT NULL THEN
    PERFORM public.ad_notify_admins('The seasonal hero banners for ' || _season || ' could not be generated. Open Flyers to retry.');
  END IF;
END $$;

-- ---- publish the finished set: one transaction, safe to repeat
-- _items: [{slot, placement, title, image_url, headline, subline, cta_label, link_url, sort_order}] (exactly five)
CREATE OR REPLACE FUNCTION public.seasonal_hero_publish(_run uuid, _season text, _items jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.seasonal_hero_settings%ROWTYPE; _i jsonb; _start timestamptz; _end timestamptz; _live integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('seasonal_hero'));
  IF _season !~ '^20[0-9][0-9]-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Bad season.'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) <> 5 THEN RAISE EXCEPTION 'Exactly five banners are needed.'; END IF;
  FOR _i IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF coalesce(_i ->> 'image_url', '') !~ '^https://' THEN RAISE EXCEPTION 'A banner has no picture.'; END IF;
    IF _i ->> 'placement' NOT IN ('hero_slide', 'hero_side') THEN RAISE EXCEPTION 'Bad placement.'; END IF;
    IF NOT (public.ad_copy_is_safe(_i ->> 'headline') AND public.ad_copy_is_safe(_i ->> 'subline') AND public.ad_copy_is_safe(_i ->> 'cta_label')) THEN
      RAISE EXCEPTION 'Banner wording failed the safety rules.'; END IF;
    IF coalesce(_i ->> 'link_url', '') !~ '^/($|[^/])' THEN RAISE EXCEPTION 'Banner links must stay on this site.'; END IF;
  END LOOP;
  SELECT * INTO _s FROM public.seasonal_hero_settings WHERE id;
  _start := make_timestamptz(substr(_season, 1, 4)::int, substr(_season, 6, 2)::int, 1, 0, 0, 0, 'Africa/Lagos');
  _end := _start + interval '1 month 5 days';

  DELETE FROM public.flyers WHERE generated AND season_key = _season;      -- a repeated or forced run replaces its own set
  FOR _i IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.flyers (title, placement, image_url, link_url, sort_order, is_active, starts_at, ends_at, headline, subline, cta_label, season_key, slot, generated)
    VALUES (_i ->> 'title', _i ->> 'placement', _i ->> 'image_url', _i ->> 'link_url', coalesce((_i ->> 'sort_order')::int, 10),
            _s.auto_publish, _start, _end, _i ->> 'headline', _i ->> 'subline', _i ->> 'cta_label', _season, _i ->> 'slot', true);
  END LOOP;
  IF _s.auto_publish THEN
    -- the new month replaces last month's generated set straight away (admin-uploaded flyers are never touched)
    UPDATE public.flyers SET is_active = false WHERE generated AND season_key <> _season AND is_active;
    _live := 5;
  END IF;
  UPDATE public.seasonal_hero_runs SET status = 'succeeded', published = _s.auto_publish, finished_at = now(), updated_at = now(), error = NULL WHERE id = _run;
  PERFORM public.ad_notify_admins(CASE WHEN _s.auto_publish
    THEN 'The seasonal hero banners for ' || _season || ' are live on the homepage.'
    ELSE 'The seasonal hero banners for ' || _season || ' are ready. Switch them on in Flyers.' END);
  RETURN jsonb_build_object('published', _s.auto_publish, 'live', _live);
END $$;

-- ---- admin screen
CREATE OR REPLACE FUNCTION public.admin_seasonal_hero_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  RETURN jsonb_build_object(
    'settings', (SELECT to_jsonb(s) FROM public.seasonal_hero_settings s WHERE id),
    'runs', coalesce((SELECT jsonb_agg(to_jsonb(r) - 'slots' ORDER BY r.season_key DESC) FROM (SELECT * FROM public.seasonal_hero_runs ORDER BY season_key DESC LIMIT 6) r), '[]'::jsonb),
    'live_generated', (SELECT count(*) FROM public.flyers WHERE generated AND is_active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())));
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_seasonal_hero_settings(_enabled boolean, _auto_publish boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  UPDATE public.seasonal_hero_settings SET enabled = coalesce(_enabled, enabled), auto_publish = coalesce(_auto_publish, auto_publish), updated_at = now() WHERE id;
END $$;

-- ---- permissions: pipeline functions are service-role only, admin functions need a signed-in admin
DO $$
DECLARE _r record;
BEGIN
  FOR _r IN SELECT p.oid::regprocedure AS sig, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname IN ('seasonal_hero_begin', 'seasonal_hero_save_slot', 'seasonal_hero_note_failure',
               'seasonal_hero_fail', 'seasonal_hero_publish', 'admin_seasonal_hero_status', 'admin_set_seasonal_hero_settings') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', _r.sig);
    IF _r.proname LIKE 'admin_%' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', _r.sig); END IF;
  END LOOP;
END $$;
