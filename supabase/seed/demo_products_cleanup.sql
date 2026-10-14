-- =====================================================================
-- DEMO PRODUCTS CLEANUP
-- Removes everything demo_products.sql added: demo products (SKU 'DEMO-%'),
-- the demo suppliers, and any demo category that has no products left.
-- Run in the Supabase SQL editor. If a demo product was already ordered, the
-- order history will block its deletion; delete those orders first or keep it.
-- =====================================================================

DELETE FROM public.products WHERE sku LIKE 'DEMO-%';

DELETE FROM public.vendors
WHERE user_id IN ('00000000-0000-4000-8000-000000000d01'::uuid, '00000000-0000-4000-8000-000000000d02'::uuid, '00000000-0000-4000-8000-000000000d03'::uuid, '00000000-0000-4000-8000-000000000d04'::uuid, '00000000-0000-4000-8000-000000000d05'::uuid, '00000000-0000-4000-8000-000000000d06'::uuid);

-- Placeholder login records (only exist if your schema required them)
DELETE FROM public.user_roles WHERE user_id IN ('00000000-0000-4000-8000-000000000d01'::uuid, '00000000-0000-4000-8000-000000000d02'::uuid, '00000000-0000-4000-8000-000000000d03'::uuid, '00000000-0000-4000-8000-000000000d04'::uuid, '00000000-0000-4000-8000-000000000d05'::uuid, '00000000-0000-4000-8000-000000000d06'::uuid);
DELETE FROM public.profiles WHERE user_id IN ('00000000-0000-4000-8000-000000000d01'::uuid, '00000000-0000-4000-8000-000000000d02'::uuid, '00000000-0000-4000-8000-000000000d03'::uuid, '00000000-0000-4000-8000-000000000d04'::uuid, '00000000-0000-4000-8000-000000000d05'::uuid, '00000000-0000-4000-8000-000000000d06'::uuid);
DELETE FROM auth.users WHERE id IN ('00000000-0000-4000-8000-000000000d01'::uuid, '00000000-0000-4000-8000-000000000d02'::uuid, '00000000-0000-4000-8000-000000000d03'::uuid, '00000000-0000-4000-8000-000000000d04'::uuid, '00000000-0000-4000-8000-000000000d05'::uuid, '00000000-0000-4000-8000-000000000d06'::uuid);

DELETE FROM public.categories c
WHERE c.slug IN ('smartphones', 'laptops-computers', 'tablets-ereaders', 'phones-accessories', 'wearables', 'smart-tvs', 'gaming-devices', 'cameras-drones', 'power-banks-chargers', 'monitors', 'printers', 'home-kitchen', 'fashion', 'beauty-health', 'sports-outdoors')
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.categories k WHERE k.parent_id = c.id);
