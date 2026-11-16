DO $$
DECLARE a uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); r jsonb; ok boolean; n int; id1 uuid; id2 uuid; bal bigint;
BEGIN
  INSERT INTO public.vendors VALUES (a, ua, 'A');
  PERFORM set_config('t.uid', ua::text, false);
  -- 1 no balance: refused, nothing written
  ok:=false; BEGIN PERFORM public.vendor_start_ai_image('a bowl of fresh mangoes on a table'); EXCEPTION WHEN OTHERS THEN ok:=true; RAISE NOTICE 't1: %', SQLERRM; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 1'; END IF;
  IF (SELECT count(*) FROM public.ad_ai_images)<>0 THEN RAISE EXCEPTION 'FAIL 1b'; END IF;
  INSERT INTO public.ad_wallet_ledger (vendor_id,kind,amount_kobo) VALUES (a,'topup',50000);   -- 500 naira
  -- 2 deducts exactly 200 naira at start
  r := public.vendor_start_ai_image('a bowl of fresh mangoes on a table'); id1 := (r->>'id')::uuid;
  IF public.ad_wallet_balance_kobo(a) <> 30000 OR (r->>'balance_kobo')::bigint <> 30000 THEN RAISE EXCEPTION 'FAIL 2 %', public.ad_wallet_balance_kobo(a); END IF;
  -- 3 failure refunds once; second refund call does nothing
  IF NOT public.finish_ai_image_failure(id1,'provider_network') THEN RAISE EXCEPTION 'FAIL 3a'; END IF;
  IF public.finish_ai_image_failure(id1,'provider_network') THEN RAISE EXCEPTION 'FAIL 3b double refund'; END IF;
  IF public.ad_wallet_balance_kobo(a) <> 50000 THEN RAISE EXCEPTION 'FAIL 3c %', public.ad_wallet_balance_kobo(a); END IF;
  -- 4 success keeps the charge; cannot then be refunded or finished twice
  r := public.vendor_start_ai_image('red ankara fabric folded neatly'); id2 := (r->>'id')::uuid;
  IF NOT public.finish_ai_image_success(id2, a||'/ai-x.jpg') THEN RAISE EXCEPTION 'FAIL 4a'; END IF;
  IF public.finish_ai_image_failure(id2,'x') THEN RAISE EXCEPTION 'FAIL 4b refund after success'; END IF;
  IF public.finish_ai_image_success(id2, a||'/ai-x.jpg') THEN RAISE EXCEPTION 'FAIL 4c'; END IF;
  IF public.ad_wallet_balance_kobo(a) <> 30000 THEN RAISE EXCEPTION 'FAIL 4d'; END IF;
  -- 5 path must be in the vendor's own folder
  r := public.vendor_start_ai_image('blue sneakers on a white shelf'); id1 := (r->>'id')::uuid;
  ok:=false; BEGIN PERFORM public.finish_ai_image_success(id1, gen_random_uuid()||'/ai-y.jpg'); EXCEPTION WHEN OTHERS THEN ok:=true; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 5'; END IF;
  -- 6 balance can go to exactly zero but never below
  PERFORM public.finish_ai_image_failure(id1,'x');  -- refund -> 30000
  INSERT INTO public.ad_wallet_ledger (vendor_id,kind,amount_kobo) VALUES (a,'adjustment',-10000);  -- balance 20000 = exactly one image
  UPDATE public.ad_ai_images SET created_at = now() - interval '2 hours';   -- clear hourly counter for the test
  r := public.vendor_start_ai_image('a leather handbag on a wooden bench'); IF public.ad_wallet_balance_kobo(a) <> 0 THEN RAISE EXCEPTION 'FAIL 6a'; END IF;
  ok:=false; BEGIN PERFORM public.vendor_start_ai_image('another leather handbag on a bench'); EXCEPTION WHEN OTHERS THEN ok:=true; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 6b'; END IF;
  -- 7 stuck job refunded by sweeper after 10 minutes, not before
  IF public.refund_stuck_ai_images() <> 0 THEN RAISE EXCEPTION 'FAIL 7a'; END IF;
  UPDATE public.ad_ai_images SET created_at = now() - interval '11 minutes' WHERE status='generating';
  n := public.refund_stuck_ai_images(); IF n <> 1 OR public.ad_wallet_balance_kobo(a) <> 20000 THEN RAISE EXCEPTION 'FAIL 7b n=% bal=%', n, public.ad_wallet_balance_kobo(a); END IF;
  -- 8 bad prompts
  ok:=false; BEGIN PERFORM public.vendor_start_ai_image('short'); EXCEPTION WHEN OTHERS THEN ok:=true; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 8a'; END IF;
  ok:=false; BEGIN PERFORM public.vendor_start_ai_image('visit https://evil.example for the best deals'); EXCEPTION WHEN OTHERS THEN ok:=true; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 8b'; END IF;
  -- 9 hourly limit
  UPDATE public.ad_wallet_settings SET ai_image_hourly_limit = 2; INSERT INTO public.ad_wallet_ledger (vendor_id,kind,amount_kobo) VALUES (a,'topup',1000000);
  UPDATE public.ad_ai_images SET created_at = now() - interval '2 hours';
  PERFORM public.vendor_start_ai_image('first lovely product photo of shoes'); PERFORM public.finish_ai_image_failure((SELECT id FROM public.ad_ai_images ORDER BY created_at DESC LIMIT 1),'x');
  PERFORM public.vendor_start_ai_image('second lovely product photo of shoes'); PERFORM public.finish_ai_image_failure((SELECT id FROM public.ad_ai_images ORDER BY created_at DESC LIMIT 1),'x');
  ok:=false; BEGIN PERFORM public.vendor_start_ai_image('third lovely product photo of shoes'); EXCEPTION WHEN OTHERS THEN ok:=true; RAISE NOTICE 't9: %', SQLERRM; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 9'; END IF;
  -- 10 switch off
  UPDATE public.ad_wallet_settings SET ai_image_enabled=false, ai_image_hourly_limit=50;
  ok:=false; BEGIN PERFORM public.vendor_start_ai_image('fourth lovely product photo of shoes'); EXCEPTION WHEN OTHERS THEN ok:=true; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 10'; END IF;
  -- 11 ledger can't have two charges for one image
  ok:=false; BEGIN INSERT INTO public.ad_wallet_ledger (vendor_id,kind,amount_kobo,ai_image_id) SELECT vendor_id,'ai_image',-1,id FROM public.ad_ai_images WHERE status='done' LIMIT 1; EXCEPTION WHEN unique_violation THEN ok:=true; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 11'; END IF;
  RAISE EXCEPTION 'ALL AI IMAGE TESTS PASSED';
END $$;
