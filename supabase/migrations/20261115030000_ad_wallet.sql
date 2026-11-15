-- =====================================================================
-- AD WALLET: a supplier adds money (Paystack) to an advertising balance, and spend on external ads is deducted from it.
--   * The balance is the SUM of a ledger. Nothing edits a balance directly, and a ledger line is never changed.
--   * Money is added only by finalize_ad_wallet_topup(), which the edge functions call after Paystack confirms the charge
--     server-side (amount and currency must match our own record). The browser's "success" is never trusted.
--   * Spend and corrections are recorded by an admin, who cannot take a balance below zero.
--   * Limits (minimum / maximum top-up) and an on/off switch are admin settings, not code.
-- Requires 20261114090000_vendor_advertising.sql. Safe to run more than once.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ad_wallet_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  min_topup_kobo bigint NOT NULL DEFAULT 100000 CHECK (min_topup_kobo >= 10000),
  max_topup_kobo bigint NOT NULL DEFAULT 100000000 CHECK (max_topup_kobo >= min_topup_kobo),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ad_wallet_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ad_wallet_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  paystack_reference text NOT NULL UNIQUE,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  status_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ad_wallet_topups_vendor ON public.ad_wallet_topups (vendor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ad_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('topup', 'spend', 'adjustment')),
  amount_kobo bigint NOT NULL CHECK (amount_kobo <> 0),            -- + adds to the balance, - takes from it
  platform text CHECK (platform IS NULL OR platform IN ('google', 'meta', 'tiktok', 'other')),
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  topup_id uuid REFERENCES public.ad_wallet_topups(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_sign CHECK ((kind = 'topup' AND amount_kobo > 0) OR (kind = 'spend' AND amount_kobo < 0) OR kind = 'adjustment')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_wallet_ledger_topup ON public.ad_wallet_ledger (topup_id) WHERE topup_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ad_wallet_ledger_vendor ON public.ad_wallet_ledger (vendor_id, created_at DESC);

ALTER TABLE public.ad_wallet_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_wallet_topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_wallet_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read wallet settings" ON public.ad_wallet_settings;
CREATE POLICY "Read wallet settings" ON public.ad_wallet_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Vendors read own topups" ON public.ad_wallet_topups;
CREATE POLICY "Vendors read own topups" ON public.ad_wallet_topups FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));
DROP POLICY IF EXISTS "Vendors read own ledger" ON public.ad_wallet_ledger;
CREATE POLICY "Vendors read own ledger" ON public.ad_wallet_ledger FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));
REVOKE ALL ON public.ad_wallet_settings, public.ad_wallet_topups, public.ad_wallet_ledger FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ad_wallet_settings, public.ad_wallet_topups, public.ad_wallet_ledger FROM authenticated;

CREATE OR REPLACE FUNCTION public.ad_wallet_balance_kobo(_vendor uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(sum(amount_kobo), 0)::bigint FROM public.ad_wallet_ledger WHERE vendor_id = _vendor;
$$;
REVOKE ALL ON FUNCTION public.ad_wallet_balance_kobo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ad_wallet_balance_kobo(uuid) TO service_role;

-- Adds a confirmed payment to the balance. Service role only. Idempotent: the same reference twice adds the money once.
CREATE OR REPLACE FUNCTION public.finalize_ad_wallet_topup(_reference text, _amount_kobo bigint, _currency text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.ad_wallet_topups%ROWTYPE;
BEGIN
  SELECT * INTO _t FROM public.ad_wallet_topups WHERE paystack_reference = _reference FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _t.status = 'success' THEN RETURN true; END IF;
  IF _t.status <> 'pending' OR _t.amount_kobo <> _amount_kobo OR _t.currency <> _currency THEN RETURN false; END IF;
  INSERT INTO public.ad_wallet_ledger (vendor_id, kind, amount_kobo, note, topup_id)
    VALUES (_t.vendor_id, 'topup', _t.amount_kobo, 'Added by card or bank transfer (Paystack)', _t.id);
  UPDATE public.ad_wallet_topups SET status = 'success', paid_at = now(), status_detail = NULL WHERE id = _t.id;
  PERFORM public.ad_notify_vendor(_t.vendor_id, 'Your advertising balance was topped up.');
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finalize_ad_wallet_topup(text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_ad_wallet_topup(text, bigint, text) TO service_role;

-- Supplier view: balance, totals, limits and recent history.
CREATE OR REPLACE FUNCTION public.my_ad_wallet() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _s public.ad_wallet_settings%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.ad_wallet_settings WHERE id;
  RETURN jsonb_build_object(
    'enabled', _s.enabled, 'min_topup_kobo', _s.min_topup_kobo, 'max_topup_kobo', _s.max_topup_kobo,
    'balance_kobo', public.ad_wallet_balance_kobo(_v),
    'topped_up_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.ad_wallet_ledger WHERE vendor_id = _v AND kind = 'topup'), 0),
    'spent_kobo', COALESCE((SELECT -sum(amount_kobo) FROM public.ad_wallet_ledger WHERE vendor_id = _v AND kind = 'spend'), 0),
    'ledger', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC)
                         FROM (SELECT id, kind, amount_kobo, platform, note, created_at FROM public.ad_wallet_ledger
                               WHERE vendor_id = _v ORDER BY created_at DESC LIMIT 100) l), '[]'::jsonb),
    'pending', COALESCE((SELECT jsonb_agg(jsonb_build_object('reference', t.paystack_reference, 'amount_kobo', t.amount_kobo, 'created_at', t.created_at))
                          FROM public.ad_wallet_topups t WHERE t.vendor_id = _v AND t.status = 'pending' AND t.created_at > now() - interval '2 days'), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.my_ad_wallet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_ad_wallet() TO authenticated;

-- Admin: every supplier with an advertising balance or history.
CREATE OR REPLACE FUNCTION public.admin_ad_wallets() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.ad_wallet_settings%ROWTYPE;
BEGIN
  PERFORM public.ad_require_admin();
  SELECT * INTO _s FROM public.ad_wallet_settings WHERE id;
  RETURN jsonb_build_object(
    'settings', to_jsonb(_s),
    'vendors', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.balance_kobo DESC)
      FROM (SELECT v.id AS vendor_id, v.store_name,
                   COALESCE(sum(l.amount_kobo), 0)::bigint AS balance_kobo,
                   COALESCE(sum(l.amount_kobo) FILTER (WHERE l.kind = 'topup'), 0)::bigint AS topped_up_kobo,
                   COALESCE(-sum(l.amount_kobo) FILTER (WHERE l.kind = 'spend'), 0)::bigint AS spent_kobo
              FROM public.vendors v JOIN public.ad_wallet_ledger l ON l.vendor_id = v.id
             GROUP BY v.id, v.store_name) r), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.admin_ad_wallets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ad_wallets() TO authenticated;

-- Admin: money spent on an external ad platform for a supplier. Cannot take the balance below zero.
CREATE OR REPLACE FUNCTION public.admin_record_ad_spend(_vendor uuid, _amount_kobo bigint, _platform text, _note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  IF _amount_kobo IS NULL OR _amount_kobo <= 0 THEN RAISE EXCEPTION 'Enter an amount above zero.'; END IF;
  IF _platform NOT IN ('google', 'meta', 'tiktok', 'other') THEN RAISE EXCEPTION 'Choose a platform.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = _vendor) THEN RAISE EXCEPTION 'Supplier not found.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ad_wallet:' || _vendor::text));
  IF public.ad_wallet_balance_kobo(_vendor) < _amount_kobo THEN RAISE EXCEPTION 'The supplier''s balance is too low for this spend.'; END IF;
  INSERT INTO public.ad_wallet_ledger (vendor_id, kind, amount_kobo, platform, note, created_by)
    VALUES (_vendor, 'spend', -_amount_kobo, _platform, NULLIF(btrim(_note), ''), auth.uid());
  PERFORM public.ad_notify_vendor(_vendor, 'Advertising spend was recorded against your balance.');
  RETURN jsonb_build_object('balance_kobo', public.ad_wallet_balance_kobo(_vendor));
END $$;
REVOKE ALL ON FUNCTION public.admin_record_ad_spend(uuid, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_ad_spend(uuid, bigint, text, text) TO authenticated;

-- Admin: a correction or refund (+ adds, - removes). A reason is required.
CREATE OR REPLACE FUNCTION public.admin_adjust_ad_wallet(_vendor uuid, _amount_kobo bigint, _note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  IF _amount_kobo IS NULL OR _amount_kobo = 0 THEN RAISE EXCEPTION 'Enter an amount.'; END IF;
  IF _note IS NULL OR char_length(btrim(_note)) < 5 THEN RAISE EXCEPTION 'Give a reason (at least 5 characters).'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = _vendor) THEN RAISE EXCEPTION 'Supplier not found.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ad_wallet:' || _vendor::text));
  IF _amount_kobo < 0 AND public.ad_wallet_balance_kobo(_vendor) < -_amount_kobo THEN RAISE EXCEPTION 'That would take the balance below zero.'; END IF;
  INSERT INTO public.ad_wallet_ledger (vendor_id, kind, amount_kobo, note, created_by) VALUES (_vendor, 'adjustment', _amount_kobo, btrim(_note), auth.uid());
  PERFORM public.ad_notify_vendor(_vendor, 'Your advertising balance was adjusted by ITHUBAFRICA.');
  RETURN jsonb_build_object('balance_kobo', public.ad_wallet_balance_kobo(_vendor));
END $$;
REVOKE ALL ON FUNCTION public.admin_adjust_ad_wallet(uuid, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_ad_wallet(uuid, bigint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_ad_wallet_settings(_enabled boolean, _min_kobo bigint, _max_kobo bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  IF _min_kobo < 10000 OR _max_kobo < _min_kobo THEN RAISE EXCEPTION 'The minimum must be at least 100 naira and the maximum cannot be below it.'; END IF;
  UPDATE public.ad_wallet_settings SET enabled = _enabled, min_topup_kobo = _min_kobo, max_topup_kobo = _max_kobo, updated_at = now() WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_ad_wallet_settings(boolean, bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_ad_wallet_settings(boolean, bigint, bigint) TO authenticated;
