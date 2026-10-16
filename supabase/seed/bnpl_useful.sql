-- Turn Pay later ON for every product in a category (examples, change the slug as you like)
UPDATE public.products SET bnpl_eligible = true
WHERE category_id = (SELECT id FROM public.categories WHERE slug = 'laptops-computers');

-- See what is currently eligible
SELECT name, price, bnpl_eligible FROM public.products WHERE bnpl_eligible ORDER BY price DESC LIMIT 30;

-- Troubleshooting: what Klump answered for the latest Pay later payments
SELECT order_id, status, provider_reference, is_live, raw_verify
FROM public.bnpl_transactions ORDER BY created_at DESC LIMIT 5;
