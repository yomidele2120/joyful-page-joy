DO $$
DECLARE th uuid := gen_random_uuid(); ot uuid := gen_random_uuid(); p_broken uuid; p_good uuid; p_mixed uuid; p_other uuid; j jsonb; ok boolean;
BEGIN
  INSERT INTO public.vendors VALUES (th, gen_random_uuid(), 'TechHub Operations Limited'), (ot, gen_random_uuid(), 'Other');
  INSERT INTO public.auto_image_vendors (vendor_id) VALUES (th);
  INSERT INTO public.products (name,vendor_id,image_url,images) VALUES ('Monitor',th,'https://ithubafrica.com/media/a.jpeg',ARRAY['https://ithubafrica.com/media/a.jpeg']) RETURNING id INTO p_broken;
  INSERT INTO public.products (name,vendor_id,image_url,images) VALUES ('Good',th,'https://cdn.x/g.jpg',ARRAY['https://cdn.x/g.jpg']) RETURNING id INTO p_good;
  INSERT INTO public.products (name,vendor_id,image_url,images) VALUES ('Mixed',th,'https://cdn.x/dead.jpg',ARRAY['https://cdn.x/dead.jpg','https://cdn.x/live.jpg']) RETURNING id INTO p_mixed;
  INSERT INTO public.products (name,vendor_id,image_url,images) VALUES ('OtherVendor',ot,'https://dead/x.jpg',ARRAY['https://dead/x.jpg']) RETURNING id INTO p_other;
  -- 1 checks are claimed for the switched-on vendor only, with their distinct urls
  j := public.claim_auto_image_checks(10);
  IF jsonb_array_length(j) <> 3 THEN RAISE EXCEPTION 'FAIL 1 %', j; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(j) e WHERE (e->>'product_id')::uuid = p_other) THEN RAISE EXCEPTION 'FAIL 1b other vendor checked'; END IF;
  IF (SELECT jsonb_array_length(e->'urls') FROM jsonb_array_elements(j) e WHERE (e->>'product_id')::uuid = p_mixed) <> 2 THEN RAISE EXCEPTION 'FAIL 1c'; END IF;
  -- 2 ok and unknown do not create jobs; broken does
  PERFORM public.record_auto_image_check(p_good, ARRAY['https://cdn.x/g.jpg'], 'ok');
  PERFORM public.record_auto_image_check(p_mixed, ARRAY['https://cdn.x/dead.jpg','https://cdn.x/live.jpg'], 'ok');
  PERFORM public.record_auto_image_check(p_broken, ARRAY['https://ithubafrica.com/media/a.jpeg'], 'broken');
  IF (SELECT count(*) FROM public.auto_product_image_jobs) <> 1 THEN RAISE EXCEPTION 'FAIL 2'; END IF;
  -- 3 nothing is re-checked straight away; an unknown result is retried only after a day
  IF jsonb_array_length(public.claim_auto_image_checks(10)) <> 0 THEN RAISE EXCEPTION 'FAIL 3a'; END IF;
  PERFORM public.record_auto_image_check(p_good, ARRAY['https://cdn.x/g.jpg'], 'unknown');
  IF jsonb_array_length(public.claim_auto_image_checks(10)) <> 0 THEN RAISE EXCEPTION 'FAIL 3b'; END IF;
  UPDATE public.auto_product_image_checks SET checked_at = now() - interval '2 days' WHERE product_id = p_good;
  IF jsonb_array_length(public.claim_auto_image_checks(10)) <> 1 THEN RAISE EXCEPTION 'FAIL 3c'; END IF;
  -- 4 the worker picks up the broken product and replaces it
  j := public.claim_auto_product_images(5);
  IF jsonb_array_length(j) <> 1 OR (j->0->>'product_id')::uuid <> p_broken THEN RAISE EXCEPTION 'FAIL 4a %', j; END IF;
  IF NOT public.finish_auto_product_image(p_broken, 'https://res.cloudinary.com/x/new.jpg') THEN RAISE EXCEPTION 'FAIL 4b'; END IF;
  IF (SELECT ai_generated_image FROM public.products WHERE id=p_broken) IS NOT TRUE OR (SELECT images FROM public.products WHERE id=p_broken) <> ARRAY['https://res.cloudinary.com/x/new.jpg'] THEN RAISE EXCEPTION 'FAIL 4c'; END IF;
  -- 5 if the vendor fixed the picture in the meantime, it is NOT replaced
  INSERT INTO public.products (name,vendor_id,image_url,images) VALUES ('Race',th,'https://dead/r.jpg',ARRAY['https://dead/r.jpg']) RETURNING id INTO p_mixed;
  PERFORM public.record_auto_image_check(p_mixed, ARRAY['https://dead/r.jpg'], 'broken');
  PERFORM public.claim_auto_product_images(5);
  UPDATE public.products SET image_url='https://own/fixed.jpg', images=ARRAY['https://own/fixed.jpg'] WHERE id=p_mixed;
  IF public.finish_auto_product_image(p_mixed,'https://res.cloudinary.com/x/late.jpg') THEN RAISE EXCEPTION 'FAIL 5a'; END IF;
  IF (SELECT image_url FROM public.products WHERE id=p_mixed) <> 'https://own/fixed.jpg' THEN RAISE EXCEPTION 'FAIL 5b'; END IF;
  -- 6 a product that still has one other (unchecked) picture is not replaced either
  INSERT INTO public.products (name,vendor_id,image_url,images) VALUES ('Partial',th,'https://dead/p.jpg',ARRAY['https://dead/p.jpg','https://other/q.jpg']) RETURNING id INTO p_good;
  PERFORM public.record_auto_image_check(p_good, ARRAY['https://dead/p.jpg'], 'broken');   -- (checked list incomplete on purpose)
  PERFORM public.claim_auto_product_images(5);
  IF public.finish_auto_product_image(p_good,'https://res.cloudinary.com/x/p.jpg') THEN RAISE EXCEPTION 'FAIL 6 replaced a product that still has another picture'; END IF;
  RAISE EXCEPTION 'ALL BROKEN-LINK TESTS PASSED';
END $$;
