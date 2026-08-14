import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Mints a one-time direct-upload URL from Cloudflare Stream so the browser
// can upload the raw video straight to Cloudflare (never through our own
// server). Cloudflare then transcodes it into adaptive HLS renditions and
// serves it from their CDN — this is what makes playback fast on a weak
// connection instead of everyone downloading one big raw file.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Only approved vendors can mint an upload URL
    const { data: vendor } = await adminClient
      .from('vendors')
      .select('id, is_approved')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!vendor || !vendor.is_approved) {
      return new Response(JSON.stringify({ error: 'Only approved vendors can post videos' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const CF_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const CF_STREAM_TOKEN = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');

    if (!CF_ACCOUNT_ID || !CF_STREAM_TOKEN) {
      // Not configured yet — the client falls back to direct Supabase
      // Storage upload when it sees this specific error code.
      return new Response(JSON.stringify({ error: 'not_configured' }), { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/direct_upload`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CF_STREAM_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxDurationSeconds: 180,
          requireSignedURLs: false,
          allowedOrigins: ['*'],
        }),
      }
    );

    const cfData = await cfRes.json();

    if (!cfData.success) {
      const message = cfData.errors?.[0]?.message || 'Could not create upload URL';
      return new Response(JSON.stringify({ error: message }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      uploadURL: cfData.result.uploadURL,
      uid: cfData.result.uid,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
