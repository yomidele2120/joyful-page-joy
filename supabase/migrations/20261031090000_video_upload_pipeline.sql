-- Video upload pipeline: a post now exists from the moment an upload starts, and is published by the SERVER
-- once Cloudflare Stream has finished optimising the video. So it still goes live if the seller's phone is
-- switched off, the browser is closed or the app is killed after the upload has finished.
--
--   uploading   the file is still being sent (it resumes from where it stopped when the seller comes back)
--   processing  the whole file arrived; Cloudflare is optimising it. Nothing more is needed from the phone.
--   ready       published (is_active = true)
--   failed      Cloudflare rejected the file or the upload was never finished; processing_error says why
--
-- Existing posts keep processing_status = 'ready', so nothing changes for them.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS processing_error TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_processing_status_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_processing_status_check
  CHECK (processing_status IN ('uploading', 'processing', 'ready', 'failed'));

-- Only the few unfinished rows are ever looked up by status.
CREATE INDEX IF NOT EXISTS idx_posts_unfinished
  ON public.posts (vendor_id, created_at DESC)
  WHERE processing_status <> 'ready';

-- Lookup by Cloudflare's video id (used by the webhook).
CREATE INDEX IF NOT EXISTS idx_posts_stream_uid
  ON public.posts (stream_uid)
  WHERE stream_uid IS NOT NULL;
