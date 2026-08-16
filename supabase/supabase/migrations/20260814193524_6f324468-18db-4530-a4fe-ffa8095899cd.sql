ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'video',
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.posts ALTER COLUMN video_url DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_media_type_check'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_media_type_check CHECK (media_type IN ('video', 'images'));
  END IF;
END $$;