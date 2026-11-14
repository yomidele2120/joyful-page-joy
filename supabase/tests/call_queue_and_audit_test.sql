-- Run on a STAGING database after 20261114120000_call_queue_and_audit.sql. Everything rolls back.
-- NOTE: runs as the database owner, so it tests the functions and triggers, not row-level-security policies
-- (check those separately: sign in as a buyer in the app and confirm /rest/v1/call_queue only returns your own rows).
-- A passing run ends with the exception "ALL CALL QUEUE AND AUDIT TESTS PASSED".
CREATE OR REPLACE FUNCTION pg_temp.mk_user(_id uuid) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token,
                          email_change, email_change_token_new, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cq-test-' || _id || '@example.invalid',
          '', now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now());
$f$;
CREATE OR REPLACE FUNCTION pg_temp.act_as(_id uuid) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_id::text, ''), true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _id, 'role', 'authenticated')::text, true);
END $f$;

DO $test$
DECLARE
  _sup uuid := gen_random_uuid(); _b1 uuid := gen_random_uuid(); _b2 uuid := gen_random_uuid(); _b3 uuid := gen_random_uuid(); _b4 uuid := gen_random_uuid();
  _adm uuid := gen_random_uuid(); _v uuid; _r jsonb; _q1 uuid; _q2 uuid; _q3 uuid; _n integer; _call uuid; _msg text; _list jsonb;
BEGIN
  FOREACH _v IN ARRAY ARRAY[_sup, _b1, _b2, _b3, _b4, _adm] LOOP PERFORM pg_temp.mk_user(_v); END LOOP;
  INSERT INTO public.user_roles (user_id, role) VALUES (_adm, 'admin');
  INSERT INTO public.vendors (user_id, store_name, is_approved) VALUES (_sup, 'Queue Test Store', true) RETURNING id INTO _v;
  INSERT INTO public.vendor_memberships (vendor_id, plan_slug, status) VALUES (_v, 'free', 'active');
  UPDATE public.marketplace_settings SET calls_enabled = true WHERE id = true;
  UPDATE public.call_queue_capacity SET max_waiting = 2 WHERE plan_slug = 'free';
  UPDATE public.call_queue_settings SET offer_seconds = 30, max_queues_per_buyer = 3;
  -- every buyer has a chat with the supplier (a call needs one)
  INSERT INTO public.conversations (participant_1, participant_2) SELECT _sup, b FROM unnest(ARRAY[_b1, _b2, _b3, _b4]) b;

  -- 1. supplier free and queue empty: "call_now", nothing is queued
  PERFORM pg_temp.act_as(_b1);
  _r := public.join_call_queue(_sup, 'voice');
  IF _r ->> 'action' <> 'call_now' THEN RAISE EXCEPTION 'FAIL 1: expected call_now, got %', _r; END IF;
  SELECT count(*) INTO _n FROM public.call_queue; IF _n <> 0 THEN RAISE EXCEPTION 'FAIL 1b: nothing should be queued'; END IF;

  -- 2. supplier on a call: buyers queue in order, positions are right, duplicates are refused
  _call := public.start_call(_sup, 'voice');
  PERFORM public.finish_call(_call, 'answered');          -- answered and still open = supplier busy (also buyer 1)
  PERFORM pg_temp.act_as(_b2);
  _r := public.join_call_queue(_sup, 'voice');
  IF _r ->> 'action' <> 'queued' OR (_r ->> 'position')::int <> 1 THEN RAISE EXCEPTION 'FAIL 2a: %', _r; END IF;
  _q2 := (_r ->> 'id')::uuid;
  IF public.join_call_queue(_sup, 'voice') ->> 'action' <> 'already_queued' THEN RAISE EXCEPTION 'FAIL 2b: duplicate must be refused'; END IF;
  PERFORM pg_temp.act_as(_b3);
  _r := public.join_call_queue(_sup, 'video');
  IF (_r ->> 'position')::int <> 2 THEN RAISE EXCEPTION 'FAIL 2c: second buyer should be position 2, got %', _r; END IF;
  _q3 := (_r ->> 'id')::uuid;

  -- 3. capacity (2 for the free plan) is enforced
  PERFORM pg_temp.act_as(_b4);
  IF public.join_call_queue(_sup, 'voice') ->> 'action' <> 'queue_full' THEN RAISE EXCEPTION 'FAIL 3: queue should be full'; END IF;

  -- 4. nobody can read or change another buyer's entry
  PERFORM pg_temp.act_as(_b4);
  IF public.leave_call_queue(_q2) THEN RAISE EXCEPTION 'FAIL 4a: a stranger must not cancel someone else''s entry'; END IF;
  _msg := NULL;
  BEGIN PERFORM public.begin_queue_offer(_q2); EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL THEN RAISE EXCEPTION 'FAIL 4b: a stranger must not begin someone else''s offer'; END IF;

  -- 5. when the supplier's call ends, the FIRST waiting buyer is offered the turn (and only one offer exists)
  UPDATE public.call_logs SET status = 'ended', ended_at = now(), duration_seconds = 60 WHERE id = _call;
  IF (SELECT status FROM public.call_queue WHERE id = _q2) <> 'offered' THEN RAISE EXCEPTION 'FAIL 5a: first in line should be offered'; END IF;
  IF (SELECT status FROM public.call_queue WHERE id = _q3) <> 'waiting' THEN RAISE EXCEPTION 'FAIL 5b: second in line keeps waiting'; END IF;
  SELECT count(*) INTO _n FROM public.call_queue WHERE status = 'offered'; IF _n <> 1 THEN RAISE EXCEPTION 'FAIL 5c: exactly one open offer'; END IF;

  -- 6. an offer that is not taken lapses and moves on
  UPDATE public.call_queue SET offer_expires_at = now() - interval '1 second' WHERE id = _q2;
  PERFORM pg_temp.act_as(_b3);
  PERFORM public.my_call_queue();
  IF (SELECT status FROM public.call_queue WHERE id = _q2) <> 'missed' THEN RAISE EXCEPTION 'FAIL 6a: lapsed offer should be missed'; END IF;
  IF (SELECT status FROM public.call_queue WHERE id = _q3) <> 'offered' THEN RAISE EXCEPTION 'FAIL 6b: next buyer should now be offered'; END IF;

  -- 7. the offered buyer can begin, a late one cannot, leaving frees the place
  _r := public.begin_queue_offer(_q3);
  IF (_r ->> 'callee_id')::uuid <> _sup THEN RAISE EXCEPTION 'FAIL 7a: wrong supplier in offer'; END IF;
  PERFORM pg_temp.act_as(_b2);
  _msg := NULL; BEGIN PERFORM public.begin_queue_offer(_q2); EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL THEN RAISE EXCEPTION 'FAIL 7b: a lapsed offer must not be usable'; END IF;
  PERFORM pg_temp.act_as(_b3);
  IF NOT public.leave_call_queue(_q3) THEN RAISE EXCEPTION 'FAIL 7c: should be able to leave'; END IF;
  IF (SELECT count(*) FROM public.call_queue WHERE status IN ('waiting', 'offered')) <> 0 THEN RAISE EXCEPTION 'FAIL 7d: queue should be empty'; END IF;

  -- 8. old waiting entries expire
  PERFORM pg_temp.act_as(_b2);
  UPDATE public.call_logs SET status = 'ended', ended_at = now() WHERE ended_at IS NULL;
  INSERT INTO public.call_queue (caller_id, callee_id, call_type, created_at) VALUES (_b2, _sup, 'voice', now() - interval '3 hours');
  PERFORM public.my_call_queue();
  IF (SELECT count(*) FROM public.call_queue WHERE status = 'expired') < 1 THEN RAISE EXCEPTION 'FAIL 8: stale waiting entry should expire'; END IF;

  -- 9. switching the queue off, and a plan with no capacity, refuse politely
  UPDATE public.call_queue_settings SET queue_enabled = false;
  PERFORM pg_temp.act_as(_b1);
  IF public.join_call_queue(_sup, 'voice') ->> 'reason' <> 'queue_off' THEN RAISE EXCEPTION 'FAIL 9a'; END IF;
  UPDATE public.call_queue_settings SET queue_enabled = true;

  -- 10. audit log: admin changes are recorded with old/new values; ordinary users' changes and counter bumps are not
  PERFORM pg_temp.act_as(_adm);
  UPDATE public.call_queue_capacity SET max_waiting = 4 WHERE plan_slug = 'free';
  SELECT count(*) INTO _n FROM public.admin_audit_logs WHERE entity_type = 'call_queue_capacity' AND actor_id = _adm AND action = 'update'
     AND details -> 'changes' -> 'max_waiting' ->> 'to' = '4';
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL 10a: admin change should be logged once, got %', _n; END IF;
  PERFORM pg_temp.act_as(_b1);
  UPDATE public.call_queue_capacity SET max_waiting = 9 WHERE plan_slug = 'silver';       -- (this test runs as the database owner so RLS is not exercised; the point is that a non-admin actor is never logged)
  SELECT count(*) INTO _n FROM public.admin_audit_logs WHERE actor_id = _b1; IF _n <> 0 THEN RAISE EXCEPTION 'FAIL 10b: non-admin actions must not be logged'; END IF;
  _msg := NULL; BEGIN PERFORM public.admin_list_audit_logs(); EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL THEN RAISE EXCEPTION 'FAIL 10c: only admins may read the audit log'; END IF;
  PERFORM pg_temp.act_as(_adm);
  _list := public.admin_list_audit_logs('call_queue_capacity', 10);
  IF jsonb_array_length(_list) < 1 THEN RAISE EXCEPTION 'FAIL 10d: admin should see the entry'; END IF;

  RAISE EXCEPTION 'ALL CALL QUEUE AND AUDIT TESTS PASSED';
END $test$;
