import { supabase } from '@/integrations/supabase/client';

export interface StreamUploadResult {
  uid: string;
  hlsUrl: string;
  thumbnailUrl: string;
}

export class StreamNotConfiguredError extends Error {}

// Uploads a video file straight to Cloudflare Stream (browser -> Cloudflare,
// never through our own server) so it comes back transcoded into adaptive
// HLS renditions and served off Cloudflare's CDN. If Stream hasn't been
// configured (no API credentials set as Supabase secrets yet), this throws
// StreamNotConfiguredError so the caller can fall back to a direct Supabase
// Storage upload instead of failing outright.
export async function uploadToCloudflareStream(file: File): Promise<StreamUploadResult> {
  const { data: session } = await supabase.auth.getSession();
  const accessToken = session.session?.access_token;
  if (!accessToken) throw new Error('Sign in to upload videos');

  const { data, error } = await supabase.functions.invoke<{ uploadURL?: string; uid?: string; error?: string }>(
    'create-stream-upload',
    { method: 'POST' }
  );

  if (error || !data?.uploadURL || !data.uid) {
    if (data?.error === 'not_configured') {
      throw new StreamNotConfiguredError('Cloudflare Stream is not configured');
    }
    throw new Error(data?.error || error?.message || 'Could not start video upload');
  }

  const form = new FormData();
  form.append('file', file);

  const uploadRes = await fetch(data.uploadURL, { method: 'POST', body: form });
  if (!uploadRes.ok) {
    throw new Error('Video upload to Cloudflare failed. Please try again.');
  }

  const uid = data.uid;
  return {
    uid,
    hlsUrl: `https://videodelivery.net/${uid}/manifest/video.m3u8`,
    thumbnailUrl: `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg?time=0.5s`,
  };
}
