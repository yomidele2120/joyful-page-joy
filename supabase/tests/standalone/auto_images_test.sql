DO $$
DECLARE th uuid := gen_random_uuid(); ot uuid := gen_random_uuid(); cat uuid := gen_random_uuid(); p_none uuid; p_img uuid; p_arr uuid; p_other uuid; p_inactive uuid; j jsonb; n int; ok boolean;
BEGIN
  INSERT INTO public.categories VALUES (cat,'Laptops');
  INSERT INTO public.vendors VALUES (th, gen_random_uuid(), '  TechHub Operations Limited '), (ot, gen_random_uuid(), 'Other Shop');
  INSERT INTO public.products (id,name,vendor_id,category_id,image_url,images) VALUES
    (gen_random_uuid(),'Laptop A',th,cat,NULL,NULL) RETURNING id INTO p_none;
  INSERT INTO public.products (id,name,vendor_id,image_url,images) VALUES (gen_random_uuid(),'Has main image',th,'https://x/y.jpg',NULL) RETURNING id INTO p_img;
  INSERT INTO public.products (id,name,vendor_id,image_url,images) VALUES (gen_random_uuid(),'Has gallery',th,'',ARRAY['https://x/z.jpg']) RETURNING id INTO p_arr;
  INSERT INTO public.products (id,name,vendor_id,image_url,images) VALUES (gen_random_uuid(),'Other vendor no image',ot,NULL,'{}') RETURNING id INTO p_other;
  INSERT INTO public.products (id,name,vendor_id,image_url,images,is_active) VALUES (gen_random_uuid(),'Inactive',th,NULL,NULL,false) RETURNING id INTO p_inactive;
  -- enabled for exactly the matching vendor via the migration block? re-run the block now that data exists
  INSERT INTO public.auto_image_vendors (vendor_id) SELECT id FROM public.vendors WHERE lower(btrim(store_name)) = 'techhub operations limited' ON CONFLICT DO NOTHING;
  -- 1 only the picture-less, active product of the switched-on vendor is claimed
  j := public.claim_auto_product_images(5);
  IF jsonb_array_length(j) <> 1 OR (j->0->>'product_id')::uuid <> p_none OR j->0->>'category' <> 'Laptops' THEN RAISE EXCEPTION 'FAIL 1 %', j; END IF;
  IF (SELECT count(*) FROM public.auto_product_image_jobs) <> 1 THEN RAISE EXCEPTION 'FAIL 1b'; END IF;
  -- 2 a second claim does not hand out the same job
  IF jsonb_array_length(public.claim_auto_product_images(5)) <> 0 THEN RAISE EXCEPTION 'FAIL 2'; END IF;
  -- 3 save sets image + flag; job done
  IF NOT public.finish_auto_product_image(p_none, 'https://res.cloudinary.com/x/ai.jpg') THEN RAISE EXCEPTION 'FAIL 3a'; END IF;
  IF (SELECT ai_generated_image FROM public.products WHERE id=p_none) IS NOT TRUE OR (SELECT images[1] FROM public.products WHERE id=p_none) <> 'https://res.cloudinary.com/x/ai.jpg' THEN RAISE EXCEPTION 'FAIL 3b'; END IF;
  PERFORM set_config('app.auto_image','off',true);   -- (a real vendor edit is a separate transaction; the DO block is one)
  -- 4 vendor later uploads their own photo -> label cleared
  UPDATE public.products SET image_url='https://own/photo.jpg', images=ARRAY['https://own/photo.jpg'] WHERE id=p_none;
  IF (SELECT ai_generated_image FROM public.products WHERE id=p_none) THEN RAISE EXCEPTION 'FAIL 4 flag not cleared'; END IF;
  -- 5 never overwrite a picture that appeared while the job ran
  INSERT INTO public.products (id,name,vendor_id) VALUES (gen_random_uuid(),'Race',th) RETURNING id INTO p_img;
  PERFORM public.claim_auto_product_images(5);
  UPDATE public.products SET image_url='https://own/real.jpg' WHERE id=p_img;
  IF public.finish_auto_product_image(p_img,'https://res.cloudinary.com/x/late.jpg') THEN RAISE EXCEPTION 'FAIL 5a'; END IF;
  IF (SELECT image_url FROM public.products WHERE id=p_img) <> 'https://own/real.jpg' OR (SELECT status FROM public.auto_product_image_jobs WHERE product_id=p_img) <> 'skipped' THEN RAISE EXCEPTION 'FAIL 5b'; END IF;
  -- 6 retry rules: a retryable failure goes back to pending twice, then fails on attempt 3
  INSERT INTO public.products (id,name,vendor_id) VALUES (gen_random_uuid(),'Retry me',th) RETURNING id INTO p_arr;
  FOR n IN 1..3 LOOP
    j := public.claim_auto_product_images(5);
    IF jsonb_array_length(j) <> 1 THEN RAISE EXCEPTION 'FAIL 6a attempt %: %', n, j; END IF;
    PERFORM public.fail_auto_product_image(p_arr,'provider_network',true);
  END LOOP;
  IF (SELECT status FROM public.auto_product_image_jobs WHERE product_id=p_arr) <> 'failed' THEN RAISE EXCEPTION 'FAIL 6b'; END IF;
  IF jsonb_array_length(public.claim_auto_product_images(5)) <> 0 THEN RAISE EXCEPTION 'FAIL 6c'; END IF;
  -- 7 the other vendor and the inactive product were never queued
  IF EXISTS (SELECT 1 FROM public.auto_product_image_jobs WHERE product_id IN (p_other, p_inactive)) THEN RAISE EXCEPTION 'FAIL 7'; END IF;
  -- 8 daily cap
  UPDATE public.auto_image_settings SET daily_limit = 1;
  INSERT INTO public.products (id,name,vendor_id) VALUES (gen_random_uuid(),'Cap 1',th), (gen_random_uuid(),'Cap 2',th);
  IF jsonb_array_length(public.claim_auto_product_images(5)) <> 0 THEN RAISE EXCEPTION 'FAIL 8: cap should already be used up by today''s attempts'; END IF;
  UPDATE public.auto_image_settings SET daily_limit = 100, enabled = false;
  IF jsonb_array_length(public.claim_auto_product_images(5)) <> 0 THEN RAISE EXCEPTION 'FAIL 8b switched off'; END IF;
  -- 9 admin-only controls; non-admin refused
  PERFORM set_config('t.admin','off',false);
  ok:=false; BEGIN PERFORM public.admin_set_auto_product_images(ot,true); EXCEPTION WHEN OTHERS THEN ok:=true; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 9a'; END IF;
  PERFORM set_config('t.admin','on',false);
  PERFORM public.admin_set_auto_product_images(ot,true); PERFORM public.admin_set_auto_product_images(ot,false);
  IF (SELECT count(*) FROM public.auto_image_vendors) <> 1 THEN RAISE EXCEPTION 'FAIL 9b'; END IF;
  -- 10 bad url rejected
  ok:=false; BEGIN PERFORM public.finish_auto_product_image(p_none,'http://insecure/x.jpg'); EXCEPTION WHEN OTHERS THEN ok:=true; END; IF NOT ok THEN RAISE EXCEPTION 'FAIL 10'; END IF;
  RAISE EXCEPTION 'ALL AUTO PRODUCT IMAGE TESTS PASSED';
END $$;
