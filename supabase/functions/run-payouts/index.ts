// Pays suppliers the exact amount they are owed. Admin only.
//   { action: 'run', vendor_id?: string }   pay one supplier, or every supplier with available funds
//   { action: 'verify', payout_id: string } ask Paystack what happened to a payout still "processing"
// The amount is never taken from the browser: claim_vendor_payout() adds up the supplier's
// released order lines in the database and the payout id is used as the Paystack reference,
// so the same payout can never be sent twice.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return reply({ error: 'Unauthorized' }, 401);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: userError } = await db.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) return reply({ error: 'Unauthorized' }, 401);
    const { data: roles } = await db.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin');
    if (!roles?.length) return reply({ error: 'Admins only' }, 403);

    const KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!KEY) return reply({ error: 'Paystack not configured' }, 500);
    const ps = (path: string, init?: RequestInit) =>
      fetch(`https://api.paystack.co${path}`, { ...init, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } }).then((r) => r.json());

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'run';

    // ---- check on a payout that is still processing --------------------------------------
    if (action === 'verify') {
      const payoutId = String(body.payout_id ?? '');
      if (!payoutId) return reply({ error: 'payout_id is required' }, 400);
      const res = await ps(`/transfer/verify/${payoutId}`);
      if (!res.status) return reply({ error: res.message || 'Paystack has no record of this transfer', code: 'not_found_at_paystack' }, 404);
      const st = res.data.status as string;
      if (st === 'success') await db.rpc('finish_payout', { _payout_id: payoutId, _outcome: 'success', _transfer_code: res.data.transfer_code });
      else if (st === 'failed') await db.rpc('finish_payout', { _payout_id: payoutId, _outcome: 'failed', _transfer_code: res.data.transfer_code, _reason: res.data.reason || 'Transfer failed' });
      else if (st === 'reversed') await db.rpc('finish_payout', { _payout_id: payoutId, _outcome: 'reversed', _transfer_code: res.data.transfer_code, _reason: 'Transfer reversed' });
      return reply({ ok: true, paystack_status: st });
    }

    // ---- pay suppliers ------------------------------------------------------------------
    let vendorIds: string[] = [];
    if (body.vendor_id) {
      vendorIds = [String(body.vendor_id)];
    } else {
      const { data: rows, error } = await db.from('order_item_payables').select('vendor_id').eq('payout_status', 'available');
      if (error) return reply({ error: error.message }, 500);
      vendorIds = [...new Set((rows ?? []).map((r: any) => r.vendor_id as string))];
    }
    if (!vendorIds.length) return reply({ results: [], message: 'Nothing is available to pay yet.' });

    const results: any[] = [];
    for (const vendorId of vendorIds) {
      const { data: vendor } = await db.from('vendors').select('store_name, is_approved').eq('id', vendorId).maybeSingle();
      const name = vendor?.store_name ?? vendorId;
      if (!vendor?.is_approved) { results.push({ vendor: name, status: 'skipped', reason: 'Supplier is not approved' }); continue; }

      const { data: vp } = await db.from('vendor_private')
        .select('bank_name, bank_account_number, transfer_recipient_code, transfer_recipient_fingerprint').eq('vendor_id', vendorId).maybeSingle();
      const fingerprint = `${(vp?.bank_name ?? '').toLowerCase().trim()}|${(vp?.bank_account_number ?? '').trim()}`;
      if (!vp?.transfer_recipient_code) { results.push({ vendor: name, status: 'skipped', reason: 'Bank account not verified yet' }); continue; }
      if (vp.transfer_recipient_fingerprint !== fingerprint) {
        results.push({ vendor: name, status: 'skipped', reason: 'Bank details changed. Verify the bank account again.' }); continue;
      }

      const { data: claimed, error: claimErr } = await db.rpc('claim_vendor_payout', { _vendor_id: vendorId });
      if (claimErr) { results.push({ vendor: name, status: 'error', reason: claimErr.message }); continue; }
      const claim = Array.isArray(claimed) ? claimed[0] : claimed;
      if (!claim?.payout_id) { results.push({ vendor: name, status: 'skipped', reason: 'Below the minimum payout, or nothing owed' }); continue; }

      const payoutId: string = claim.payout_id;
      const amount = Number(claim.amount);
      let res: any;
      try {
        res = await ps('/transfer', {
          method: 'POST',
          body: JSON.stringify({
            source: 'balance', currency: 'NGN',
            amount: Math.round(amount * 100),
            recipient: vp.transfer_recipient_code,
            reference: payoutId,
            reason: `Supplier payout ${payoutId.slice(0, 8)}`,
          }),
        });
      } catch (_e) {
        // The request may or may not have reached Paystack: leave it "processing" and let the
        // webhook (or the Check status button) settle it. Never retry blindly.
        results.push({ vendor: name, status: 'unknown', amount, payout_id: payoutId, reason: 'No answer from Paystack. Use "Check status" in a minute.' });
        continue;
      }

      if (!res.status) {
        await db.rpc('finish_payout', { _payout_id: payoutId, _outcome: 'failed', _reason: res.message || 'Paystack rejected the transfer' });
        results.push({ vendor: name, status: 'failed', amount, reason: res.message || 'Paystack rejected the transfer' });
        continue;
      }

      const tStatus = res.data.status as string;
      await db.from('payouts').update({ paystack_transfer_code: res.data.transfer_code }).eq('id', payoutId);
      if (tStatus === 'success') {
        await db.rpc('finish_payout', { _payout_id: payoutId, _outcome: 'success', _transfer_code: res.data.transfer_code });
        results.push({ vendor: name, status: 'paid', amount });
      } else if (tStatus === 'otp') {
        await db.rpc('finish_payout', { _payout_id: payoutId, _outcome: 'failed', _transfer_code: res.data.transfer_code, _reason: 'Paystack wants an OTP. Turn off OTP for transfers in your Paystack settings.' });
        results.push({ vendor: name, status: 'failed', amount, reason: 'Paystack wants an OTP. Turn off OTP for transfers in your Paystack settings.' });
      } else {
        results.push({ vendor: name, status: 'processing', amount, payout_id: payoutId }); // webhook will finish it
      }
    }
    return reply({ results });
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : 'Internal server error' }, 500);
  }
});
