import { supabase } from '@/integrations/supabase/client';

// Client side of the video pipeline. The heavy lifting happens on the server and at Cloudflare:
//   createStreamUpload -> the server creates a resumable upload and a hidden post
//   (the browser sends the file with lib/tus.ts)
//   checkStreamPosts   -> asks the server to publish any video Cloudflare has finished (a safety net next to the
//                         webhook, which does the same thing even when the app is closed)

export class StreamNotConfiguredError extends Error {
  constructor(message = 'Cloudflare Stream is not set up') { super(message); this.name = 'StreamNotConfiguredError'; }
}
/** The seller is not allowed to post (not signed in, or not approved). Retrying will not help. */
export class StreamDeniedError extends Error {
  constructor(message: string) { super(message); this.name = 'StreamDeniedError'; }
}

export class NetworkError extends Error {
  constructor(message = 'No connection') { super(message); this.name = 'NetworkError'; }
}

export interface CreateUploadInput {
  size: number;
  name?: string;
  caption?: string;
  productId?: string | null;
  /** Ask for a fresh upload address for a post that already exists (the old one expired). */
  postId?: string;
}
export interface CreatedUpload { postId: string; uploadUrl: string; uid: string }

// supabase-js hides the real reason behind "Edge Function returned a non-2xx status code". The status and the
// reason are in the response body, so read them from there.
async function describeFailure(error: unknown, data: { error?: string } | null) {
  let status = 0;
  let reason = data?.error;
  const res = (error as { context?: unknown } | null)?.context;
  if (res instanceof Response) {
    status = res.status;
    try { reason = ((await res.clone().json()) as { error?: string })?.error ?? reason; } catch { /* not JSON */ }
  }
  return { status, reason: reason || (error as Error | null)?.message || 'Unknown error' };
}

export async function createStreamUpload(input: CreateUploadInput): Promise<CreatedUpload> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.access_token) throw new StreamDeniedError('Sign in to upload videos');

  const { data, error } = await supabase.functions.invoke<CreatedUpload & { error?: string }>('create-stream-upload', { body: input });
  if (!error && data?.uploadUrl && data.postId) return data;

  const { status, reason } = await describeFailure(error, data);
  if (status === 401 || status === 403) throw new StreamDeniedError(reason);
  // Not set up (501), not deployed yet (404), or Cloudflare unreachable / refusing our token (502, 503): this must
  // never stop a seller from posting, so the queue uses the website's own storage instead.
  if (status === 501 || status === 404 || status === 502 || status === 503) {
    console.warn('Cloudflare Stream unavailable, posting through storage instead:', status, reason);
    throw new StreamNotConfiguredError(reason);
  }
  // A real answer from the server (bad size, expired post, Cloudflare refused): show it as it is.
  if (status >= 400) throw new Error(reason);
  // No answer at all: this is the network, so the caller keeps the video and tries again later.
  throw new NetworkError(reason);
}

export async function checkStreamPosts(): Promise<{ id: string; status: string }[]> {
  const { data, error } = await supabase.functions.invoke<{ posts?: { id: string; status: string }[] }>('check-stream-post', { body: {} });
  if (error) return [];
  return data?.posts ?? [];
}
