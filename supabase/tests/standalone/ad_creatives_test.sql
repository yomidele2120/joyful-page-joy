DO $$
DECLARE a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); r uuid; ok boolean; n int; f jsonb;
BEGIN
  INSERT INTO public.vendors VALUES (a, ua, 'A'), (b, ub, 'B');
  INSERT INTO storage.objects (bucket_id,name) VALUES ('ad-creatives', a||'/p1.jpg'),('ad-creatives', a||'/v1.mp4'),('ad-creatives', a||'/v2.mp4'),('ad-creatives', b||'/other.jpg');
  PERFORM set_config('t.uid', ua::text, false);
  -- 1 draft without files is allowed
  r := public.vendor_request_external_campaign('google_ads','shop','{}','traffic',5000,14,false);
  IF (SELECT status FROM public.external_ad_campaigns WHERE id=r) <> 'draft' THEN RAISE EXCEPTION 'FAIL 1'; END IF;
  -- 2 submit without files refused
  ok:=false; BEGIN PERFORM public.vendor_request_external_campaign('google_ads','shop','{}','traffic',5000,14,true); EXCEPTION WHEN OTHERS THEN ok:=true; RAISE NOTICE 'ok2: %', SQLERRM; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 2'; END IF;
  -- 3 submit with photo accepted
  r := public.vendor_request_external_campaign('google_ads','shop','{}','traffic',5000,14,true, jsonb_build_array(jsonb_build_object('kind','photo','path',a||'/p1.jpg','name','p1.jpg','size',10)), '  Show the red one  ');
  SELECT creative_files, status INTO f FROM (SELECT creative_files, status FROM public.external_ad_campaigns WHERE id=r) q;
  IF (SELECT creative_note FROM public.external_ad_campaigns WHERE id=r) <> 'Show the red one' OR (SELECT status FROM public.external_ad_campaigns WHERE id=r) <> 'pending_integration' THEN RAISE EXCEPTION 'FAIL 3'; END IF;
  -- 4 other vendor's file refused
  ok:=false; BEGIN PERFORM public.vendor_request_external_campaign('google_ads','shop','{}','traffic',5000,14,true, jsonb_build_array(jsonb_build_object('kind','photo','path',b||'/other.jpg'))); EXCEPTION WHEN OTHERS THEN ok:=true; RAISE NOTICE 'ok4: %', SQLERRM; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 4'; END IF;
  -- 5 path traversal / nested path refused
  ok:=false; BEGIN PERFORM public.vendor_request_external_campaign('google_ads','shop','{}','traffic',5000,14,true, jsonb_build_array(jsonb_build_object('kind','photo','path',a||'/../'||b||'/other.jpg'))); EXCEPTION WHEN OTHERS THEN ok:=true; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 5'; END IF;
  -- 6 file that was never uploaded refused
  ok:=false; BEGIN PERFORM public.vendor_request_external_campaign('google_ads','shop','{}','traffic',5000,14,true, jsonb_build_array(jsonb_build_object('kind','photo','path',a||'/ghost.jpg'))); EXCEPTION WHEN OTHERS THEN ok:=true; RAISE NOTICE 'ok6: %', SQLERRM; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 6'; END IF;
  -- 7 two videos refused, one video accepted
  ok:=false; BEGIN PERFORM public.vendor_request_external_campaign('tiktok_ads','shop','{}','traffic',5000,14,true, jsonb_build_array(jsonb_build_object('kind','video','path',a||'/v1.mp4'),jsonb_build_object('kind','video','path',a||'/v2.mp4'))); EXCEPTION WHEN OTHERS THEN ok:=true; RAISE NOTICE 'ok7: %', SQLERRM; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 7'; END IF;
  PERFORM public.vendor_request_external_campaign('tiktok_ads','shop','{}','traffic',5000,14,true, jsonb_build_array(jsonb_build_object('kind','video','path',a||'/v1.mp4')));
  -- 8 bad kind and non-array refused; 7 files refused
  ok:=false; BEGIN PERFORM public.vendor_request_external_campaign('tiktok_ads','shop','{}','traffic',5000,14,true, jsonb_build_array(jsonb_build_object('kind','pdf','path',a||'/p1.jpg'))); EXCEPTION WHEN OTHERS THEN ok:=true; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 8a'; END IF;
  ok:=false; BEGIN PERFORM public.vendor_request_external_campaign('tiktok_ads','shop','{}','traffic',5000,14,false, '{"a":1}'::jsonb); EXCEPTION WHEN OTHERS THEN ok:=true; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 8b'; END IF;
  ok:=false; BEGIN PERFORM public.vendor_request_external_campaign('tiktok_ads','shop','{}','traffic',5000,14,false, (SELECT jsonb_agg(jsonb_build_object('kind','photo','path',a||'/p1.jpg')) FROM generate_series(1,7))); EXCEPTION WHEN OTHERS THEN ok:=true; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 8c'; END IF;
  -- 9 long note refused
  ok:=false; BEGIN PERFORM public.vendor_request_external_campaign('tiktok_ads','shop','{}','traffic',5000,14,false,'[]',repeat('x',501)); EXCEPTION WHEN OTHERS THEN ok:=true; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 9'; END IF;
  -- 10 old 7-arg function is gone (only one overload remains)
  SELECT count(*) INTO n FROM pg_proc WHERE proname='vendor_request_external_campaign'; IF n <> 1 THEN RAISE EXCEPTION 'FAIL 10: % overloads', n; END IF;
  RAISE EXCEPTION 'ALL AD CREATIVE TESTS PASSED';
END $$;
