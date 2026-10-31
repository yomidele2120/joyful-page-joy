import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MAX_DURATION_SECONDS, MAX_UPLOAD_BYTES, hlsUrlFor, thumbnailUrlFor } from "../_shared/stream.ts";
import { cloudflareCredentials } from "../_shared/cloudflare.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const b64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

// Starts a video upload.
//
//  1. Creates a RESUMABLE (tus) upload at Cloudflare Stream, so a dropped connection or a closed app can carry on
//     from where it stopped instead of starting again.
//  2. Creates the post straight away (hidden, "uploading"). The server publishes it once Cloudflare has finished
//     optimising the video (see stream-webhook / check-stream-post), so the seller's phone does not have to stay
//     on for that part.
//
// Body: { size: number, name?: string, caption?: string, productId?: string, postId?: string }
//   postId: ask for a fresh upload URL for a post that already exists (the old URL expired).
// Answer: { postId, uploadUrl, uid }
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: userError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    // Only approved vendors can post videos.
    const { data: vendor } = await admin.from('vendors').select('id, is_approved').eq('user_id', user.id).maybeSingle();
    if (!vendor || !vendor.is_approved) return json({ error: 'Only approved vendors can post videos' }, 403);

    const cf = cloudflareCredentials();
    // Not set up yet: the app falls back to posting through its own storage.
    if (!cf) return json({ error: 'not_configured' }, 501);

    let body: { size?: number; name?: string; caption?: string; productId?: string; postId?: string } = {};
    try { body = await req.json(); } catch { /* no body */ }

    const size = Number(body.size);
    if (!Number.isFinite(size) || size < 1) return json({ error: 'The video size is missing' }, 400);
    if (size > MAX_UPLOAD_BYTES) return json({ error: 'This video is too large. Please pick one under 500 MB.' }, 400);

    // Re-issuing a URL: the post must be this seller's and still unfinished.
    let existingId: string | null = null;
    if (body.postId) {
      const { data: existing } = await admin.from('posts')
        .select('id').eq('id', body.postId).eq('vendor_id', vendor.id)
        .in('processing_status', ['uploading', 'failed']).maybeSingle();
      if (!existing) return json({ error: 'This post can no longer be uploaded to. Please start it again.' }, 404);
      existingId = existing.id;
    }

    // Ask Cloudflare for a one-time resumable upload URL (tus). Metadata values are base64.
    const metadata = [
      `maxDurationSeconds ${b64(String(MAX_DURATION_SECONDS))}`,
      `name ${b64((body.name || 'seller-video').slice(0, 120))}`,
    ].join(',');
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cf.accountId}/stream?direct_user=true`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cf.token}`,
          'Tus-Resumable': '1.0.0',
          'Upload-Length': String(Math.floor(size)),
          'Upload-Metadata': metadata,
        },
      },
    );
    if (!cfRes.ok) {
      const detail = (await cfRes.text()).slice(0, 300);
      console.error('create-stream-upload: Cloudflare refused', cfRes.status, detail);
      return json({ error: `Video hosting rejected the upload (${cfRes.status}). ${detail}` }, 502);
    }
    const uploadUrl = cfRes.headers.get('Location');
    const uid = cfRes.headers.get('stream-media-id');
    if (!uploadUrl || !uid) {
      console.error('create-stream-upload: missing Location or stream-media-id', uploadUrl, uid);
      return json({ error: 'Video hosting did not return an upload address.' }, 502);
    }

    const stream = {
      stream_uid: uid,
      hls_url: hlsUrlFor(uid),
      video_url: hlsUrlFor(uid),
      thumbnail_url: thumbnailUrlFor(uid),
      processing_status: 'uploading',
      processing_error: null,
      is_active: false,
    };

    if (existingId) {
      const { error } = await admin.from('posts').update(stream).eq('id', existingId);
      if (error) return json({ error: error.message }, 500);
      return json({ postId: existingId, uploadUrl, uid });
    }

    // Only link a product that belongs to this seller.
    let productId: string | null = null;
    if (body.productId) {
      const { data: product } = await admin.from('products').select('id').eq('id', body.productId).eq('vendor_id', vendor.id).maybeSingle();
      productId = product?.id ?? null;
    }

    const { data: post, error: insertError } = await admin.from('posts').insert({
      vendor_id: vendor.id,
      media_type: 'video',
      caption: (body.caption ?? '').trim().slice(0, 2200) || null,
      product_id: productId,
      ...stream,
    }).select('id').single();
    if (insertError || !post) return json({ error: insertError?.message || 'Could not create the post' }, 500);

    return json({ postId: post.id, uploadUrl, uid });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, 500);
  }
});
