import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ABANDON_AFTER_HOURS, applyStreamState, type StreamVideo } from "../_shared/stream.ts";
import { cloudflareCredentials } from "../_shared/cloudflare.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Safety net next to the webhook: asks Cloudflare how this seller's unfinished videos are doing and publishes
// the ones that are ready. The app calls it when the seller opens the site, so a post still goes live if the
// webhook was never set up or a delivery was missed. It also gives up on uploads nobody finished.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: userError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const { data: vendor } = await admin.from('vendors').select('id').eq('user_id', user.id).maybeSingle();
    if (!vendor) return json({ error: 'Only vendors can post videos' }, 403);

    const cf = cloudflareCredentials();
    if (!cf) return json({ posts: [] });

    const { data: unfinished } = await admin.from('posts')
      .select('id, stream_uid, processing_status, created_at')
      .eq('vendor_id', vendor.id)
      .in('processing_status', ['uploading', 'processing'])
      .not('stream_uid', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);

    const results: { id: string; status: string }[] = [];
    for (const post of unfinished ?? []) {
      const ageHours = (Date.now() - new Date(post.created_at).getTime()) / 36e5;
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cf.accountId}/stream/${post.stream_uid}`,
        { headers: { Authorization: `Bearer ${cf.token}` } },
      );

      if (res.status === 404) {
        // Cloudflare has no such video (the upload URL expired before any byte arrived).
        if (ageHours > 1) {
          await admin.from('posts').update({ processing_status: 'failed', is_active: false, processing_error: 'The upload was never finished. Please post the video again.' }).eq('id', post.id);
          results.push({ id: post.id, status: 'failed' });
        } else results.push({ id: post.id, status: post.processing_status });
        continue;
      }
      if (!res.ok) { results.push({ id: post.id, status: post.processing_status }); continue; }

      const video = ((await res.json()) as { result?: StreamVideo }).result ?? {};
      let outcome = await applyStreamState(admin, { ...video, uid: post.stream_uid });
      if (outcome === 'uploading' && ageHours > ABANDON_AFTER_HOURS) {
        await admin.from('posts').update({ processing_status: 'failed', is_active: false, processing_error: 'The upload was never finished. Please post the video again.' }).eq('id', post.id);
        outcome = 'failed';
      }
      results.push({ id: post.id, status: outcome === 'unchanged' ? post.processing_status : outcome });
    }
    return json({ posts: results });
  } catch (error: unknown) {
    return json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
});
