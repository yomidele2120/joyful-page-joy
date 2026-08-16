-- Cloudflare Stream fields. When a video is uploaded through Stream
-- (see the create-stream-upload edge function), we store its uid and the
-- adaptive HLS manifest URL here. video_url remains as a fallback/raw
-- source for posts uploaded before Stream was configured, or if it's
-- never configured at all — the app degrades gracefully either way.
ALTER TABLE public.posts
  ADD COLUMN stream_uid TEXT,
  ADD COLUMN hls_url TEXT;
