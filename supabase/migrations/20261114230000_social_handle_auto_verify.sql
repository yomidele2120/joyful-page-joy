-- Vendors enter only their social username. The link is built here, checked by ad_normalize_social() (the same strict
-- validator as before), and accepted automatically (verification_status = 'verified') without waiting for an admin.
-- An admin can still reject any link, and a rejected link stays rejected if the vendor saves the same username again.
-- Auto-accept means "well-formed link on the right site", not proof that the vendor owns the account.
-- Run after 20261114090000_vendor_advertising.sql.

CREATE OR REPLACE FUNCTION public.vendor_upsert_social_handle(_platform text, _username text, _enabled boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _v uuid := public.ad_require_vendor();
  _in text := btrim(coalesce(_username, ''));
  _h text; _url text; _n jsonb; _e jsonb; _max integer; _on integer;
  _row public.vendor_social_profiles%ROWTYPE;
BEGIN
  IF _platform NOT IN ('instagram', 'facebook', 'tiktok') THEN RAISE EXCEPTION 'Unsupported platform.'; END IF;
  -- Accept "name", "@name", or a pasted profile link: keep only the username.
  IF _in ~* '(instagram\.com|facebook\.com|tiktok\.com)/' THEN
    _in := coalesce(substring(_in FROM '(?i)(?:instagram\.com|facebook\.com|tiktok\.com)/(@?[A-Za-z0-9._]+)'), '');
  END IF;
  _h := regexp_replace(_in, '^@+', '');
  IF _h = '' OR _h !~ '^[A-Za-z0-9._]+$' THEN
    RAISE EXCEPTION 'Enter just your username, for example yourshop. Letters, numbers, dots and underscores only.'; END IF;

  _url := CASE _platform
            WHEN 'instagram' THEN 'https://www.instagram.com/' || _h || '/'
            WHEN 'facebook'  THEN 'https://www.facebook.com/' || _h
            ELSE 'https://www.tiktok.com/@' || _h END;
  _n := public.ad_normalize_social(_platform, _url, NULL);   -- same rules as every other social link

  IF coalesce(_enabled, true) THEN
    _e := public.ad_entitlement(_v);
    IF (_e ->> 'active')::boolean AND coalesce((_e -> 'features' ->> 'social_banner_enabled')::boolean, false) THEN
      _max := (_e -> 'features' ->> 'max_social_profiles')::integer;
      SELECT count(*) INTO _on FROM public.vendor_social_profiles WHERE vendor_id = _v AND promo_enabled AND platform <> _platform;
      IF _on >= _max THEN RAISE EXCEPTION 'Your plan allows promoting up to % social profiles.', _max; END IF;
    END IF;
  END IF;

  INSERT INTO public.vendor_social_profiles (vendor_id, platform, profile_url, handle, display_name, verification_status, promo_enabled)
  VALUES (_v, _platform, _n ->> 'url', _n ->> 'handle', '@' || (_n ->> 'handle'), 'verified', coalesce(_enabled, true))
  ON CONFLICT (vendor_id, platform) DO UPDATE
    SET profile_url = EXCLUDED.profile_url, handle = EXCLUDED.handle, display_name = EXCLUDED.display_name,
        promo_enabled = EXCLUDED.promo_enabled,
        -- same link as before: keep the current status (so an admin rejection sticks); a new link is accepted automatically
        verification_status = CASE WHEN public.vendor_social_profiles.profile_url = EXCLUDED.profile_url
                                   THEN public.vendor_social_profiles.verification_status ELSE 'verified' END,
        updated_at = now()
  RETURNING * INTO _row;
  RETURN to_jsonb(_row);
END $$;

REVOKE ALL ON FUNCTION public.vendor_upsert_social_handle(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_upsert_social_handle(text, text, boolean) TO authenticated;

-- Links saved earlier that are still waiting for review are accepted too (rejected ones stay rejected).
UPDATE public.vendor_social_profiles SET verification_status = 'verified' WHERE verification_status = 'unverified';
