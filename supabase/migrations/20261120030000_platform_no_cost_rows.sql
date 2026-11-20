-- Supabase, Vercel and ZegoCloud cost nothing: show an expiry date (Supabase, Vercel) or call minutes (ZegoCloud) instead of money.
-- Requires 20261120010000_platform_subscriptions.sql. Safe to run twice.
ALTER TABLE public.service_allocations ADD COLUMN IF NOT EXISTS no_cost boolean NOT NULL DEFAULT false;
ALTER TABLE public.service_allocations ADD COLUMN IF NOT EXISTS expires_on date;

INSERT INTO public.service_allocations (service_key, service_name, currency, payment_status, sort_order)
VALUES ('zegocloud', 'ZegoCloud', 'USD', 'Active', 8)
ON CONFLICT (service_key) DO NOTHING;
UPDATE public.service_allocations SET no_cost = true WHERE service_key IN ('supabase', 'vercel', 'zegocloud');

CREATE OR REPLACE FUNCTION public.admin_service_costs_summary() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _funded numeric; _alloc numeric; _spent numeric; _charges numeric; _n bigint; _since timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT funded_balance, annual_allocation INTO _funded, _alloc FROM public.service_allocations WHERE service_key = 'openai';
  SELECT coalesce(sum(actual_cost_usd), 0), coalesce(sum(service_charge_usd), 0), count(*), min(created_at)
    INTO _spent, _charges, _n, _since FROM public.ai_cost_ledger WHERE status = 'succeeded';
  RETURN jsonb_build_object(
    'services', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.sort_order), '[]'::jsonb) FROM public.service_allocations s),
    'openai_allocation_usd', _alloc,
    'openai_funded_usd', _funded,
    'actual_spend_usd', round(_spent, 4),
    'remaining_actual_usd', round(coalesce(_funded, 0) - _charges, 4),
    'service_charges_usd', round(_charges, 4),
    'billed_calls', _n,
    'tracking_since', _since,
    'call_minutes_month', (SELECT coalesce(round(sum(duration_seconds) / 60.0, 1), 0) FROM public.call_logs
                            WHERE duration_seconds > 0 AND created_at >= date_trunc('month', now())),
    'call_minutes_total', (SELECT coalesce(round(sum(duration_seconds) / 60.0, 1), 0) FROM public.call_logs WHERE duration_seconds > 0));
END $$;
REVOKE ALL ON FUNCTION public.admin_service_costs_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_service_costs_summary() TO authenticated;
