import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { vendor_id } = await req.json();
    const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!PAYSTACK_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'Paystack not configured' }), { status: 500, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Get vendor details
    const { data: vendor, error: vendorErr } = await adminClient
      .from('vendors')
      .select('*')
      .eq('id', vendor_id)
      .single();

    if (vendorErr || !vendor) {
      return new Response(JSON.stringify({ error: 'Vendor not found' }), { status: 404, headers: corsHeaders });
    }

    // Check if already has subaccount
    if (vendor.paystack_subaccount_code) {
      return new Response(JSON.stringify({ subaccount_code: vendor.paystack_subaccount_code }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!vendor.bank_name || !vendor.bank_account_number || !vendor.bank_account_name) {
      return new Response(JSON.stringify({ error: 'Vendor bank details incomplete' }), { status: 400, headers: corsHeaders });
    }

    // Map bank name to Paystack bank code (common Nigerian banks)
    const bankCodes: Record<string, string> = {
      'access bank': '044', 'citibank': '023', 'diamond bank': '063',
      'ecobank': '050', 'fidelity bank': '070', 'first bank': '011',
      'first city monument bank': '214', 'fcmb': '214',
      'guaranty trust bank': '058', 'gtbank': '058', 'gtb': '058',
      'heritage bank': '030', 'keystone bank': '082',
      'polaris bank': '076', 'skye bank': '076',
      'stanbic ibtc': '221', 'standard chartered': '068',
      'sterling bank': '232', 'union bank': '032',
      'united bank for africa': '033', 'uba': '033',
      'unity bank': '215', 'wema bank': '035', 'zenith bank': '057',
      'kuda': '50211', 'opay': '999992', 'palmpay': '999991',
    };

    const bankCode = bankCodes[vendor.bank_name.toLowerCase()] || '';
    if (!bankCode) {
      return new Response(JSON.stringify({ error: `Unsupported bank: ${vendor.bank_name}` }), { status: 400, headers: corsHeaders });
    }

    // Create Paystack subaccount
    const paystackRes = await fetch('https://api.paystack.co/subaccount', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        business_name: vendor.store_name,
        bank_code: bankCode,
        account_number: vendor.bank_account_number,
        percentage_charge: 5, // Platform takes 5% commission
        description: `Subaccount for ${vendor.store_name}`,
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status) {
      return new Response(JSON.stringify({ error: paystackData.message || 'Failed to create subaccount' }), { status: 400, headers: corsHeaders });
    }

    // Save subaccount code to vendor
    await adminClient.from('vendors').update({
      paystack_subaccount_code: paystackData.data.subaccount_code,
    }).eq('id', vendor_id);

    return new Response(JSON.stringify({
      subaccount_code: paystackData.data.subaccount_code,
      message: 'Subaccount created successfully',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
