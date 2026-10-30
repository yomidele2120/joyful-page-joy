import { supabase } from '@/integrations/supabase/client';

export interface StreamUploadResult {
  uid: string;
  hlsUrl: string;
  thumbnailUrl: string;
}

export class StreamUnavailableError extends Error {}

// Uploads a video file straight to Cloudflare Stream (browser -> Cloudflare,
// never through our own server) so it comes back transcoded into adaptive
// HLS renditions and served off Cloudflare's CDN. If Stream hasn't been
// configured or temporarily unavailable, this throws StreamUnavailableError
// so the caller can fall back to a direct Supabase Storage upload.
export async function uploadToCloudflareStream(file: File): Promise<StreamUploadResult> {
  const { data: session } = await supabase.auth.getSession();
  const accessToken = session.session?.access_token;
  if (!accessToken) throw new Error('Sign in to upload videos');

  const { data, error } = await supabase.functions.invoke<{ uploadURL?: string; uid?: string; error?: string }>(
    'create-stream-upload',
    { method: 'POST' }
  );

  if (error || !data?.uploadURL || !data.uid) {
    // supabase-js hands back `data: null` whenever the function answers with a non-2xx status, and only
    // the generic message "Edge Function returned a non-2xx status code". The real reason (and the
    // status) is in the response body, so read it from there.
    let status = 0;
    let reason = data?.error;
    const res = (error as { context?: unknown } | null)?.context;
    if (res instanceof Response) {
      status = res.status;
      try { reason = ((await res.clone().json()) as { error?: string })?.error ?? reason; } catch { /* not JSON */ }
    }

    // The seller is genuinely not allowed to post: say so plainly instead of trying another route.
    if (status === 401 || status === 403) {
      throw new Error(reason || 'You are not allowed to post videos');
    }
    // Anything else (Stream not set up yet, the function not deployed, Cloudflare unreachable or
    // rejecting the token) must not stop a seller from posting: use the direct storage upload instead.
    console.warn('Cloudflare Stream unavailable, using direct upload:', status, reason ?? error?.message);
    throw new StreamUnavailableError(reason || 'Cloudflare Stream is unavailable');
  }

  const form = new FormData();
  form.append('file', file);

  let uploadRes: Response;
  try {
    uploadRes = await fetch(data.uploadURL, { method: 'POST', body: form });
  } catch {
    throw new StreamUnavailableError('Could not connect to Cloudflare Stream');
  }
  if (!uploadRes.ok) {
    throw new StreamUnavailableError(`Cloudflare Stream upload failed (HTTP ${uploadRes.status})`);
  }

  const uid = data.uid;
  return {
    uid,
    hlsUrl: `https://videodelivery.net/${uid}/manifest/video.m3u8`,
    thumbnailUrl: `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg?time=0.5s`,
  };
}
