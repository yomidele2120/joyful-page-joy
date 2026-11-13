-- Run after 20261112100000_call_usage_quotas.sql.
DO $test$
DECLARE
  _vendor_user uuid := gen_random_uuid();
  _buyer_user uuid := gen_random_uuid();
  _vendor_id uuid;
  _quota jsonb;
BEGIN
  INSERT INTO public.vendors (user_id, store_name, is_approved)
  VALUES (_vendor_user, 'Call quota test vendor', true)
  RETURNING id INTO _vendor_id;
  INSERT INTO public.vendor_memberships (vendor_id, plan_slug, status)
  VALUES (_vendor_id, 'free', 'active');

  INSERT INTO public.call_logs (caller_id, callee_id, call_type, status, created_at, answered_at, ended_at, duration_seconds)
  VALUES (_vendor_user, _buyer_user, 'voice', 'ended', now(), now(), now(), 61);
  INSERT INTO public.call_logs (caller_id, callee_id, call_type, status, created_at, answered_at)
  VALUES (_vendor_user, _buyer_user, 'voice', 'answered', now() - interval '61 seconds', now() - interval '61 seconds');

  _quota := public.call_quota_for_user(_vendor_user);
  IF (_quota->>'role') <> 'free' THEN RAISE EXCEPTION 'FAIL: expected the Free plan, got %', _quota; END IF;
  IF (_quota->>'daily_used_minutes')::integer <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 minutes including the active call, got %', _quota; END IF;
  IF (_quota->>'monthly_used_minutes')::integer <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 monthly minutes including the active call, got %', _quota; END IF;
  IF (_quota->>'daily_remaining_minutes')::integer <> 6 THEN RAISE EXCEPTION 'FAIL: expected 6 daily minutes remaining, got %', _quota; END IF;
  IF (_quota->>'reason') <> 'concurrent_call_limit' THEN RAISE EXCEPTION 'FAIL: expected concurrent call limit, got %', _quota; END IF;

  RAISE EXCEPTION 'ALL CALL QUOTA TESTS PASSED';
END $test$;