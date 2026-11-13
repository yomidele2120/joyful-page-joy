import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (claimsError || !userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { reference } = await req.json();
    if (typeof reference !== 'string' || !/^itha_sub_[a-f0-9]{32}$/i.test(reference)) {
      return new Response(JSON.stringify({ error: 'Invalid payment reference' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      url,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    const { data: vendor } = await admin.from('vendors').select('id').eq('user_id', userId).maybeSingle();
    if (!vendor) {
      return new Response(JSON.stringify({ error: 'Supplier account not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: payment } = await admin.from('supplier_membership_payments')
      .select('id')
      .eq('paystack_reference', reference)
      .eq('vendor_id', vendor.id)
      .maybeSingle();
    if (!payment) {
      return new Response(JSON.stringify({ error: 'Payment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!secret) throw new Error('Paystack is not configured');
    const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!verifyResponse.ok) throw new Error('Paystack verification request failed');
    const verified = await verifyResponse.json();
    const charge = verified.data;

    if (!verified.status || charge?.status !== 'success') {
      if (charge?.status === 'failed') {
        await admin.from('supplier_membership_payments')
          .update({ status: 'failed' }).eq('id', payment.id).eq('status', 'pending');
      }
      return new Response(JSON.stringify({ error: 'Payment is not confirmed yet' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: finalized, error: finalizeError } = await admin.rpc('finalize_supplier_membership_payment', {
      _reference: reference,
      _amount_kobo: Number(charge.amount),
      _currency: String(charge.currency ?? ''),
    });
    if (finalizeError) throw finalizeError;
    if (!finalized) {
      await admin.from('supplier_membership_payments')
        .update({ status: 'failed' }).eq('id', payment.id).eq('status', 'pending');
      return new Response(JSON.stringify({ error: 'Payment amount or currency did not match the plan' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('verify-supplier-subscription error:', error);
    return new Response(JSON.stringify({ error: 'Could not verify supplier membership payment' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});