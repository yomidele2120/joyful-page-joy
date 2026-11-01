-- TikTok for sellers: all database changes in one file. Paste into Supabase > SQL Editor and Run once (safe to run again).
-- Needs the earlier project migrations already applied (posts, vendors, marketplace_settings, has_role).

-- TikTok integration: a vendor connects their own TikTok account, picks which of their TikTok videos to show,
-- and the chosen ones appear in the feed and under their shop.
--
--   * Chosen videos are stored as ordinary rows in public.posts with media_type = 'tiktok', so ranking, likes, comments,
--     search, hashtags and the shop video grid all work without a second system. Only the CHOSEN videos are stored
--     (TikTok asks apps to keep only metadata of videos the user selected).
--   * TikTok access/refresh tokens live in vendor_tiktok_tokens. RLS is on and NO policy exists, and anon/authenticated
--     have no privileges: only the edge function (service role) can read them. They never reach a browser.
--   * Only the server may create or change TikTok posts, so a seller cannot claim somebody else's TikTok video.

-- 1. posts columns + allowed media type ---------------------------------------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS tiktok_video_id  TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_embed_url TEXT;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_media_type_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_media_type_check CHECK (media_type IN ('video', 'images', 'tiktok'));

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_tiktok_embed_url_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_tiktok_embed_url_check
  CHECK (tiktok_embed_url IS NULL OR tiktok_embed_url ~ '^https://www\.tiktok\.com/embed/v2/[0-9]+$');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_vendor_tiktok_video_key') THEN
    -- NULLs are distinct, so ordinary posts (no TikTok id) are unaffected.
    ALTER TABLE public.posts ADD CONSTRAINT posts_vendor_tiktok_video_key UNIQUE (vendor_id, tiktok_video_id);
  END IF;
END $$;

-- 2. Only the server (service role) may create/alter TikTok posts ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_tiktok_posts()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF auth.role() = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.media_type = 'tiktok' OR NEW.tiktok_video_id IS NOT NULL OR NEW.tiktok_embed_url IS NOT NULL THEN
      RAISE EXCEPTION 'TikTok posts can only be created by connecting your TikTok account';
    END IF;
  ELSE
    IF NEW.media_type IS DISTINCT FROM OLD.media_type
       OR NEW.tiktok_video_id IS DISTINCT FROM OLD.tiktok_video_id
       OR NEW.tiktok_embed_url IS DISTINCT FROM OLD.tiktok_embed_url THEN
      RAISE EXCEPTION 'TikTok details cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_tiktok_posts ON public.posts;
CREATE TRIGGER trg_guard_tiktok_posts
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_tiktok_posts();

-- 3. Connection status (safe to show to the vendor: no tokens) ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_tiktok_connections (
  vendor_id        UUID PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  open_id          TEXT NOT NULL,
  display_name     TEXT,
  avatar_url       TEXT,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at   TIMESTAMPTZ,
  needs_reconnect  BOOLEAN NOT NULL DEFAULT false,
  last_error       TEXT
);
ALTER TABLE public.vendor_tiktok_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors view own TikTok connection" ON public.vendor_tiktok_connections;
CREATE POLICY "Vendors view own TikTok connection" ON public.vendor_tiktok_connections
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));
DROP POLICY IF EXISTS "Admins view TikTok connections" ON public.vendor_tiktok_connections;
CREATE POLICY "Admins view TikTok connections" ON public.vendor_tiktok_connections
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
-- No insert/update/delete policy: only the edge function (service role) writes here.
REVOKE INSERT, UPDATE, DELETE ON public.vendor_tiktok_connections FROM anon, authenticated;
REVOKE ALL ON public.vendor_tiktok_connections FROM anon;

-- 4. Tokens: server only -------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_tiktok_tokens (
  vendor_id           UUID PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  access_token        TEXT NOT NULL,
  refresh_token       TEXT NOT NULL,
  access_expires_at   TIMESTAMPTZ NOT NULL,
  refresh_expires_at  TIMESTAMPTZ NOT NULL,
  scope               TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vendor_tiktok_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendor_tiktok_tokens FROM anon, authenticated;

-- 5. One-time "state" values that protect the connect flow against forged callbacks -----------------------------------------
CREATE TABLE IF NOT EXISTS public.tiktok_oauth_states (
  state       TEXT PRIMARY KEY,
  vendor_id   UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tiktok_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tiktok_oauth_states FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_tiktok_oauth_states_created ON public.tiktok_oauth_states (created_at);


-- ===== part 2: automatic mode =====
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


-- ===== part 3: admin on/off switch =====
-- The admin on/off switch for the seller TikTok feature. Lives in the existing marketplace_settings row, which everyone can read
-- and only admins can change (policies already exist). Off by default: sellers see nothing and the server refuses TikTok actions
-- until an admin switches it on (Admin > Marketplace > Sections and rules).
ALTER TABLE public.marketplace_settings
  ADD COLUMN IF NOT EXISTS tiktok_enabled BOOLEAN NOT NULL DEFAULT false;
