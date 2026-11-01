-- Optional "automatically show my new TikTok videos".
--   * auto_import: the seller turned it on (default off, so nothing changes for anyone who has not).
--   * excluded_video_ids: videos the seller removed on purpose. Auto mode never adds them back.
--     Filled by a trigger, so it works however the post is deleted (dashboard bin, Choose videos, refresh).
ALTER TABLE public.vendor_tiktok_connections
  ADD COLUMN IF NOT EXISTS auto_import BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluded_video_ids TEXT[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.remember_removed_tiktok_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.media_type = 'tiktok' AND OLD.tiktok_video_id IS NOT NULL THEN
    UPDATE public.vendor_tiktok_connections
       SET excluded_video_ids = array_append(excluded_video_ids, OLD.tiktok_video_id)
     WHERE vendor_id = OLD.vendor_id
       AND NOT (OLD.tiktok_video_id = ANY (excluded_video_ids));
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_remember_removed_tiktok_post ON public.posts;
CREATE TRIGGER trg_remember_removed_tiktok_post
  AFTER DELETE ON public.posts
  FOR EACH ROW WHEN (OLD.media_type = 'tiktok')
  EXECUTE FUNCTION public.remember_removed_tiktok_post();
