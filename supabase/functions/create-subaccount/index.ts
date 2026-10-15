// Creates (or refreshes) a supplier's Paystack subaccount.
// Who may call it:
//   - an admin, for any vendor (runs automatically when a supplier is approved)
//   - the supplier themselves, but only once they are approved
//     (runs automatically when they save or add their bank details)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

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
  'moniepoint': '50515',
};

// Forgiving match: "Access Bank PLC", "GTBank", "Zenith" all work.
function findBankCode(name: string): string {
  const norm = (v: string) =>
    v.toLowerCase().replace(/\bplc\b|\blimited\b|\bltd\b|[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const typed = norm(name);
  if (bankCodes[typed]) return bankCodes[typed];
  const hit = Object.keys(bankCodes)
    .sort((x, y) => y.length - x.length)
    .find((k) => typed.includes(k) || (typed.length >= 4 && k.includes(typed)));
  return hit ? bankCodes[hit] : '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return reply({ error: 'Unauthorized' }, 401);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) return reply({ error: 'Unauthorized' }, 401);

    const { data: roles } = await adminClient
      .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin');
    const isAdmin = !!roles?.length;

    const { vendor_id, refresh } = await req.json();
    if (!vendor_id) return reply({ error: 'vendor_id is required' }, 400);

    const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!PAYSTACK_SECRET_KEY) return reply({ error: 'Paystack not configured' }, 500);

    const { data: vendor, error: vendorErr } = await adminClient
      .from('vendors').select('*').eq('id', vendor_id).single();
    if (vendorErr || !vendor) return reply({ error: 'Vendor not found' }, 404);

    // Admins can act on any vendor; a supplier only on their own approved shop.
    if (!isAdmin) {
      if (vendor.user_id !== user.id) return reply({ error: 'Not allowed' }, 403);
      if (!vendor.is_approved) return reply({ error: 'Your account is not approved yet' }, 403);
    }

    // Bank details live in the private vendor_private table
    const { data: bank } = await adminClient
      .from('vendor_private')
      .select('bank_name, bank_account_number, bank_account_name')
      .eq('vendor_id', vendor_id)
      .maybeSingle();

    const alreadyHasCode = !!vendor.paystack_subaccount_code;
    if (alreadyHasCode && !refresh) {
      return reply({ subaccount_code: vendor.paystack_subaccount_code });
    }

    if (!bank?.bank_name || !bank?.bank_account_number || !bank?.bank_account_name) {
      return reply({ error: 'Vendor bank details incomplete. Cannot create subaccount.', code: 'bank_incomplete' }, 400);
    }

    const bankCode = findBankCode(bank.bank_name);
    if (!bankCode) return reply({ error: `Unsupported bank: ${bank.bank_name}`, code: 'bank_unsupported' }, 400);

    // Bank details changed on an existing subaccount: update it in place.
    if (alreadyHasCode && refresh) {
      const upd = await fetch(`https://api.paystack.co/subaccount/${vendor.paystack_subaccount_code}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: vendor.store_name,
          settlement_bank: bankCode,
          account_number: bank.bank_account_number,
        }),
      });
      const updData = await upd.json();
      if (!updData.status) return reply({ error: updData.message || 'Failed to update subaccount' }, 400);
      return reply({ subaccount_code: vendor.paystack_subaccount_code, message: 'Subaccount updated' });
    }

    const paystackRes = await fetch('https://api.paystack.co/subaccount', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_name: vendor.store_name,
        bank_code: bankCode,
        account_number: bank.bank_account_number,
        percentage_charge: 5,
        description: `Subaccount for ${vendor.store_name}`,
      }),
    });
    const paystackData = await paystackRes.json();
    if (!paystackData.status) {
      return reply({ error: paystackData.message || 'Failed to create subaccount' }, 400);
    }

    await adminClient.from('vendors').update({
      paystack_subaccount_code: paystackData.data.subaccount_code,
    }).eq('id', vendor_id);

    return reply({
      subaccount_code: paystackData.data.subaccount_code,
      message: 'Subaccount created successfully',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return reply({ error: message }, 500);
  }
});
