
-- Add media columns to messages table
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_type text; -- 'image', 'video', 'voice'

-- Create chat-media storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to chat-media
CREATE POLICY "Authenticated users can upload chat media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-media');

-- Allow public read access to chat media
CREATE POLICY "Public can view chat media"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-media');
