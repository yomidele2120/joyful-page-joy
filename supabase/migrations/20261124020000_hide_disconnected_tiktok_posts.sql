-- A vendor's TikTok videos only show while their TikTok connection is healthy. When the connection is removed, expires or
-- is revoked (needs_reconnect), their TikTok posts leave the feed, search, hashtags and the shop page. When they connect
-- again, the same videos come back. Videos an admin switched off for moderation stay off: only the ones we hid ourselves
-- (tiktok_hidden) are switched back on.
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS tiktok_hidden boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.trg_tiktok_connection_visibility() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _vendor uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.vendor_id ELSE NEW.vendor_id END;
        _hide boolean := TG_OP = 'DELETE' OR coalesce(NEW.needs_reconnect, false);
BEGIN
  IF _hide THEN
    UPDATE public.posts SET is_active = false, tiktok_hidden = true
     WHERE vendor_id = _vendor AND media_type = 'tiktok' AND is_active;
  ELSE
    UPDATE public.posts SET is_active = true, tiktok_hidden = false
     WHERE vendor_id = _vendor AND media_type = 'tiktok' AND tiktok_hidden;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_tiktok_connection_visibility ON public.vendor_tiktok_connections;
CREATE TRIGGER trg_tiktok_connection_visibility
  AFTER INSERT OR DELETE OR UPDATE OF needs_reconnect ON public.vendor_tiktok_connections
  FOR EACH ROW EXECUTE FUNCTION public.trg_tiktok_connection_visibility();

-- A TikTok post can only be live while its vendor is connected, even if a post arrives some other way.
CREATE OR REPLACE FUNCTION public.trg_tiktok_post_needs_connection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.media_type = 'tiktok' AND NEW.is_active AND NOT EXISTS (
       SELECT 1 FROM public.vendor_tiktok_connections c WHERE c.vendor_id = NEW.vendor_id AND NOT c.needs_reconnect) THEN
    NEW.is_active := false; NEW.tiktok_hidden := true;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_tiktok_post_needs_connection ON public.posts;
CREATE TRIGGER trg_tiktok_post_needs_connection BEFORE INSERT OR UPDATE OF is_active ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_tiktok_post_needs_connection();

-- Hide what is showing right now for vendors who are not connected.
UPDATE public.posts p SET is_active = false, tiktok_hidden = true
 WHERE p.media_type = 'tiktok' AND p.is_active
   AND NOT EXISTS (SELECT 1 FROM public.vendor_tiktok_connections c WHERE c.vendor_id = p.vendor_id AND NOT c.needs_reconnect);
