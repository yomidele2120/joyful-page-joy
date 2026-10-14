-- =====================================================================
-- DEMO PRODUCTS SEED  (126 products, 15 categories, 6 demo suppliers)
--
-- Run this in the Supabase SQL editor (it runs as the postgres role, so row-level
-- security does not get in the way). It is safe to run more than once: every insert
-- skips rows that already exist (matched by slug / user_id).
--
-- Every demo product has a SKU starting with 'DEMO-', so the matching cleanup
-- script (demo_products_cleanup.sql) can remove them all in one go.
--
-- Product images are SVG files that ship inside the app at /public/demo-products/,
-- so deploy the updated project together with this SQL.
--
-- Prices, stock, specs and supplier names are made-up demo data, not real listings.
-- Requires the B2B migration (moq, unit, price_tiers, specs columns) to be applied.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PART 1: categories (skipped if the slug already exists)
-- ---------------------------------------------------------------------
INSERT INTO public.categories (name, slug, description, sort_order) VALUES
  ('Smartphones', 'smartphones', 'Latest Android phones and iPhones: flagship, mid-range and budget, brand new or refurbished.', 1),
  ('Laptops & Computers', 'laptops-computers', 'Business, student, creator and gaming laptops from top brands, new and UK-used.', 2),
  ('Tablets & eReaders', 'tablets-ereaders', 'iPads and Android tablets for work, school and entertainment.', 3),
  ('Phone Accessories', 'phones-accessories', 'Earbuds, chargers, cables, cases, screen protectors and hubs.', 4),
  ('Wearables', 'wearables', 'Smartwatches and fitness bands.', 5),
  ('Smart TVs', 'smart-tvs', '4K and Full HD smart televisions in popular sizes.', 6),
  ('Gaming Devices', 'gaming-devices', 'Consoles, controllers and gaming peripherals.', 7),
  ('Cameras & Drones', 'cameras-drones', 'Mirrorless cameras, action cameras and drones.', 8),
  ('Power Banks & Chargers', 'power-banks-chargers', 'Power banks and portable power stations for always-on power.', 9),
  ('Monitors', 'monitors', 'Office, creator and gaming monitors.', 10),
  ('Printers', 'printers', 'Laser and ink-tank printers for home and office.', 11),
  ('Home & Kitchen', 'home-kitchen', 'Kitchen appliances, cooling and smart-home gadgets.', 12),
  ('Fashion', 'fashion', 'Footwear, watches and bags.', 13),
  ('Beauty & Health', 'beauty-health', 'Personal care and home health devices.', 14),
  ('Sports & Outdoors', 'sports-outdoors', 'Fitness equipment and body-tracking gear.', 15)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------
-- PART 1b: only if vendors.user_id has a foreign key to auth.users (older schema),
-- create placeholder auth users for the demo suppliers. Does nothing otherwise.
-- ---------------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vendors'::regclass AND contype = 'f' AND confrelid = 'auth.users'::regclass) THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change, email_change_token_new, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES
      ('00000000-0000-4000-8000-000000000d01'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'demo-seller-1@example.invalid', '', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Ikeja Digital Hub"}'::jsonb, now(), now()),
      ('00000000-0000-4000-8000-000000000d02'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'demo-seller-2@example.invalid', '', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Wuse Gadget Plaza"}'::jsonb, now(), now()),
      ('00000000-0000-4000-8000-000000000d03'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'demo-seller-3@example.invalid', '', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Alaba Electronics Depot"}'::jsonb, now(), now()),
      ('00000000-0000-4000-8000-000000000d04'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'demo-seller-4@example.invalid', '', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Kano Mobile Mart"}'::jsonb, now(), now()),
      ('00000000-0000-4000-8000-000000000d05'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'demo-seller-5@example.invalid', '', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "PH Tech Zone"}'::jsonb, now(), now()),
      ('00000000-0000-4000-8000-000000000d06'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'demo-seller-6@example.invalid', '', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Ibadan Home & Style"}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------
-- PART 2: demo suppliers (approved, with placeholder user ids; no bank details)
-- ---------------------------------------------------------------------
INSERT INTO public.vendors
  (user_id, store_name, store_description, phone, whatsapp_number, company_name, address, location, business_type, year_established, is_approved)
VALUES
  ('00000000-0000-4000-8000-000000000d01'::uuid, 'Ikeja Digital Hub', 'Authorised reseller of phones, laptops and accessories. Bulk orders for offices and schools welcome.', '+234 803 555 0101', '+234 803 555 0101', 'Ikeja Digital Hub Ltd (demo seller)', 'Computer Village, Ikeja, Lagos', 'Lagos, Nigeria', 'Registered business', 2016, true),
  ('00000000-0000-4000-8000-000000000d02'::uuid, 'Wuse Gadget Plaza', 'Premium laptops, Apple devices and business hardware with nationwide delivery.', '+234 803 555 0102', '+234 803 555 0102', 'Wuse Gadget Plaza Ltd (demo seller)', 'Wuse Zone 4, Abuja', 'Abuja, Nigeria', 'Registered business', 2014, true),
  ('00000000-0000-4000-8000-000000000d03'::uuid, 'Alaba Electronics Depot', 'Wholesale electronics, TVs, audio and gaming at trade prices.', '+234 803 555 0103', '+234 803 555 0103', 'Alaba Electronics Depot Ltd (demo seller)', 'Alaba International Market, Ojo, Lagos', 'Lagos, Nigeria', 'Registered business', 2012, true),
  ('00000000-0000-4000-8000-000000000d04'::uuid, 'Kano Mobile Mart', 'Affordable smartphones and accessories in bulk, shipped across the north.', '+234 803 555 0104', '+234 803 555 0104', 'Kano Mobile Mart Ltd (demo seller)', 'Sabon Gari Market, Kano', 'Kano, Nigeria', 'Starter business', 2019, true),
  ('00000000-0000-4000-8000-000000000d05'::uuid, 'PH Tech Zone', 'Gaming gear, laptops, cameras and power solutions for the south-south.', '+234 803 555 0105', '+234 803 555 0105', 'PH Tech Zone Ltd (demo seller)', 'Trans-Amadi, Port Harcourt', 'Port Harcourt, Nigeria', 'Registered business', 2018, true),
  ('00000000-0000-4000-8000-000000000d06'::uuid, 'Ibadan Home & Style', 'Home appliances, kitchen helpers, fashion and wellness products.', '+234 803 555 0106', '+234 803 555 0106', 'Ibadan Home & Style Ltd (demo seller)', 'Dugbe Market, Ibadan', 'Ibadan, Nigeria', 'Starter business', 2020, true)
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- PART 3: products - Smartphones (32)
-- ---------------------------------------------------------------------
INSERT INTO public.products
  (name, slug, description, price, compare_at_price, image_url, images, category_id, vendor_id, brand, sku,
   stock_quantity, is_active, is_featured, badge, moq, unit, price_tiers, specs, created_at)
SELECT v.name, v.slug, v.description, v.price, v.cmp, v.image_url, v.images, c.id, vd.id, v.brand, v.sku,
       v.stock, true, v.feat, v.badge, v.moq, v.unit, v.tiers::jsonb, v.specs::jsonb,
       now() - make_interval(hours => v.hrs)
FROM (VALUES
  ('Apple iPhone 16 Pro Max 256GB', 'apple-iphone-16-pro-max-256gb', $d$Apple iPhone 16 Pro Max 256GB is Apple's biggest and most capable iPhone, with a titanium body, the Camera Control button and the A18 Pro chip built for Apple Intelligence.

DISPLAY & PERFORMANCE
The 6.9-inch Super Retina XDR OLED, 120Hz ProMotion, 2868 x 1320 keeps every scroll, video and game smooth and sharp. Inside, the Apple A18 Pro (3nm) with 8GB of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs iOS 18.

CAMERA & BATTERY
Capture detail day and night with the 48MP Fusion + 48MP Ultra Wide + 12MP 5x Telephoto rear camera system, plus a 12MP TrueDepth front camera for selfies and video calls. A 4,685 mAh battery is built to last through a full day, and charging is handled by USB-C, 25W wired / 25W MagSafe.

KEY FEATURES
• Display: 6.9-inch Super Retina XDR OLED, 120Hz ProMotion, 2868 x 1320
• Processor: Apple A18 Pro (3nm)
• Memory & storage: 8GB RAM, 256GB
• Rear camera: 48MP Fusion + 48MP Ultra Wide + 12MP 5x Telephoto
• Battery: 4,685 mAh (USB-C, 25W wired / 25W MagSafe)
• Network: 5G · iOS 18

IN THE BOX
iPhone, USB-C charge cable, documentation. Power adapter is not included.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 2350000, 2480000, '/demo-products/apple-iphone-16-pro-max-256gb-1.svg', ARRAY['/demo-products/apple-iphone-16-pro-max-256gb-1.svg', '/demo-products/apple-iphone-16-pro-max-256gb-2.svg', '/demo-products/apple-iphone-16-pro-max-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d01', 'Apple', 'DEMO-PH-001', 18, true, 'New', 1, 'Piece', '[]', '{"Display": "6.9-inch Super Retina XDR OLED, 120Hz ProMotion, 2868 x 1320", "Processor": "Apple A18 Pro (3nm)", "Memory (RAM)": "8GB", "Storage": "256GB", "Rear camera": "48MP Fusion + 48MP Ultra Wide + 12MP 5x Telephoto", "Front camera": "12MP TrueDepth", "Battery": "4,685 mAh", "Charging": "USB-C, 25W wired / 25W MagSafe", "Network": "5G", "Operating system": "iOS 18", "Colour": "Natural Titanium", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 459),
  ('Apple iPhone 16 128GB', 'apple-iphone-16-128gb', $d$Apple iPhone 16 128GB brings the Action button, Camera Control and the A18 chip to the standard iPhone in a durable aluminium and Ceramic Shield design.

DISPLAY & PERFORMANCE
The 6.1-inch Super Retina XDR OLED, 60Hz, 2556 x 1179 keeps every scroll, video and game smooth and sharp. Inside, the Apple A18 with 8GB of memory and 128GB of storage handles multitasking, social apps and gaming with ease. It runs iOS 18.

CAMERA & BATTERY
Capture detail day and night with the 48MP Fusion + 12MP Ultra Wide rear camera system, plus a 12MP TrueDepth front camera for selfies and video calls. A 3,561 mAh battery is built to last through a full day, and charging is handled by USB-C, 20W wired / 25W MagSafe.

KEY FEATURES
• Display: 6.1-inch Super Retina XDR OLED, 60Hz, 2556 x 1179
• Processor: Apple A18
• Memory & storage: 8GB RAM, 128GB
• Rear camera: 48MP Fusion + 12MP Ultra Wide
• Battery: 3,561 mAh (USB-C, 20W wired / 25W MagSafe)
• Network: 5G · iOS 18

IN THE BOX
iPhone, USB-C charge cable, documentation. Power adapter is not included.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1450000, NULL::numeric, '/demo-products/apple-iphone-16-128gb-1.svg', ARRAY['/demo-products/apple-iphone-16-128gb-1.svg', '/demo-products/apple-iphone-16-128gb-2.svg', '/demo-products/apple-iphone-16-128gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d02', 'Apple', 'DEMO-PH-002', 26, true, 'New', 1, 'Piece', '[{"min_qty": 5, "price": 1421000}, {"min_qty": 10, "price": 1392000}, {"min_qty": 20, "price": 1363000}]', '{"Display": "6.1-inch Super Retina XDR OLED, 60Hz, 2556 x 1179", "Processor": "Apple A18", "Memory (RAM)": "8GB", "Storage": "128GB", "Rear camera": "48MP Fusion + 12MP Ultra Wide", "Front camera": "12MP TrueDepth", "Battery": "3,561 mAh", "Charging": "USB-C, 20W wired / 25W MagSafe", "Network": "5G", "Operating system": "iOS 18", "Colour": "Blue", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1174),
  ('Apple iPhone 15 128GB', 'apple-iphone-15-128gb', $d$Apple iPhone 15 128GB delivers USB-C, the Dynamic Island and a 48MP main camera at a more accessible price than the latest generation.

DISPLAY & PERFORMANCE
The 6.1-inch Super Retina XDR OLED, 60Hz, 2556 x 1179 keeps every scroll, video and game smooth and sharp. Inside, the Apple A16 Bionic with 6GB of memory and 128GB of storage handles multitasking, social apps and gaming with ease. It runs iOS 17 (upgradable).

CAMERA & BATTERY
Capture detail day and night with the 48MP main + 12MP Ultra Wide rear camera system, plus a 12MP TrueDepth front camera for selfies and video calls. A 3,349 mAh battery is built to last through a full day, and charging is handled by USB-C, 20W wired / 15W MagSafe.

KEY FEATURES
• Display: 6.1-inch Super Retina XDR OLED, 60Hz, 2556 x 1179
• Processor: Apple A16 Bionic
• Memory & storage: 6GB RAM, 128GB
• Rear camera: 48MP main + 12MP Ultra Wide
• Battery: 3,349 mAh (USB-C, 20W wired / 15W MagSafe)
• Network: 5G · iOS 17 (upgradable)

IN THE BOX
iPhone, USB-C charge cable, documentation. Power adapter is not included.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1150000, 1250000, '/demo-products/apple-iphone-15-128gb-1.svg', ARRAY['/demo-products/apple-iphone-15-128gb-1.svg', '/demo-products/apple-iphone-15-128gb-2.svg', '/demo-products/apple-iphone-15-128gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d02', 'Apple', 'DEMO-PH-003', 22, false, 'Hot', 1, 'Piece', '[{"min_qty": 5, "price": 1127000}, {"min_qty": 10, "price": 1104000}, {"min_qty": 20, "price": 1081000}]', '{"Display": "6.1-inch Super Retina XDR OLED, 60Hz, 2556 x 1179", "Processor": "Apple A16 Bionic", "Memory (RAM)": "6GB", "Storage": "128GB", "Rear camera": "48MP main + 12MP Ultra Wide", "Front camera": "12MP TrueDepth", "Battery": "3,349 mAh", "Charging": "USB-C, 20W wired / 15W MagSafe", "Network": "5G", "Operating system": "iOS 17 (upgradable)", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1203),
  ('Apple iPhone 15 Pro 256GB', 'apple-iphone-15-pro-256gb', $d$Apple iPhone 15 Pro 256GB pairs a lightweight titanium frame with the A17 Pro chip, a 3x telephoto lens and USB 3 speeds for fast file transfer.

DISPLAY & PERFORMANCE
The 6.1-inch LTPO Super Retina XDR OLED, 120Hz, 2556 x 1179 keeps every scroll, video and game smooth and sharp. Inside, the Apple A17 Pro (3nm) with 8GB of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs iOS 17 (upgradable).

CAMERA & BATTERY
Capture detail day and night with the 48MP main + 12MP Ultra Wide + 12MP 3x Telephoto rear camera system, plus a 12MP TrueDepth front camera for selfies and video calls. A 3,274 mAh battery is built to last through a full day, and charging is handled by USB-C (USB 3), 20W wired / 15W MagSafe.

KEY FEATURES
• Display: 6.1-inch LTPO Super Retina XDR OLED, 120Hz, 2556 x 1179
• Processor: Apple A17 Pro (3nm)
• Memory & storage: 8GB RAM, 256GB
• Rear camera: 48MP main + 12MP Ultra Wide + 12MP 3x Telephoto
• Battery: 3,274 mAh (USB-C (USB 3), 20W wired / 15W MagSafe)
• Network: 5G · iOS 17 (upgradable)

IN THE BOX
iPhone, USB-C charge cable, documentation. Power adapter is not included.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1650000, 1780000, '/demo-products/apple-iphone-15-pro-256gb-1.svg', ARRAY['/demo-products/apple-iphone-15-pro-256gb-1.svg', '/demo-products/apple-iphone-15-pro-256gb-2.svg', '/demo-products/apple-iphone-15-pro-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d01', 'Apple', 'DEMO-PH-004', 12, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 1617000}, {"min_qty": 10, "price": 1584000}, {"min_qty": 20, "price": 1551000}]', '{"Display": "6.1-inch LTPO Super Retina XDR OLED, 120Hz, 2556 x 1179", "Processor": "Apple A17 Pro (3nm)", "Memory (RAM)": "8GB", "Storage": "256GB", "Rear camera": "48MP main + 12MP Ultra Wide + 12MP 3x Telephoto", "Front camera": "12MP TrueDepth", "Battery": "3,274 mAh", "Charging": "USB-C (USB 3), 20W wired / 15W MagSafe", "Network": "5G", "Operating system": "iOS 17 (upgradable)", "Colour": "Titanium", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1259),
  ('Apple iPhone 14 128GB (Refurbished, Grade A)', 'apple-iphone-14-128gb-refurbished-grade-a', $d$Apple iPhone 14 128GB (Refurbished, Grade A) is a professionally tested, Grade A refurbished iPhone in excellent cosmetic condition with a fresh battery check, ideal for buyers who want the iPhone experience for less.

DISPLAY & PERFORMANCE
The 6.1-inch Super Retina XDR OLED, 60Hz, 2532 x 1170 keeps every scroll, video and game smooth and sharp. Inside, the Apple A15 Bionic with 6GB of memory and 128GB of storage handles multitasking, social apps and gaming with ease. It runs iOS 16 (upgradable).

CAMERA & BATTERY
Capture detail day and night with the 12MP main + 12MP Ultra Wide rear camera system, plus a 12MP TrueDepth front camera for selfies and video calls. A 3,279 mAh battery is built to last through a full day, and charging is handled by Lightning, 20W wired / 15W MagSafe.

KEY FEATURES
• Display: 6.1-inch Super Retina XDR OLED, 60Hz, 2532 x 1170
• Processor: Apple A15 Bionic
• Memory & storage: 6GB RAM, 128GB
• Rear camera: 12MP main + 12MP Ultra Wide
• Battery: 3,279 mAh (Lightning, 20W wired / 15W MagSafe)
• Network: 5G · iOS 16 (upgradable)

IN THE BOX
iPhone, Lightning charge cable, SIM ejector pin. Original box and power adapter are not included.

SUPPLY & WARRANTY
Each unit is inspected, tested and cleaned before sale. Refurbished (Grade A): expect light signs of use only. Core functions, battery, display and ports are checked, and the supplier backs every unit with a 6 months warranty. Bulk price breaks (where listed) apply automatically at checkout. Buying for a shop, school or office? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 720000, 820000, '/demo-products/apple-iphone-14-128gb-refurbished-grade-a-1.svg', ARRAY['/demo-products/apple-iphone-14-128gb-refurbished-grade-a-1.svg', '/demo-products/apple-iphone-14-128gb-refurbished-grade-a-2.svg', '/demo-products/apple-iphone-14-128gb-refurbished-grade-a-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d02', 'Apple', 'DEMO-PH-005', 14, false, 'Refurbished', 1, 'Piece', '[]', '{"Display": "6.1-inch Super Retina XDR OLED, 60Hz, 2532 x 1170", "Processor": "Apple A15 Bionic", "Memory (RAM)": "6GB", "Storage": "128GB", "Rear camera": "12MP main + 12MP Ultra Wide", "Front camera": "12MP TrueDepth", "Battery": "3,279 mAh", "Charging": "Lightning, 20W wired / 15W MagSafe", "Network": "5G", "Operating system": "iOS 16 (upgradable)", "Colour": "Midnight", "Condition": "Refurbished (Grade A)", "Warranty": "6 months"}', 202),
  ('Apple iPhone 13 128GB (Refurbished, Grade A)', 'apple-iphone-13-128gb-refurbished-grade-a', $d$Apple iPhone 13 128GB (Refurbished, Grade A) is a certified refurbished iPhone with the speedy A15 chip and a dual-camera system, tested and cleaned for like-new performance at a budget price.

DISPLAY & PERFORMANCE
The 6.1-inch Super Retina XDR OLED, 60Hz, 2532 x 1170 keeps every scroll, video and game smooth and sharp. Inside, the Apple A15 Bionic with 4GB of memory and 128GB of storage handles multitasking, social apps and gaming with ease. It runs iOS 15 (upgradable).

CAMERA & BATTERY
Capture detail day and night with the 12MP main + 12MP Ultra Wide rear camera system, plus a 12MP TrueDepth front camera for selfies and video calls. A 3,240 mAh battery is built to last through a full day, and charging is handled by Lightning, 20W wired / 15W MagSafe.

KEY FEATURES
• Display: 6.1-inch Super Retina XDR OLED, 60Hz, 2532 x 1170
• Processor: Apple A15 Bionic
• Memory & storage: 4GB RAM, 128GB
• Rear camera: 12MP main + 12MP Ultra Wide
• Battery: 3,240 mAh (Lightning, 20W wired / 15W MagSafe)
• Network: 5G · iOS 15 (upgradable)

IN THE BOX
iPhone, Lightning charge cable, SIM ejector pin. Original box and power adapter are not included.

SUPPLY & WARRANTY
Each unit is inspected, tested and cleaned before sale. Refurbished (Grade A): expect light signs of use only. Core functions, battery, display and ports are checked, and the supplier backs every unit with a 6 months warranty. Bulk price breaks (where listed) apply automatically at checkout. Buying for a shop, school or office? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 540000, NULL::numeric, '/demo-products/apple-iphone-13-128gb-refurbished-grade-a-1.svg', ARRAY['/demo-products/apple-iphone-13-128gb-refurbished-grade-a-1.svg', '/demo-products/apple-iphone-13-128gb-refurbished-grade-a-2.svg', '/demo-products/apple-iphone-13-128gb-refurbished-grade-a-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d02', 'Apple', 'DEMO-PH-006', 20, false, 'Refurbished', 1, 'Piece', '[{"min_qty": 5, "price": 529000}, {"min_qty": 10, "price": 518500}, {"min_qty": 20, "price": 507500}]', '{"Display": "6.1-inch Super Retina XDR OLED, 60Hz, 2532 x 1170", "Processor": "Apple A15 Bionic", "Memory (RAM)": "4GB", "Storage": "128GB", "Rear camera": "12MP main + 12MP Ultra Wide", "Front camera": "12MP TrueDepth", "Battery": "3,240 mAh", "Charging": "Lightning, 20W wired / 15W MagSafe", "Network": "5G", "Operating system": "iOS 15 (upgradable)", "Colour": "Pink", "Condition": "Refurbished (Grade A)", "Warranty": "6 months"}', 25),
  ('Samsung Galaxy S25 Ultra 256GB', 'samsung-galaxy-s25-ultra-256gb', $d$Samsung Galaxy S25 Ultra 256GB is Samsung's flagship with a built-in S Pen, a 200MP camera and Galaxy AI features powered by the Snapdragon 8 Elite.

DISPLAY & PERFORMANCE
The 6.9-inch Dynamic AMOLED 2X, 120Hz, QHD+ (3120 x 1440) keeps every scroll, video and game smooth and sharp. Inside, the Snapdragon 8 Elite for Galaxy with 12GB of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 15, One UI 7.

CAMERA & BATTERY
Capture detail day and night with the 200MP main + 50MP 5x Periscope + 10MP 3x Telephoto + 50MP Ultra Wide rear camera system, plus a 12MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 45W wired / 15W wireless.

KEY FEATURES
• Display: 6.9-inch Dynamic AMOLED 2X, 120Hz, QHD+ (3120 x 1440)
• Processor: Snapdragon 8 Elite for Galaxy
• Memory & storage: 12GB RAM, 256GB
• Rear camera: 200MP main + 50MP 5x Periscope + 10MP 3x Telephoto + 50MP Ultra Wide
• Battery: 5,000 mAh (45W wired / 15W wireless)
• Network: 5G · Android 15, One UI 7

IN THE BOX
Handset, USB-C cable, SIM ejector pin, quick start guide. Charger is not included.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 2150000, 2280000, '/demo-products/samsung-galaxy-s25-ultra-256gb-1.svg', ARRAY['/demo-products/samsung-galaxy-s25-ultra-256gb-1.svg', '/demo-products/samsung-galaxy-s25-ultra-256gb-2.svg', '/demo-products/samsung-galaxy-s25-ultra-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d04', 'Samsung', 'DEMO-PH-007', 15, true, 'New', 1, 'Piece', '[{"min_qty": 5, "price": 2107000}, {"min_qty": 10, "price": 2064000}, {"min_qty": 20, "price": 2021000}]', '{"Display": "6.9-inch Dynamic AMOLED 2X, 120Hz, QHD+ (3120 x 1440)", "Processor": "Snapdragon 8 Elite for Galaxy", "Memory (RAM)": "12GB", "Storage": "256GB", "Rear camera": "200MP main + 50MP 5x Periscope + 10MP 3x Telephoto + 50MP Ultra Wide", "Front camera": "12MP", "Battery": "5,000 mAh", "Charging": "45W wired / 15W wireless", "Network": "5G", "Operating system": "Android 15, One UI 7", "Colour": "Titanium", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1006),
  ('Samsung Galaxy S24 Ultra 256GB', 'samsung-galaxy-s24-ultra-256gb', $d$Samsung Galaxy S24 Ultra 256GB combines a titanium frame, an integrated S Pen and a 200MP quad-camera system, with seven years of promised OS updates.

DISPLAY & PERFORMANCE
The 6.8-inch Dynamic AMOLED 2X, 120Hz, QHD+ (3120 x 1440) keeps every scroll, video and game smooth and sharp. Inside, the Snapdragon 8 Gen 3 for Galaxy with 12GB of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 14, One UI 6.1.

CAMERA & BATTERY
Capture detail day and night with the 200MP main + 50MP 5x Telephoto + 10MP 3x Telephoto + 12MP Ultra Wide rear camera system, plus a 12MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 45W wired / 15W wireless.

KEY FEATURES
• Display: 6.8-inch Dynamic AMOLED 2X, 120Hz, QHD+ (3120 x 1440)
• Processor: Snapdragon 8 Gen 3 for Galaxy
• Memory & storage: 12GB RAM, 256GB
• Rear camera: 200MP main + 50MP 5x Telephoto + 10MP 3x Telephoto + 12MP Ultra Wide
• Battery: 5,000 mAh (45W wired / 15W wireless)
• Network: 5G · Android 14, One UI 6.1

IN THE BOX
Handset, USB-C cable, SIM ejector pin, quick start guide. Charger is not included.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1650000, 1780000, '/demo-products/samsung-galaxy-s24-ultra-256gb-1.svg', ARRAY['/demo-products/samsung-galaxy-s24-ultra-256gb-1.svg', '/demo-products/samsung-galaxy-s24-ultra-256gb-2.svg', '/demo-products/samsung-galaxy-s24-ultra-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d01', 'Samsung', 'DEMO-PH-008', 17, true, 'Sale', 1, 'Piece', '[{"min_qty": 5, "price": 1617000}, {"min_qty": 10, "price": 1584000}, {"min_qty": 20, "price": 1551000}]', '{"Display": "6.8-inch Dynamic AMOLED 2X, 120Hz, QHD+ (3120 x 1440)", "Processor": "Snapdragon 8 Gen 3 for Galaxy", "Memory (RAM)": "12GB", "Storage": "256GB", "Rear camera": "200MP main + 50MP 5x Telephoto + 10MP 3x Telephoto + 12MP Ultra Wide", "Front camera": "12MP", "Battery": "5,000 mAh", "Charging": "45W wired / 15W wireless", "Network": "5G", "Operating system": "Android 14, One UI 6.1", "Colour": "Natural Titanium", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 815),
  ('Samsung Galaxy S25 256GB', 'samsung-galaxy-s25-256gb', $d$Samsung Galaxy S25 256GB is a compact flagship that packs the Snapdragon 8 Elite, a bright 120Hz display and Galaxy AI into a pocket-friendly body.

DISPLAY & PERFORMANCE
The 6.2-inch Dynamic AMOLED 2X, 120Hz, FHD+ (2340 x 1080) keeps every scroll, video and game smooth and sharp. Inside, the Snapdragon 8 Elite for Galaxy with 12GB of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 15, One UI 7.

CAMERA & BATTERY
Capture detail day and night with the 50MP main + 12MP Ultra Wide + 10MP 3x Telephoto rear camera system, plus a 12MP front camera for selfies and video calls. A 4,000 mAh battery is built to last through a full day, and charging is handled by 25W wired / 15W wireless.

KEY FEATURES
• Display: 6.2-inch Dynamic AMOLED 2X, 120Hz, FHD+ (2340 x 1080)
• Processor: Snapdragon 8 Elite for Galaxy
• Memory & storage: 12GB RAM, 256GB
• Rear camera: 50MP main + 12MP Ultra Wide + 10MP 3x Telephoto
• Battery: 4,000 mAh (25W wired / 15W wireless)
• Network: 5G · Android 15, One UI 7

IN THE BOX
Handset, USB-C cable, SIM ejector pin, quick start guide. Charger is not included.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1250000, NULL::numeric, '/demo-products/samsung-galaxy-s25-256gb-1.svg', ARRAY['/demo-products/samsung-galaxy-s25-256gb-1.svg', '/demo-products/samsung-galaxy-s25-256gb-2.svg', '/demo-products/samsung-galaxy-s25-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d03', 'Samsung', 'DEMO-PH-009', 19, false, 'New', 1, 'Piece', '[{"min_qty": 5, "price": 1225000}, {"min_qty": 10, "price": 1200000}, {"min_qty": 20, "price": 1175000}]', '{"Display": "6.2-inch Dynamic AMOLED 2X, 120Hz, FHD+ (2340 x 1080)", "Processor": "Snapdragon 8 Elite for Galaxy", "Memory (RAM)": "12GB", "Storage": "256GB", "Rear camera": "50MP main + 12MP Ultra Wide + 10MP 3x Telephoto", "Front camera": "12MP", "Battery": "4,000 mAh", "Charging": "25W wired / 15W wireless", "Network": "5G", "Operating system": "Android 15, One UI 7", "Colour": "Navy", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 714),
  ('Samsung Galaxy A55 5G 8GB/256GB', 'samsung-galaxy-a55-5g-8gb-256gb', $d$Samsung Galaxy A55 5G 8GB/256GB is a premium-feeling mid-ranger with a metal frame, a vivid 120Hz Super AMOLED screen and IP67 water resistance.

DISPLAY & PERFORMANCE
The 6.6-inch Super AMOLED, 120Hz, FHD+ (2340 x 1080) keeps every scroll, video and game smooth and sharp. Inside, the Exynos 1480 with 8GB of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 14, One UI 6.1.

CAMERA & BATTERY
Capture detail day and night with the 50MP main (OIS) + 12MP Ultra Wide + 5MP Macro rear camera system, plus a 32MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 25W wired.

KEY FEATURES
• Display: 6.6-inch Super AMOLED, 120Hz, FHD+ (2340 x 1080)
• Processor: Exynos 1480
• Memory & storage: 8GB RAM, 256GB
• Rear camera: 50MP main (OIS) + 12MP Ultra Wide + 5MP Macro
• Battery: 5,000 mAh (25W wired)
• Network: 5G · Android 14, One UI 6.1

IN THE BOX
Handset, USB-C cable, SIM ejector pin, quick start guide. Charger is not included.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 480000, 520000, '/demo-products/samsung-galaxy-a55-5g-8gb-256gb-1.svg', ARRAY['/demo-products/samsung-galaxy-a55-5g-8gb-256gb-1.svg', '/demo-products/samsung-galaxy-a55-5g-8gb-256gb-2.svg', '/demo-products/samsung-galaxy-a55-5g-8gb-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d03', 'Samsung', 'DEMO-PH-010', 34, true, 'Best Seller', 1, 'Piece', '[{"min_qty": 5, "price": 470500}, {"min_qty": 10, "price": 461000}, {"min_qty": 20, "price": 451000}]', '{"Display": "6.6-inch Super AMOLED, 120Hz, FHD+ (2340 x 1080)", "Processor": "Exynos 1480", "Memory (RAM)": "8GB", "Storage": "256GB", "Rear camera": "50MP main (OIS) + 12MP Ultra Wide + 5MP Macro", "Front camera": "32MP", "Battery": "5,000 mAh", "Charging": "25W wired", "Network": "5G", "Operating system": "Android 14, One UI 6.1", "Colour": "Navy", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 772),
  ('Samsung Galaxy A35 5G 8GB/256GB', 'samsung-galaxy-a35-5g-8gb-256gb', $d$Samsung Galaxy A35 5G 8GB/256GB offers a smooth 120Hz Super AMOLED display, a stabilised 50MP camera and a long-lasting battery at a mid-range price.

DISPLAY & PERFORMANCE
The 6.6-inch Super AMOLED, 120Hz, FHD+ (2340 x 1080) keeps every scroll, video and game smooth and sharp. Inside, the Exynos 1380 with 8GB of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 14, One UI 6.1.

CAMERA & BATTERY
Capture detail day and night with the 50MP main (OIS) + 8MP Ultra Wide + 5MP Macro rear camera system, plus a 13MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 25W wired.

KEY FEATURES
• Display: 6.6-inch Super AMOLED, 120Hz, FHD+ (2340 x 1080)
• Processor: Exynos 1380
• Memory & storage: 8GB RAM, 256GB
• Rear camera: 50MP main (OIS) + 8MP Ultra Wide + 5MP Macro
• Battery: 5,000 mAh (25W wired)
• Network: 5G · Android 14, One UI 6.1

IN THE BOX
Handset, USB-C cable, SIM ejector pin, quick start guide. Charger is not included.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 390000, NULL::numeric, '/demo-products/samsung-galaxy-a35-5g-8gb-256gb-1.svg', ARRAY['/demo-products/samsung-galaxy-a35-5g-8gb-256gb-1.svg', '/demo-products/samsung-galaxy-a35-5g-8gb-256gb-2.svg', '/demo-products/samsung-galaxy-a35-5g-8gb-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d04', 'Samsung', 'DEMO-PH-011', 40, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 382000}, {"min_qty": 10, "price": 374500}, {"min_qty": 20, "price": 366500}]', '{"Display": "6.6-inch Super AMOLED, 120Hz, FHD+ (2340 x 1080)", "Processor": "Exynos 1380", "Memory (RAM)": "8GB", "Storage": "256GB", "Rear camera": "50MP main (OIS) + 8MP Ultra Wide + 5MP Macro", "Front camera": "13MP", "Battery": "5,000 mAh", "Charging": "25W wired", "Network": "5G", "Operating system": "Android 14, One UI 6.1", "Colour": "Lavender", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1053),
  ('Samsung Galaxy A16 6GB/128GB', 'samsung-galaxy-a16-6gb-128gb', $d$Samsung Galaxy A16 6GB/128GB is an affordable everyday phone with a bright AMOLED display, a triple camera and a battery that comfortably lasts through the day.

DISPLAY & PERFORMANCE
The 6.7-inch Super AMOLED, 90Hz, FHD+ (2340 x 1080) keeps every scroll, video and game smooth and sharp. Inside, the MediaTek Helio G99 with 6GB of memory and 128GB of storage handles multitasking, social apps and gaming with ease. It runs Android 14, One UI 6.

CAMERA & BATTERY
Capture detail day and night with the 50MP main + 5MP Ultra Wide + 2MP Macro rear camera system, plus a 13MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 25W wired.

KEY FEATURES
• Display: 6.7-inch Super AMOLED, 90Hz, FHD+ (2340 x 1080)
• Processor: MediaTek Helio G99
• Memory & storage: 6GB RAM, 128GB
• Rear camera: 50MP main + 5MP Ultra Wide + 2MP Macro
• Battery: 5,000 mAh (25W wired)
• Network: 4G · Android 14, One UI 6

IN THE BOX
Handset, USB-C cable, SIM ejector pin, quick start guide. Charger is not included.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 205000, 225000, '/demo-products/samsung-galaxy-a16-6gb-128gb-1.svg', ARRAY['/demo-products/samsung-galaxy-a16-6gb-128gb-1.svg', '/demo-products/samsung-galaxy-a16-6gb-128gb-2.svg', '/demo-products/samsung-galaxy-a16-6gb-128gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d04', 'Samsung', 'DEMO-PH-012', 60, false, 'Hot', 2, 'Piece', '[{"min_qty": 5, "price": 201000}, {"min_qty": 10, "price": 197000}, {"min_qty": 20, "price": 192500}]', '{"Display": "6.7-inch Super AMOLED, 90Hz, FHD+ (2340 x 1080)", "Processor": "MediaTek Helio G99", "Memory (RAM)": "6GB", "Storage": "128GB", "Rear camera": "50MP main + 5MP Ultra Wide + 2MP Macro", "Front camera": "13MP", "Battery": "5,000 mAh", "Charging": "25W wired", "Network": "4G", "Operating system": "Android 14, One UI 6", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 699),
  ('Samsung Galaxy A06 4GB/64GB', 'samsung-galaxy-a06-4gb-64gb', $d$Samsung Galaxy A06 4GB/64GB is a simple, dependable entry-level smartphone with a large screen and all-day battery for calls, WhatsApp and streaming.

DISPLAY & PERFORMANCE
The 6.7-inch PLS LCD, 60Hz, HD+ (1600 x 720) keeps every scroll, video and game smooth and sharp. Inside, the MediaTek Helio G85 with 4GB of memory and 64GB of storage handles multitasking, social apps and gaming with ease. It runs Android 14, One UI 6.1.

CAMERA & BATTERY
Capture detail day and night with the 50MP main + 2MP Depth rear camera system, plus a 8MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 25W wired.

KEY FEATURES
• Display: 6.7-inch PLS LCD, 60Hz, HD+ (1600 x 720)
• Processor: MediaTek Helio G85
• Memory & storage: 4GB RAM, 64GB
• Rear camera: 50MP main + 2MP Depth
• Battery: 5,000 mAh (25W wired)
• Network: 4G · Android 14, One UI 6.1

IN THE BOX
Handset, USB-C cable, SIM ejector pin, quick start guide. Charger is not included.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 118000, NULL::numeric, '/demo-products/samsung-galaxy-a06-4gb-64gb-1.svg', ARRAY['/demo-products/samsung-galaxy-a06-4gb-64gb-1.svg', '/demo-products/samsung-galaxy-a06-4gb-64gb-2.svg', '/demo-products/samsung-galaxy-a06-4gb-64gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d01', 'Samsung', 'DEMO-PH-013', 90, false, NULL::text, 3, 'Piece', '[{"min_qty": 6, "price": 115500}, {"min_qty": 15, "price": 113500}, {"min_qty": 30, "price": 111000}]', '{"Display": "6.7-inch PLS LCD, 60Hz, HD+ (1600 x 720)", "Processor": "MediaTek Helio G85", "Memory (RAM)": "4GB", "Storage": "64GB", "Rear camera": "50MP main + 2MP Depth", "Front camera": "8MP", "Battery": "5,000 mAh", "Charging": "25W wired", "Network": "4G", "Operating system": "Android 14, One UI 6.1", "Colour": "Gold", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1143),
  ('Samsung Galaxy Z Flip6 256GB', 'samsung-galaxy-z-flip6-256gb', $d$Samsung Galaxy Z Flip6 256GB is a pocketable foldable that opens into a full-size screen and lets you shoot hands-free selfies using the FlexCam and cover display.

DISPLAY & PERFORMANCE
The 6.7-inch Dynamic AMOLED 2X inner, 120Hz, FHD+ + 3.4-inch Super AMOLED cover keeps every scroll, video and game smooth and sharp. Inside, the Snapdragon 8 Gen 3 for Galaxy with 12GB of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 14, One UI 6.1.1.

CAMERA & BATTERY
Capture detail day and night with the 50MP main + 12MP Ultra Wide rear camera system, plus a 10MP front camera for selfies and video calls. A 4,000 mAh battery is built to last through a full day, and charging is handled by 25W wired / 15W wireless.

KEY FEATURES
• Display: 6.7-inch Dynamic AMOLED 2X inner, 120Hz, FHD+ + 3.4-inch Super AMOLED cover
• Processor: Snapdragon 8 Gen 3 for Galaxy
• Memory & storage: 12GB RAM, 256GB
• Rear camera: 50MP main + 12MP Ultra Wide
• Battery: 4,000 mAh (25W wired / 15W wireless)
• Network: 5G · Android 14, One UI 6.1.1

IN THE BOX
Handset, USB-C cable, SIM ejector pin, quick start guide. Charger is not included.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1350000, 1480000, '/demo-products/samsung-galaxy-z-flip6-256gb-1.svg', ARRAY['/demo-products/samsung-galaxy-z-flip6-256gb-1.svg', '/demo-products/samsung-galaxy-z-flip6-256gb-2.svg', '/demo-products/samsung-galaxy-z-flip6-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d03', 'Samsung', 'DEMO-PH-014', 8, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 1323000}, {"min_qty": 10, "price": 1296000}, {"min_qty": 20, "price": 1269000}]', '{"Display": "6.7-inch Dynamic AMOLED 2X inner, 120Hz, FHD+ + 3.4-inch Super AMOLED cover", "Processor": "Snapdragon 8 Gen 3 for Galaxy", "Memory (RAM)": "12GB", "Storage": "256GB", "Rear camera": "50MP main + 12MP Ultra Wide", "Front camera": "10MP", "Battery": "4,000 mAh", "Charging": "25W wired / 15W wireless", "Network": "5G", "Operating system": "Android 14, One UI 6.1.1", "Colour": "Mint", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 938),
  ('Tecno Camon 30 8GB/256GB', 'tecno-camon-30-8gb-256gb', $d$Tecno Camon 30 8GB/256GB focuses on photography, with a large OIS-stabilised main sensor, a 50MP selfie camera and super-fast 70W charging.

DISPLAY & PERFORMANCE
The 6.78-inch AMOLED, 120Hz, FHD+ (2436 x 1080) keeps every scroll, video and game smooth and sharp. Inside, the MediaTek Helio G99 Ultimate with 8GB (+8GB extended RAM) of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 14, HiOS 14.

CAMERA & BATTERY
Capture detail day and night with the 50MP RGBW main (OIS) + 2MP rear camera system, plus a 50MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 70W wired.

KEY FEATURES
• Display: 6.78-inch AMOLED, 120Hz, FHD+ (2436 x 1080)
• Processor: MediaTek Helio G99 Ultimate
• Memory & storage: 8GB (+8GB extended RAM) RAM, 256GB
• Rear camera: 50MP RGBW main (OIS) + 2MP
• Battery: 5,000 mAh (70W wired)
• Network: 4G · Android 14, HiOS 14

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 285000, 310000, '/demo-products/tecno-camon-30-8gb-256gb-1.svg', ARRAY['/demo-products/tecno-camon-30-8gb-256gb-1.svg', '/demo-products/tecno-camon-30-8gb-256gb-2.svg', '/demo-products/tecno-camon-30-8gb-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d03', 'Tecno', 'DEMO-PH-015', 30, true, 'New', 1, 'Piece', '[]', '{"Display": "6.78-inch AMOLED, 120Hz, FHD+ (2436 x 1080)", "Processor": "MediaTek Helio G99 Ultimate", "Memory (RAM)": "8GB (+8GB extended RAM)", "Storage": "256GB", "Rear camera": "50MP RGBW main (OIS) + 2MP", "Front camera": "50MP", "Battery": "5,000 mAh", "Charging": "70W wired", "Network": "4G", "Operating system": "Android 14, HiOS 14", "Colour": "Green", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 52),
  ('Tecno Spark 20 Pro 8GB/256GB', 'tecno-spark-20-pro-8gb-256gb', $d$Tecno Spark 20 Pro 8GB/256GB delivers a 108MP main camera and a smooth 120Hz screen in a stylish design that is priced for everyday users.

DISPLAY & PERFORMANCE
The 6.78-inch IPS LCD, 120Hz, FHD+ (2460 x 1080) keeps every scroll, video and game smooth and sharp. Inside, the MediaTek Helio G99 with 8GB (+8GB extended RAM) of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 13, HiOS 13.5.

CAMERA & BATTERY
Capture detail day and night with the 108MP main + auxiliary lens rear camera system, plus a 32MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 33W wired.

KEY FEATURES
• Display: 6.78-inch IPS LCD, 120Hz, FHD+ (2460 x 1080)
• Processor: MediaTek Helio G99
• Memory & storage: 8GB (+8GB extended RAM) RAM, 256GB
• Rear camera: 108MP main + auxiliary lens
• Battery: 5,000 mAh (33W wired)
• Network: 4G · Android 13, HiOS 13.5

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 195000, 215000, '/demo-products/tecno-spark-20-pro-8gb-256gb-1.svg', ARRAY['/demo-products/tecno-spark-20-pro-8gb-256gb-1.svg', '/demo-products/tecno-spark-20-pro-8gb-256gb-2.svg', '/demo-products/tecno-spark-20-pro-8gb-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d03', 'Tecno', 'DEMO-PH-016', 45, false, 'Hot', 2, 'Piece', '[{"min_qty": 5, "price": 191000}, {"min_qty": 10, "price": 187000}, {"min_qty": 20, "price": 183500}]', '{"Display": "6.78-inch IPS LCD, 120Hz, FHD+ (2460 x 1080)", "Processor": "MediaTek Helio G99", "Memory (RAM)": "8GB (+8GB extended RAM)", "Storage": "256GB", "Rear camera": "108MP main + auxiliary lens", "Front camera": "32MP", "Battery": "5,000 mAh", "Charging": "33W wired", "Network": "4G", "Operating system": "Android 13, HiOS 13.5", "Colour": "Blue", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 746),
  ('Tecno Spark 30 8GB/128GB', 'tecno-spark-30-8gb-128gb', $d$Tecno Spark 30 8GB/128GB is a value-packed phone with a big 120Hz display, dual speakers and a 64MP camera for social and everyday photography.

DISPLAY & PERFORMANCE
The 6.78-inch IPS LCD, 120Hz, FHD+ (2460 x 1080) keeps every scroll, video and game smooth and sharp. Inside, the MediaTek Helio G91 Ultimate with 8GB (+8GB extended RAM) of memory and 128GB of storage handles multitasking, social apps and gaming with ease. It runs Android 14, HiOS 14.

CAMERA & BATTERY
Capture detail day and night with the 64MP main + auxiliary lens rear camera system, plus a 13MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 18W wired.

KEY FEATURES
• Display: 6.78-inch IPS LCD, 120Hz, FHD+ (2460 x 1080)
• Processor: MediaTek Helio G91 Ultimate
• Memory & storage: 8GB (+8GB extended RAM) RAM, 128GB
• Rear camera: 64MP main + auxiliary lens
• Battery: 5,000 mAh (18W wired)
• Network: 4G · Android 14, HiOS 14

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 160000, NULL::numeric, '/demo-products/tecno-spark-30-8gb-128gb-1.svg', ARRAY['/demo-products/tecno-spark-30-8gb-128gb-1.svg', '/demo-products/tecno-spark-30-8gb-128gb-2.svg', '/demo-products/tecno-spark-30-8gb-128gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d05', 'Tecno', 'DEMO-PH-017', 55, false, NULL::text, 2, 'Piece', '[{"min_qty": 5, "price": 157000}, {"min_qty": 10, "price": 153500}, {"min_qty": 20, "price": 150500}]', '{"Display": "6.78-inch IPS LCD, 120Hz, FHD+ (2460 x 1080)", "Processor": "MediaTek Helio G91 Ultimate", "Memory (RAM)": "8GB (+8GB extended RAM)", "Storage": "128GB", "Rear camera": "64MP main + auxiliary lens", "Front camera": "13MP", "Battery": "5,000 mAh", "Charging": "18W wired", "Network": "4G", "Operating system": "Android 14, HiOS 14", "Colour": "Purple", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 866),
  ('Tecno Spark Go 1 4GB/64GB', 'tecno-spark-go-1-4gb-64gb', $d$Tecno Spark Go 1 4GB/64GB is a budget-friendly smartphone that keeps the basics strong: a 90Hz display, a big battery and dependable performance.

DISPLAY & PERFORMANCE
The 6.67-inch IPS LCD, 90Hz, HD+ (1600 x 720) keeps every scroll, video and game smooth and sharp. Inside, the Unisoc T615 with 4GB (+4GB extended RAM) of memory and 64GB of storage handles multitasking, social apps and gaming with ease. It runs Android 14 Go Edition.

CAMERA & BATTERY
Capture detail day and night with the 13MP main rear camera system, plus a 8MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 15W wired.

KEY FEATURES
• Display: 6.67-inch IPS LCD, 90Hz, HD+ (1600 x 720)
• Processor: Unisoc T615
• Memory & storage: 4GB (+4GB extended RAM) RAM, 64GB
• Rear camera: 13MP main
• Battery: 5,000 mAh (15W wired)
• Network: 4G · Android 14 Go Edition

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 88000, NULL::numeric, '/demo-products/tecno-spark-go-1-4gb-64gb-1.svg', ARRAY['/demo-products/tecno-spark-go-1-4gb-64gb-1.svg', '/demo-products/tecno-spark-go-1-4gb-64gb-2.svg', '/demo-products/tecno-spark-go-1-4gb-64gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d04', 'Tecno', 'DEMO-PH-018', 120, false, 'Best Seller', 5, 'Piece', '[{"min_qty": 10, "price": 86200}, {"min_qty": 25, "price": 84500}, {"min_qty": 50, "price": 82700}]', '{"Display": "6.67-inch IPS LCD, 90Hz, HD+ (1600 x 720)", "Processor": "Unisoc T615", "Memory (RAM)": "4GB (+4GB extended RAM)", "Storage": "64GB", "Rear camera": "13MP main", "Front camera": "8MP", "Battery": "5,000 mAh", "Charging": "15W wired", "Network": "4G", "Operating system": "Android 14 Go Edition", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 818),
  ('Tecno Phantom X2 12GB/256GB', 'tecno-phantom-x2-12gb-256gb', $d$Tecno Phantom X2 12GB/256GB is a curved-AMOLED flagship with a Dimensity 9000 chip, a portrait telephoto lens and a motorised retractable camera design.

DISPLAY & PERFORMANCE
The 6.8-inch curved AMOLED, 120Hz, FHD+ (2400 x 1080) keeps every scroll, video and game smooth and sharp. Inside, the MediaTek Dimensity 9000 with 12GB (+8GB extended RAM) of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 12, HiOS 12.

CAMERA & BATTERY
Capture detail day and night with the 50MP main + 13MP 2x Portrait + 50MP Ultra Wide rear camera system, plus a 32MP front camera for selfies and video calls. A 5,160 mAh battery is built to last through a full day, and charging is handled by 45W wired.

KEY FEATURES
• Display: 6.8-inch curved AMOLED, 120Hz, FHD+ (2400 x 1080)
• Processor: MediaTek Dimensity 9000
• Memory & storage: 12GB (+8GB extended RAM) RAM, 256GB
• Rear camera: 50MP main + 13MP 2x Portrait + 50MP Ultra Wide
• Battery: 5,160 mAh (45W wired)
• Network: 5G · Android 12, HiOS 12

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 580000, 690000, '/demo-products/tecno-phantom-x2-12gb-256gb-1.svg', ARRAY['/demo-products/tecno-phantom-x2-12gb-256gb-1.svg', '/demo-products/tecno-phantom-x2-12gb-256gb-2.svg', '/demo-products/tecno-phantom-x2-12gb-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d05', 'Tecno', 'DEMO-PH-019', 0, false, 'Deal', 1, 'Piece', '[{"min_qty": 5, "price": 568500}, {"min_qty": 10, "price": 557000}, {"min_qty": 20, "price": 545000}]', '{"Display": "6.8-inch curved AMOLED, 120Hz, FHD+ (2400 x 1080)", "Processor": "MediaTek Dimensity 9000", "Memory (RAM)": "12GB (+8GB extended RAM)", "Storage": "256GB", "Rear camera": "50MP main + 13MP 2x Portrait + 50MP Ultra Wide", "Front camera": "32MP", "Battery": "5,160 mAh", "Charging": "45W wired", "Network": "5G", "Operating system": "Android 12, HiOS 12", "Colour": "Silver", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 240),
  ('Tecno Pova 6 Pro 8GB/256GB', 'tecno-pova-6-pro-8gb-256gb', $d$Tecno Pova 6 Pro 8GB/256GB is built for gamers and heavy users with a massive 6,000 mAh battery, 70W charging and a 108MP main camera.

DISPLAY & PERFORMANCE
The 6.78-inch AMOLED, 120Hz, FHD+ (2436 x 1080) keeps every scroll, video and game smooth and sharp. Inside, the MediaTek Helio G99 Ultimate with 8GB (+8GB extended RAM) of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 14, HiOS 14.

CAMERA & BATTERY
Capture detail day and night with the 108MP main + auxiliary lens rear camera system, plus a 32MP front camera for selfies and video calls. A 6,000 mAh battery is built to last through a full day, and charging is handled by 70W wired.

KEY FEATURES
• Display: 6.78-inch AMOLED, 120Hz, FHD+ (2436 x 1080)
• Processor: MediaTek Helio G99 Ultimate
• Memory & storage: 8GB (+8GB extended RAM) RAM, 256GB
• Rear camera: 108MP main + auxiliary lens
• Battery: 6,000 mAh (70W wired)
• Network: 4G · Android 14, HiOS 14

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 310000, NULL::numeric, '/demo-products/tecno-pova-6-pro-8gb-256gb-1.svg', ARRAY['/demo-products/tecno-pova-6-pro-8gb-256gb-1.svg', '/demo-products/tecno-pova-6-pro-8gb-256gb-2.svg', '/demo-products/tecno-pova-6-pro-8gb-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d05', 'Tecno', 'DEMO-PH-020', 36, false, 'New', 2, 'Piece', '[{"min_qty": 5, "price": 304000}, {"min_qty": 10, "price": 297500}, {"min_qty": 20, "price": 291500}]', '{"Display": "6.78-inch AMOLED, 120Hz, FHD+ (2436 x 1080)", "Processor": "MediaTek Helio G99 Ultimate", "Memory (RAM)": "8GB (+8GB extended RAM)", "Storage": "256GB", "Rear camera": "108MP main + auxiliary lens", "Front camera": "32MP", "Battery": "6,000 mAh", "Charging": "70W wired", "Network": "4G", "Operating system": "Android 14, HiOS 14", "Colour": "Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1039),
  ('Infinix Note 40 Pro 8GB/256GB', 'infinix-note-40-pro-8gb-256gb', $d$Infinix Note 40 Pro 8GB/256GB stands out with 20W wireless MagCharge, a 120Hz AMOLED display and JBL-tuned stereo speakers at a mid-range price.

DISPLAY & PERFORMANCE
The 6.78-inch AMOLED, 120Hz, FHD+ (2436 x 1080) keeps every scroll, video and game smooth and sharp. Inside, the MediaTek Helio G99 Ultimate with 8GB (+8GB extended RAM) of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 14, XOS 14.

CAMERA & BATTERY
Capture detail day and night with the 108MP main + 2MP Depth + AF rear camera system, plus a 32MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 45W wired / 20W wireless MagCharge.

KEY FEATURES
• Display: 6.78-inch AMOLED, 120Hz, FHD+ (2436 x 1080)
• Processor: MediaTek Helio G99 Ultimate
• Memory & storage: 8GB (+8GB extended RAM) RAM, 256GB
• Rear camera: 108MP main + 2MP Depth + AF
• Battery: 5,000 mAh (45W wired / 20W wireless MagCharge)
• Network: 4G · Android 14, XOS 14

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 270000, 295000, '/demo-products/infinix-note-40-pro-8gb-256gb-1.svg', ARRAY['/demo-products/infinix-note-40-pro-8gb-256gb-1.svg', '/demo-products/infinix-note-40-pro-8gb-256gb-2.svg', '/demo-products/infinix-note-40-pro-8gb-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d05', 'Infinix', 'DEMO-PH-021', 32, true, 'Hot', 1, 'Piece', '[{"min_qty": 5, "price": 264500}, {"min_qty": 10, "price": 259000}, {"min_qty": 20, "price": 254000}]', '{"Display": "6.78-inch AMOLED, 120Hz, FHD+ (2436 x 1080)", "Processor": "MediaTek Helio G99 Ultimate", "Memory (RAM)": "8GB (+8GB extended RAM)", "Storage": "256GB", "Rear camera": "108MP main + 2MP Depth + AF", "Front camera": "32MP", "Battery": "5,000 mAh", "Charging": "45W wired / 20W wireless MagCharge", "Network": "4G", "Operating system": "Android 14, XOS 14", "Colour": "Green", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 817),
  ('Infinix Hot 40 Pro 8GB/256GB', 'infinix-hot-40-pro-8gb-256gb', $d$Infinix Hot 40 Pro 8GB/256GB combines a 108MP camera, a 120Hz display and 33W fast charging for buyers who want flagship-style features on a budget.

DISPLAY & PERFORMANCE
The 6.78-inch IPS LCD, 120Hz, FHD+ (2460 x 1080) keeps every scroll, video and game smooth and sharp. Inside, the MediaTek Helio G99 with 8GB (+8GB extended RAM) of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 13, XOS 13.

CAMERA & BATTERY
Capture detail day and night with the 108MP main + AI lens rear camera system, plus a 32MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 33W wired.

KEY FEATURES
• Display: 6.78-inch IPS LCD, 120Hz, FHD+ (2460 x 1080)
• Processor: MediaTek Helio G99
• Memory & storage: 8GB (+8GB extended RAM) RAM, 256GB
• Rear camera: 108MP main + AI lens
• Battery: 5,000 mAh (33W wired)
• Network: 4G · Android 13, XOS 13

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 185000, NULL::numeric, '/demo-products/infinix-hot-40-pro-8gb-256gb-1.svg', ARRAY['/demo-products/infinix-hot-40-pro-8gb-256gb-1.svg', '/demo-products/infinix-hot-40-pro-8gb-256gb-2.svg', '/demo-products/infinix-hot-40-pro-8gb-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d03', 'Infinix', 'DEMO-PH-022', 48, false, NULL::text, 2, 'Piece', '[{"min_qty": 5, "price": 181500}, {"min_qty": 10, "price": 177500}, {"min_qty": 20, "price": 174000}]', '{"Display": "6.78-inch IPS LCD, 120Hz, FHD+ (2460 x 1080)", "Processor": "MediaTek Helio G99", "Memory (RAM)": "8GB (+8GB extended RAM)", "Storage": "256GB", "Rear camera": "108MP main + AI lens", "Front camera": "32MP", "Battery": "5,000 mAh", "Charging": "33W wired", "Network": "4G", "Operating system": "Android 13, XOS 13", "Colour": "Bronze", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 862),
  ('Infinix Hot 40i 4GB/128GB', 'infinix-hot-40i-4gb-128gb', $d$Infinix Hot 40i 4GB/128GB offers a 50MP camera, a large 90Hz screen and a long-lasting battery at an entry-level price.

DISPLAY & PERFORMANCE
The 6.56-inch IPS LCD, 90Hz, HD+ (1612 x 720) keeps every scroll, video and game smooth and sharp. Inside, the Unisoc T606 with 4GB (+4GB extended RAM) of memory and 128GB of storage handles multitasking, social apps and gaming with ease. It runs Android 13, XOS 13.

CAMERA & BATTERY
Capture detail day and night with the 50MP main + AI lens rear camera system, plus a 8MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 18W wired.

KEY FEATURES
• Display: 6.56-inch IPS LCD, 90Hz, HD+ (1612 x 720)
• Processor: Unisoc T606
• Memory & storage: 4GB (+4GB extended RAM) RAM, 128GB
• Rear camera: 50MP main + AI lens
• Battery: 5,000 mAh (18W wired)
• Network: 4G · Android 13, XOS 13

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 105000, NULL::numeric, '/demo-products/infinix-hot-40i-4gb-128gb-1.svg', ARRAY['/demo-products/infinix-hot-40i-4gb-128gb-1.svg', '/demo-products/infinix-hot-40i-4gb-128gb-2.svg', '/demo-products/infinix-hot-40i-4gb-128gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d05', 'Infinix', 'DEMO-PH-023', 80, false, NULL::text, 3, 'Piece', '[{"min_qty": 6, "price": 103000}, {"min_qty": 15, "price": 101000}, {"min_qty": 30, "price": 98500}]', '{"Display": "6.56-inch IPS LCD, 90Hz, HD+ (1612 x 720)", "Processor": "Unisoc T606", "Memory (RAM)": "4GB (+4GB extended RAM)", "Storage": "128GB", "Rear camera": "50MP main + AI lens", "Front camera": "8MP", "Battery": "5,000 mAh", "Charging": "18W wired", "Network": "4G", "Operating system": "Android 13, XOS 13", "Colour": "Sky Blue", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1052),
  ('Infinix Zero 30 5G 12GB/256GB', 'infinix-zero-30-5g-12gb-256gb', $d$Infinix Zero 30 5G 12GB/256GB is a 5G camera phone with a curved 144Hz AMOLED display, a 50MP selfie camera and 4K 60fps front and rear video.

DISPLAY & PERFORMANCE
The 6.78-inch curved AMOLED, 144Hz, FHD+ (2400 x 1080) keeps every scroll, video and game smooth and sharp. Inside, the MediaTek Dimensity 8020 with 12GB (+12GB extended RAM) of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 13, XOS 13.

CAMERA & BATTERY
Capture detail day and night with the 108MP main (OIS) + 13MP Ultra Wide + 2MP rear camera system, plus a 50MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 68W wired.

KEY FEATURES
• Display: 6.78-inch curved AMOLED, 144Hz, FHD+ (2400 x 1080)
• Processor: MediaTek Dimensity 8020
• Memory & storage: 12GB (+12GB extended RAM) RAM, 256GB
• Rear camera: 108MP main (OIS) + 13MP Ultra Wide + 2MP
• Battery: 5,000 mAh (68W wired)
• Network: 5G · Android 13, XOS 13

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 360000, 395000, '/demo-products/infinix-zero-30-5g-12gb-256gb-1.svg', ARRAY['/demo-products/infinix-zero-30-5g-12gb-256gb-1.svg', '/demo-products/infinix-zero-30-5g-12gb-256gb-2.svg', '/demo-products/infinix-zero-30-5g-12gb-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d04', 'Infinix', 'DEMO-PH-024', 20, false, 'New', 1, 'Piece', '[{"min_qty": 5, "price": 353000}, {"min_qty": 10, "price": 345500}, {"min_qty": 20, "price": 338500}]', '{"Display": "6.78-inch curved AMOLED, 144Hz, FHD+ (2400 x 1080)", "Processor": "MediaTek Dimensity 8020", "Memory (RAM)": "12GB (+12GB extended RAM)", "Storage": "256GB", "Rear camera": "108MP main (OIS) + 13MP Ultra Wide + 2MP", "Front camera": "50MP", "Battery": "5,000 mAh", "Charging": "68W wired", "Network": "5G", "Operating system": "Android 13, XOS 13", "Colour": "Purple", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1180),
  ('Infinix Smart 8 4GB/64GB', 'infinix-smart-8-4gb-64gb', $d$Infinix Smart 8 4GB/64GB is a no-fuss starter phone with a big display, a long-lasting battery and enough storage for apps, photos and music.

DISPLAY & PERFORMANCE
The 6.6-inch IPS LCD, 90Hz, HD+ (1612 x 720) keeps every scroll, video and game smooth and sharp. Inside, the Unisoc T606 with 4GB (+4GB extended RAM) of memory and 64GB of storage handles multitasking, social apps and gaming with ease. It runs Android 13 Go Edition, XOS 13.

CAMERA & BATTERY
Capture detail day and night with the 13MP main + AI lens rear camera system, plus a 8MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 10W wired.

KEY FEATURES
• Display: 6.6-inch IPS LCD, 90Hz, HD+ (1612 x 720)
• Processor: Unisoc T606
• Memory & storage: 4GB (+4GB extended RAM) RAM, 64GB
• Rear camera: 13MP main + AI lens
• Battery: 5,000 mAh (10W wired)
• Network: 4G · Android 13 Go Edition, XOS 13

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 82000, NULL::numeric, '/demo-products/infinix-smart-8-4gb-64gb-1.svg', ARRAY['/demo-products/infinix-smart-8-4gb-64gb-1.svg', '/demo-products/infinix-smart-8-4gb-64gb-2.svg', '/demo-products/infinix-smart-8-4gb-64gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d01', 'Infinix', 'DEMO-PH-025', 140, false, 'Best Seller', 5, 'Piece', '[{"min_qty": 10, "price": 80400}, {"min_qty": 25, "price": 78700}, {"min_qty": 50, "price": 77100}]', '{"Display": "6.6-inch IPS LCD, 90Hz, HD+ (1612 x 720)", "Processor": "Unisoc T606", "Memory (RAM)": "4GB (+4GB extended RAM)", "Storage": "64GB", "Rear camera": "13MP main + AI lens", "Front camera": "8MP", "Battery": "5,000 mAh", "Charging": "10W wired", "Network": "4G", "Operating system": "Android 13 Go Edition, XOS 13", "Colour": "Teal", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 266),
  ('Xiaomi Redmi Note 13 Pro 8GB/256GB', 'xiaomi-redmi-note-13-pro-8gb-256gb', $d$Xiaomi Redmi Note 13 Pro 8GB/256GB brings a 200MP OIS camera, a vivid 120Hz AMOLED screen and 67W turbo charging to the mid-range.

DISPLAY & PERFORMANCE
The 6.67-inch AMOLED, 120Hz, FHD+ (2400 x 1080) keeps every scroll, video and game smooth and sharp. Inside, the MediaTek Helio G99 Ultra with 8GB of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 13, MIUI 14.

CAMERA & BATTERY
Capture detail day and night with the 200MP main (OIS) + 8MP Ultra Wide + 2MP Macro rear camera system, plus a 16MP front camera for selfies and video calls. A 5,100 mAh battery is built to last through a full day, and charging is handled by 67W wired.

KEY FEATURES
• Display: 6.67-inch AMOLED, 120Hz, FHD+ (2400 x 1080)
• Processor: MediaTek Helio G99 Ultra
• Memory & storage: 8GB RAM, 256GB
• Rear camera: 200MP main (OIS) + 8MP Ultra Wide + 2MP Macro
• Battery: 5,100 mAh (67W wired)
• Network: 4G · Android 13, MIUI 14

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 285000, 315000, '/demo-products/xiaomi-redmi-note-13-pro-8gb-256gb-1.svg', ARRAY['/demo-products/xiaomi-redmi-note-13-pro-8gb-256gb-1.svg', '/demo-products/xiaomi-redmi-note-13-pro-8gb-256gb-2.svg', '/demo-products/xiaomi-redmi-note-13-pro-8gb-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d04', 'Xiaomi', 'DEMO-PH-026', 38, true, 'Hot', 1, 'Piece', '[{"min_qty": 5, "price": 279500}, {"min_qty": 10, "price": 273500}, {"min_qty": 20, "price": 268000}]', '{"Display": "6.67-inch AMOLED, 120Hz, FHD+ (2400 x 1080)", "Processor": "MediaTek Helio G99 Ultra", "Memory (RAM)": "8GB", "Storage": "256GB", "Rear camera": "200MP main (OIS) + 8MP Ultra Wide + 2MP Macro", "Front camera": "16MP", "Battery": "5,100 mAh", "Charging": "67W wired", "Network": "4G", "Operating system": "Android 13, MIUI 14", "Colour": "Purple", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1276),
  ('Xiaomi Redmi Note 14 Pro 5G 8GB/256GB', 'xiaomi-redmi-note-14-pro-5g-8gb-256gb', $d$Xiaomi Redmi Note 14 Pro 5G 8GB/256GB is a 5G mid-ranger with a bright AMOLED display, a 50MP OIS main camera and fast charging for all-day productivity.

DISPLAY & PERFORMANCE
The 6.67-inch AMOLED, 120Hz, 1.5K (2712 x 1220) keeps every scroll, video and game smooth and sharp. Inside, the MediaTek Dimensity 7300 Ultra with 8GB of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 14, HyperOS.

CAMERA & BATTERY
Capture detail day and night with the 50MP main (OIS) + 8MP Ultra Wide + 2MP Macro rear camera system, plus a 20MP front camera for selfies and video calls. A 5,110 mAh battery is built to last through a full day, and charging is handled by 45W wired.

KEY FEATURES
• Display: 6.67-inch AMOLED, 120Hz, 1.5K (2712 x 1220)
• Processor: MediaTek Dimensity 7300 Ultra
• Memory & storage: 8GB RAM, 256GB
• Rear camera: 50MP main (OIS) + 8MP Ultra Wide + 2MP Macro
• Battery: 5,110 mAh (45W wired)
• Network: 5G · Android 14, HyperOS

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 360000, NULL::numeric, '/demo-products/xiaomi-redmi-note-14-pro-5g-8gb-256gb-1.svg', ARRAY['/demo-products/xiaomi-redmi-note-14-pro-5g-8gb-256gb-1.svg', '/demo-products/xiaomi-redmi-note-14-pro-5g-8gb-256gb-2.svg', '/demo-products/xiaomi-redmi-note-14-pro-5g-8gb-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d05', 'Xiaomi', 'DEMO-PH-027', 28, false, 'New', 1, 'Piece', '[{"min_qty": 5, "price": 353000}, {"min_qty": 10, "price": 345500}, {"min_qty": 20, "price": 338500}]', '{"Display": "6.67-inch AMOLED, 120Hz, 1.5K (2712 x 1220)", "Processor": "MediaTek Dimensity 7300 Ultra", "Memory (RAM)": "8GB", "Storage": "256GB", "Rear camera": "50MP main (OIS) + 8MP Ultra Wide + 2MP Macro", "Front camera": "20MP", "Battery": "5,110 mAh", "Charging": "45W wired", "Network": "5G", "Operating system": "Android 14, HyperOS", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 964),
  ('Xiaomi Redmi 13C 4GB/128GB', 'xiaomi-redmi-13c-4gb-128gb', $d$Xiaomi Redmi 13C 4GB/128GB is an affordable all-rounder with a 50MP camera, a large 90Hz display and a battery that easily lasts a full day.

DISPLAY & PERFORMANCE
The 6.74-inch IPS LCD, 90Hz, HD+ (1600 x 720) keeps every scroll, video and game smooth and sharp. Inside, the MediaTek Helio G85 with 4GB of memory and 128GB of storage handles multitasking, social apps and gaming with ease. It runs Android 13, MIUI 14.

CAMERA & BATTERY
Capture detail day and night with the 50MP main + 2MP Depth rear camera system, plus a 5MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 18W wired.

KEY FEATURES
• Display: 6.74-inch IPS LCD, 90Hz, HD+ (1600 x 720)
• Processor: MediaTek Helio G85
• Memory & storage: 4GB RAM, 128GB
• Rear camera: 50MP main + 2MP Depth
• Battery: 5,000 mAh (18W wired)
• Network: 4G · Android 13, MIUI 14

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 112000, 125000, '/demo-products/xiaomi-redmi-13c-4gb-128gb-1.svg', ARRAY['/demo-products/xiaomi-redmi-13c-4gb-128gb-1.svg', '/demo-products/xiaomi-redmi-13c-4gb-128gb-2.svg', '/demo-products/xiaomi-redmi-13c-4gb-128gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d01', 'Xiaomi', 'DEMO-PH-028', 85, false, NULL::text, 3, 'Piece', '[]', '{"Display": "6.74-inch IPS LCD, 90Hz, HD+ (1600 x 720)", "Processor": "MediaTek Helio G85", "Memory (RAM)": "4GB", "Storage": "128GB", "Rear camera": "50MP main + 2MP Depth", "Front camera": "5MP", "Battery": "5,000 mAh", "Charging": "18W wired", "Network": "4G", "Operating system": "Android 13, MIUI 14", "Colour": "Green", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 251),
  ('Xiaomi POCO X6 Pro 5G 8GB/256GB', 'xiaomi-poco-x6-pro-5g-8gb-256gb', $d$Xiaomi POCO X6 Pro 5G 8GB/256GB is a performance-focused 5G phone with a flagship-class Dimensity 8300 Ultra chip and a 1.5K 120Hz AMOLED screen built for gaming.

DISPLAY & PERFORMANCE
The 6.67-inch AMOLED, 120Hz, 1.5K (2712 x 1220) keeps every scroll, video and game smooth and sharp. Inside, the MediaTek Dimensity 8300 Ultra with 8GB of memory and 256GB of storage handles multitasking, social apps and gaming with ease. It runs Android 14, HyperOS.

CAMERA & BATTERY
Capture detail day and night with the 64MP main (OIS) + 8MP Ultra Wide + 2MP Macro rear camera system, plus a 16MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 67W wired.

KEY FEATURES
• Display: 6.67-inch AMOLED, 120Hz, 1.5K (2712 x 1220)
• Processor: MediaTek Dimensity 8300 Ultra
• Memory & storage: 8GB RAM, 256GB
• Rear camera: 64MP main (OIS) + 8MP Ultra Wide + 2MP Macro
• Battery: 5,000 mAh (67W wired)
• Network: 5G · Android 14, HyperOS

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 345000, 375000, '/demo-products/xiaomi-poco-x6-pro-5g-8gb-256gb-1.svg', ARRAY['/demo-products/xiaomi-poco-x6-pro-5g-8gb-256gb-1.svg', '/demo-products/xiaomi-poco-x6-pro-5g-8gb-256gb-2.svg', '/demo-products/xiaomi-poco-x6-pro-5g-8gb-256gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d05', 'Xiaomi', 'DEMO-PH-029', 24, false, 'Hot', 1, 'Piece', '[{"min_qty": 5, "price": 338000}, {"min_qty": 10, "price": 331000}, {"min_qty": 20, "price": 324500}]', '{"Display": "6.67-inch AMOLED, 120Hz, 1.5K (2712 x 1220)", "Processor": "MediaTek Dimensity 8300 Ultra", "Memory (RAM)": "8GB", "Storage": "256GB", "Rear camera": "64MP main (OIS) + 8MP Ultra Wide + 2MP Macro", "Front camera": "16MP", "Battery": "5,000 mAh", "Charging": "67W wired", "Network": "5G", "Operating system": "Android 14, HyperOS", "Colour": "Yellow", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1382),
  ('Google Pixel 9 128GB', 'google-pixel-9-128gb', $d$Google Pixel 9 128GB delivers Google's smartest camera and AI features, including Magic Editor and Gemini, with seven years of OS and security updates.

DISPLAY & PERFORMANCE
The 6.3-inch Actua OLED, 120Hz, FHD+ (2424 x 1080) keeps every scroll, video and game smooth and sharp. Inside, the Google Tensor G4 with 12GB of memory and 128GB of storage handles multitasking, social apps and gaming with ease. It runs Android 14 (upgradable).

CAMERA & BATTERY
Capture detail day and night with the 50MP main (OIS) + 48MP Ultra Wide rear camera system, plus a 10.5MP front camera for selfies and video calls. A 4,700 mAh battery is built to last through a full day, and charging is handled by 27W wired / 15W wireless.

KEY FEATURES
• Display: 6.3-inch Actua OLED, 120Hz, FHD+ (2424 x 1080)
• Processor: Google Tensor G4
• Memory & storage: 12GB RAM, 128GB
• Rear camera: 50MP main (OIS) + 48MP Ultra Wide
• Battery: 4,700 mAh (27W wired / 15W wireless)
• Network: 5G · Android 14 (upgradable)

IN THE BOX
Handset, USB-C cable, SIM ejector pin, quick start guide. Charger is not included.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 980000, 1050000, '/demo-products/google-pixel-9-128gb-1.svg', ARRAY['/demo-products/google-pixel-9-128gb-1.svg', '/demo-products/google-pixel-9-128gb-2.svg', '/demo-products/google-pixel-9-128gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d01', 'Google', 'DEMO-PH-030', 11, false, 'New', 1, 'Piece', '[{"min_qty": 5, "price": 960500}, {"min_qty": 10, "price": 941000}, {"min_qty": 20, "price": 921000}]', '{"Display": "6.3-inch Actua OLED, 120Hz, FHD+ (2424 x 1080)", "Processor": "Google Tensor G4", "Memory (RAM)": "12GB", "Storage": "128GB", "Rear camera": "50MP main (OIS) + 48MP Ultra Wide", "Front camera": "10.5MP", "Battery": "4,700 mAh", "Charging": "27W wired / 15W wireless", "Network": "5G", "Operating system": "Android 14 (upgradable)", "Colour": "Sky Blue", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1148),
  ('Google Pixel 8a 128GB', 'google-pixel-8a-128gb', $d$Google Pixel 8a 128GB is a compact, great-value Pixel with the Tensor G3 chip, a clean Android experience and class-leading point-and-shoot photos.

DISPLAY & PERFORMANCE
The 6.1-inch OLED, 120Hz, FHD+ (2400 x 1080) keeps every scroll, video and game smooth and sharp. Inside, the Google Tensor G3 with 8GB of memory and 128GB of storage handles multitasking, social apps and gaming with ease. It runs Android 14 (upgradable).

CAMERA & BATTERY
Capture detail day and night with the 64MP main (OIS) + 13MP Ultra Wide rear camera system, plus a 13MP front camera for selfies and video calls. A 4,492 mAh battery is built to last through a full day, and charging is handled by 18W wired / 7.5W wireless.

KEY FEATURES
• Display: 6.1-inch OLED, 120Hz, FHD+ (2400 x 1080)
• Processor: Google Tensor G3
• Memory & storage: 8GB RAM, 128GB
• Rear camera: 64MP main (OIS) + 13MP Ultra Wide
• Battery: 4,492 mAh (18W wired / 7.5W wireless)
• Network: 5G · Android 14 (upgradable)

IN THE BOX
Handset, USB-C cable, SIM ejector pin, quick start guide. Charger is not included.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 520000, 580000, '/demo-products/google-pixel-8a-128gb-1.svg', ARRAY['/demo-products/google-pixel-8a-128gb-1.svg', '/demo-products/google-pixel-8a-128gb-2.svg', '/demo-products/google-pixel-8a-128gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d01', 'Google', 'DEMO-PH-031', 0, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 509500}, {"min_qty": 10, "price": 499000}, {"min_qty": 20, "price": 489000}]', '{"Display": "6.1-inch OLED, 120Hz, FHD+ (2400 x 1080)", "Processor": "Google Tensor G3", "Memory (RAM)": "8GB", "Storage": "128GB", "Rear camera": "64MP main (OIS) + 13MP Ultra Wide", "Front camera": "13MP", "Battery": "4,492 mAh", "Charging": "18W wired / 7.5W wireless", "Network": "5G", "Operating system": "Android 14 (upgradable)", "Colour": "Mint", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1124),
  ('itel A70 4GB/128GB', 'itel-a70-4gb-128gb', $d$itel A70 4GB/128GB is a simple, affordable phone with generous storage, a large screen and a battery built to last for days of light use.

DISPLAY & PERFORMANCE
The 6.6-inch IPS LCD, 90Hz, HD+ (1612 x 720) keeps every scroll, video and game smooth and sharp. Inside, the Unisoc T603 with 4GB (+4GB extended RAM) of memory and 128GB of storage handles multitasking, social apps and gaming with ease. It runs Android 13 Go Edition.

CAMERA & BATTERY
Capture detail day and night with the 13MP main rear camera system, plus a 8MP front camera for selfies and video calls. A 5,000 mAh battery is built to last through a full day, and charging is handled by 18W wired.

KEY FEATURES
• Display: 6.6-inch IPS LCD, 90Hz, HD+ (1612 x 720)
• Processor: Unisoc T603
• Memory & storage: 4GB (+4GB extended RAM) RAM, 128GB
• Rear camera: 13MP main
• Battery: 5,000 mAh (18W wired)
• Network: 4G · Android 13 Go Edition

IN THE BOX
Handset, fast charger, USB cable, SIM ejector pin, protective case, quick start guide and warranty card.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 75000, NULL::numeric, '/demo-products/itel-a70-4gb-128gb-1.svg', ARRAY['/demo-products/itel-a70-4gb-128gb-1.svg', '/demo-products/itel-a70-4gb-128gb-2.svg', '/demo-products/itel-a70-4gb-128gb-3.svg']::text[], 'smartphones', '00000000-0000-4000-8000-000000000d05', 'itel', 'DEMO-PH-032', 150, false, 'Best Seller', 5, 'Piece', '[{"min_qty": 10, "price": 73500}, {"min_qty": 25, "price": 72000}, {"min_qty": 50, "price": 70500}]', '{"Display": "6.6-inch IPS LCD, 90Hz, HD+ (1612 x 720)", "Processor": "Unisoc T603", "Memory (RAM)": "4GB (+4GB extended RAM)", "Storage": "128GB", "Rear camera": "13MP main", "Front camera": "8MP", "Battery": "5,000 mAh", "Charging": "18W wired", "Network": "4G", "Operating system": "Android 13 Go Edition", "Colour": "Blue", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 825)
) AS v(name, slug, description, price, cmp, image_url, images, cat_slug, vendor_uid, brand, sku,
       stock, feat, badge, moq, unit, tiers, specs, hrs)
JOIN public.categories c ON c.slug = v.cat_slug
JOIN public.vendors vd ON vd.user_id = v.vendor_uid::uuid
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------
-- PART 4: products - Laptops & Computers (34)
-- ---------------------------------------------------------------------
INSERT INTO public.products
  (name, slug, description, price, compare_at_price, image_url, images, category_id, vendor_id, brand, sku,
   stock_quantity, is_active, is_featured, badge, moq, unit, price_tiers, specs, created_at)
SELECT v.name, v.slug, v.description, v.price, v.cmp, v.image_url, v.images, c.id, vd.id, v.brand, v.sku,
       v.stock, true, v.feat, v.badge, v.moq, v.unit, v.tiers::jsonb, v.specs::jsonb,
       now() - make_interval(hours => v.hrs)
FROM (VALUES
  ('Apple MacBook Air 13" M2 8GB/256GB', 'apple-macbook-air-13-m2-8gb-256gb', $d$Apple MacBook Air 13" M2 8GB/256GB is a thin, fanless laptop with all-day battery life and the efficient Apple M2 chip, perfect for students and professionals on the move.

PERFORMANCE
Powered by the Apple M2 (8-core CPU) with 8GB unified memory and a 256GB SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Apple M2 8-core GPU. It runs macOS.

DISPLAY & DESIGN
The 13.6-inch Liquid Retina, 2560 x 1664, 500 nits gives you a sharp, comfortable view for work and entertainment. At 1.24 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
52.6Wh, up to 18 hours. Connectivity includes 2x Thunderbolt/USB 4, MagSafe 3, 3.5mm headphone jack.

BEST FOR
Ideal for professionals, creators and frequent travellers who want top-tier build quality, displays and battery life.

KEY FEATURES
• Processor: Apple M2 (8-core CPU)
• Memory & storage: 8GB unified memory, 256GB SSD
• Display: 13.6-inch Liquid Retina, 2560 x 1664, 500 nits
• Graphics: Apple M2 8-core GPU
• Battery: 52.6Wh, up to 18 hours
• Weight: 1.24 kg

IN THE BOX
MacBook, USB-C power adapter, USB-C to MagSafe 3 cable, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1250000, 1350000, '/demo-products/apple-macbook-air-13-m2-8gb-256gb-1.svg', ARRAY['/demo-products/apple-macbook-air-13-m2-8gb-256gb-1.svg', '/demo-products/apple-macbook-air-13-m2-8gb-256gb-2.svg', '/demo-products/apple-macbook-air-13-m2-8gb-256gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d03', 'Apple', 'DEMO-LP-001', 14, true, 'Best Seller', 1, 'Piece', '[{"min_qty": 5, "price": 1225000}, {"min_qty": 10, "price": 1200000}, {"min_qty": 20, "price": 1175000}]', '{"Processor": "Apple M2 (8-core CPU)", "Memory (RAM)": "8GB unified memory", "Storage": "256GB SSD", "Display": "13.6-inch Liquid Retina, 2560 x 1664, 500 nits", "Graphics": "Apple M2 8-core GPU", "Operating system": "macOS", "Battery": "52.6Wh, up to 18 hours", "Weight": "1.24 kg", "Ports": "2x Thunderbolt/USB 4, MagSafe 3, 3.5mm headphone jack", "Colour": "Midnight", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 552),
  ('Apple MacBook Air 13" M3 16GB/512GB', 'apple-macbook-air-13-m3-16gb-512gb', $d$Apple MacBook Air 13" M3 16GB/512GB brings the faster M3 chip, 16GB of memory and Wi-Fi 6E to Apple's lightest laptop, ready for multitasking and creative work.

PERFORMANCE
Powered by the Apple M3 (8-core CPU) with 16GB unified memory and a 512GB SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Apple M3 8-core GPU. It runs macOS.

DISPLAY & DESIGN
The 13.6-inch Liquid Retina, 2560 x 1664, 500 nits gives you a sharp, comfortable view for work and entertainment. At 1.24 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
52.6Wh, up to 18 hours. Connectivity includes 2x Thunderbolt/USB 4, MagSafe 3, 3.5mm headphone jack.

BEST FOR
Ideal for professionals, creators and frequent travellers who want top-tier build quality, displays and battery life.

KEY FEATURES
• Processor: Apple M3 (8-core CPU)
• Memory & storage: 16GB unified memory, 512GB SSD
• Display: 13.6-inch Liquid Retina, 2560 x 1664, 500 nits
• Graphics: Apple M3 8-core GPU
• Battery: 52.6Wh, up to 18 hours
• Weight: 1.24 kg

IN THE BOX
MacBook, USB-C power adapter, USB-C to MagSafe 3 cable, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1780000, NULL::numeric, '/demo-products/apple-macbook-air-13-m3-16gb-512gb-1.svg', ARRAY['/demo-products/apple-macbook-air-13-m3-16gb-512gb-1.svg', '/demo-products/apple-macbook-air-13-m3-16gb-512gb-2.svg', '/demo-products/apple-macbook-air-13-m3-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d01', 'Apple', 'DEMO-LP-002', 10, true, 'New', 1, 'Piece', '[{"min_qty": 5, "price": 1744500}, {"min_qty": 10, "price": 1709000}, {"min_qty": 20, "price": 1673000}]', '{"Processor": "Apple M3 (8-core CPU)", "Memory (RAM)": "16GB unified memory", "Storage": "512GB SSD", "Display": "13.6-inch Liquid Retina, 2560 x 1664, 500 nits", "Graphics": "Apple M3 8-core GPU", "Operating system": "macOS", "Battery": "52.6Wh, up to 18 hours", "Weight": "1.24 kg", "Ports": "2x Thunderbolt/USB 4, MagSafe 3, 3.5mm headphone jack", "Colour": "Starlight", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 69),
  ('Apple MacBook Air 15" M3 16GB/512GB', 'apple-macbook-air-15-m3-16gb-512gb', $d$Apple MacBook Air 15" M3 16GB/512GB gives you a roomy 15.3-inch display and six-speaker sound system in a laptop that is still only 11.5mm thin.

PERFORMANCE
Powered by the Apple M3 (8-core CPU) with 16GB unified memory and a 512GB SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Apple M3 10-core GPU. It runs macOS.

DISPLAY & DESIGN
The 15.3-inch Liquid Retina, 2880 x 1864, 500 nits gives you a sharp, comfortable view for work and entertainment. At 1.51 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
66.5Wh, up to 18 hours. Connectivity includes 2x Thunderbolt/USB 4, MagSafe 3, 3.5mm headphone jack.

BEST FOR
Ideal for professionals, creators and frequent travellers who want top-tier build quality, displays and battery life.

KEY FEATURES
• Processor: Apple M3 (8-core CPU)
• Memory & storage: 16GB unified memory, 512GB SSD
• Display: 15.3-inch Liquid Retina, 2880 x 1864, 500 nits
• Graphics: Apple M3 10-core GPU
• Battery: 66.5Wh, up to 18 hours
• Weight: 1.51 kg

IN THE BOX
MacBook, USB-C power adapter, USB-C to MagSafe 3 cable, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 2150000, 2250000, '/demo-products/apple-macbook-air-15-m3-16gb-512gb-1.svg', ARRAY['/demo-products/apple-macbook-air-15-m3-16gb-512gb-1.svg', '/demo-products/apple-macbook-air-15-m3-16gb-512gb-2.svg', '/demo-products/apple-macbook-air-15-m3-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d05', 'Apple', 'DEMO-LP-003', 8, false, NULL::text, 1, 'Piece', '[]', '{"Processor": "Apple M3 (8-core CPU)", "Memory (RAM)": "16GB unified memory", "Storage": "512GB SSD", "Display": "15.3-inch Liquid Retina, 2880 x 1864, 500 nits", "Graphics": "Apple M3 10-core GPU", "Operating system": "macOS", "Battery": "66.5Wh, up to 18 hours", "Weight": "1.51 kg", "Ports": "2x Thunderbolt/USB 4, MagSafe 3, 3.5mm headphone jack", "Colour": "Space Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1072),
  ('Apple MacBook Pro 14" M4 16GB/512GB', 'apple-macbook-pro-14-m4-16gb-512gb', $d$Apple MacBook Pro 14" M4 16GB/512GB is built for demanding work, with the M4 chip, a brilliant Liquid Retina XDR display and a full set of pro ports.

PERFORMANCE
Powered by the Apple M4 (10-core CPU) with 16GB unified memory and a 512GB SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Apple M4 10-core GPU. It runs macOS.

DISPLAY & DESIGN
The 14.2-inch Liquid Retina XDR, 3024 x 1964, 1000 nits sustained gives you a sharp, comfortable view for work and entertainment. At 1.55 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
72.4Wh, up to 24 hours. Connectivity includes 3x Thunderbolt 4, HDMI, SDXC card slot, MagSafe 3, 3.5mm headphone jack.

BEST FOR
Ideal for professionals, creators and frequent travellers who want top-tier build quality, displays and battery life.

KEY FEATURES
• Processor: Apple M4 (10-core CPU)
• Memory & storage: 16GB unified memory, 512GB SSD
• Display: 14.2-inch Liquid Retina XDR, 3024 x 1964, 1000 nits sustained
• Graphics: Apple M4 10-core GPU
• Battery: 72.4Wh, up to 24 hours
• Weight: 1.55 kg

IN THE BOX
MacBook, USB-C power adapter, USB-C to MagSafe 3 cable, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 2450000, NULL::numeric, '/demo-products/apple-macbook-pro-14-m4-16gb-512gb-1.svg', ARRAY['/demo-products/apple-macbook-pro-14-m4-16gb-512gb-1.svg', '/demo-products/apple-macbook-pro-14-m4-16gb-512gb-2.svg', '/demo-products/apple-macbook-pro-14-m4-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d05', 'Apple', 'DEMO-LP-004', 7, true, 'New', 1, 'Piece', '[{"min_qty": 5, "price": 2401000}, {"min_qty": 10, "price": 2352000}, {"min_qty": 20, "price": 2303000}]', '{"Processor": "Apple M4 (10-core CPU)", "Memory (RAM)": "16GB unified memory", "Storage": "512GB SSD", "Display": "14.2-inch Liquid Retina XDR, 3024 x 1964, 1000 nits sustained", "Graphics": "Apple M4 10-core GPU", "Operating system": "macOS", "Battery": "72.4Wh, up to 24 hours", "Weight": "1.55 kg", "Ports": "3x Thunderbolt 4, HDMI, SDXC card slot, MagSafe 3, 3.5mm headphone jack", "Colour": "Space Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 739),
  ('HP 15s Core i5 12th Gen 8GB/512GB', 'hp-15s-core-i5-12th-gen-8gb-512gb', $d$HP 15s Core i5 12th Gen 8GB/512GB is a dependable everyday laptop with a speedy 12th Gen Core i5, a full-HD display and a fast SSD for school and office work.

PERFORMANCE
Powered by the Intel Core i5-1235U (10 cores, up to 4.4GHz) with 8GB DDR4 (upgradable) and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel Iris Xe Graphics. It runs Windows 11 Home.

DISPLAY & DESIGN
The 15.6-inch FHD (1920 x 1080) IPS, anti-glare gives you a sharp, comfortable view for work and entertainment. At 1.69 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
41Wh, up to 9 hours. Connectivity includes 2x USB-A, 1x USB-C, HDMI 1.4, SD card reader, 3.5mm combo jack.

BEST FOR
Ideal for students, remote workers and home offices who need a dependable, good-value daily laptop.

KEY FEATURES
• Processor: Intel Core i5-1235U (10 cores, up to 4.4GHz)
• Memory & storage: 8GB DDR4 (upgradable), 512GB NVMe SSD
• Display: 15.6-inch FHD (1920 x 1080) IPS, anti-glare
• Graphics: Intel Iris Xe Graphics
• Battery: 41Wh, up to 9 hours
• Weight: 1.69 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 640000, 690000, '/demo-products/hp-15s-core-i5-12th-gen-8gb-512gb-1.svg', ARRAY['/demo-products/hp-15s-core-i5-12th-gen-8gb-512gb-1.svg', '/demo-products/hp-15s-core-i5-12th-gen-8gb-512gb-2.svg', '/demo-products/hp-15s-core-i5-12th-gen-8gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d03', 'HP', 'DEMO-LP-005', 40, true, 'Best Seller', 1, 'Piece', '[{"min_qty": 5, "price": 627000}, {"min_qty": 10, "price": 614500}, {"min_qty": 20, "price": 601500}]', '{"Processor": "Intel Core i5-1235U (10 cores, up to 4.4GHz)", "Memory (RAM)": "8GB DDR4 (upgradable)", "Storage": "512GB NVMe SSD", "Display": "15.6-inch FHD (1920 x 1080) IPS, anti-glare", "Graphics": "Intel Iris Xe Graphics", "Operating system": "Windows 11 Home", "Battery": "41Wh, up to 9 hours", "Weight": "1.69 kg", "Ports": "2x USB-A, 1x USB-C, HDMI 1.4, SD card reader, 3.5mm combo jack", "Colour": "Silver", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1420),
  ('HP 250 G9 Core i3 8GB/256GB', 'hp-250-g9-core-i3-8gb-256gb', $d$HP 250 G9 Core i3 8GB/256GB is a no-nonsense business laptop for typing, browsing and cloud apps, with a numeric keypad and a sturdy build.

PERFORMANCE
Powered by the Intel Core i3-1215U (6 cores) with 8GB DDR4 and a 256GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel UHD Graphics. It runs Windows 11 Home.

DISPLAY & DESIGN
The 15.6-inch FHD (1920 x 1080) anti-glare gives you a sharp, comfortable view for work and entertainment. At 1.74 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
41Wh, up to 8 hours. Connectivity includes 2x USB-A, 1x USB-C, HDMI 1.4, RJ-45, SD reader, 3.5mm combo jack.

BEST FOR
Ideal for students, remote workers and home offices who need a dependable, good-value daily laptop.

KEY FEATURES
• Processor: Intel Core i3-1215U (6 cores)
• Memory & storage: 8GB DDR4, 256GB NVMe SSD
• Display: 15.6-inch FHD (1920 x 1080) anti-glare
• Graphics: Intel UHD Graphics
• Battery: 41Wh, up to 8 hours
• Weight: 1.74 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 420000, NULL::numeric, '/demo-products/hp-250-g9-core-i3-8gb-256gb-1.svg', ARRAY['/demo-products/hp-250-g9-core-i3-8gb-256gb-1.svg', '/demo-products/hp-250-g9-core-i3-8gb-256gb-2.svg', '/demo-products/hp-250-g9-core-i3-8gb-256gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d05', 'HP', 'DEMO-LP-006', 55, false, NULL::text, 2, 'Piece', '[{"min_qty": 5, "price": 411500}, {"min_qty": 10, "price": 403000}, {"min_qty": 20, "price": 395000}]', '{"Processor": "Intel Core i3-1215U (6 cores)", "Memory (RAM)": "8GB DDR4", "Storage": "256GB NVMe SSD", "Display": "15.6-inch FHD (1920 x 1080) anti-glare", "Graphics": "Intel UHD Graphics", "Operating system": "Windows 11 Home", "Battery": "41Wh, up to 8 hours", "Weight": "1.74 kg", "Ports": "2x USB-A, 1x USB-C, HDMI 1.4, RJ-45, SD reader, 3.5mm combo jack", "Colour": "Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 957),
  ('HP Pavilion 15 Ryzen 5 16GB/512GB', 'hp-pavilion-15-ryzen-5-16gb-512gb', $d$HP Pavilion 15 Ryzen 5 16GB/512GB balances performance and style with a six-core Ryzen processor and 16GB of RAM for smooth multitasking.

PERFORMANCE
Powered by the AMD Ryzen 5 7530U (6 cores, up to 4.5GHz) with 16GB DDR4 and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by AMD Radeon Graphics. It runs Windows 11 Home.

DISPLAY & DESIGN
The 15.6-inch FHD (1920 x 1080) IPS micro-edge gives you a sharp, comfortable view for work and entertainment. At 1.75 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
41Wh, up to 9 hours. Connectivity includes 2x USB-A, 1x USB-C, HDMI 2.1, SD reader, 3.5mm combo jack.

BEST FOR
Ideal for students, remote workers and home offices who need a dependable, good-value daily laptop.

KEY FEATURES
• Processor: AMD Ryzen 5 7530U (6 cores, up to 4.5GHz)
• Memory & storage: 16GB DDR4, 512GB NVMe SSD
• Display: 15.6-inch FHD (1920 x 1080) IPS micro-edge
• Graphics: AMD Radeon Graphics
• Battery: 41Wh, up to 9 hours
• Weight: 1.75 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 780000, 840000, '/demo-products/hp-pavilion-15-ryzen-5-16gb-512gb-1.svg', ARRAY['/demo-products/hp-pavilion-15-ryzen-5-16gb-512gb-1.svg', '/demo-products/hp-pavilion-15-ryzen-5-16gb-512gb-2.svg', '/demo-products/hp-pavilion-15-ryzen-5-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d05', 'HP', 'DEMO-LP-007', 25, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 764500}, {"min_qty": 10, "price": 749000}, {"min_qty": 20, "price": 733000}]', '{"Processor": "AMD Ryzen 5 7530U (6 cores, up to 4.5GHz)", "Memory (RAM)": "16GB DDR4", "Storage": "512GB NVMe SSD", "Display": "15.6-inch FHD (1920 x 1080) IPS micro-edge", "Graphics": "AMD Radeon Graphics", "Operating system": "Windows 11 Home", "Battery": "41Wh, up to 9 hours", "Weight": "1.75 kg", "Ports": "2x USB-A, 1x USB-C, HDMI 2.1, SD reader, 3.5mm combo jack", "Colour": "Silver", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 891),
  ('HP EliteBook 840 G10 Core i7 16GB/512GB', 'hp-elitebook-840-g10-core-i7-16gb-512gb', $d$HP EliteBook 840 G10 Core i7 16GB/512GB is a premium business ultrabook with enterprise security, a 16:10 display and a light, MIL-STD tested chassis.

PERFORMANCE
Powered by the Intel Core i7-1355U (10 cores, up to 5.0GHz) with 16GB DDR5 and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel Iris Xe Graphics. It runs Windows 11 Pro.

DISPLAY & DESIGN
The 14-inch WUXGA (1920 x 1200) IPS, 400 nits gives you a sharp, comfortable view for work and entertainment. At 1.36 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
51Wh, up to 14 hours. Connectivity includes 2x Thunderbolt 4, 2x USB-A, HDMI 2.1, 3.5mm combo jack, optional nano-SIM.

BEST FOR
Ideal for business users, SMEs and corporate fleets that value security, durability and Windows 11 Pro management.

KEY FEATURES
• Processor: Intel Core i7-1355U (10 cores, up to 5.0GHz)
• Memory & storage: 16GB DDR5, 512GB NVMe SSD
• Display: 14-inch WUXGA (1920 x 1200) IPS, 400 nits
• Graphics: Intel Iris Xe Graphics
• Battery: 51Wh, up to 14 hours
• Weight: 1.36 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1380000, 1480000, '/demo-products/hp-elitebook-840-g10-core-i7-16gb-512gb-1.svg', ARRAY['/demo-products/hp-elitebook-840-g10-core-i7-16gb-512gb-1.svg', '/demo-products/hp-elitebook-840-g10-core-i7-16gb-512gb-2.svg', '/demo-products/hp-elitebook-840-g10-core-i7-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d01', 'HP', 'DEMO-LP-008', 12, true, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 1352500}, {"min_qty": 10, "price": 1325000}, {"min_qty": 20, "price": 1297000}]', '{"Processor": "Intel Core i7-1355U (10 cores, up to 5.0GHz)", "Memory (RAM)": "16GB DDR5", "Storage": "512GB NVMe SSD", "Display": "14-inch WUXGA (1920 x 1200) IPS, 400 nits", "Graphics": "Intel Iris Xe Graphics", "Operating system": "Windows 11 Pro", "Battery": "51Wh, up to 14 hours", "Weight": "1.36 kg", "Ports": "2x Thunderbolt 4, 2x USB-A, HDMI 2.1, 3.5mm combo jack, optional nano-SIM", "Colour": "Silver", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 596),
  ('HP Victus 15 Core i5 RTX 3050 16GB/512GB', 'hp-victus-15-core-i5-rtx-3050-16gb-512gb', $d$HP Victus 15 Core i5 RTX 3050 16GB/512GB is an entry-level gaming laptop with a 144Hz display and dedicated RTX graphics for esports titles and creative apps.

PERFORMANCE
Powered by the Intel Core i5-12450H (8 cores, up to 4.4GHz) with 16GB DDR4 and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by NVIDIA GeForce RTX 3050 (6GB GDDR6). It runs Windows 11 Home.

DISPLAY & DESIGN
The 15.6-inch FHD (1920 x 1080) IPS, 144Hz gives you a sharp, comfortable view for work and entertainment. At 2.29 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
70Wh, up to 7 hours. Connectivity includes 3x USB-A, 1x USB-C, HDMI 2.1, RJ-45, 3.5mm combo jack.

BEST FOR
Ideal for gamers and content creators who want high refresh-rate visuals and dedicated graphics power.

KEY FEATURES
• Processor: Intel Core i5-12450H (8 cores, up to 4.4GHz)
• Memory & storage: 16GB DDR4, 512GB NVMe SSD
• Display: 15.6-inch FHD (1920 x 1080) IPS, 144Hz
• Graphics: NVIDIA GeForce RTX 3050 (6GB GDDR6)
• Battery: 70Wh, up to 7 hours
• Weight: 2.29 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 780000, 850000, '/demo-products/hp-victus-15-core-i5-rtx-3050-16gb-512gb-1.svg', ARRAY['/demo-products/hp-victus-15-core-i5-rtx-3050-16gb-512gb-1.svg', '/demo-products/hp-victus-15-core-i5-rtx-3050-16gb-512gb-2.svg', '/demo-products/hp-victus-15-core-i5-rtx-3050-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d01', 'HP', 'DEMO-LP-009', 18, false, 'Hot', 1, 'Piece', '[]', '{"Processor": "Intel Core i5-12450H (8 cores, up to 4.4GHz)", "Memory (RAM)": "16GB DDR4", "Storage": "512GB NVMe SSD", "Display": "15.6-inch FHD (1920 x 1080) IPS, 144Hz", "Graphics": "NVIDIA GeForce RTX 3050 (6GB GDDR6)", "Operating system": "Windows 11 Home", "Battery": "70Wh, up to 7 hours", "Weight": "2.29 kg", "Ports": "3x USB-A, 1x USB-C, HDMI 2.1, RJ-45, 3.5mm combo jack", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 899),
  ('HP ProBook 450 G10 Core i5 16GB/512GB', 'hp-probook-450-g10-core-i5-16gb-512gb', $d$HP ProBook 450 G10 Core i5 16GB/512GB is a dependable business laptop with a full-size keyboard, fingerprint reader and Windows 11 Pro for secure everyday work.

PERFORMANCE
Powered by the Intel Core i5-1335U (10 cores, up to 4.6GHz) with 16GB DDR4 and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel Iris Xe Graphics. It runs Windows 11 Pro.

DISPLAY & DESIGN
The 15.6-inch FHD (1920 x 1080) IPS, anti-glare gives you a sharp, comfortable view for work and entertainment. At 1.79 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
51Wh, up to 10 hours. Connectivity includes 2x USB-A, 1x USB-C, HDMI 2.0, RJ-45, 3.5mm combo jack.

BEST FOR
Ideal for business users, SMEs and corporate fleets that value security, durability and Windows 11 Pro management.

KEY FEATURES
• Processor: Intel Core i5-1335U (10 cores, up to 4.6GHz)
• Memory & storage: 16GB DDR4, 512GB NVMe SSD
• Display: 15.6-inch FHD (1920 x 1080) IPS, anti-glare
• Graphics: Intel Iris Xe Graphics
• Battery: 51Wh, up to 10 hours
• Weight: 1.79 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 890000, NULL::numeric, '/demo-products/hp-probook-450-g10-core-i5-16gb-512gb-1.svg', ARRAY['/demo-products/hp-probook-450-g10-core-i5-16gb-512gb-1.svg', '/demo-products/hp-probook-450-g10-core-i5-16gb-512gb-2.svg', '/demo-products/hp-probook-450-g10-core-i5-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d03', 'HP', 'DEMO-LP-010', 22, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 872000}, {"min_qty": 10, "price": 854500}, {"min_qty": 20, "price": 836500}]', '{"Processor": "Intel Core i5-1335U (10 cores, up to 4.6GHz)", "Memory (RAM)": "16GB DDR4", "Storage": "512GB NVMe SSD", "Display": "15.6-inch FHD (1920 x 1080) IPS, anti-glare", "Graphics": "Intel Iris Xe Graphics", "Operating system": "Windows 11 Pro", "Battery": "51Wh, up to 10 hours", "Weight": "1.79 kg", "Ports": "2x USB-A, 1x USB-C, HDMI 2.0, RJ-45, 3.5mm combo jack", "Colour": "Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 929),
  ('Dell Inspiron 15 3520 Core i5 8GB/512GB', 'dell-inspiron-15-3520-core-i5-8gb-512gb', $d$Dell Inspiron 15 3520 Core i5 8GB/512GB is a straightforward 15.6-inch laptop built for students and home offices, with plenty of ports and a roomy keyboard.

PERFORMANCE
Powered by the Intel Core i5-1235U (10 cores) with 8GB DDR4 (upgradable to 16GB) and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel Iris Xe Graphics. It runs Windows 11 Home.

DISPLAY & DESIGN
The 15.6-inch FHD (1920 x 1080) WVA, anti-glare gives you a sharp, comfortable view for work and entertainment. At 1.65 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
41Wh, up to 8 hours. Connectivity includes 2x USB-A, 1x USB-C, HDMI 1.4, SD reader, 3.5mm combo jack.

BEST FOR
Ideal for students, remote workers and home offices who need a dependable, good-value daily laptop.

KEY FEATURES
• Processor: Intel Core i5-1235U (10 cores)
• Memory & storage: 8GB DDR4 (upgradable to 16GB), 512GB NVMe SSD
• Display: 15.6-inch FHD (1920 x 1080) WVA, anti-glare
• Graphics: Intel Iris Xe Graphics
• Battery: 41Wh, up to 8 hours
• Weight: 1.65 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 670000, 720000, '/demo-products/dell-inspiron-15-3520-core-i5-8gb-512gb-1.svg', ARRAY['/demo-products/dell-inspiron-15-3520-core-i5-8gb-512gb-1.svg', '/demo-products/dell-inspiron-15-3520-core-i5-8gb-512gb-2.svg', '/demo-products/dell-inspiron-15-3520-core-i5-8gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d02', 'Dell', 'DEMO-LP-011', 30, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 656500}, {"min_qty": 10, "price": 643000}, {"min_qty": 20, "price": 630000}]', '{"Processor": "Intel Core i5-1235U (10 cores)", "Memory (RAM)": "8GB DDR4 (upgradable to 16GB)", "Storage": "512GB NVMe SSD", "Display": "15.6-inch FHD (1920 x 1080) WVA, anti-glare", "Graphics": "Intel Iris Xe Graphics", "Operating system": "Windows 11 Home", "Battery": "41Wh, up to 8 hours", "Weight": "1.65 kg", "Ports": "2x USB-A, 1x USB-C, HDMI 1.4, SD reader, 3.5mm combo jack", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 873),
  ('Dell Latitude 5440 Core i7 16GB/512GB', 'dell-latitude-5440-core-i7-16gb-512gb', $d$Dell Latitude 5440 Core i7 16GB/512GB is a business-class 14-inch laptop with robust security, an RJ-45 port and optional LTE for reliable work anywhere.

PERFORMANCE
Powered by the Intel Core i7-1355U (10 cores, up to 5.0GHz) with 16GB DDR4 and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel Iris Xe Graphics. It runs Windows 11 Pro.

DISPLAY & DESIGN
The 14-inch FHD (1920 x 1080) IPS, anti-glare gives you a sharp, comfortable view for work and entertainment. At 1.40 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
54Wh, up to 12 hours. Connectivity includes Thunderbolt 4, USB-C, 2x USB-A, HDMI 2.0, RJ-45, 3.5mm combo jack.

BEST FOR
Ideal for business users, SMEs and corporate fleets that value security, durability and Windows 11 Pro management.

KEY FEATURES
• Processor: Intel Core i7-1355U (10 cores, up to 5.0GHz)
• Memory & storage: 16GB DDR4, 512GB NVMe SSD
• Display: 14-inch FHD (1920 x 1080) IPS, anti-glare
• Graphics: Intel Iris Xe Graphics
• Battery: 54Wh, up to 12 hours
• Weight: 1.40 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1250000, NULL::numeric, '/demo-products/dell-latitude-5440-core-i7-16gb-512gb-1.svg', ARRAY['/demo-products/dell-latitude-5440-core-i7-16gb-512gb-1.svg', '/demo-products/dell-latitude-5440-core-i7-16gb-512gb-2.svg', '/demo-products/dell-latitude-5440-core-i7-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d05', 'Dell', 'DEMO-LP-012', 14, true, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 1225000}, {"min_qty": 10, "price": 1200000}, {"min_qty": 20, "price": 1175000}]', '{"Processor": "Intel Core i7-1355U (10 cores, up to 5.0GHz)", "Memory (RAM)": "16GB DDR4", "Storage": "512GB NVMe SSD", "Display": "14-inch FHD (1920 x 1080) IPS, anti-glare", "Graphics": "Intel Iris Xe Graphics", "Operating system": "Windows 11 Pro", "Battery": "54Wh, up to 12 hours", "Weight": "1.40 kg", "Ports": "Thunderbolt 4, USB-C, 2x USB-A, HDMI 2.0, RJ-45, 3.5mm combo jack", "Colour": "Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 133),
  ('Dell XPS 13 9340 Core Ultra 7 16GB/512GB', 'dell-xps-13-9340-core-ultra-7-16gb-512gb', $d$Dell XPS 13 9340 Core Ultra 7 16GB/512GB is an ultra-compact premium laptop with an edge-to-edge InfinityEdge display, an Intel Core Ultra chip with a built-in NPU and a CNC aluminium body.

PERFORMANCE
Powered by the Intel Core Ultra 7 155H with 16GB LPDDR5x and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel Arc Graphics. It runs Windows 11 Home.

DISPLAY & DESIGN
The 13.4-inch FHD+ (1920 x 1200) InfinityEdge, 500 nits gives you a sharp, comfortable view for work and entertainment. At 1.19 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
55Wh, up to 14 hours. Connectivity includes 2x USB-C (Thunderbolt 4), 3.5mm combo jack.

BEST FOR
Ideal for professionals, creators and frequent travellers who want top-tier build quality, displays and battery life.

KEY FEATURES
• Processor: Intel Core Ultra 7 155H
• Memory & storage: 16GB LPDDR5x, 512GB NVMe SSD
• Display: 13.4-inch FHD+ (1920 x 1200) InfinityEdge, 500 nits
• Graphics: Intel Arc Graphics
• Battery: 55Wh, up to 14 hours
• Weight: 1.19 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1950000, 2080000, '/demo-products/dell-xps-13-9340-core-ultra-7-16gb-512gb-1.svg', ARRAY['/demo-products/dell-xps-13-9340-core-ultra-7-16gb-512gb-1.svg', '/demo-products/dell-xps-13-9340-core-ultra-7-16gb-512gb-2.svg', '/demo-products/dell-xps-13-9340-core-ultra-7-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d05', 'Dell', 'DEMO-LP-013', 6, false, 'New', 1, 'Piece', '[{"min_qty": 5, "price": 1911000}, {"min_qty": 10, "price": 1872000}, {"min_qty": 20, "price": 1833000}]', '{"Processor": "Intel Core Ultra 7 155H", "Memory (RAM)": "16GB LPDDR5x", "Storage": "512GB NVMe SSD", "Display": "13.4-inch FHD+ (1920 x 1200) InfinityEdge, 500 nits", "Graphics": "Intel Arc Graphics", "Operating system": "Windows 11 Home", "Battery": "55Wh, up to 14 hours", "Weight": "1.19 kg", "Ports": "2x USB-C (Thunderbolt 4), 3.5mm combo jack", "Colour": "Silver", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 760),
  ('Dell XPS 15 9530 Core i7 RTX 4050 16GB/1TB', 'dell-xps-15-9530-core-i7-rtx-4050-16gb-1tb', $d$Dell XPS 15 9530 Core i7 RTX 4050 16GB/1TB is a creator-grade laptop with a stunning 3.5K OLED touch display, discrete RTX graphics and a premium aluminium and carbon-fibre build.

PERFORMANCE
Powered by the Intel Core i7-13700H (14 cores, up to 5.0GHz) with 16GB DDR5 and a 1TB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by NVIDIA GeForce RTX 4050 (6GB GDDR6). It runs Windows 11 Home.

DISPLAY & DESIGN
The 15.6-inch 3.5K (3456 x 2160) OLED touch, 400 nits gives you a sharp, comfortable view for work and entertainment. At 1.92 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
86Wh, up to 10 hours. Connectivity includes 2x Thunderbolt 4, USB-C 3.2, SD card reader, 3.5mm combo jack.

BEST FOR
Ideal for professionals, creators and frequent travellers who want top-tier build quality, displays and battery life.

KEY FEATURES
• Processor: Intel Core i7-13700H (14 cores, up to 5.0GHz)
• Memory & storage: 16GB DDR5, 1TB NVMe SSD
• Display: 15.6-inch 3.5K (3456 x 2160) OLED touch, 400 nits
• Graphics: NVIDIA GeForce RTX 4050 (6GB GDDR6)
• Battery: 86Wh, up to 10 hours
• Weight: 1.92 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 2250000, NULL::numeric, '/demo-products/dell-xps-15-9530-core-i7-rtx-4050-16gb-1tb-1.svg', ARRAY['/demo-products/dell-xps-15-9530-core-i7-rtx-4050-16gb-1tb-1.svg', '/demo-products/dell-xps-15-9530-core-i7-rtx-4050-16gb-1tb-2.svg', '/demo-products/dell-xps-15-9530-core-i7-rtx-4050-16gb-1tb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d01', 'Dell', 'DEMO-LP-014', 5, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 2205000}, {"min_qty": 10, "price": 2160000}, {"min_qty": 20, "price": 2115000}]', '{"Processor": "Intel Core i7-13700H (14 cores, up to 5.0GHz)", "Memory (RAM)": "16GB DDR5", "Storage": "1TB NVMe SSD", "Display": "15.6-inch 3.5K (3456 x 2160) OLED touch, 400 nits", "Graphics": "NVIDIA GeForce RTX 4050 (6GB GDDR6)", "Operating system": "Windows 11 Home", "Battery": "86Wh, up to 10 hours", "Weight": "1.92 kg", "Ports": "2x Thunderbolt 4, USB-C 3.2, SD card reader, 3.5mm combo jack", "Colour": "Silver", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 400),
  ('Dell G15 5530 Core i7 RTX 4060 16GB/512GB', 'dell-g15-5530-core-i7-rtx-4060-16gb-512gb', $d$Dell G15 5530 Core i7 RTX 4060 16GB/512GB is a powerful gaming laptop with a 165Hz display, RTX 4060 graphics and a thermal design tuned for long sessions.

PERFORMANCE
Powered by the Intel Core i7-13650HX (14 cores, up to 4.9GHz) with 16GB DDR5 and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by NVIDIA GeForce RTX 4060 (8GB GDDR6). It runs Windows 11 Home.

DISPLAY & DESIGN
The 15.6-inch FHD (1920 x 1080) 165Hz, 3ms gives you a sharp, comfortable view for work and entertainment. At 2.65 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
56Wh, up to 5 hours. Connectivity includes 2x USB-A, USB-C (DP), HDMI 2.1, RJ-45, 3.5mm combo jack.

BEST FOR
Ideal for gamers and content creators who want high refresh-rate visuals and dedicated graphics power.

KEY FEATURES
• Processor: Intel Core i7-13650HX (14 cores, up to 4.9GHz)
• Memory & storage: 16GB DDR5, 512GB NVMe SSD
• Display: 15.6-inch FHD (1920 x 1080) 165Hz, 3ms
• Graphics: NVIDIA GeForce RTX 4060 (8GB GDDR6)
• Battery: 56Wh, up to 5 hours
• Weight: 2.65 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1450000, 1550000, '/demo-products/dell-g15-5530-core-i7-rtx-4060-16gb-512gb-1.svg', ARRAY['/demo-products/dell-g15-5530-core-i7-rtx-4060-16gb-512gb-1.svg', '/demo-products/dell-g15-5530-core-i7-rtx-4060-16gb-512gb-2.svg', '/demo-products/dell-g15-5530-core-i7-rtx-4060-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d05', 'Dell', 'DEMO-LP-015', 9, false, 'Hot', 1, 'Piece', '[{"min_qty": 5, "price": 1421000}, {"min_qty": 10, "price": 1392000}, {"min_qty": 20, "price": 1363000}]', '{"Processor": "Intel Core i7-13650HX (14 cores, up to 4.9GHz)", "Memory (RAM)": "16GB DDR5", "Storage": "512GB NVMe SSD", "Display": "15.6-inch FHD (1920 x 1080) 165Hz, 3ms", "Graphics": "NVIDIA GeForce RTX 4060 (8GB GDDR6)", "Operating system": "Windows 11 Home", "Battery": "56Wh, up to 5 hours", "Weight": "2.65 kg", "Ports": "2x USB-A, USB-C (DP), HDMI 2.1, RJ-45, 3.5mm combo jack", "Colour": "Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 301),
  ('Lenovo IdeaPad Slim 3 15 Ryzen 5 8GB/512GB', 'lenovo-ideapad-slim-3-15-ryzen-5-8gb-512gb', $d$Lenovo IdeaPad Slim 3 15 Ryzen 5 8GB/512GB is a slim, lightweight laptop with a physical webcam shutter and a comfortable keyboard for everyday study and work.

PERFORMANCE
Powered by the AMD Ryzen 5 7520U (4 cores, up to 4.3GHz) with 8GB LPDDR5 (soldered) and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by AMD Radeon 610M. It runs Windows 11 Home.

DISPLAY & DESIGN
The 15.6-inch FHD (1920 x 1080) IPS, 300 nits gives you a sharp, comfortable view for work and entertainment. At 1.62 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
47Wh, up to 9 hours. Connectivity includes 2x USB-A, 1x USB-C, HDMI 1.4, SD reader, 3.5mm combo jack.

BEST FOR
Ideal for students, remote workers and home offices who need a dependable, good-value daily laptop.

KEY FEATURES
• Processor: AMD Ryzen 5 7520U (4 cores, up to 4.3GHz)
• Memory & storage: 8GB LPDDR5 (soldered), 512GB NVMe SSD
• Display: 15.6-inch FHD (1920 x 1080) IPS, 300 nits
• Graphics: AMD Radeon 610M
• Battery: 47Wh, up to 9 hours
• Weight: 1.62 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 560000, 610000, '/demo-products/lenovo-ideapad-slim-3-15-ryzen-5-8gb-512gb-1.svg', ARRAY['/demo-products/lenovo-ideapad-slim-3-15-ryzen-5-8gb-512gb-1.svg', '/demo-products/lenovo-ideapad-slim-3-15-ryzen-5-8gb-512gb-2.svg', '/demo-products/lenovo-ideapad-slim-3-15-ryzen-5-8gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d01', 'Lenovo', 'DEMO-LP-016', 45, false, 'Deal', 1, 'Piece', '[{"min_qty": 5, "price": 549000}, {"min_qty": 10, "price": 537500}, {"min_qty": 20, "price": 526500}]', '{"Processor": "AMD Ryzen 5 7520U (4 cores, up to 4.3GHz)", "Memory (RAM)": "8GB LPDDR5 (soldered)", "Storage": "512GB NVMe SSD", "Display": "15.6-inch FHD (1920 x 1080) IPS, 300 nits", "Graphics": "AMD Radeon 610M", "Operating system": "Windows 11 Home", "Battery": "47Wh, up to 9 hours", "Weight": "1.62 kg", "Ports": "2x USB-A, 1x USB-C, HDMI 1.4, SD reader, 3.5mm combo jack", "Colour": "Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 190),
  ('Lenovo ThinkPad E14 Gen 5 Core i5 16GB/512GB', 'lenovo-thinkpad-e14-gen-5-core-i5-16gb-512gb', $d$Lenovo ThinkPad E14 Gen 5 Core i5 16GB/512GB delivers the classic ThinkPad keyboard and TrackPoint with a modern 13th Gen processor in a business-ready 14-inch frame.

PERFORMANCE
Powered by the Intel Core i5-1335U (10 cores, up to 4.6GHz) with 16GB DDR4 and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel Iris Xe Graphics. It runs Windows 11 Pro.

DISPLAY & DESIGN
The 14-inch WUXGA (1920 x 1200) IPS, 300 nits gives you a sharp, comfortable view for work and entertainment. At 1.41 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
47Wh, up to 12 hours. Connectivity includes 2x USB-A, 2x USB-C (1x Thunderbolt 4), HDMI 2.1, RJ-45, 3.5mm combo jack.

BEST FOR
Ideal for business users, SMEs and corporate fleets that value security, durability and Windows 11 Pro management.

KEY FEATURES
• Processor: Intel Core i5-1335U (10 cores, up to 4.6GHz)
• Memory & storage: 16GB DDR4, 512GB NVMe SSD
• Display: 14-inch WUXGA (1920 x 1200) IPS, 300 nits
• Graphics: Intel Iris Xe Graphics
• Battery: 47Wh, up to 12 hours
• Weight: 1.41 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 960000, NULL::numeric, '/demo-products/lenovo-thinkpad-e14-gen-5-core-i5-16gb-512gb-1.svg', ARRAY['/demo-products/lenovo-thinkpad-e14-gen-5-core-i5-16gb-512gb-1.svg', '/demo-products/lenovo-thinkpad-e14-gen-5-core-i5-16gb-512gb-2.svg', '/demo-products/lenovo-thinkpad-e14-gen-5-core-i5-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d01', 'Lenovo', 'DEMO-LP-017', 20, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 941000}, {"min_qty": 10, "price": 921500}, {"min_qty": 20, "price": 902500}]', '{"Processor": "Intel Core i5-1335U (10 cores, up to 4.6GHz)", "Memory (RAM)": "16GB DDR4", "Storage": "512GB NVMe SSD", "Display": "14-inch WUXGA (1920 x 1200) IPS, 300 nits", "Graphics": "Intel Iris Xe Graphics", "Operating system": "Windows 11 Pro", "Battery": "47Wh, up to 12 hours", "Weight": "1.41 kg", "Ports": "2x USB-A, 2x USB-C (1x Thunderbolt 4), HDMI 2.1, RJ-45, 3.5mm combo jack", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 926),
  ('Lenovo ThinkPad X1 Carbon Gen 11 Core i7 16GB/512GB', 'lenovo-thinkpad-x1-carbon-gen-11-core-i7-16gb-512gb', $d$Lenovo ThinkPad X1 Carbon Gen 11 Core i7 16GB/512GB is the benchmark business ultrabook: carbon-fibre construction at just 1.12 kg, a superb keyboard and all-day battery life.

PERFORMANCE
Powered by the Intel Core i7-1355U (10 cores, up to 5.0GHz) with 16GB LPDDR5 and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel Iris Xe Graphics. It runs Windows 11 Pro.

DISPLAY & DESIGN
The 14-inch WUXGA (1920 x 1200) IPS, 400 nits gives you a sharp, comfortable view for work and entertainment. At 1.12 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
57Wh, up to 15 hours. Connectivity includes 2x Thunderbolt 4, 2x USB-A, HDMI 2.0b, 3.5mm combo jack.

BEST FOR
Ideal for professionals, creators and frequent travellers who want top-tier build quality, displays and battery life.

KEY FEATURES
• Processor: Intel Core i7-1355U (10 cores, up to 5.0GHz)
• Memory & storage: 16GB LPDDR5, 512GB NVMe SSD
• Display: 14-inch WUXGA (1920 x 1200) IPS, 400 nits
• Graphics: Intel Iris Xe Graphics
• Battery: 57Wh, up to 15 hours
• Weight: 1.12 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 2100000, 2250000, '/demo-products/lenovo-thinkpad-x1-carbon-gen-11-core-i7-16gb-512gb-1.svg', ARRAY['/demo-products/lenovo-thinkpad-x1-carbon-gen-11-core-i7-16gb-512gb-1.svg', '/demo-products/lenovo-thinkpad-x1-carbon-gen-11-core-i7-16gb-512gb-2.svg', '/demo-products/lenovo-thinkpad-x1-carbon-gen-11-core-i7-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d01', 'Lenovo', 'DEMO-LP-018', 4, true, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 2058000}, {"min_qty": 10, "price": 2016000}, {"min_qty": 20, "price": 1974000}]', '{"Processor": "Intel Core i7-1355U (10 cores, up to 5.0GHz)", "Memory (RAM)": "16GB LPDDR5", "Storage": "512GB NVMe SSD", "Display": "14-inch WUXGA (1920 x 1200) IPS, 400 nits", "Graphics": "Intel Iris Xe Graphics", "Operating system": "Windows 11 Pro", "Battery": "57Wh, up to 15 hours", "Weight": "1.12 kg", "Ports": "2x Thunderbolt 4, 2x USB-A, HDMI 2.0b, 3.5mm combo jack", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1251),
  ('Lenovo Legion 5 Ryzen 7 RTX 4060 16GB/512GB', 'lenovo-legion-5-ryzen-7-rtx-4060-16gb-512gb', $d$Lenovo Legion 5 Ryzen 7 RTX 4060 16GB/512GB is a gaming favourite with a 165Hz display, an excellent keyboard and strong cooling for smooth play at high settings.

PERFORMANCE
Powered by the AMD Ryzen 7 7735HS (8 cores, up to 4.75GHz) with 16GB DDR5 and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by NVIDIA GeForce RTX 4060 (8GB GDDR6). It runs Windows 11 Home.

DISPLAY & DESIGN
The 15.6-inch FHD (1920 x 1080) IPS, 165Hz, 300 nits gives you a sharp, comfortable view for work and entertainment. At 2.4 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
80Wh, up to 6 hours. Connectivity includes 4x USB-A/USB-C, HDMI 2.1, RJ-45, 3.5mm combo jack.

BEST FOR
Ideal for gamers and content creators who want high refresh-rate visuals and dedicated graphics power.

KEY FEATURES
• Processor: AMD Ryzen 7 7735HS (8 cores, up to 4.75GHz)
• Memory & storage: 16GB DDR5, 512GB NVMe SSD
• Display: 15.6-inch FHD (1920 x 1080) IPS, 165Hz, 300 nits
• Graphics: NVIDIA GeForce RTX 4060 (8GB GDDR6)
• Battery: 80Wh, up to 6 hours
• Weight: 2.4 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1350000, 1450000, '/demo-products/lenovo-legion-5-ryzen-7-rtx-4060-16gb-512gb-1.svg', ARRAY['/demo-products/lenovo-legion-5-ryzen-7-rtx-4060-16gb-512gb-1.svg', '/demo-products/lenovo-legion-5-ryzen-7-rtx-4060-16gb-512gb-2.svg', '/demo-products/lenovo-legion-5-ryzen-7-rtx-4060-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d02', 'Lenovo', 'DEMO-LP-019', 11, false, 'Hot', 1, 'Piece', '[{"min_qty": 5, "price": 1323000}, {"min_qty": 10, "price": 1296000}, {"min_qty": 20, "price": 1269000}]', '{"Processor": "AMD Ryzen 7 7735HS (8 cores, up to 4.75GHz)", "Memory (RAM)": "16GB DDR5", "Storage": "512GB NVMe SSD", "Display": "15.6-inch FHD (1920 x 1080) IPS, 165Hz, 300 nits", "Graphics": "NVIDIA GeForce RTX 4060 (8GB GDDR6)", "Operating system": "Windows 11 Home", "Battery": "80Wh, up to 6 hours", "Weight": "2.4 kg", "Ports": "4x USB-A/USB-C, HDMI 2.1, RJ-45, 3.5mm combo jack", "Colour": "Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 249),
  ('Lenovo Yoga Slim 7i Core Ultra 7 16GB/1TB', 'lenovo-yoga-slim-7i-core-ultra-7-16gb-1tb', $d$Lenovo Yoga Slim 7i Core Ultra 7 16GB/1TB is a thin, light creator laptop with a 3K OLED display and a metal chassis that looks as good as it performs.

PERFORMANCE
Powered by the Intel Core Ultra 7 155H with 16GB LPDDR5x and a 1TB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel Arc Graphics. It runs Windows 11 Home.

DISPLAY & DESIGN
The 14-inch 3K (2880 x 1800) OLED, 120Hz gives you a sharp, comfortable view for work and entertainment. At 1.39 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
70Wh, up to 13 hours. Connectivity includes 2x Thunderbolt 4, USB-A, HDMI 2.1, 3.5mm combo jack.

BEST FOR
Ideal for professionals, creators and frequent travellers who want top-tier build quality, displays and battery life.

KEY FEATURES
• Processor: Intel Core Ultra 7 155H
• Memory & storage: 16GB LPDDR5x, 1TB NVMe SSD
• Display: 14-inch 3K (2880 x 1800) OLED, 120Hz
• Graphics: Intel Arc Graphics
• Battery: 70Wh, up to 13 hours
• Weight: 1.39 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1650000, NULL::numeric, '/demo-products/lenovo-yoga-slim-7i-core-ultra-7-16gb-1tb-1.svg', ARRAY['/demo-products/lenovo-yoga-slim-7i-core-ultra-7-16gb-1tb-1.svg', '/demo-products/lenovo-yoga-slim-7i-core-ultra-7-16gb-1tb-2.svg', '/demo-products/lenovo-yoga-slim-7i-core-ultra-7-16gb-1tb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d01', 'Lenovo', 'DEMO-LP-020', 6, false, 'New', 1, 'Piece', '[{"min_qty": 5, "price": 1617000}, {"min_qty": 10, "price": 1584000}, {"min_qty": 20, "price": 1551000}]', '{"Processor": "Intel Core Ultra 7 155H", "Memory (RAM)": "16GB LPDDR5x", "Storage": "1TB NVMe SSD", "Display": "14-inch 3K (2880 x 1800) OLED, 120Hz", "Graphics": "Intel Arc Graphics", "Operating system": "Windows 11 Home", "Battery": "70Wh, up to 13 hours", "Weight": "1.39 kg", "Ports": "2x Thunderbolt 4, USB-A, HDMI 2.1, 3.5mm combo jack", "Colour": "Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1121),
  ('Asus Vivobook 15 X1504 Core i5 8GB/512GB', 'asus-vivobook-15-x1504-core-i5-8gb-512gb', $d$Asus Vivobook 15 X1504 Core i5 8GB/512GB is a stylish, lightweight 15.6-inch laptop that handles homework, streaming and remote work with ease.

PERFORMANCE
Powered by the Intel Core i5-1235U (10 cores) with 8GB DDR4 (upgradable) and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel Iris Xe Graphics. It runs Windows 11 Home.

DISPLAY & DESIGN
The 15.6-inch FHD (1920 x 1080) IPS gives you a sharp, comfortable view for work and entertainment. At 1.70 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
42Wh, up to 8 hours. Connectivity includes 2x USB-A, 1x USB-C, HDMI 1.4, 3.5mm combo jack.

BEST FOR
Ideal for students, remote workers and home offices who need a dependable, good-value daily laptop.

KEY FEATURES
• Processor: Intel Core i5-1235U (10 cores)
• Memory & storage: 8GB DDR4 (upgradable), 512GB NVMe SSD
• Display: 15.6-inch FHD (1920 x 1080) IPS
• Graphics: Intel Iris Xe Graphics
• Battery: 42Wh, up to 8 hours
• Weight: 1.70 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 600000, 650000, '/demo-products/asus-vivobook-15-x1504-core-i5-8gb-512gb-1.svg', ARRAY['/demo-products/asus-vivobook-15-x1504-core-i5-8gb-512gb-1.svg', '/demo-products/asus-vivobook-15-x1504-core-i5-8gb-512gb-2.svg', '/demo-products/asus-vivobook-15-x1504-core-i5-8gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d03', 'Asus', 'DEMO-LP-021', 35, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 588000}, {"min_qty": 10, "price": 576000}, {"min_qty": 20, "price": 564000}]', '{"Processor": "Intel Core i5-1235U (10 cores)", "Memory (RAM)": "8GB DDR4 (upgradable)", "Storage": "512GB NVMe SSD", "Display": "15.6-inch FHD (1920 x 1080) IPS", "Graphics": "Intel Iris Xe Graphics", "Operating system": "Windows 11 Home", "Battery": "42Wh, up to 8 hours", "Weight": "1.70 kg", "Ports": "2x USB-A, 1x USB-C, HDMI 1.4, 3.5mm combo jack", "Colour": "Silver", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 318),
  ('Asus Vivobook Go 15 Ryzen 5 8GB/512GB', 'asus-vivobook-go-15-ryzen-5-8gb-512gb', $d$Asus Vivobook Go 15 Ryzen 5 8GB/512GB is a light and affordable laptop with an ErgoLift hinge and a long battery life for students on a budget.

PERFORMANCE
Powered by the AMD Ryzen 5 7520U (4 cores) with 8GB LPDDR5 and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by AMD Radeon Graphics. It runs Windows 11 Home.

DISPLAY & DESIGN
The 15.6-inch FHD (1920 x 1080) IPS gives you a sharp, comfortable view for work and entertainment. At 1.63 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
42Wh, up to 9 hours. Connectivity includes 2x USB-A, 1x USB-C, HDMI 1.4, 3.5mm combo jack.

BEST FOR
Ideal for students, remote workers and home offices who need a dependable, good-value daily laptop.

KEY FEATURES
• Processor: AMD Ryzen 5 7520U (4 cores)
• Memory & storage: 8GB LPDDR5, 512GB NVMe SSD
• Display: 15.6-inch FHD (1920 x 1080) IPS
• Graphics: AMD Radeon Graphics
• Battery: 42Wh, up to 9 hours
• Weight: 1.63 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 530000, NULL::numeric, '/demo-products/asus-vivobook-go-15-ryzen-5-8gb-512gb-1.svg', ARRAY['/demo-products/asus-vivobook-go-15-ryzen-5-8gb-512gb-1.svg', '/demo-products/asus-vivobook-go-15-ryzen-5-8gb-512gb-2.svg', '/demo-products/asus-vivobook-go-15-ryzen-5-8gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d01', 'Asus', 'DEMO-LP-022', 42, false, NULL::text, 2, 'Piece', '[{"min_qty": 5, "price": 519500}, {"min_qty": 10, "price": 509000}, {"min_qty": 20, "price": 498000}]', '{"Processor": "AMD Ryzen 5 7520U (4 cores)", "Memory (RAM)": "8GB LPDDR5", "Storage": "512GB NVMe SSD", "Display": "15.6-inch FHD (1920 x 1080) IPS", "Graphics": "AMD Radeon Graphics", "Operating system": "Windows 11 Home", "Battery": "42Wh, up to 9 hours", "Weight": "1.63 kg", "Ports": "2x USB-A, 1x USB-C, HDMI 1.4, 3.5mm combo jack", "Colour": "Mint", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 643),
  ('Asus Zenbook 14 OLED UX3405 Core Ultra 7 16GB/1TB', 'asus-zenbook-14-oled-ux3405-core-ultra-7-16gb-1tb', $d$Asus Zenbook 14 OLED UX3405 Core Ultra 7 16GB/1TB is an ultra-light 1.2 kg laptop with a 3K 120Hz OLED display and AI-ready Intel Core Ultra processor.

PERFORMANCE
Powered by the Intel Core Ultra 7 155H with 16GB LPDDR5x and a 1TB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel Arc Graphics. It runs Windows 11 Home.

DISPLAY & DESIGN
The 14-inch 3K (2880 x 1800) OLED, 120Hz gives you a sharp, comfortable view for work and entertainment. At 1.20 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
75Wh, up to 15 hours. Connectivity includes 2x Thunderbolt 4, USB-A 3.2, HDMI 2.1, 3.5mm combo jack.

BEST FOR
Ideal for professionals, creators and frequent travellers who want top-tier build quality, displays and battery life.

KEY FEATURES
• Processor: Intel Core Ultra 7 155H
• Memory & storage: 16GB LPDDR5x, 1TB NVMe SSD
• Display: 14-inch 3K (2880 x 1800) OLED, 120Hz
• Graphics: Intel Arc Graphics
• Battery: 75Wh, up to 15 hours
• Weight: 1.20 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1750000, 1850000, '/demo-products/asus-zenbook-14-oled-ux3405-core-ultra-7-16gb-1tb-1.svg', ARRAY['/demo-products/asus-zenbook-14-oled-ux3405-core-ultra-7-16gb-1tb-1.svg', '/demo-products/asus-zenbook-14-oled-ux3405-core-ultra-7-16gb-1tb-2.svg', '/demo-products/asus-zenbook-14-oled-ux3405-core-ultra-7-16gb-1tb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d05', 'Asus', 'DEMO-LP-023', 7, true, 'New', 1, 'Piece', '[{"min_qty": 5, "price": 1715000}, {"min_qty": 10, "price": 1680000}, {"min_qty": 20, "price": 1645000}]', '{"Processor": "Intel Core Ultra 7 155H", "Memory (RAM)": "16GB LPDDR5x", "Storage": "1TB NVMe SSD", "Display": "14-inch 3K (2880 x 1800) OLED, 120Hz", "Graphics": "Intel Arc Graphics", "Operating system": "Windows 11 Home", "Battery": "75Wh, up to 15 hours", "Weight": "1.20 kg", "Ports": "2x Thunderbolt 4, USB-A 3.2, HDMI 2.1, 3.5mm combo jack", "Colour": "Silver", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1414),
  ('Asus ROG Strix G16 Core i7 RTX 4060 16GB/1TB', 'asus-rog-strix-g16-core-i7-rtx-4060-16gb-1tb', $d$Asus ROG Strix G16 Core i7 RTX 4060 16GB/1TB is a 16-inch esports laptop with a 165Hz display, per-key RGB keyboard and a liquid-metal cooling design.

PERFORMANCE
Powered by the Intel Core i7-13650HX (14 cores, up to 4.9GHz) with 16GB DDR5 and a 1TB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by NVIDIA GeForce RTX 4060 (8GB GDDR6). It runs Windows 11 Home.

DISPLAY & DESIGN
The 16-inch WUXGA (1920 x 1200) 165Hz, 3ms gives you a sharp, comfortable view for work and entertainment. At 2.5 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
90Wh, up to 6 hours. Connectivity includes 3x USB-A/USB-C (1x Thunderbolt 4), HDMI 2.1, RJ-45, 3.5mm combo jack.

BEST FOR
Ideal for gamers and content creators who want high refresh-rate visuals and dedicated graphics power.

KEY FEATURES
• Processor: Intel Core i7-13650HX (14 cores, up to 4.9GHz)
• Memory & storage: 16GB DDR5, 1TB NVMe SSD
• Display: 16-inch WUXGA (1920 x 1200) 165Hz, 3ms
• Graphics: NVIDIA GeForce RTX 4060 (8GB GDDR6)
• Battery: 90Wh, up to 6 hours
• Weight: 2.5 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1850000, NULL::numeric, '/demo-products/asus-rog-strix-g16-core-i7-rtx-4060-16gb-1tb-1.svg', ARRAY['/demo-products/asus-rog-strix-g16-core-i7-rtx-4060-16gb-1tb-1.svg', '/demo-products/asus-rog-strix-g16-core-i7-rtx-4060-16gb-1tb-2.svg', '/demo-products/asus-rog-strix-g16-core-i7-rtx-4060-16gb-1tb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d02', 'Asus', 'DEMO-LP-024', 6, false, 'Hot', 1, 'Piece', '[{"min_qty": 5, "price": 1813000}, {"min_qty": 10, "price": 1776000}, {"min_qty": 20, "price": 1739000}]', '{"Processor": "Intel Core i7-13650HX (14 cores, up to 4.9GHz)", "Memory (RAM)": "16GB DDR5", "Storage": "1TB NVMe SSD", "Display": "16-inch WUXGA (1920 x 1200) 165Hz, 3ms", "Graphics": "NVIDIA GeForce RTX 4060 (8GB GDDR6)", "Operating system": "Windows 11 Home", "Battery": "90Wh, up to 6 hours", "Weight": "2.5 kg", "Ports": "3x USB-A/USB-C (1x Thunderbolt 4), HDMI 2.1, RJ-45, 3.5mm combo jack", "Colour": "Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1119),
  ('Asus TUF Gaming F15 Core i5 RTX 3050 16GB/512GB', 'asus-tuf-gaming-f15-core-i5-rtx-3050-16gb-512gb', $d$Asus TUF Gaming F15 Core i5 RTX 3050 16GB/512GB is a military-grade tough gaming laptop with a 144Hz display and RTX graphics at a gamer-friendly price.

PERFORMANCE
Powered by the Intel Core i5-12500H (12 cores, up to 4.5GHz) with 16GB DDR4 and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by NVIDIA GeForce RTX 3050 (4GB GDDR6). It runs Windows 11 Home.

DISPLAY & DESIGN
The 15.6-inch FHD (1920 x 1080) IPS, 144Hz gives you a sharp, comfortable view for work and entertainment. At 2.2 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
48Wh, up to 5 hours. Connectivity includes 3x USB-A/USB-C, HDMI 2.0, RJ-45, 3.5mm combo jack.

BEST FOR
Ideal for gamers and content creators who want high refresh-rate visuals and dedicated graphics power.

KEY FEATURES
• Processor: Intel Core i5-12500H (12 cores, up to 4.5GHz)
• Memory & storage: 16GB DDR4, 512GB NVMe SSD
• Display: 15.6-inch FHD (1920 x 1080) IPS, 144Hz
• Graphics: NVIDIA GeForce RTX 3050 (4GB GDDR6)
• Battery: 48Wh, up to 5 hours
• Weight: 2.2 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 920000, 990000, '/demo-products/asus-tuf-gaming-f15-core-i5-rtx-3050-16gb-512gb-1.svg', ARRAY['/demo-products/asus-tuf-gaming-f15-core-i5-rtx-3050-16gb-512gb-1.svg', '/demo-products/asus-tuf-gaming-f15-core-i5-rtx-3050-16gb-512gb-2.svg', '/demo-products/asus-tuf-gaming-f15-core-i5-rtx-3050-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d02', 'Asus', 'DEMO-LP-025', 15, false, 'Deal', 1, 'Piece', '[]', '{"Processor": "Intel Core i5-12500H (12 cores, up to 4.5GHz)", "Memory (RAM)": "16GB DDR4", "Storage": "512GB NVMe SSD", "Display": "15.6-inch FHD (1920 x 1080) IPS, 144Hz", "Graphics": "NVIDIA GeForce RTX 3050 (4GB GDDR6)", "Operating system": "Windows 11 Home", "Battery": "48Wh, up to 5 hours", "Weight": "2.2 kg", "Ports": "3x USB-A/USB-C, HDMI 2.0, RJ-45, 3.5mm combo jack", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1226),
  ('Acer Aspire 5 A515-57 Core i5 8GB/512GB', 'acer-aspire-5-a515-57-core-i5-8gb-512gb', $d$Acer Aspire 5 A515-57 Core i5 8GB/512GB is a reliable all-rounder with a slim metal-look chassis, a bright full-HD screen and a fast SSD.

PERFORMANCE
Powered by the Intel Core i5-1235U (10 cores) with 8GB DDR4 (upgradable) and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel Iris Xe Graphics. It runs Windows 11 Home.

DISPLAY & DESIGN
The 15.6-inch FHD (1920 x 1080) IPS gives you a sharp, comfortable view for work and entertainment. At 1.76 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
50Wh, up to 9 hours. Connectivity includes 2x USB-A, 1x USB-C (Thunderbolt 4), HDMI 2.1, 3.5mm combo jack.

BEST FOR
Ideal for students, remote workers and home offices who need a dependable, good-value daily laptop.

KEY FEATURES
• Processor: Intel Core i5-1235U (10 cores)
• Memory & storage: 8GB DDR4 (upgradable), 512GB NVMe SSD
• Display: 15.6-inch FHD (1920 x 1080) IPS
• Graphics: Intel Iris Xe Graphics
• Battery: 50Wh, up to 9 hours
• Weight: 1.76 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 580000, NULL::numeric, '/demo-products/acer-aspire-5-a515-57-core-i5-8gb-512gb-1.svg', ARRAY['/demo-products/acer-aspire-5-a515-57-core-i5-8gb-512gb-1.svg', '/demo-products/acer-aspire-5-a515-57-core-i5-8gb-512gb-2.svg', '/demo-products/acer-aspire-5-a515-57-core-i5-8gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d03', 'Acer', 'DEMO-LP-026', 38, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 568500}, {"min_qty": 10, "price": 557000}, {"min_qty": 20, "price": 545000}]', '{"Processor": "Intel Core i5-1235U (10 cores)", "Memory (RAM)": "8GB DDR4 (upgradable)", "Storage": "512GB NVMe SSD", "Display": "15.6-inch FHD (1920 x 1080) IPS", "Graphics": "Intel Iris Xe Graphics", "Operating system": "Windows 11 Home", "Battery": "50Wh, up to 9 hours", "Weight": "1.76 kg", "Ports": "2x USB-A, 1x USB-C (Thunderbolt 4), HDMI 2.1, 3.5mm combo jack", "Colour": "Silver", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 174),
  ('Acer Swift Go 14 Core Ultra 5 16GB/512GB', 'acer-swift-go-14-core-ultra-5-16gb-512gb', $d$Acer Swift Go 14 Core Ultra 5 16GB/512GB is a light 14-inch laptop with a sharp 2.8K OLED display and AI-ready Intel Core Ultra processor for work on the go.

PERFORMANCE
Powered by the Intel Core Ultra 5 125H with 16GB LPDDR5x and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel Arc Graphics. It runs Windows 11 Home.

DISPLAY & DESIGN
The 14-inch 2.8K (2880 x 1800) OLED, 90Hz gives you a sharp, comfortable view for work and entertainment. At 1.32 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
65Wh, up to 12 hours. Connectivity includes 2x Thunderbolt 4, 2x USB-A, HDMI 2.1, microSD, 3.5mm combo jack.

BEST FOR
Ideal for professionals, creators and frequent travellers who want top-tier build quality, displays and battery life.

KEY FEATURES
• Processor: Intel Core Ultra 5 125H
• Memory & storage: 16GB LPDDR5x, 512GB NVMe SSD
• Display: 14-inch 2.8K (2880 x 1800) OLED, 90Hz
• Graphics: Intel Arc Graphics
• Battery: 65Wh, up to 12 hours
• Weight: 1.32 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1150000, 1250000, '/demo-products/acer-swift-go-14-core-ultra-5-16gb-512gb-1.svg', ARRAY['/demo-products/acer-swift-go-14-core-ultra-5-16gb-512gb-1.svg', '/demo-products/acer-swift-go-14-core-ultra-5-16gb-512gb-2.svg', '/demo-products/acer-swift-go-14-core-ultra-5-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d02', 'Acer', 'DEMO-LP-027', 9, false, 'New', 1, 'Piece', '[{"min_qty": 5, "price": 1127000}, {"min_qty": 10, "price": 1104000}, {"min_qty": 20, "price": 1081000}]', '{"Processor": "Intel Core Ultra 5 125H", "Memory (RAM)": "16GB LPDDR5x", "Storage": "512GB NVMe SSD", "Display": "14-inch 2.8K (2880 x 1800) OLED, 90Hz", "Graphics": "Intel Arc Graphics", "Operating system": "Windows 11 Home", "Battery": "65Wh, up to 12 hours", "Weight": "1.32 kg", "Ports": "2x Thunderbolt 4, 2x USB-A, HDMI 2.1, microSD, 3.5mm combo jack", "Colour": "Silver", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 279),
  ('Acer Nitro V 15 Core i5 RTX 3050 16GB/512GB', 'acer-nitro-v-15-core-i5-rtx-3050-16gb-512gb', $d$Acer Nitro V 15 Core i5 RTX 3050 16GB/512GB is an affordable gaming laptop with a 144Hz screen, dedicated RTX graphics and Acer's dual-fan cooling.

PERFORMANCE
Powered by the Intel Core i5-13420H (8 cores, up to 4.6GHz) with 16GB DDR5 and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by NVIDIA GeForce RTX 3050 (6GB GDDR6). It runs Windows 11 Home.

DISPLAY & DESIGN
The 15.6-inch FHD (1920 x 1080) IPS, 144Hz gives you a sharp, comfortable view for work and entertainment. At 2.1 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
57Wh, up to 6 hours. Connectivity includes 3x USB-A/USB-C, HDMI 2.1, RJ-45, 3.5mm combo jack.

BEST FOR
Ideal for gamers and content creators who want high refresh-rate visuals and dedicated graphics power.

KEY FEATURES
• Processor: Intel Core i5-13420H (8 cores, up to 4.6GHz)
• Memory & storage: 16GB DDR5, 512GB NVMe SSD
• Display: 15.6-inch FHD (1920 x 1080) IPS, 144Hz
• Graphics: NVIDIA GeForce RTX 3050 (6GB GDDR6)
• Battery: 57Wh, up to 6 hours
• Weight: 2.1 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 870000, NULL::numeric, '/demo-products/acer-nitro-v-15-core-i5-rtx-3050-16gb-512gb-1.svg', ARRAY['/demo-products/acer-nitro-v-15-core-i5-rtx-3050-16gb-512gb-1.svg', '/demo-products/acer-nitro-v-15-core-i5-rtx-3050-16gb-512gb-2.svg', '/demo-products/acer-nitro-v-15-core-i5-rtx-3050-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d03', 'Acer', 'DEMO-LP-028', 16, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 852500}, {"min_qty": 10, "price": 835000}, {"min_qty": 20, "price": 818000}]', '{"Processor": "Intel Core i5-13420H (8 cores, up to 4.6GHz)", "Memory (RAM)": "16GB DDR5", "Storage": "512GB NVMe SSD", "Display": "15.6-inch FHD (1920 x 1080) IPS, 144Hz", "Graphics": "NVIDIA GeForce RTX 3050 (6GB GDDR6)", "Operating system": "Windows 11 Home", "Battery": "57Wh, up to 6 hours", "Weight": "2.1 kg", "Ports": "3x USB-A/USB-C, HDMI 2.1, RJ-45, 3.5mm combo jack", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1041),
  ('Acer Predator Helios Neo 16 Core i7 RTX 4060 16GB/1TB', 'acer-predator-helios-neo-16-core-i7-rtx-4060-16gb-1tb', $d$Acer Predator Helios Neo 16 Core i7 RTX 4060 16GB/1TB is a high-refresh gaming laptop with a 16-inch 165Hz display, RTX 4060 graphics and a four-zone RGB keyboard.

PERFORMANCE
Powered by the Intel Core i7-13700HX (16 cores, up to 5.0GHz) with 16GB DDR5 and a 1TB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by NVIDIA GeForce RTX 4060 (8GB GDDR6). It runs Windows 11 Home.

DISPLAY & DESIGN
The 16-inch WUXGA (1920 x 1200) IPS, 165Hz gives you a sharp, comfortable view for work and entertainment. At 2.6 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
90Wh, up to 6 hours. Connectivity includes 3x USB-A, Thunderbolt 4, HDMI 2.1, RJ-45, 3.5mm combo jack.

BEST FOR
Ideal for gamers and content creators who want high refresh-rate visuals and dedicated graphics power.

KEY FEATURES
• Processor: Intel Core i7-13700HX (16 cores, up to 5.0GHz)
• Memory & storage: 16GB DDR5, 1TB NVMe SSD
• Display: 16-inch WUXGA (1920 x 1200) IPS, 165Hz
• Graphics: NVIDIA GeForce RTX 4060 (8GB GDDR6)
• Battery: 90Wh, up to 6 hours
• Weight: 2.6 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1950000, 2100000, '/demo-products/acer-predator-helios-neo-16-core-i7-rtx-4060-16gb-1tb-1.svg', ARRAY['/demo-products/acer-predator-helios-neo-16-core-i7-rtx-4060-16gb-1tb-1.svg', '/demo-products/acer-predator-helios-neo-16-core-i7-rtx-4060-16gb-1tb-2.svg', '/demo-products/acer-predator-helios-neo-16-core-i7-rtx-4060-16gb-1tb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d02', 'Acer', 'DEMO-LP-029', 5, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 1911000}, {"min_qty": 10, "price": 1872000}, {"min_qty": 20, "price": 1833000}]', '{"Processor": "Intel Core i7-13700HX (16 cores, up to 5.0GHz)", "Memory (RAM)": "16GB DDR5", "Storage": "1TB NVMe SSD", "Display": "16-inch WUXGA (1920 x 1200) IPS, 165Hz", "Graphics": "NVIDIA GeForce RTX 4060 (8GB GDDR6)", "Operating system": "Windows 11 Home", "Battery": "90Wh, up to 6 hours", "Weight": "2.6 kg", "Ports": "3x USB-A, Thunderbolt 4, HDMI 2.1, RJ-45, 3.5mm combo jack", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1067),
  ('MSI Modern 14 C13M Core i5 16GB/512GB', 'msi-modern-14-c13m-core-i5-16gb-512gb', $d$MSI Modern 14 C13M Core i5 16GB/512GB is a business-styled 14-inch laptop that stays light and quiet while handling daily productivity apps.

PERFORMANCE
Powered by the Intel Core i5-1335U (10 cores) with 16GB DDR4 and a 512GB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel Iris Xe Graphics. It runs Windows 11 Home.

DISPLAY & DESIGN
The 14-inch FHD (1920 x 1080) IPS gives you a sharp, comfortable view for work and entertainment. At 1.40 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
39Wh, up to 9 hours. Connectivity includes 2x USB-A, 1x USB-C, HDMI 1.4, microSD, 3.5mm combo jack.

BEST FOR
Ideal for students, remote workers and home offices who need a dependable, good-value daily laptop.

KEY FEATURES
• Processor: Intel Core i5-1335U (10 cores)
• Memory & storage: 16GB DDR4, 512GB NVMe SSD
• Display: 14-inch FHD (1920 x 1080) IPS
• Graphics: Intel Iris Xe Graphics
• Battery: 39Wh, up to 9 hours
• Weight: 1.40 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 720000, NULL::numeric, '/demo-products/msi-modern-14-c13m-core-i5-16gb-512gb-1.svg', ARRAY['/demo-products/msi-modern-14-c13m-core-i5-16gb-512gb-1.svg', '/demo-products/msi-modern-14-c13m-core-i5-16gb-512gb-2.svg', '/demo-products/msi-modern-14-c13m-core-i5-16gb-512gb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d02', 'MSI', 'DEMO-LP-030', 20, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 705500}, {"min_qty": 10, "price": 691000}, {"min_qty": 20, "price": 677000}]', '{"Processor": "Intel Core i5-1335U (10 cores)", "Memory (RAM)": "16GB DDR4", "Storage": "512GB NVMe SSD", "Display": "14-inch FHD (1920 x 1080) IPS", "Graphics": "Intel Iris Xe Graphics", "Operating system": "Windows 11 Home", "Battery": "39Wh, up to 9 hours", "Weight": "1.40 kg", "Ports": "2x USB-A, 1x USB-C, HDMI 1.4, microSD, 3.5mm combo jack", "Colour": "Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 772),
  ('MSI Katana 15 B13V Core i7 RTX 4060 16GB/1TB', 'msi-katana-15-b13v-core-i7-rtx-4060-16gb-1tb', $d$MSI Katana 15 B13V Core i7 RTX 4060 16GB/1TB is a performance gaming laptop with a 144Hz display, RTX 4060 graphics and a red-backlit keyboard.

PERFORMANCE
Powered by the Intel Core i7-13620H (10 cores, up to 4.9GHz) with 16GB DDR5 and a 1TB NVMe SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by NVIDIA GeForce RTX 4060 (8GB GDDR6). It runs Windows 11 Home.

DISPLAY & DESIGN
The 15.6-inch FHD (1920 x 1080) IPS, 144Hz gives you a sharp, comfortable view for work and entertainment. At 2.25 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
53.5Wh, up to 5 hours. Connectivity includes 3x USB-A/USB-C, HDMI 2.1, RJ-45, 3.5mm combo jack.

BEST FOR
Ideal for gamers and content creators who want high refresh-rate visuals and dedicated graphics power.

KEY FEATURES
• Processor: Intel Core i7-13620H (10 cores, up to 4.9GHz)
• Memory & storage: 16GB DDR5, 1TB NVMe SSD
• Display: 15.6-inch FHD (1920 x 1080) IPS, 144Hz
• Graphics: NVIDIA GeForce RTX 4060 (8GB GDDR6)
• Battery: 53.5Wh, up to 5 hours
• Weight: 2.25 kg

IN THE BOX
Laptop, power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1520000, 1620000, '/demo-products/msi-katana-15-b13v-core-i7-rtx-4060-16gb-1tb-1.svg', ARRAY['/demo-products/msi-katana-15-b13v-core-i7-rtx-4060-16gb-1tb-1.svg', '/demo-products/msi-katana-15-b13v-core-i7-rtx-4060-16gb-1tb-2.svg', '/demo-products/msi-katana-15-b13v-core-i7-rtx-4060-16gb-1tb-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d01', 'MSI', 'DEMO-LP-031', 8, false, 'Hot', 1, 'Piece', '[]', '{"Processor": "Intel Core i7-13620H (10 cores, up to 4.9GHz)", "Memory (RAM)": "16GB DDR5", "Storage": "1TB NVMe SSD", "Display": "15.6-inch FHD (1920 x 1080) IPS, 144Hz", "Graphics": "NVIDIA GeForce RTX 4060 (8GB GDDR6)", "Operating system": "Windows 11 Home", "Battery": "53.5Wh, up to 5 hours", "Weight": "2.25 kg", "Ports": "3x USB-A/USB-C, HDMI 2.1, RJ-45, 3.5mm combo jack", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 799),
  ('HP EliteBook 840 G5 Core i5 8GB/256GB (UK Used)', 'hp-elitebook-840-g5-core-i5-8gb-256gb-uk-used', $d$HP EliteBook 840 G5 Core i5 8GB/256GB (UK Used) is a tested UK-used business ultrabook that has been cleaned and checked, a smart low-cost choice for offices, schools and resellers.

PERFORMANCE
Powered by the Intel Core i5-8350U (4 cores, up to 3.6GHz) with 8GB DDR4 and a 256GB SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel UHD Graphics 620. It runs Windows 11 Pro.

DISPLAY & DESIGN
The 14-inch FHD (1920 x 1080) IPS gives you a sharp, comfortable view for work and entertainment. At 1.48 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
Battery tested, around 4-6 hours. Connectivity includes 2x USB-A, USB-C, HDMI, 3.5mm combo jack.

BEST FOR
Ideal for budget buyers, schools, offices and resellers who want proven business hardware at a fraction of the new price.

KEY FEATURES
• Processor: Intel Core i5-8350U (4 cores, up to 3.6GHz)
• Memory & storage: 8GB DDR4, 256GB SSD
• Display: 14-inch FHD (1920 x 1080) IPS
• Graphics: Intel UHD Graphics 620
• Battery: Battery tested, around 4-6 hours
• Weight: 1.48 kg

IN THE BOX
Laptop and compatible charger. Cleaned and tested; original box not included.

SUPPLY & WARRANTY
Each unit is inspected, tested and cleaned before sale. UK Used (Grade A): expect light signs of use only. Core functions, battery, display and ports are checked, and the supplier backs every unit with a 3 months warranty. Bulk price breaks (where listed) apply automatically at checkout. Buying for a shop, school or office? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 210000, 245000, '/demo-products/hp-elitebook-840-g5-core-i5-8gb-256gb-uk-used-1.svg', ARRAY['/demo-products/hp-elitebook-840-g5-core-i5-8gb-256gb-uk-used-1.svg', '/demo-products/hp-elitebook-840-g5-core-i5-8gb-256gb-uk-used-2.svg', '/demo-products/hp-elitebook-840-g5-core-i5-8gb-256gb-uk-used-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d03', 'HP', 'DEMO-LP-032', 60, false, 'UK Used', 3, 'Piece', '[{"min_qty": 6, "price": 206000}, {"min_qty": 15, "price": 201500}, {"min_qty": 30, "price": 197500}]', '{"Processor": "Intel Core i5-8350U (4 cores, up to 3.6GHz)", "Memory (RAM)": "8GB DDR4", "Storage": "256GB SSD", "Display": "14-inch FHD (1920 x 1080) IPS", "Graphics": "Intel UHD Graphics 620", "Operating system": "Windows 11 Pro", "Battery": "Battery tested, around 4-6 hours", "Weight": "1.48 kg", "Ports": "2x USB-A, USB-C, HDMI, 3.5mm combo jack", "Colour": "Silver", "Condition": "UK Used (Grade A)", "Warranty": "3 months"}', 712),
  ('Dell Latitude 7490 Core i7 16GB/512GB (UK Used)', 'dell-latitude-7490-core-i7-16gb-512gb-uk-used', $d$Dell Latitude 7490 Core i7 16GB/512GB (UK Used) is a business-grade UK-used laptop with an 8th Gen Core i7, 16GB RAM and a fast SSD, tested and ready to work.

PERFORMANCE
Powered by the Intel Core i7-8650U (4 cores, up to 4.2GHz) with 16GB DDR4 and a 512GB SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel UHD Graphics 620. It runs Windows 11 Pro.

DISPLAY & DESIGN
The 14-inch FHD (1920 x 1080) IPS gives you a sharp, comfortable view for work and entertainment. At 1.50 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
Battery tested, around 4-6 hours. Connectivity includes 2x USB-A, USB-C (Thunderbolt 3), HDMI, 3.5mm combo jack.

BEST FOR
Ideal for budget buyers, schools, offices and resellers who want proven business hardware at a fraction of the new price.

KEY FEATURES
• Processor: Intel Core i7-8650U (4 cores, up to 4.2GHz)
• Memory & storage: 16GB DDR4, 512GB SSD
• Display: 14-inch FHD (1920 x 1080) IPS
• Graphics: Intel UHD Graphics 620
• Battery: Battery tested, around 4-6 hours
• Weight: 1.50 kg

IN THE BOX
Laptop and compatible charger. Cleaned and tested; original box not included.

SUPPLY & WARRANTY
Each unit is inspected, tested and cleaned before sale. UK Used (Grade A): expect light signs of use only. Core functions, battery, display and ports are checked, and the supplier backs every unit with a 3 months warranty. Bulk price breaks (where listed) apply automatically at checkout. Buying for a shop, school or office? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 290000, NULL::numeric, '/demo-products/dell-latitude-7490-core-i7-16gb-512gb-uk-used-1.svg', ARRAY['/demo-products/dell-latitude-7490-core-i7-16gb-512gb-uk-used-1.svg', '/demo-products/dell-latitude-7490-core-i7-16gb-512gb-uk-used-2.svg', '/demo-products/dell-latitude-7490-core-i7-16gb-512gb-uk-used-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d01', 'Dell', 'DEMO-LP-033', 45, false, 'UK Used', 3, 'Piece', '[{"min_qty": 6, "price": 284000}, {"min_qty": 15, "price": 278500}, {"min_qty": 30, "price": 272500}]', '{"Processor": "Intel Core i7-8650U (4 cores, up to 4.2GHz)", "Memory (RAM)": "16GB DDR4", "Storage": "512GB SSD", "Display": "14-inch FHD (1920 x 1080) IPS", "Graphics": "Intel UHD Graphics 620", "Operating system": "Windows 11 Pro", "Battery": "Battery tested, around 4-6 hours", "Weight": "1.50 kg", "Ports": "2x USB-A, USB-C (Thunderbolt 3), HDMI, 3.5mm combo jack", "Colour": "Black", "Condition": "UK Used (Grade A)", "Warranty": "3 months"}', 725),
  ('Lenovo ThinkPad T480 Core i5 16GB/256GB (UK Used)', 'lenovo-thinkpad-t480-core-i5-16gb-256gb-uk-used', $d$Lenovo ThinkPad T480 Core i5 16GB/256GB (UK Used) is a legendary tough ThinkPad with a hot-swappable battery system and a comfortable keyboard, tested and graded for dependable daily use.

PERFORMANCE
Powered by the Intel Core i5-8350U (4 cores, up to 3.6GHz) with 16GB DDR4 and a 256GB SSD drive, it boots fast, opens apps instantly and keeps up with multitasking. Graphics are handled by Intel UHD Graphics 620. It runs Windows 11 Pro.

DISPLAY & DESIGN
The 14-inch FHD (1920 x 1080) IPS gives you a sharp, comfortable view for work and entertainment. At 1.64 kg, it is easy to carry between home, office and campus.

BATTERY & PORTS
Dual-battery capable, tested. Connectivity includes 3x USB-A, USB-C, HDMI, mini DisplayPort, RJ-45, 3.5mm combo jack.

BEST FOR
Ideal for budget buyers, schools, offices and resellers who want proven business hardware at a fraction of the new price.

KEY FEATURES
• Processor: Intel Core i5-8350U (4 cores, up to 3.6GHz)
• Memory & storage: 16GB DDR4, 256GB SSD
• Display: 14-inch FHD (1920 x 1080) IPS
• Graphics: Intel UHD Graphics 620
• Battery: Dual-battery capable, tested
• Weight: 1.64 kg

IN THE BOX
Laptop and compatible charger. Cleaned and tested; original box not included.

SUPPLY & WARRANTY
Each unit is inspected, tested and cleaned before sale. UK Used (Grade A): expect light signs of use only. Core functions, battery, display and ports are checked, and the supplier backs every unit with a 3 months warranty. Bulk price breaks (where listed) apply automatically at checkout. Buying for a shop, school or office? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 265000, 290000, '/demo-products/lenovo-thinkpad-t480-core-i5-16gb-256gb-uk-used-1.svg', ARRAY['/demo-products/lenovo-thinkpad-t480-core-i5-16gb-256gb-uk-used-1.svg', '/demo-products/lenovo-thinkpad-t480-core-i5-16gb-256gb-uk-used-2.svg', '/demo-products/lenovo-thinkpad-t480-core-i5-16gb-256gb-uk-used-3.svg']::text[], 'laptops-computers', '00000000-0000-4000-8000-000000000d03', 'Lenovo', 'DEMO-LP-034', 50, false, 'UK Used', 3, 'Piece', '[{"min_qty": 6, "price": 259500}, {"min_qty": 15, "price": 254500}, {"min_qty": 30, "price": 249000}]', '{"Processor": "Intel Core i5-8350U (4 cores, up to 3.6GHz)", "Memory (RAM)": "16GB DDR4", "Storage": "256GB SSD", "Display": "14-inch FHD (1920 x 1080) IPS", "Graphics": "Intel UHD Graphics 620", "Operating system": "Windows 11 Pro", "Battery": "Dual-battery capable, tested", "Weight": "1.64 kg", "Ports": "3x USB-A, USB-C, HDMI, mini DisplayPort, RJ-45, 3.5mm combo jack", "Colour": "Black", "Condition": "UK Used (Grade A)", "Warranty": "3 months"}', 54)
) AS v(name, slug, description, price, cmp, image_url, images, cat_slug, vendor_uid, brand, sku,
       stock, feat, badge, moq, unit, tiers, specs, hrs)
JOIN public.categories c ON c.slug = v.cat_slug
JOIN public.vendors vd ON vd.user_id = v.vendor_uid::uuid
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------
-- PART 5: products - Everything else (tablets, accessories, wearables, TVs, gaming, cameras, power, monitors, printers, home, fashion, health, sports) (60)
-- ---------------------------------------------------------------------
INSERT INTO public.products
  (name, slug, description, price, compare_at_price, image_url, images, category_id, vendor_id, brand, sku,
   stock_quantity, is_active, is_featured, badge, moq, unit, price_tiers, specs, created_at)
SELECT v.name, v.slug, v.description, v.price, v.cmp, v.image_url, v.images, c.id, vd.id, v.brand, v.sku,
       v.stock, true, v.feat, v.badge, v.moq, v.unit, v.tiers::jsonb, v.specs::jsonb,
       now() - make_interval(hours => v.hrs)
FROM (VALUES
  ('Apple iPad 10th Gen 64GB Wi-Fi', 'apple-ipad-10th-gen-64gb-wi-fi', $d$Apple iPad 10th Gen 64GB Wi-Fi is the everyday iPad with a colourful 10.9-inch Liquid Retina display, the A14 Bionic chip and USB-C, great for school, streaming and drawing.

KEY FEATURES
• Display: 10.9-inch Liquid Retina, 2360 x 1640, 500 nits
• Chip: Apple A14 Bionic
• Storage: 64GB
• Rear camera: 12MP Wide
• Front camera: 12MP Ultra Wide, Center Stage
• Connectivity: Wi-Fi 6, Bluetooth 5.2

GOOD TO KNOW
Pair it with a keyboard case or stylus to turn it into a study or work machine. Parental controls and multiple user profiles make it easy to share with the family.

WHAT'S IN THE BOX
iPad, USB-C charge cable, 20W USB-C power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 420000, 455000, '/demo-products/apple-ipad-10th-gen-64gb-wi-fi-1.svg', ARRAY['/demo-products/apple-ipad-10th-gen-64gb-wi-fi-1.svg', '/demo-products/apple-ipad-10th-gen-64gb-wi-fi-2.svg', '/demo-products/apple-ipad-10th-gen-64gb-wi-fi-3.svg']::text[], 'tablets-ereaders', '00000000-0000-4000-8000-000000000d02', 'Apple', 'DEMO-TB-001', 28, true, 'Best Seller', 1, 'Piece', '[{"min_qty": 5, "price": 411500}, {"min_qty": 10, "price": 403000}, {"min_qty": 20, "price": 395000}]', '{"Display": "10.9-inch Liquid Retina, 2360 x 1640, 500 nits", "Chip": "Apple A14 Bionic", "Storage": "64GB", "Rear camera": "12MP Wide", "Front camera": "12MP Ultra Wide, Center Stage", "Connectivity": "Wi-Fi 6, Bluetooth 5.2", "Battery": "Up to 10 hours", "Weight": "477 g", "OS": "iPadOS 17 (upgradable)", "Colour": "Blue", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1400),
  ('Apple iPad Air 11" M2 128GB Wi-Fi', 'apple-ipad-air-11-m2-128gb-wi-fi', $d$Apple iPad Air 11" M2 128GB Wi-Fi combines the M2 chip with a laminated 11-inch display and Apple Pencil Pro support in a thin, light design.

KEY FEATURES
• Display: 11-inch Liquid Retina, 2360 x 1640, 500 nits
• Chip: Apple M2 (8-core CPU)
• Storage: 128GB
• Rear camera: 12MP Wide
• Front camera: 12MP Ultra Wide (landscape)
• Connectivity: Wi-Fi 6E, Bluetooth 5.3

GOOD TO KNOW
Pair it with a keyboard case or stylus to turn it into a study or work machine. Parental controls and multiple user profiles make it easy to share with the family.

WHAT'S IN THE BOX
iPad Air, USB-C charge cable, 30W USB-C power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 720000, NULL::numeric, '/demo-products/apple-ipad-air-11-m2-128gb-wi-fi-1.svg', ARRAY['/demo-products/apple-ipad-air-11-m2-128gb-wi-fi-1.svg', '/demo-products/apple-ipad-air-11-m2-128gb-wi-fi-2.svg', '/demo-products/apple-ipad-air-11-m2-128gb-wi-fi-3.svg']::text[], 'tablets-ereaders', '00000000-0000-4000-8000-000000000d02', 'Apple', 'DEMO-TB-002', 14, false, 'New', 1, 'Piece', '[{"min_qty": 5, "price": 705500}, {"min_qty": 10, "price": 691000}, {"min_qty": 20, "price": 677000}]', '{"Display": "11-inch Liquid Retina, 2360 x 1640, 500 nits", "Chip": "Apple M2 (8-core CPU)", "Storage": "128GB", "Rear camera": "12MP Wide", "Front camera": "12MP Ultra Wide (landscape)", "Connectivity": "Wi-Fi 6E, Bluetooth 5.3", "Battery": "Up to 10 hours", "Weight": "462 g", "OS": "iPadOS 17 (upgradable)", "Colour": "Sky Blue", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 923),
  ('Apple iPad Pro 11" M4 256GB Wi-Fi', 'apple-ipad-pro-11-m4-256gb-wi-fi', $d$Apple iPad Pro 11" M4 256GB Wi-Fi is Apple's thinnest product ever, with an Ultra Retina XDR OLED display and the M4 chip for pro-level creative work.

KEY FEATURES
• Display: 11-inch Ultra Retina XDR OLED, 2420 x 1668, 1000 nits sustained
• Chip: Apple M4
• Storage: 256GB
• Rear camera: 12MP Wide + LiDAR
• Front camera: 12MP Ultra Wide
• Connectivity: Wi-Fi 6E, Bluetooth 5.3

GOOD TO KNOW
Pair it with a keyboard case or stylus to turn it into a study or work machine. Parental controls and multiple user profiles make it easy to share with the family.

WHAT'S IN THE BOX
iPad Pro, USB-C charge cable, 20W USB-C power adapter, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1350000, 1450000, '/demo-products/apple-ipad-pro-11-m4-256gb-wi-fi-1.svg', ARRAY['/demo-products/apple-ipad-pro-11-m4-256gb-wi-fi-1.svg', '/demo-products/apple-ipad-pro-11-m4-256gb-wi-fi-2.svg', '/demo-products/apple-ipad-pro-11-m4-256gb-wi-fi-3.svg']::text[], 'tablets-ereaders', '00000000-0000-4000-8000-000000000d01', 'Apple', 'DEMO-TB-003', 6, false, 'New', 1, 'Piece', '[]', '{"Display": "11-inch Ultra Retina XDR OLED, 2420 x 1668, 1000 nits sustained", "Chip": "Apple M4", "Storage": "256GB", "Rear camera": "12MP Wide + LiDAR", "Front camera": "12MP Ultra Wide", "Connectivity": "Wi-Fi 6E, Bluetooth 5.3", "Battery": "Up to 10 hours", "Weight": "444 g", "OS": "iPadOS 17 (upgradable)", "Colour": "Space Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1021),
  ('Samsung Galaxy Tab A9+ 4GB/64GB', 'samsung-galaxy-tab-a9-4gb-64gb', $d$Samsung Galaxy Tab A9+ 4GB/64GB is an affordable family tablet with a large 11-inch 90Hz display, quad speakers and a long-lasting battery.

KEY FEATURES
• Display: 11-inch TFT LCD, 90Hz, 1920 x 1200
• Processor: Snapdragon 695
• RAM / Storage: 4GB / 64GB (microSD up to 1TB)
• Rear camera: 8MP
• Front camera: 5MP
• Battery: 7,040 mAh, 15W charging

GOOD TO KNOW
Pair it with a keyboard case or stylus to turn it into a study or work machine. Parental controls and multiple user profiles make it easy to share with the family.

WHAT'S IN THE BOX
Tablet, USB-C cable, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 235000, NULL::numeric, '/demo-products/samsung-galaxy-tab-a9-4gb-64gb-1.svg', ARRAY['/demo-products/samsung-galaxy-tab-a9-4gb-64gb-1.svg', '/demo-products/samsung-galaxy-tab-a9-4gb-64gb-2.svg', '/demo-products/samsung-galaxy-tab-a9-4gb-64gb-3.svg']::text[], 'tablets-ereaders', '00000000-0000-4000-8000-000000000d02', 'Samsung', 'DEMO-TB-004', 35, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 230500}, {"min_qty": 10, "price": 225500}, {"min_qty": 20, "price": 221000}]', '{"Display": "11-inch TFT LCD, 90Hz, 1920 x 1200", "Processor": "Snapdragon 695", "RAM / Storage": "4GB / 64GB (microSD up to 1TB)", "Rear camera": "8MP", "Front camera": "5MP", "Battery": "7,040 mAh, 15W charging", "Speakers": "Quad speakers, Dolby Atmos", "OS": "Android 13, One UI 5.1", "Colour": "Graphite", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1172),
  ('Samsung Galaxy Tab S9 FE 6GB/128GB', 'samsung-galaxy-tab-s9-fe-6gb-128gb', $d$Samsung Galaxy Tab S9 FE 6GB/128GB is a water-resistant tablet with an S Pen in the box, a smooth 90Hz display and a flagship-style design.

KEY FEATURES
• Display: 10.9-inch TFT LCD, 90Hz, 2304 x 1440
• Processor: Exynos 1380
• RAM / Storage: 6GB / 128GB (microSD up to 1TB)
• Rear camera: 8MP
• Front camera: 12MP Ultra Wide
• Battery: 8,000 mAh, 45W charging

GOOD TO KNOW
Pair it with a keyboard case or stylus to turn it into a study or work machine. Parental controls and multiple user profiles make it easy to share with the family.

WHAT'S IN THE BOX
Tablet, S Pen, USB-C cable, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 480000, 520000, '/demo-products/samsung-galaxy-tab-s9-fe-6gb-128gb-1.svg', ARRAY['/demo-products/samsung-galaxy-tab-s9-fe-6gb-128gb-1.svg', '/demo-products/samsung-galaxy-tab-s9-fe-6gb-128gb-2.svg', '/demo-products/samsung-galaxy-tab-s9-fe-6gb-128gb-3.svg']::text[], 'tablets-ereaders', '00000000-0000-4000-8000-000000000d01', 'Samsung', 'DEMO-TB-005', 20, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 470500}, {"min_qty": 10, "price": 461000}, {"min_qty": 20, "price": 451000}]', '{"Display": "10.9-inch TFT LCD, 90Hz, 2304 x 1440", "Processor": "Exynos 1380", "RAM / Storage": "6GB / 128GB (microSD up to 1TB)", "Rear camera": "8MP", "Front camera": "12MP Ultra Wide", "Battery": "8,000 mAh, 45W charging", "Water resistance": "IP68", "OS": "Android 13, One UI 5.1.1", "Colour": "Mint", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 317),
  ('Xiaomi Redmi Pad SE 4GB/128GB', 'xiaomi-redmi-pad-se-4gb-128gb', $d$Xiaomi Redmi Pad SE 4GB/128GB is a budget tablet with an 11-inch 90Hz display and quad speakers, ideal for e-learning and entertainment.

KEY FEATURES
• Display: 11-inch IPS LCD, 90Hz, 1920 x 1200
• Processor: Snapdragon 680
• RAM / Storage: 4GB / 128GB (microSD up to 1TB)
• Rear camera: 8MP
• Front camera: 5MP
• Battery: 8,000 mAh, 10W charging

GOOD TO KNOW
Pair it with a keyboard case or stylus to turn it into a study or work machine. Parental controls and multiple user profiles make it easy to share with the family.

WHAT'S IN THE BOX
Tablet, USB-C cable, charger, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 155000, 175000, '/demo-products/xiaomi-redmi-pad-se-4gb-128gb-1.svg', ARRAY['/demo-products/xiaomi-redmi-pad-se-4gb-128gb-1.svg', '/demo-products/xiaomi-redmi-pad-se-4gb-128gb-2.svg', '/demo-products/xiaomi-redmi-pad-se-4gb-128gb-3.svg']::text[], 'tablets-ereaders', '00000000-0000-4000-8000-000000000d01', 'Xiaomi', 'DEMO-TB-006', 50, false, 'Deal', 2, 'Piece', '[{"min_qty": 5, "price": 152000}, {"min_qty": 10, "price": 149000}, {"min_qty": 20, "price": 145500}]', '{"Display": "11-inch IPS LCD, 90Hz, 1920 x 1200", "Processor": "Snapdragon 680", "RAM / Storage": "4GB / 128GB (microSD up to 1TB)", "Rear camera": "8MP", "Front camera": "5MP", "Battery": "8,000 mAh, 10W charging", "Speakers": "Quad speakers, Dolby Atmos", "OS": "Android 13, MIUI 14", "Colour": "Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 890),
  ('Apple AirPods Pro (2nd Gen) USB-C', 'apple-airpods-pro-2nd-gen-usb-c', $d$Apple AirPods Pro (2nd Gen) USB-C deliver Active Noise Cancellation, Adaptive Audio and up to 6 hours of listening time in a compact MagSafe charging case.

KEY FEATURES
• Type: In-ear true wireless
• Noise control: Active Noise Cancellation, Transparency, Adaptive Audio
• Chip: Apple H2
• Battery: Up to 6 hours (30 hours with case)
• Connectivity: Bluetooth 5.3
• Charging case: USB-C, MagSafe, Apple Watch charger compatible

GOOD TO KNOW
Always choose accessories from a reputable brand: poor quality chargers and cables can damage batteries. Buying for resale? Mixed-model orders can be arranged with the supplier.

WHAT'S IN THE BOX
AirPods Pro, MagSafe charging case (USB-C), 4 sizes of ear tips, USB-C cable, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 235000, 255000, '/demo-products/apple-airpods-pro-2nd-gen-usb-c-1.svg', ARRAY['/demo-products/apple-airpods-pro-2nd-gen-usb-c-1.svg', '/demo-products/apple-airpods-pro-2nd-gen-usb-c-2.svg', '/demo-products/apple-airpods-pro-2nd-gen-usb-c-3.svg']::text[], 'phones-accessories', '00000000-0000-4000-8000-000000000d03', 'Apple', 'DEMO-AC-001', 40, true, 'Best Seller', 2, 'Piece', '[{"min_qty": 10, "price": 223000}, {"min_qty": 25, "price": 214000}, {"min_qty": 50, "price": 204500}]', '{"Type": "In-ear true wireless", "Noise control": "Active Noise Cancellation, Transparency, Adaptive Audio", "Chip": "Apple H2", "Battery": "Up to 6 hours (30 hours with case)", "Connectivity": "Bluetooth 5.3", "Charging case": "USB-C, MagSafe, Apple Watch charger compatible", "Water resistance": "IP54 (buds and case)", "Colour": "White", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1227),
  ('Oraimo FreePods 4 Active Noise Cancelling Earbuds', 'oraimo-freepods-4-active-noise-cancelling-earbuds', $d$Oraimo FreePods 4 Active Noise Cancelling Earbuds are affordable ANC earbuds with 4-mic call clarity, low-latency gaming mode and up to 35 hours of total playtime.

KEY FEATURES
• Type: In-ear true wireless
• Noise control: Hybrid ANC up to 43dB
• Driver: 10mm dynamic
• Battery: Up to 8 hours (35 hours with case)
• Connectivity: Bluetooth 5.3
• Charging: USB-C fast charge

GOOD TO KNOW
Always choose accessories from a reputable brand: poor quality chargers and cables can damage batteries. Buying for resale? Mixed-model orders can be arranged with the supplier.

WHAT'S IN THE BOX
Earbuds, charging case, ear tips, USB-C cable, user manual.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 28500, 32000, '/demo-products/oraimo-freepods-4-active-noise-cancelling-earbuds-1.svg', ARRAY['/demo-products/oraimo-freepods-4-active-noise-cancelling-earbuds-1.svg', '/demo-products/oraimo-freepods-4-active-noise-cancelling-earbuds-2.svg', '/demo-products/oraimo-freepods-4-active-noise-cancelling-earbuds-3.svg']::text[], 'phones-accessories', '00000000-0000-4000-8000-000000000d04', 'Oraimo', 'DEMO-AC-002', 200, false, 'Hot', 10, 'Piece', '[]', '{"Type": "In-ear true wireless", "Noise control": "Hybrid ANC up to 43dB", "Driver": "10mm dynamic", "Battery": "Up to 8 hours (35 hours with case)", "Connectivity": "Bluetooth 5.3", "Charging": "USB-C fast charge", "Water resistance": "IPX5", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 144),
  ('Anker Soundcore Liberty 4 NC Earbuds', 'anker-soundcore-liberty-4-nc-earbuds', $d$Anker Soundcore Liberty 4 NC Earbuds offer adaptive noise cancelling, Hi-Res LDAC audio and heart-rate sensing at a competitive price.

KEY FEATURES
• Type: In-ear true wireless
• Noise control: Adaptive ANC
• Driver: 11mm dynamic
• Codec: LDAC, AAC, SBC
• Battery: Up to 10 hours (50 hours with case)
• Connectivity: Bluetooth 5.3, multipoint

GOOD TO KNOW
Always choose accessories from a reputable brand: poor quality chargers and cables can damage batteries. Buying for resale? Mixed-model orders can be arranged with the supplier.

WHAT'S IN THE BOX
Earbuds, charging case, ear tips, USB-C cable, user manual.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 72000, 80000, '/demo-products/anker-soundcore-liberty-4-nc-earbuds-1.svg', ARRAY['/demo-products/anker-soundcore-liberty-4-nc-earbuds-1.svg', '/demo-products/anker-soundcore-liberty-4-nc-earbuds-2.svg', '/demo-products/anker-soundcore-liberty-4-nc-earbuds-3.svg']::text[], 'phones-accessories', '00000000-0000-4000-8000-000000000d01', 'Anker', 'DEMO-AC-003', 90, false, NULL::text, 5, 'Piece', '[{"min_qty": 10, "price": 68400}, {"min_qty": 25, "price": 65500}, {"min_qty": 50, "price": 62600}]', '{"Type": "In-ear true wireless", "Noise control": "Adaptive ANC", "Driver": "11mm dynamic", "Codec": "LDAC, AAC, SBC", "Battery": "Up to 10 hours (50 hours with case)", "Connectivity": "Bluetooth 5.3, multipoint", "Water resistance": "IPX4", "Colour": "Navy", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 402),
  ('Anker 735 GaNPrime 65W 3-Port USB-C Charger', 'anker-735-ganprime-65w-3-port-usb-c-charger', $d$Anker 735 GaNPrime 65W 3-Port USB-C Charger is a compact GaN charger that powers a laptop, phone and tablet at once, with smart power sharing across three ports.

KEY FEATURES
• Output: 65W max (2x USB-C, 1x USB-A)
• Input: 100-240V AC
• Technology: GaNPrime, ActiveShield temperature control
• Compatibility: MacBook Air, iPhone, Galaxy, iPad, Switch
• Plug: Folding UK 3-pin
• Safety: Over-voltage, short-circuit and temperature protection

GOOD TO KNOW
Always choose accessories from a reputable brand: poor quality chargers and cables can damage batteries. Buying for resale? Mixed-model orders can be arranged with the supplier.

WHAT'S IN THE BOX
Charger, user guide.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 42000, 48000, '/demo-products/anker-735-ganprime-65w-3-port-usb-c-charger-1.svg', ARRAY['/demo-products/anker-735-ganprime-65w-3-port-usb-c-charger-1.svg', '/demo-products/anker-735-ganprime-65w-3-port-usb-c-charger-2.svg', '/demo-products/anker-735-ganprime-65w-3-port-usb-c-charger-3.svg']::text[], 'phones-accessories', '00000000-0000-4000-8000-000000000d01', 'Anker', 'DEMO-AC-004', 120, false, NULL::text, 5, 'Piece', '[{"min_qty": 10, "price": 39900}, {"min_qty": 25, "price": 38200}, {"min_qty": 50, "price": 36500}]', '{"Output": "65W max (2x USB-C, 1x USB-A)", "Input": "100-240V AC", "Technology": "GaNPrime, ActiveShield temperature control", "Compatibility": "MacBook Air, iPhone, Galaxy, iPad, Switch", "Plug": "Folding UK 3-pin", "Safety": "Over-voltage, short-circuit and temperature protection", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 94),
  ('Baseus 100W USB-C to USB-C Cable 2m', 'baseus-100w-usb-c-to-usb-c-cable-2m', $d$Baseus 100W USB-C to USB-C Cable 2m is a braided 100W cable that fast-charges laptops, tablets and phones and supports 480Mbps data transfer.

KEY FEATURES
• Connector: USB-C to USB-C
• Length: 2 metres
• Power: Up to 100W (20V/5A)
• Data speed: Up to 480Mbps
• Material: Braided nylon with reinforced connectors

GOOD TO KNOW
Always choose accessories from a reputable brand: poor quality chargers and cables can damage batteries. Buying for resale? Mixed-model orders can be arranged with the supplier.

WHAT'S IN THE BOX
Cable, user guide.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, covered by a 30-day seller guarantee. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 8500, 10500, '/demo-products/baseus-100w-usb-c-to-usb-c-cable-2m-1.svg', ARRAY['/demo-products/baseus-100w-usb-c-to-usb-c-cable-2m-1.svg', '/demo-products/baseus-100w-usb-c-to-usb-c-cable-2m-2.svg', '/demo-products/baseus-100w-usb-c-to-usb-c-cable-2m-3.svg']::text[], 'phones-accessories', '00000000-0000-4000-8000-000000000d01', 'Baseus', 'DEMO-AC-005', 400, false, NULL::text, 20, 'Piece', '[{"min_qty": 40, "price": 8100}, {"min_qty": 100, "price": 7750}, {"min_qty": 200, "price": 7400}]', '{"Connector": "USB-C to USB-C", "Length": "2 metres", "Power": "Up to 100W (20V/5A)", "Data speed": "Up to 480Mbps", "Material": "Braided nylon with reinforced connectors", "Condition": "Brand new, factory sealed", "Warranty": "30-day seller guarantee"}', 927),
  ('Spigen Ultra Hybrid Clear Case', 'spigen-ultra-hybrid-clear-case', $d$Spigen Ultra Hybrid Clear Case is a crystal-clear case with a flexible TPU frame and air-cushion corners that protects against drops while showing off your phone.

KEY FEATURES
• Material: Polycarbonate back + TPU bumper
• Protection: Air Cushion Technology, raised camera and screen lip
• Wireless charging: Compatible
• Fits: Choose your phone model when ordering

GOOD TO KNOW
Always choose accessories from a reputable brand: poor quality chargers and cables can damage batteries. Buying for resale? Mixed-model orders can be arranged with the supplier.

WHAT'S IN THE BOX
Phone case.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, covered by a 30-day seller guarantee. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 14500, NULL::numeric, '/demo-products/spigen-ultra-hybrid-clear-case-1.svg', ARRAY['/demo-products/spigen-ultra-hybrid-clear-case-1.svg', '/demo-products/spigen-ultra-hybrid-clear-case-2.svg', '/demo-products/spigen-ultra-hybrid-clear-case-3.svg']::text[], 'phones-accessories', '00000000-0000-4000-8000-000000000d04', 'Spigen', 'DEMO-AC-006', 150, false, NULL::text, 10, 'Piece', '[{"min_qty": 20, "price": 13800}, {"min_qty": 50, "price": 13200}, {"min_qty": 100, "price": 12600}]', '{"Material": "Polycarbonate back + TPU bumper", "Protection": "Air Cushion Technology, raised camera and screen lip", "Wireless charging": "Compatible", "Fits": "Choose your phone model when ordering", "Condition": "Brand new, factory sealed", "Warranty": "30-day seller guarantee"}', 388),
  ('Tempered Glass Screen Protector 9H (Pack of 10)', 'tempered-glass-screen-protector-9h-pack-of-10', $d$Tempered Glass Screen Protector 9H (Pack of 10) is a 10-piece bulk pack of 9H tempered glass protectors with oleophobic coating, great for phone shops and resellers.

KEY FEATURES
• Hardness: 9H
• Thickness: 0.33mm
• Coating: Anti-fingerprint oleophobic
• Pack size: 10 pieces
• Fits: Choose your phone model when ordering

GOOD TO KNOW
Always choose accessories from a reputable brand: poor quality chargers and cables can damage batteries. Buying for resale? Mixed-model orders can be arranged with the supplier.

WHAT'S IN THE BOX
10 screen protectors, wet wipes, dust stickers.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, covered by a 30-day seller guarantee. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 12000, 15000, '/demo-products/tempered-glass-screen-protector-9h-pack-of-10-1.svg', ARRAY['/demo-products/tempered-glass-screen-protector-9h-pack-of-10-1.svg', '/demo-products/tempered-glass-screen-protector-9h-pack-of-10-2.svg', '/demo-products/tempered-glass-screen-protector-9h-pack-of-10-3.svg']::text[], 'phones-accessories', '00000000-0000-4000-8000-000000000d04', 'Generic', 'DEMO-AC-007', 300, false, 'Deal', 5, 'Pack', '[{"min_qty": 10, "price": 11400}, {"min_qty": 25, "price": 10900}, {"min_qty": 50, "price": 10400}]', '{"Hardness": "9H", "Thickness": "0.33mm", "Coating": "Anti-fingerprint oleophobic", "Pack size": "10 pieces", "Fits": "Choose your phone model when ordering", "Condition": "Brand new, factory sealed", "Warranty": "30-day seller guarantee"}', 43),
  ('Ugreen 6-in-1 USB-C Hub (HDMI 4K, USB 3.0, SD)', 'ugreen-6-in-1-usb-c-hub-hdmi-4k-usb-3-0-sd', $d$Ugreen 6-in-1 USB-C Hub (HDMI 4K, USB 3.0, SD) is a slim aluminium hub that adds 4K HDMI, USB 3.0 ports, an SD/microSD reader and USB-C pass-through charging to your laptop.

KEY FEATURES
• Ports: 1x HDMI 4K@30Hz, 2x USB 3.0, SD, microSD, USB-C PD 100W
• Data speed: Up to 5Gbps
• Material: Aluminium alloy
• Compatibility: MacBook, iPad Pro, Windows laptops with USB-C

GOOD TO KNOW
Always choose accessories from a reputable brand: poor quality chargers and cables can damage batteries. Buying for resale? Mixed-model orders can be arranged with the supplier.

WHAT'S IN THE BOX
Hub, user guide.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 26000, 30000, '/demo-products/ugreen-6-in-1-usb-c-hub-hdmi-4k-usb-3-0-sd-1.svg', ARRAY['/demo-products/ugreen-6-in-1-usb-c-hub-hdmi-4k-usb-3-0-sd-1.svg', '/demo-products/ugreen-6-in-1-usb-c-hub-hdmi-4k-usb-3-0-sd-2.svg', '/demo-products/ugreen-6-in-1-usb-c-hub-hdmi-4k-usb-3-0-sd-3.svg']::text[], 'phones-accessories', '00000000-0000-4000-8000-000000000d04', 'Ugreen', 'DEMO-AC-008', 110, false, NULL::text, 5, 'Piece', '[]', '{"Ports": "1x HDMI 4K@30Hz, 2x USB 3.0, SD, microSD, USB-C PD 100W", "Data speed": "Up to 5Gbps", "Material": "Aluminium alloy", "Compatibility": "MacBook, iPad Pro, Windows laptops with USB-C", "Colour": "Space Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 449),
  ('Apple Watch Series 9 45mm GPS', 'apple-watch-series-9-45mm-gps', $d$Apple Watch Series 9 45mm GPS adds the S9 chip, a brighter display and the new Double Tap gesture to Apple's most popular smartwatch.

KEY FEATURES
• Case size: 45mm aluminium
• Display: Always-On Retina LTPO OLED, up to 2000 nits
• Chip: S9 SiP with 4-core Neural Engine
• Sensors: Blood oxygen, ECG, temperature, heart rate
• Battery: Up to 18 hours
• Water resistance: 50m, WR50

GOOD TO KNOW
Pair it with your phone through the brand's companion app to sync workouts, sleep and notifications. Battery life varies with display brightness, GPS use and connected features.

WHAT'S IN THE BOX
Watch, sport band, magnetic fast charger (USB-C), documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 520000, 560000, '/demo-products/apple-watch-series-9-45mm-gps-1.svg', ARRAY['/demo-products/apple-watch-series-9-45mm-gps-1.svg', '/demo-products/apple-watch-series-9-45mm-gps-2.svg', '/demo-products/apple-watch-series-9-45mm-gps-3.svg']::text[], 'wearables', '00000000-0000-4000-8000-000000000d03', 'Apple', 'DEMO-WR-001', 16, true, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 509500}, {"min_qty": 10, "price": 499000}, {"min_qty": 20, "price": 489000}]', '{"Case size": "45mm aluminium", "Display": "Always-On Retina LTPO OLED, up to 2000 nits", "Chip": "S9 SiP with 4-core Neural Engine", "Sensors": "Blood oxygen, ECG, temperature, heart rate", "Battery": "Up to 18 hours", "Water resistance": "50m, WR50", "Compatibility": "iPhone XS or later", "Colour": "Midnight", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 284),
  ('Apple Watch SE (2nd Gen) 44mm GPS', 'apple-watch-se-2nd-gen-44mm-gps', $d$Apple Watch SE (2nd Gen) 44mm GPS is an affordable Apple Watch with the essentials: fitness tracking, Crash Detection and a bright Retina display.

KEY FEATURES
• Case size: 44mm aluminium
• Display: Retina LTPO OLED, 1000 nits
• Chip: S8 SiP
• Sensors: Heart rate, accelerometer, gyroscope
• Battery: Up to 18 hours
• Water resistance: 50m, WR50

GOOD TO KNOW
Pair it with your phone through the brand's companion app to sync workouts, sleep and notifications. Battery life varies with display brightness, GPS use and connected features.

WHAT'S IN THE BOX
Watch, sport band, magnetic fast charger (USB-C), documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 310000, NULL::numeric, '/demo-products/apple-watch-se-2nd-gen-44mm-gps-1.svg', ARRAY['/demo-products/apple-watch-se-2nd-gen-44mm-gps-1.svg', '/demo-products/apple-watch-se-2nd-gen-44mm-gps-2.svg', '/demo-products/apple-watch-se-2nd-gen-44mm-gps-3.svg']::text[], 'wearables', '00000000-0000-4000-8000-000000000d01', 'Apple', 'DEMO-WR-002', 24, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 304000}, {"min_qty": 10, "price": 297500}, {"min_qty": 20, "price": 291500}]', '{"Case size": "44mm aluminium", "Display": "Retina LTPO OLED, 1000 nits", "Chip": "S8 SiP", "Sensors": "Heart rate, accelerometer, gyroscope", "Battery": "Up to 18 hours", "Water resistance": "50m, WR50", "Compatibility": "iPhone 8 or later", "Colour": "Starlight", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1356),
  ('Samsung Galaxy Watch7 44mm Bluetooth', 'samsung-galaxy-watch7-44mm-bluetooth', $d$Samsung Galaxy Watch7 44mm Bluetooth is a Wear OS smartwatch with an energy score, sleep coaching and a bright 1.5-inch AMOLED display.

KEY FEATURES
• Case size: 44mm aluminium
• Display: 1.5-inch Super AMOLED, 480 x 480
• Processor: Exynos W1000
• Sensors: BioActive (heart rate, ECG, BIA)
• Battery: 425 mAh, around 40 hours
• Water resistance: 5ATM + IP68

GOOD TO KNOW
Pair it with your phone through the brand's companion app to sync workouts, sleep and notifications. Battery life varies with display brightness, GPS use and connected features.

WHAT'S IN THE BOX
Watch, strap, wireless charger, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 295000, 325000, '/demo-products/samsung-galaxy-watch7-44mm-bluetooth-1.svg', ARRAY['/demo-products/samsung-galaxy-watch7-44mm-bluetooth-1.svg', '/demo-products/samsung-galaxy-watch7-44mm-bluetooth-2.svg', '/demo-products/samsung-galaxy-watch7-44mm-bluetooth-3.svg']::text[], 'wearables', '00000000-0000-4000-8000-000000000d02', 'Samsung', 'DEMO-WR-003', 22, false, 'New', 1, 'Piece', '[{"min_qty": 5, "price": 289000}, {"min_qty": 10, "price": 283000}, {"min_qty": 20, "price": 277500}]', '{"Case size": "44mm aluminium", "Display": "1.5-inch Super AMOLED, 480 x 480", "Processor": "Exynos W1000", "Sensors": "BioActive (heart rate, ECG, BIA)", "Battery": "425 mAh, around 40 hours", "Water resistance": "5ATM + IP68", "Compatibility": "Android 11 or later", "Colour": "Green", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 560),
  ('Xiaomi Smart Band 8', 'xiaomi-smart-band-8', $d$Xiaomi Smart Band 8 is a slim fitness band with a 1.62-inch AMOLED display, 150+ sports modes and up to 16 days of battery life.

KEY FEATURES
• Display: 1.62-inch AMOLED, 192 x 490, 60Hz
• Sensors: Heart rate, SpO2, sleep monitoring
• Sports modes: 150+
• Battery: 190 mAh, up to 16 days
• Water resistance: 5ATM
• Connectivity: Bluetooth 5.1

GOOD TO KNOW
Pair it with your phone through the brand's companion app to sync workouts, sleep and notifications. Battery life varies with display brightness, GPS use and connected features.

WHAT'S IN THE BOX
Band, strap, magnetic charging cable, quick start guide.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 32000, 38000, '/demo-products/xiaomi-smart-band-8-1.svg', ARRAY['/demo-products/xiaomi-smart-band-8-1.svg', '/demo-products/xiaomi-smart-band-8-2.svg', '/demo-products/xiaomi-smart-band-8-3.svg']::text[], 'wearables', '00000000-0000-4000-8000-000000000d02', 'Xiaomi', 'DEMO-WR-004', 180, false, 'Best Seller', 5, 'Piece', '[{"min_qty": 10, "price": 30400}, {"min_qty": 25, "price": 29100}, {"min_qty": 50, "price": 27800}]', '{"Display": "1.62-inch AMOLED, 192 x 490, 60Hz", "Sensors": "Heart rate, SpO2, sleep monitoring", "Sports modes": "150+", "Battery": "190 mAh, up to 16 days", "Water resistance": "5ATM", "Connectivity": "Bluetooth 5.1", "Compatibility": "Android 6.0+ / iOS 12+", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 163),
  ('Huawei Watch GT 4 46mm', 'huawei-watch-gt-4-46mm', $d$Huawei Watch GT 4 46mm is a stylish stainless-steel smartwatch with accurate health tracking and up to 14 days of battery life.

KEY FEATURES
• Case size: 46mm stainless steel
• Display: 1.43-inch AMOLED, 466 x 466
• Sensors: TruSense heart rate, SpO2, sleep, skin temperature
• Battery: Up to 14 days (typical use)
• Water resistance: 5ATM
• Connectivity: Bluetooth 5.2, GPS

GOOD TO KNOW
Pair it with your phone through the brand's companion app to sync workouts, sleep and notifications. Battery life varies with display brightness, GPS use and connected features.

WHAT'S IN THE BOX
Watch, strap, charging dock, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 185000, 210000, '/demo-products/huawei-watch-gt-4-46mm-1.svg', ARRAY['/demo-products/huawei-watch-gt-4-46mm-1.svg', '/demo-products/huawei-watch-gt-4-46mm-2.svg', '/demo-products/huawei-watch-gt-4-46mm-3.svg']::text[], 'wearables', '00000000-0000-4000-8000-000000000d01', 'Huawei', 'DEMO-WR-005', 26, false, NULL::text, 2, 'Piece', '[{"min_qty": 5, "price": 181500}, {"min_qty": 10, "price": 177500}, {"min_qty": 20, "price": 174000}]', '{"Case size": "46mm stainless steel", "Display": "1.43-inch AMOLED, 466 x 466", "Sensors": "TruSense heart rate, SpO2, sleep, skin temperature", "Battery": "Up to 14 days (typical use)", "Water resistance": "5ATM", "Connectivity": "Bluetooth 5.2, GPS", "Compatibility": "Android & iOS", "Colour": "Graphite", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 706),
  ('Amazfit Bip 5 Smartwatch', 'amazfit-bip-5-smartwatch', $d$Amazfit Bip 5 Smartwatch is a large-screen, lightweight smartwatch with built-in GPS, Bluetooth calling and up to 10 days of battery.

KEY FEATURES
• Display: 1.91-inch LCD, 320 x 380
• Sensors: Heart rate, SpO2, stress, sleep
• Battery: Up to 10 days (typical use)
• Water resistance: 5ATM
• Connectivity: Bluetooth 5.2 with calling, built-in GPS
• Compatibility: Android 7.0+ / iOS 14+

GOOD TO KNOW
Pair it with your phone through the brand's companion app to sync workouts, sleep and notifications. Battery life varies with display brightness, GPS use and connected features.

WHAT'S IN THE BOX
Watch, strap, magnetic charging cable, quick start guide.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 78000, NULL::numeric, '/demo-products/amazfit-bip-5-smartwatch-1.svg', ARRAY['/demo-products/amazfit-bip-5-smartwatch-1.svg', '/demo-products/amazfit-bip-5-smartwatch-2.svg', '/demo-products/amazfit-bip-5-smartwatch-3.svg']::text[], 'wearables', '00000000-0000-4000-8000-000000000d01', 'Amazfit', 'DEMO-WR-006', 70, false, NULL::text, 3, 'Piece', '[{"min_qty": 10, "price": 74100}, {"min_qty": 25, "price": 71000}, {"min_qty": 50, "price": 67900}]', '{"Display": "1.91-inch LCD, 320 x 380", "Sensors": "Heart rate, SpO2, stress, sleep", "Battery": "Up to 10 days (typical use)", "Water resistance": "5ATM", "Connectivity": "Bluetooth 5.2 with calling, built-in GPS", "Compatibility": "Android 7.0+ / iOS 14+", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 541),
  ('Samsung 55" Crystal UHD 4K Smart TV (DU7000)', 'samsung-55-crystal-uhd-4k-smart-tv-du7000', $d$Samsung 55" Crystal UHD 4K Smart TV (DU7000) is a 55-inch 4K smart TV with Crystal Processor 4K, PurColor and Tizen smart features for sharp, natural-looking pictures.

KEY FEATURES
• Screen size: 55 inches
• Resolution: 4K UHD (3840 x 2160)
• Refresh rate: 50Hz native, Motion Xcelerator
• HDR: HDR10+, HLG
• Smart platform: Tizen with Samsung TV Plus
• Ports: 3x HDMI, 1x USB, Ethernet

GOOD TO KNOW
Wall-mount compatible (bracket sold separately). For the best experience, pair it with a soundbar and use a stable internet connection for streaming. Delivery and installation can be arranged with the supplier.

WHAT'S IN THE BOX
TV, remote control, batteries, stand, power cord, user manual.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 520000, 560000, '/demo-products/samsung-55-crystal-uhd-4k-smart-tv-du7000-1.svg', ARRAY['/demo-products/samsung-55-crystal-uhd-4k-smart-tv-du7000-1.svg', '/demo-products/samsung-55-crystal-uhd-4k-smart-tv-du7000-2.svg', '/demo-products/samsung-55-crystal-uhd-4k-smart-tv-du7000-3.svg']::text[], 'smart-tvs', '00000000-0000-4000-8000-000000000d05', 'Samsung', 'DEMO-TV-001', 18, true, 'Hot', 1, 'Piece', '[{"min_qty": 5, "price": 509500}, {"min_qty": 10, "price": 499000}, {"min_qty": 20, "price": 489000}]', '{"Screen size": "55 inches", "Resolution": "4K UHD (3840 x 2160)", "Refresh rate": "50Hz native, Motion Xcelerator", "HDR": "HDR10+, HLG", "Smart platform": "Tizen with Samsung TV Plus", "Ports": "3x HDMI, 1x USB, Ethernet", "Wi-Fi": "Wi-Fi 5, Bluetooth 5.2", "Sound": "20W, Q-Symphony", "Wall mount": "VESA 200 x 200", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 591),
  ('LG 50" UR80 4K Smart TV with ThinQ AI', 'lg-50-ur80-4k-smart-tv-with-thinq-ai', $d$LG 50" UR80 4K Smart TV with ThinQ AI is a 50-inch 4K smart TV with the α5 Gen6 processor, webOS and Magic Remote support for easy browsing.

KEY FEATURES
• Screen size: 50 inches
• Resolution: 4K UHD (3840 x 2160)
• Refresh rate: 60Hz
• HDR: HDR10, HLG
• Smart platform: webOS 23
• Ports: 3x HDMI, 2x USB, Ethernet

GOOD TO KNOW
Wall-mount compatible (bracket sold separately). For the best experience, pair it with a soundbar and use a stable internet connection for streaming. Delivery and installation can be arranged with the supplier.

WHAT'S IN THE BOX
TV, remote control, batteries, stand, power cord, user manual.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 430000, NULL::numeric, '/demo-products/lg-50-ur80-4k-smart-tv-with-thinq-ai-1.svg', ARRAY['/demo-products/lg-50-ur80-4k-smart-tv-with-thinq-ai-1.svg', '/demo-products/lg-50-ur80-4k-smart-tv-with-thinq-ai-2.svg', '/demo-products/lg-50-ur80-4k-smart-tv-with-thinq-ai-3.svg']::text[], 'smart-tvs', '00000000-0000-4000-8000-000000000d05', 'LG', 'DEMO-TV-002', 22, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 421500}, {"min_qty": 10, "price": 413000}, {"min_qty": 20, "price": 404000}]', '{"Screen size": "50 inches", "Resolution": "4K UHD (3840 x 2160)", "Refresh rate": "60Hz", "HDR": "HDR10, HLG", "Smart platform": "webOS 23", "Ports": "3x HDMI, 2x USB, Ethernet", "Wi-Fi": "Wi-Fi 5, Bluetooth 5.0", "Sound": "20W, 2 channels", "Wall mount": "VESA 200 x 200", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 364),
  ('Hisense 65" A6 4K UHD Smart TV', 'hisense-65-a6-4k-uhd-smart-tv', $d$Hisense 65" A6 4K UHD Smart TV is a big-screen 65-inch 4K TV with Dolby Vision, DTS Virtual:X and built-in streaming apps at an excellent price.

KEY FEATURES
• Screen size: 65 inches
• Resolution: 4K UHD (3840 x 2160)
• Refresh rate: 60Hz
• HDR: Dolby Vision, HDR10, HLG
• Smart platform: VIDAA U6
• Ports: 3x HDMI, 2x USB, Ethernet

GOOD TO KNOW
Wall-mount compatible (bracket sold separately). For the best experience, pair it with a soundbar and use a stable internet connection for streaming. Delivery and installation can be arranged with the supplier.

WHAT'S IN THE BOX
TV, remote control, batteries, stand, power cord, user manual.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 690000, 760000, '/demo-products/hisense-65-a6-4k-uhd-smart-tv-1.svg', ARRAY['/demo-products/hisense-65-a6-4k-uhd-smart-tv-1.svg', '/demo-products/hisense-65-a6-4k-uhd-smart-tv-2.svg', '/demo-products/hisense-65-a6-4k-uhd-smart-tv-3.svg']::text[], 'smart-tvs', '00000000-0000-4000-8000-000000000d05', 'Hisense', 'DEMO-TV-003', 10, false, 'Deal', 1, 'Piece', '[]', '{"Screen size": "65 inches", "Resolution": "4K UHD (3840 x 2160)", "Refresh rate": "60Hz", "HDR": "Dolby Vision, HDR10, HLG", "Smart platform": "VIDAA U6", "Ports": "3x HDMI, 2x USB, Ethernet", "Wi-Fi": "Wi-Fi 5, Bluetooth 5.0", "Sound": "20W, DTS Virtual:X", "Wall mount": "VESA 300 x 200", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 912),
  ('TCL 43" 4K UHD Google TV', 'tcl-43-4k-uhd-google-tv', $d$TCL 43" 4K UHD Google TV is a compact 43-inch 4K Google TV with built-in Chromecast, voice search and easy access to all your streaming apps.

KEY FEATURES
• Screen size: 43 inches
• Resolution: 4K UHD (3840 x 2160)
• Refresh rate: 60Hz
• HDR: HDR10, HLG
• Smart platform: Google TV with Google Assistant
• Ports: 3x HDMI, 2x USB, Ethernet

GOOD TO KNOW
Wall-mount compatible (bracket sold separately). For the best experience, pair it with a soundbar and use a stable internet connection for streaming. Delivery and installation can be arranged with the supplier.

WHAT'S IN THE BOX
TV, remote control, batteries, stand, power cord, user manual.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 285000, 315000, '/demo-products/tcl-43-4k-uhd-google-tv-1.svg', ARRAY['/demo-products/tcl-43-4k-uhd-google-tv-1.svg', '/demo-products/tcl-43-4k-uhd-google-tv-2.svg', '/demo-products/tcl-43-4k-uhd-google-tv-3.svg']::text[], 'smart-tvs', '00000000-0000-4000-8000-000000000d05', 'TCL', 'DEMO-TV-004', 30, false, NULL::text, 1, 'Piece', '[]', '{"Screen size": "43 inches", "Resolution": "4K UHD (3840 x 2160)", "Refresh rate": "60Hz", "HDR": "HDR10, HLG", "Smart platform": "Google TV with Google Assistant", "Ports": "3x HDMI, 2x USB, Ethernet", "Wi-Fi": "Wi-Fi 5, Bluetooth 5.0", "Sound": "16W, Dolby Audio", "Wall mount": "VESA 200 x 200", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 195),
  ('Sony BRAVIA 55" X77L 4K Google TV', 'sony-bravia-55-x77l-4k-google-tv', $d$Sony BRAVIA 55" X77L 4K Google TV is a 55-inch Sony 4K TV with the 4K Processor X1 and TRILUMINOS Pro colour for refined, natural pictures.

KEY FEATURES
• Screen size: 55 inches
• Resolution: 4K UHD (3840 x 2160)
• Refresh rate: 60Hz native
• HDR: HDR10, HLG, Dolby Vision
• Smart platform: Google TV
• Ports: 3x HDMI (1x eARC), 2x USB, Ethernet

GOOD TO KNOW
Wall-mount compatible (bracket sold separately). For the best experience, pair it with a soundbar and use a stable internet connection for streaming. Delivery and installation can be arranged with the supplier.

WHAT'S IN THE BOX
TV, remote control, batteries, stand, power cord, user manual.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 640000, NULL::numeric, '/demo-products/sony-bravia-55-x77l-4k-google-tv-1.svg', ARRAY['/demo-products/sony-bravia-55-x77l-4k-google-tv-1.svg', '/demo-products/sony-bravia-55-x77l-4k-google-tv-2.svg', '/demo-products/sony-bravia-55-x77l-4k-google-tv-3.svg']::text[], 'smart-tvs', '00000000-0000-4000-8000-000000000d03', 'Sony', 'DEMO-TV-005', 9, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 627000}, {"min_qty": 10, "price": 614500}, {"min_qty": 20, "price": 601500}]', '{"Screen size": "55 inches", "Resolution": "4K UHD (3840 x 2160)", "Refresh rate": "60Hz native", "HDR": "HDR10, HLG, Dolby Vision", "Smart platform": "Google TV", "Ports": "3x HDMI (1x eARC), 2x USB, Ethernet", "Wi-Fi": "Wi-Fi 5, Bluetooth 5.0", "Sound": "20W, Dolby Audio", "Wall mount": "VESA 300 x 300", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 475),
  ('Sony PlayStation 5 Slim Disc Edition 1TB', 'sony-playstation-5-slim-disc-edition-1tb', $d$Sony PlayStation 5 Slim Disc Edition 1TB is the slimmer PS5 with a 1TB SSD, ray tracing and 4K gaming up to 120fps, plus a Blu-ray disc drive for your game collection.

KEY FEATURES
• Storage: 1TB SSD
• CPU: AMD Zen 2, 8 cores
• GPU: AMD RDNA 2, 10.28 TFLOPs
• Output: Up to 4K at 120fps, 8K support
• Disc drive: Ultra HD Blu-ray
• Ports: HDMI 2.1, 2x USB-C, 1x USB-A, Ethernet

GOOD TO KNOW
Check that your TV or monitor supports the resolution and refresh rate you want to play at. Online play and subscription services may require separate subscriptions.

WHAT'S IN THE BOX
Console, DualSense controller, HDMI cable, power cable, USB cable, base, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 920000, 980000, '/demo-products/sony-playstation-5-slim-disc-edition-1tb-1.svg', ARRAY['/demo-products/sony-playstation-5-slim-disc-edition-1tb-1.svg', '/demo-products/sony-playstation-5-slim-disc-edition-1tb-2.svg', '/demo-products/sony-playstation-5-slim-disc-edition-1tb-3.svg']::text[], 'gaming-devices', '00000000-0000-4000-8000-000000000d03', 'Sony', 'DEMO-GM-001', 14, true, 'Hot', 1, 'Piece', '[]', '{"Storage": "1TB SSD", "CPU": "AMD Zen 2, 8 cores", "GPU": "AMD RDNA 2, 10.28 TFLOPs", "Output": "Up to 4K at 120fps, 8K support", "Disc drive": "Ultra HD Blu-ray", "Ports": "HDMI 2.1, 2x USB-C, 1x USB-A, Ethernet", "Controller": "DualSense wireless controller", "Colour": "White", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 932),
  ('Microsoft Xbox Series X 1TB', 'microsoft-xbox-series-x-1tb', $d$Microsoft Xbox Series X 1TB is Microsoft's most powerful console, built for 4K gaming up to 120fps with Quick Resume and Game Pass support.

KEY FEATURES
• Storage: 1TB NVMe SSD
• CPU: AMD Zen 2, 8 cores
• GPU: AMD RDNA 2, 12 TFLOPs
• Output: Up to 4K at 120fps, 8K support
• Disc drive: Ultra HD Blu-ray
• Ports: HDMI 2.1, 3x USB 3.1, Ethernet

GOOD TO KNOW
Check that your TV or monitor supports the resolution and refresh rate you want to play at. Online play and subscription services may require separate subscriptions.

WHAT'S IN THE BOX
Console, wireless controller, HDMI cable, power cable, batteries, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 880000, NULL::numeric, '/demo-products/microsoft-xbox-series-x-1tb-1.svg', ARRAY['/demo-products/microsoft-xbox-series-x-1tb-1.svg', '/demo-products/microsoft-xbox-series-x-1tb-2.svg', '/demo-products/microsoft-xbox-series-x-1tb-3.svg']::text[], 'gaming-devices', '00000000-0000-4000-8000-000000000d05', 'Microsoft', 'DEMO-GM-002', 10, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 862500}, {"min_qty": 10, "price": 845000}, {"min_qty": 20, "price": 827000}]', '{"Storage": "1TB NVMe SSD", "CPU": "AMD Zen 2, 8 cores", "GPU": "AMD RDNA 2, 12 TFLOPs", "Output": "Up to 4K at 120fps, 8K support", "Disc drive": "Ultra HD Blu-ray", "Ports": "HDMI 2.1, 3x USB 3.1, Ethernet", "Controller": "Xbox Wireless Controller", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 837),
  ('Nintendo Switch OLED Model', 'nintendo-switch-oled-model', $d$Nintendo Switch OLED Model features a vivid 7-inch OLED screen, a wide adjustable stand and enhanced audio for gaming at home or on the go.

KEY FEATURES
• Display: 7-inch OLED, 1280 x 720
• Storage: 64GB (microSD expandable)
• Modes: TV, tabletop and handheld
• Battery: 4.5-9 hours
• Connectivity: Wi-Fi, Bluetooth 4.1
• Controllers: Joy-Con (L) and (R) included

GOOD TO KNOW
Check that your TV or monitor supports the resolution and refresh rate you want to play at. Online play and subscription services may require separate subscriptions.

WHAT'S IN THE BOX
Console, dock, Joy-Con controllers, Joy-Con grip, HDMI cable, AC adapter.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 370000, 400000, '/demo-products/nintendo-switch-oled-model-1.svg', ARRAY['/demo-products/nintendo-switch-oled-model-1.svg', '/demo-products/nintendo-switch-oled-model-2.svg', '/demo-products/nintendo-switch-oled-model-3.svg']::text[], 'gaming-devices', '00000000-0000-4000-8000-000000000d03', 'Nintendo', 'DEMO-GM-003', 0, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 362500}, {"min_qty": 10, "price": 355000}, {"min_qty": 20, "price": 348000}]', '{"Display": "7-inch OLED, 1280 x 720", "Storage": "64GB (microSD expandable)", "Modes": "TV, tabletop and handheld", "Battery": "4.5-9 hours", "Connectivity": "Wi-Fi, Bluetooth 4.1", "Controllers": "Joy-Con (L) and (R) included", "Colour": "White", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 57),
  ('Sony DualSense Wireless Controller', 'sony-dualsense-wireless-controller', $d$Sony DualSense Wireless Controller brings haptic feedback and adaptive triggers to your PS5 games, with a built-in microphone and motion sensors.

KEY FEATURES
• Compatibility: PS5, PC, Mac, mobile
• Features: Haptic feedback, adaptive triggers, motion sensor, built-in mic
• Battery: Up to 12 hours (1,560 mAh)
• Connectivity: Bluetooth 5.1, USB-C
• Weight: 280 g

GOOD TO KNOW
Check that your TV or monitor supports the resolution and refresh rate you want to play at. Online play and subscription services may require separate subscriptions.

WHAT'S IN THE BOX
Controller, USB-C cable, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 62000, 68000, '/demo-products/sony-dualsense-wireless-controller-1.svg', ARRAY['/demo-products/sony-dualsense-wireless-controller-1.svg', '/demo-products/sony-dualsense-wireless-controller-2.svg', '/demo-products/sony-dualsense-wireless-controller-3.svg']::text[], 'gaming-devices', '00000000-0000-4000-8000-000000000d03', 'Sony', 'DEMO-GM-004', 75, false, NULL::text, 2, 'Piece', '[{"min_qty": 10, "price": 58900}, {"min_qty": 25, "price": 56400}, {"min_qty": 50, "price": 53900}]', '{"Compatibility": "PS5, PC, Mac, mobile", "Features": "Haptic feedback, adaptive triggers, motion sensor, built-in mic", "Battery": "Up to 12 hours (1,560 mAh)", "Connectivity": "Bluetooth 5.1, USB-C", "Weight": "280 g", "Colour": "White", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 722),
  ('Logitech G502 HERO Wired Gaming Mouse', 'logitech-g502-hero-wired-gaming-mouse', $d$Logitech G502 HERO Wired Gaming Mouse is an iconic gaming mouse with a 25K HERO sensor, 11 programmable buttons and tunable weights for a custom feel.

KEY FEATURES
• Sensor: HERO 25K
• DPI: 100-25,600
• Buttons: 11 programmable
• Weight: 121 g (adjustable with weights)
• Lighting: LIGHTSYNC RGB
• Connectivity: USB wired, 2.1m cable

GOOD TO KNOW
Check that your TV or monitor supports the resolution and refresh rate you want to play at. Online play and subscription services may require separate subscriptions.

WHAT'S IN THE BOX
Mouse, removable weights, user documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 38000, 45000, '/demo-products/logitech-g502-hero-wired-gaming-mouse-1.svg', ARRAY['/demo-products/logitech-g502-hero-wired-gaming-mouse-1.svg', '/demo-products/logitech-g502-hero-wired-gaming-mouse-2.svg', '/demo-products/logitech-g502-hero-wired-gaming-mouse-3.svg']::text[], 'gaming-devices', '00000000-0000-4000-8000-000000000d03', 'Logitech', 'DEMO-GM-005', 65, false, NULL::text, 3, 'Piece', '[{"min_qty": 10, "price": 36100}, {"min_qty": 25, "price": 34600}, {"min_qty": 50, "price": 33100}]', '{"Sensor": "HERO 25K", "DPI": "100-25,600", "Buttons": "11 programmable", "Weight": "121 g (adjustable with weights)", "Lighting": "LIGHTSYNC RGB", "Connectivity": "USB wired, 2.1m cable", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 226),
  ('Canon EOS R50 Mirrorless Camera with RF-S 18-45mm Lens', 'canon-eos-r50-mirrorless-camera-with-rf-s-18-45mm-lens', $d$Canon EOS R50 Mirrorless Camera with RF-S 18-45mm Lens is a lightweight mirrorless camera for vloggers and beginners, with a 24.2MP APS-C sensor, subject-tracking autofocus and 4K video.

KEY FEATURES
• Sensor: 24.2MP APS-C CMOS
• Video: 4K up to 30p, Full HD up to 120p
• Autofocus: Dual Pixel CMOS AF II with subject tracking
• Screen: 3.0-inch vari-angle touchscreen
• Burst: Up to 15fps mechanical / 12fps electronic
• Connectivity: Wi-Fi, Bluetooth, USB-C

GOOD TO KNOW
Memory cards and spare batteries are sold separately unless listed. Drone users should check and follow local aviation rules before flying.

WHAT'S IN THE BOX
Camera body, RF-S 18-45mm lens, battery, charger, strap, body cap.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 780000, 840000, '/demo-products/canon-eos-r50-mirrorless-camera-with-rf-s-18-45mm-lens-1.svg', ARRAY['/demo-products/canon-eos-r50-mirrorless-camera-with-rf-s-18-45mm-lens-1.svg', '/demo-products/canon-eos-r50-mirrorless-camera-with-rf-s-18-45mm-lens-2.svg', '/demo-products/canon-eos-r50-mirrorless-camera-with-rf-s-18-45mm-lens-3.svg']::text[], 'cameras-drones', '00000000-0000-4000-8000-000000000d02', 'Canon', 'DEMO-CM-001', 7, true, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 764500}, {"min_qty": 10, "price": 749000}, {"min_qty": 20, "price": 733000}]', '{"Sensor": "24.2MP APS-C CMOS", "Video": "4K up to 30p, Full HD up to 120p", "Autofocus": "Dual Pixel CMOS AF II with subject tracking", "Screen": "3.0-inch vari-angle touchscreen", "Burst": "Up to 15fps mechanical / 12fps electronic", "Connectivity": "Wi-Fi, Bluetooth, USB-C", "Weight": "Approx. 375 g (body only)", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1140),
  ('Sony ZV-E10 Mirrorless Vlog Camera Kit (16-50mm)', 'sony-zv-e10-mirrorless-vlog-camera-kit-16-50mm', $d$Sony ZV-E10 Mirrorless Vlog Camera Kit (16-50mm) is built for content creators, with a flip-out screen, a directional 3-capsule microphone and fast, reliable autofocus.

KEY FEATURES
• Sensor: 24.2MP APS-C Exmor CMOS
• Video: 4K up to 30p, Full HD up to 120p
• Autofocus: Fast Hybrid AF with Real-time Eye AF
• Screen: 3.0-inch vari-angle touchscreen
• Audio: 3-capsule mic with windscreen
• Connectivity: Wi-Fi, Bluetooth, USB-C

GOOD TO KNOW
Memory cards and spare batteries are sold separately unless listed. Drone users should check and follow local aviation rules before flying.

WHAT'S IN THE BOX
Camera body, 16-50mm lens, battery, charger, windscreen, strap.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 720000, NULL::numeric, '/demo-products/sony-zv-e10-mirrorless-vlog-camera-kit-16-50mm-1.svg', ARRAY['/demo-products/sony-zv-e10-mirrorless-vlog-camera-kit-16-50mm-1.svg', '/demo-products/sony-zv-e10-mirrorless-vlog-camera-kit-16-50mm-2.svg', '/demo-products/sony-zv-e10-mirrorless-vlog-camera-kit-16-50mm-3.svg']::text[], 'cameras-drones', '00000000-0000-4000-8000-000000000d05', 'Sony', 'DEMO-CM-002', 9, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 705500}, {"min_qty": 10, "price": 691000}, {"min_qty": 20, "price": 677000}]', '{"Sensor": "24.2MP APS-C Exmor CMOS", "Video": "4K up to 30p, Full HD up to 120p", "Autofocus": "Fast Hybrid AF with Real-time Eye AF", "Screen": "3.0-inch vari-angle touchscreen", "Audio": "3-capsule mic with windscreen", "Connectivity": "Wi-Fi, Bluetooth, USB-C", "Weight": "Approx. 343 g (body only)", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1169),
  ('DJI Mini 4 Pro Fly More Combo', 'dji-mini-4-pro-fly-more-combo', $d$DJI Mini 4 Pro Fly More Combo is a sub-250g drone with 4K/60fps HDR video, omnidirectional obstacle sensing and up to 34 minutes of flight time per battery.

KEY FEATURES
• Camera: 1/1.3-inch CMOS, 48MP photos
• Video: 4K up to 60fps HDR, 100fps slow motion
• Weight: Under 249 g
• Flight time: Up to 34 minutes (per battery)
• Obstacle sensing: Omnidirectional
• Transmission: O4, up to 20km (FCC)

GOOD TO KNOW
Memory cards and spare batteries are sold separately unless listed. Drone users should check and follow local aviation rules before flying.

WHAT'S IN THE BOX
Drone, DJI RC 2 controller, 3 batteries, charging hub, propellers, carrying bag, cables.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 1100000, 1190000, '/demo-products/dji-mini-4-pro-fly-more-combo-1.svg', ARRAY['/demo-products/dji-mini-4-pro-fly-more-combo-1.svg', '/demo-products/dji-mini-4-pro-fly-more-combo-2.svg', '/demo-products/dji-mini-4-pro-fly-more-combo-3.svg']::text[], 'cameras-drones', '00000000-0000-4000-8000-000000000d02', 'DJI', 'DEMO-CM-003', 5, false, 'New', 1, 'Piece', '[]', '{"Camera": "1/1.3-inch CMOS, 48MP photos", "Video": "4K up to 60fps HDR, 100fps slow motion", "Weight": "Under 249 g", "Flight time": "Up to 34 minutes (per battery)", "Obstacle sensing": "Omnidirectional", "Transmission": "O4, up to 20km (FCC)", "Included batteries": "3x Intelligent Flight Batteries", "Colour": "Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1154),
  ('GoPro HERO12 Black Action Camera', 'gopro-hero12-black-action-camera', $d$GoPro HERO12 Black Action Camera shoots 5.3K video with HyperSmooth 6.0 stabilisation and is waterproof to 10m without a case.

KEY FEATURES
• Video: 5.3K up to 60fps, 4K up to 120fps
• Photo: 27MP
• Stabilisation: HyperSmooth 6.0
• Waterproof: To 10m (33ft)
• Battery: Enduro, 1,720 mAh
• Screens: Front and rear touchscreens

GOOD TO KNOW
Memory cards and spare batteries are sold separately unless listed. Drone users should check and follow local aviation rules before flying.

WHAT'S IN THE BOX
Camera, Enduro battery, mounting buckle, curved adhesive mount, USB-C cable.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 340000, 375000, '/demo-products/gopro-hero12-black-action-camera-1.svg', ARRAY['/demo-products/gopro-hero12-black-action-camera-1.svg', '/demo-products/gopro-hero12-black-action-camera-2.svg', '/demo-products/gopro-hero12-black-action-camera-3.svg']::text[], 'cameras-drones', '00000000-0000-4000-8000-000000000d05', 'GoPro', 'DEMO-CM-004', 12, false, NULL::text, 1, 'Piece', '[]', '{"Video": "5.3K up to 60fps, 4K up to 120fps", "Photo": "27MP", "Stabilisation": "HyperSmooth 6.0", "Waterproof": "To 10m (33ft)", "Battery": "Enduro, 1,720 mAh", "Screens": "Front and rear touchscreens", "Connectivity": "Wi-Fi 6, Bluetooth, USB-C", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 209),
  ('Anker 737 Power Bank (PowerCore 24K) 140W', 'anker-737-power-bank-powercore-24k-140w', $d$Anker 737 Power Bank (PowerCore 24K) 140W is a 24,000mAh power bank that can charge a laptop at up to 140W, with a smart display showing real-time power info.

KEY FEATURES
• Capacity: 24,000 mAh (86.4Wh)
• Output: 140W max (2x USB-C, 1x USB-A)
• Input: 140W USB-C (recharges in about 1.5 hours)
• Display: Smart colour display
• Weight: 630 g
• Safety: MultiProtect, airline-friendly

GOOD TO KNOW
Capacity is rated at the cell level, so real-world usable charge is lower. Airline-approved capacities and certifications vary, so check your airline before flying.

WHAT'S IN THE BOX
Power bank, USB-C cable, travel pouch, user guide.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 115000, 130000, '/demo-products/anker-737-power-bank-powercore-24k-140w-1.svg', ARRAY['/demo-products/anker-737-power-bank-powercore-24k-140w-1.svg', '/demo-products/anker-737-power-bank-powercore-24k-140w-2.svg', '/demo-products/anker-737-power-bank-powercore-24k-140w-3.svg']::text[], 'power-banks-chargers', '00000000-0000-4000-8000-000000000d03', 'Anker', 'DEMO-PW-001', 38, true, NULL::text, 2, 'Piece', '[{"min_qty": 10, "price": 109000}, {"min_qty": 25, "price": 104500}, {"min_qty": 50, "price": 100000}]', '{"Capacity": "24,000 mAh (86.4Wh)", "Output": "140W max (2x USB-C, 1x USB-A)", "Input": "140W USB-C (recharges in about 1.5 hours)", "Display": "Smart colour display", "Weight": "630 g", "Safety": "MultiProtect, airline-friendly", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 895),
  ('Oraimo Traveler 20000mAh Power Bank (22.5W)', 'oraimo-traveler-20000mah-power-bank-22-5w', $d$Oraimo Traveler 20000mAh Power Bank (22.5W) is a high-capacity power bank with 22.5W fast charging and dual outputs for charging two devices at once.

KEY FEATURES
• Capacity: 20,000 mAh
• Output: 22.5W max (USB-C PD + USB-A)
• Input: USB-C 18W
• Display: LED digital display
• Safety: Over-charge and short-circuit protection

GOOD TO KNOW
Capacity is rated at the cell level, so real-world usable charge is lower. Airline-approved capacities and certifications vary, so check your airline before flying.

WHAT'S IN THE BOX
Power bank, USB-C cable, user manual.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 24500, 28000, '/demo-products/oraimo-traveler-20000mah-power-bank-22-5w-1.svg', ARRAY['/demo-products/oraimo-traveler-20000mah-power-bank-22-5w-1.svg', '/demo-products/oraimo-traveler-20000mah-power-bank-22-5w-2.svg', '/demo-products/oraimo-traveler-20000mah-power-bank-22-5w-3.svg']::text[], 'power-banks-chargers', '00000000-0000-4000-8000-000000000d01', 'Oraimo', 'DEMO-PW-002', 250, false, 'Best Seller', 10, 'Piece', '[]', '{"Capacity": "20,000 mAh", "Output": "22.5W max (USB-C PD + USB-A)", "Input": "USB-C 18W", "Display": "LED digital display", "Safety": "Over-charge and short-circuit protection", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 125),
  ('Baseus Blade 100W 20000mAh Ultra-Slim Power Bank', 'baseus-blade-100w-20000mah-ultra-slim-power-bank', $d$Baseus Blade 100W 20000mAh Ultra-Slim Power Bank is an ultra-slim, laptop-ready power bank with 100W output and a digital display for monitoring battery and power.

KEY FEATURES
• Capacity: 20,000 mAh
• Output: 100W max (2x USB-C, 1x USB-A)
• Display: Digital display
• Thickness: Ultra-slim 14mm
• Compatibility: Laptops, tablets and phones

GOOD TO KNOW
Capacity is rated at the cell level, so real-world usable charge is lower. Airline-approved capacities and certifications vary, so check your airline before flying.

WHAT'S IN THE BOX
Power bank, USB-C cable, user manual.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 68000, NULL::numeric, '/demo-products/baseus-blade-100w-20000mah-ultra-slim-power-bank-1.svg', ARRAY['/demo-products/baseus-blade-100w-20000mah-ultra-slim-power-bank-1.svg', '/demo-products/baseus-blade-100w-20000mah-ultra-slim-power-bank-2.svg', '/demo-products/baseus-blade-100w-20000mah-ultra-slim-power-bank-3.svg']::text[], 'power-banks-chargers', '00000000-0000-4000-8000-000000000d05', 'Baseus', 'DEMO-PW-003', 55, false, NULL::text, 5, 'Piece', '[{"min_qty": 10, "price": 64600}, {"min_qty": 25, "price": 61900}, {"min_qty": 50, "price": 59200}]', '{"Capacity": "20,000 mAh", "Output": "100W max (2x USB-C, 1x USB-A)", "Display": "Digital display", "Thickness": "Ultra-slim 14mm", "Compatibility": "Laptops, tablets and phones", "Colour": "Silver", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 381),
  ('Anker PowerCore 10000mAh Portable Charger', 'anker-powercore-10000mah-portable-charger', $d$Anker PowerCore 10000mAh Portable Charger is one of the smallest 10,000mAh power banks of its kind, with high-speed charging for phones and small devices.

KEY FEATURES
• Capacity: 10,000 mAh
• Output: 12W max (USB-A)
• Input: Micro-USB
• Size: Pocket-size, about the size of a credit card
• Weight: 180 g

GOOD TO KNOW
Capacity is rated at the cell level, so real-world usable charge is lower. Airline-approved capacities and certifications vary, so check your airline before flying.

WHAT'S IN THE BOX
Power bank, micro-USB cable, travel pouch, user guide.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 24000, NULL::numeric, '/demo-products/anker-powercore-10000mah-portable-charger-1.svg', ARRAY['/demo-products/anker-powercore-10000mah-portable-charger-1.svg', '/demo-products/anker-powercore-10000mah-portable-charger-2.svg', '/demo-products/anker-powercore-10000mah-portable-charger-3.svg']::text[], 'power-banks-chargers', '00000000-0000-4000-8000-000000000d01', 'Anker', 'DEMO-PW-004', 140, false, NULL::text, 10, 'Piece', '[{"min_qty": 20, "price": 22800}, {"min_qty": 50, "price": 21800}, {"min_qty": 100, "price": 20900}]', '{"Capacity": "10,000 mAh", "Output": "12W max (USB-A)", "Input": "Micro-USB", "Size": "Pocket-size, about the size of a credit card", "Weight": "180 g", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1292),
  ('EcoFlow RIVER 2 Portable Power Station 256Wh', 'ecoflow-river-2-portable-power-station-256wh', $d$EcoFlow RIVER 2 Portable Power Station 256Wh keeps lights, fans, routers and laptops running during outages, with 300W AC output and a full recharge in about an hour.

KEY FEATURES
• Capacity: 256Wh (LiFePO4)
• AC output: 300W (600W surge), 2 outlets
• Ports: 2x AC, 2x USB-A, 1x USB-C 60W, DC car port
• Recharge: 0-100% in about 60 minutes (AC)
• Solar input: 11-30V, 220W max
• Cycle life: 3,000 cycles to 80%

GOOD TO KNOW
Capacity is rated at the cell level, so real-world usable charge is lower. Airline-approved capacities and certifications vary, so check your airline before flying.

WHAT'S IN THE BOX
Power station, AC charging cable, DC car cable, user manual.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 380000, 420000, '/demo-products/ecoflow-river-2-portable-power-station-256wh-1.svg', ARRAY['/demo-products/ecoflow-river-2-portable-power-station-256wh-1.svg', '/demo-products/ecoflow-river-2-portable-power-station-256wh-2.svg', '/demo-products/ecoflow-river-2-portable-power-station-256wh-3.svg']::text[], 'power-banks-chargers', '00000000-0000-4000-8000-000000000d05', 'EcoFlow', 'DEMO-PW-005', 10, false, 'Hot', 1, 'Piece', '[]', '{"Capacity": "256Wh (LiFePO4)", "AC output": "300W (600W surge), 2 outlets", "Ports": "2x AC, 2x USB-A, 1x USB-C 60W, DC car port", "Recharge": "0-100% in about 60 minutes (AC)", "Solar input": "11-30V, 220W max", "Cycle life": "3,000 cycles to 80%", "Weight": "3.5 kg", "Colour": "Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 568),
  ('Dell 24 Monitor S2425H 100Hz', 'dell-24-monitor-s2425h-100hz', $d$Dell 24 Monitor S2425H 100Hz is a 24-inch Full HD IPS monitor with a 100Hz refresh rate, built-in speakers and a thin-bezel design for office and home use.

KEY FEATURES
• Screen size: 23.8 inches
• Panel: IPS, 1920 x 1080
• Refresh rate: 100Hz
• Response time: 4ms (fast mode)
• Ports: 1x HDMI, 1x VGA
• Speakers: 2x 5W built-in

GOOD TO KNOW
Check that your computer has the right video output (HDMI or DisplayPort) for the resolution and refresh rate you want. VESA-mount compatible for monitor arms.

WHAT'S IN THE BOX
Monitor, stand, HDMI cable, power cable, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 175000, 195000, '/demo-products/dell-24-monitor-s2425h-100hz-1.svg', ARRAY['/demo-products/dell-24-monitor-s2425h-100hz-1.svg', '/demo-products/dell-24-monitor-s2425h-100hz-2.svg', '/demo-products/dell-24-monitor-s2425h-100hz-3.svg']::text[], 'monitors', '00000000-0000-4000-8000-000000000d02', 'Dell', 'DEMO-MN-001', 24, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 171500}, {"min_qty": 10, "price": 168000}, {"min_qty": 20, "price": 164500}]', '{"Screen size": "23.8 inches", "Panel": "IPS, 1920 x 1080", "Refresh rate": "100Hz", "Response time": "4ms (fast mode)", "Ports": "1x HDMI, 1x VGA", "Speakers": "2x 5W built-in", "Mount": "VESA 100 x 100", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 598),
  ('LG UltraGear 27" QHD 165Hz Nano IPS Gaming Monitor (27GP850)', 'lg-ultragear-27-qhd-165hz-nano-ips-gaming-monitor-27gp850', $d$LG UltraGear 27" QHD 165Hz Nano IPS Gaming Monitor (27GP850) is a 27-inch QHD Nano IPS gaming monitor with a 165Hz refresh rate, 1ms response and NVIDIA G-SYNC compatibility.

KEY FEATURES
• Screen size: 27 inches
• Panel: Nano IPS, 2560 x 1440
• Refresh rate: 165Hz (180Hz overclock)
• Response time: 1ms (GtG)
• HDR: VESA DisplayHDR 400
• Ports: 2x HDMI 2.0, 1x DisplayPort 1.4, USB hub

GOOD TO KNOW
Check that your computer has the right video output (HDMI or DisplayPort) for the resolution and refresh rate you want. VESA-mount compatible for monitor arms.

WHAT'S IN THE BOX
Monitor, stand, DisplayPort cable, HDMI cable, power cable, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 380000, 420000, '/demo-products/lg-ultragear-27-qhd-165hz-nano-ips-gaming-monitor-27gp850-1.svg', ARRAY['/demo-products/lg-ultragear-27-qhd-165hz-nano-ips-gaming-monitor-27gp850-1.svg', '/demo-products/lg-ultragear-27-qhd-165hz-nano-ips-gaming-monitor-27gp850-2.svg', '/demo-products/lg-ultragear-27-qhd-165hz-nano-ips-gaming-monitor-27gp850-3.svg']::text[], 'monitors', '00000000-0000-4000-8000-000000000d02', 'LG', 'DEMO-MN-002', 11, false, 'Hot', 1, 'Piece', '[{"min_qty": 5, "price": 372500}, {"min_qty": 10, "price": 365000}, {"min_qty": 20, "price": 357000}]', '{"Screen size": "27 inches", "Panel": "Nano IPS, 2560 x 1440", "Refresh rate": "165Hz (180Hz overclock)", "Response time": "1ms (GtG)", "HDR": "VESA DisplayHDR 400", "Ports": "2x HDMI 2.0, 1x DisplayPort 1.4, USB hub", "Adaptive sync": "NVIDIA G-SYNC Compatible, AMD FreeSync Premium", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 536),
  ('Samsung Odyssey G5 27" QHD 144Hz Curved Gaming Monitor', 'samsung-odyssey-g5-27-qhd-144hz-curved-gaming-monitor', $d$Samsung Odyssey G5 27" QHD 144Hz Curved Gaming Monitor is a curved 1000R gaming monitor with QHD resolution, 144Hz refresh rate and AMD FreeSync Premium for tear-free play.

KEY FEATURES
• Screen size: 27 inches
• Panel: VA curved (1000R), 2560 x 1440
• Refresh rate: 144Hz
• Response time: 1ms (MPRT)
• HDR: HDR10
• Ports: 1x HDMI 2.0, 1x DisplayPort 1.2

GOOD TO KNOW
Check that your computer has the right video output (HDMI or DisplayPort) for the resolution and refresh rate you want. VESA-mount compatible for monitor arms.

WHAT'S IN THE BOX
Monitor, stand, HDMI cable, power cable, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 285000, NULL::numeric, '/demo-products/samsung-odyssey-g5-27-qhd-144hz-curved-gaming-monitor-1.svg', ARRAY['/demo-products/samsung-odyssey-g5-27-qhd-144hz-curved-gaming-monitor-1.svg', '/demo-products/samsung-odyssey-g5-27-qhd-144hz-curved-gaming-monitor-2.svg', '/demo-products/samsung-odyssey-g5-27-qhd-144hz-curved-gaming-monitor-3.svg']::text[], 'monitors', '00000000-0000-4000-8000-000000000d03', 'Samsung', 'DEMO-MN-003', 14, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 279500}, {"min_qty": 10, "price": 273500}, {"min_qty": 20, "price": 268000}]', '{"Screen size": "27 inches", "Panel": "VA curved (1000R), 2560 x 1440", "Refresh rate": "144Hz", "Response time": "1ms (MPRT)", "HDR": "HDR10", "Ports": "1x HDMI 2.0, 1x DisplayPort 1.2", "Adaptive sync": "AMD FreeSync Premium", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 130),
  ('HP M24f 24" Full HD IPS Monitor', 'hp-m24f-24-full-hd-ips-monitor', $d$HP M24f 24" Full HD IPS Monitor is an affordable 24-inch IPS monitor with ultra-slim bezels, a 75Hz refresh rate and AMD FreeSync for everyday work.

KEY FEATURES
• Screen size: 23.8 inches
• Panel: IPS, 1920 x 1080
• Refresh rate: 75Hz
• Response time: 5ms
• Ports: 1x HDMI 1.4, 1x VGA
• Adaptive sync: AMD FreeSync

GOOD TO KNOW
Check that your computer has the right video output (HDMI or DisplayPort) for the resolution and refresh rate you want. VESA-mount compatible for monitor arms.

WHAT'S IN THE BOX
Monitor, stand, HDMI cable, power cable, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 135000, NULL::numeric, '/demo-products/hp-m24f-24-full-hd-ips-monitor-1.svg', ARRAY['/demo-products/hp-m24f-24-full-hd-ips-monitor-1.svg', '/demo-products/hp-m24f-24-full-hd-ips-monitor-2.svg', '/demo-products/hp-m24f-24-full-hd-ips-monitor-3.svg']::text[], 'monitors', '00000000-0000-4000-8000-000000000d02', 'HP', 'DEMO-MN-004', 36, false, NULL::text, 2, 'Piece', '[{"min_qty": 5, "price": 132500}, {"min_qty": 10, "price": 129500}, {"min_qty": 20, "price": 127000}]', '{"Screen size": "23.8 inches", "Panel": "IPS, 1920 x 1080", "Refresh rate": "75Hz", "Response time": "5ms", "Ports": "1x HDMI 1.4, 1x VGA", "Adaptive sync": "AMD FreeSync", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 845),
  ('HP Laser 107w Wireless Monochrome Laser Printer', 'hp-laser-107w-wireless-monochrome-laser-printer', $d$HP Laser 107w Wireless Monochrome Laser Printer is a compact wireless mono laser printer with crisp text output and easy setup through the HP Smart app.

KEY FEATURES
• Type: Monochrome laser (print only)
• Print speed: Up to 20 ppm
• Resolution: Up to 1200 x 1200 dpi
• Connectivity: Wi-Fi, Hi-Speed USB 2.0
• Paper input: 150-sheet tray
• Duty cycle: Up to 10,000 pages / month

GOOD TO KNOW
Genuine ink and toner are recommended for best results. Ask the supplier about spare cartridges or refill bottles and bulk quantities for offices.

WHAT'S IN THE BOX
Printer, starter toner cartridge, power cable, USB cable, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 165000, 185000, '/demo-products/hp-laser-107w-wireless-monochrome-laser-printer-1.svg', ARRAY['/demo-products/hp-laser-107w-wireless-monochrome-laser-printer-1.svg', '/demo-products/hp-laser-107w-wireless-monochrome-laser-printer-2.svg', '/demo-products/hp-laser-107w-wireless-monochrome-laser-printer-3.svg']::text[], 'printers', '00000000-0000-4000-8000-000000000d03', 'HP', 'DEMO-PR-001', 20, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 161500}, {"min_qty": 10, "price": 158500}, {"min_qty": 20, "price": 155000}]', '{"Type": "Monochrome laser (print only)", "Print speed": "Up to 20 ppm", "Resolution": "Up to 1200 x 1200 dpi", "Connectivity": "Wi-Fi, Hi-Speed USB 2.0", "Paper input": "150-sheet tray", "Duty cycle": "Up to 10,000 pages / month", "Colour": "White", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 850),
  ('Canon PIXMA G3420 Wireless Ink Tank All-in-One Printer', 'canon-pixma-g3420-wireless-ink-tank-all-in-one-printer', $d$Canon PIXMA G3420 Wireless Ink Tank All-in-One Printer prints, scans and copies at a very low cost per page thanks to its refillable ink tanks and wireless connectivity.

KEY FEATURES
• Type: Ink tank all-in-one (print, scan, copy)
• Print speed: Up to 8.8 ipm black / 5.0 ipm colour
• Resolution: Up to 4800 x 1200 dpi
• Connectivity: Wi-Fi, USB
• Yield: About 6,000 pages black / 7,700 pages colour (per ink set)
• Paper input: 100-sheet rear tray

GOOD TO KNOW
Genuine ink and toner are recommended for best results. Ask the supplier about spare cartridges or refill bottles and bulk quantities for offices.

WHAT'S IN THE BOX
Printer, ink bottles (GI-490), power cable, USB cable, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 215000, NULL::numeric, '/demo-products/canon-pixma-g3420-wireless-ink-tank-all-in-one-printer-1.svg', ARRAY['/demo-products/canon-pixma-g3420-wireless-ink-tank-all-in-one-printer-1.svg', '/demo-products/canon-pixma-g3420-wireless-ink-tank-all-in-one-printer-2.svg', '/demo-products/canon-pixma-g3420-wireless-ink-tank-all-in-one-printer-3.svg']::text[], 'printers', '00000000-0000-4000-8000-000000000d02', 'Canon', 'DEMO-PR-002', 17, false, 'Hot', 1, 'Piece', '[{"min_qty": 5, "price": 210500}, {"min_qty": 10, "price": 206500}, {"min_qty": 20, "price": 202000}]', '{"Type": "Ink tank all-in-one (print, scan, copy)", "Print speed": "Up to 8.8 ipm black / 5.0 ipm colour", "Resolution": "Up to 4800 x 1200 dpi", "Connectivity": "Wi-Fi, USB", "Yield": "About 6,000 pages black / 7,700 pages colour (per ink set)", "Paper input": "100-sheet rear tray", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 119),
  ('Epson EcoTank L3250 Wi-Fi All-in-One Ink Tank Printer', 'epson-ecotank-l3250-wi-fi-all-in-one-ink-tank-printer', $d$Epson EcoTank L3250 Wi-Fi All-in-One Ink Tank Printer is a Wi-Fi ink tank printer with spill-free refilling and an exceptionally low cost per page for home and small offices.

KEY FEATURES
• Type: Ink tank all-in-one (print, scan, copy)
• Print speed: Up to 10 ipm black / 5 ipm colour
• Resolution: 5760 x 1440 dpi
• Connectivity: Wi-Fi, Wi-Fi Direct, USB
• Yield: About 4,500 pages black / 7,500 pages colour
• Paper input: 100-sheet rear tray

GOOD TO KNOW
Genuine ink and toner are recommended for best results. Ask the supplier about spare cartridges or refill bottles and bulk quantities for offices.

WHAT'S IN THE BOX
Printer, ink bottles, power cable, USB cable, documentation.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 245000, 270000, '/demo-products/epson-ecotank-l3250-wi-fi-all-in-one-ink-tank-printer-1.svg', ARRAY['/demo-products/epson-ecotank-l3250-wi-fi-all-in-one-ink-tank-printer-1.svg', '/demo-products/epson-ecotank-l3250-wi-fi-all-in-one-ink-tank-printer-2.svg', '/demo-products/epson-ecotank-l3250-wi-fi-all-in-one-ink-tank-printer-3.svg']::text[], 'printers', '00000000-0000-4000-8000-000000000d02', 'Epson', 'DEMO-PR-003', 15, false, NULL::text, 1, 'Piece', '[]', '{"Type": "Ink tank all-in-one (print, scan, copy)", "Print speed": "Up to 10 ipm black / 5 ipm colour", "Resolution": "5760 x 1440 dpi", "Connectivity": "Wi-Fi, Wi-Fi Direct, USB", "Yield": "About 4,500 pages black / 7,500 pages colour", "Paper input": "100-sheet rear tray", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 636),
  ('Philips Essential Air Fryer HD9200 4.1L', 'philips-essential-air-fryer-hd9200-4-1l', $d$Philips Essential Air Fryer HD9200 4.1L uses Rapid Air technology to fry, bake and roast with up to 90% less fat, with simple dials and a dishwasher-safe basket.

KEY FEATURES
• Capacity: 4.1 litres (up to 0.8 kg food)
• Power: 1,400W
• Temperature: 60-200°C
• Timer: 30-minute dial with auto-off
• Technology: Rapid Air
• Cleaning: Dishwasher-safe basket and drawer

GOOD TO KNOW
Make sure your power supply and available space suit the appliance. Installation, where needed, is arranged separately with the supplier.

WHAT'S IN THE BOX
Air fryer, basket, user manual.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 95000, 110000, '/demo-products/philips-essential-air-fryer-hd9200-4-1l-1.svg', ARRAY['/demo-products/philips-essential-air-fryer-hd9200-4-1l-1.svg', '/demo-products/philips-essential-air-fryer-hd9200-4-1l-2.svg', '/demo-products/philips-essential-air-fryer-hd9200-4-1l-3.svg']::text[], 'home-kitchen', '00000000-0000-4000-8000-000000000d03', 'Philips', 'DEMO-HK-001', 45, true, 'Best Seller', 2, 'Piece', '[]', '{"Capacity": "4.1 litres (up to 0.8 kg food)", "Power": "1,400W", "Temperature": "60-200°C", "Timer": "30-minute dial with auto-off", "Technology": "Rapid Air", "Cleaning": "Dishwasher-safe basket and drawer", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 647),
  ('NutriBullet Pro 900 Blender', 'nutribullet-pro-900-blender', $d$NutriBullet Pro 900 Blender is a powerful personal blender for smoothies, sauces and nut butters, with a 900W motor and nutrient-extraction blades.

KEY FEATURES
• Power: 900W
• Capacity: 700ml and 900ml cups
• Blades: Stainless steel extractor blade
• Included cups: 2 (one to-go lid)
• Cleaning: Dishwasher-safe cups and blades

GOOD TO KNOW
Make sure your power supply and available space suit the appliance. Installation, where needed, is arranged separately with the supplier.

WHAT'S IN THE BOX
Motor base, extractor blade, 2 cups, lip rings, recipe guide.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 78000, 90000, '/demo-products/nutribullet-pro-900-blender-1.svg', ARRAY['/demo-products/nutribullet-pro-900-blender-1.svg', '/demo-products/nutribullet-pro-900-blender-2.svg', '/demo-products/nutribullet-pro-900-blender-3.svg']::text[], 'home-kitchen', '00000000-0000-4000-8000-000000000d06', 'NutriBullet', 'DEMO-HK-002', 32, false, NULL::text, 2, 'Piece', '[{"min_qty": 10, "price": 74100}, {"min_qty": 25, "price": 71000}, {"min_qty": 50, "price": 67900}]', '{"Power": "900W", "Capacity": "700ml and 900ml cups", "Blades": "Stainless steel extractor blade", "Included cups": "2 (one to-go lid)", "Cleaning": "Dishwasher-safe cups and blades", "Colour": "Gray", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 829),
  ('Hisense 227L Double Door Refrigerator', 'hisense-227l-double-door-refrigerator', $d$Hisense 227L Double Door Refrigerator is a frost-free double-door fridge with a spacious fresh-food compartment and an energy-saving inverter compressor.

KEY FEATURES
• Total capacity: 227 litres
• Type: Top-mount freezer, frost-free
• Compressor: Inverter
• Dimensions: About 55 x 58 x 143 cm
• Features: Adjustable glass shelves, door storage, LED lighting

GOOD TO KNOW
Make sure your power supply and available space suit the appliance. Installation, where needed, is arranged separately with the supplier.

WHAT'S IN THE BOX
Refrigerator, shelves, user manual.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 385000, 420000, '/demo-products/hisense-227l-double-door-refrigerator-1.svg', ARRAY['/demo-products/hisense-227l-double-door-refrigerator-1.svg', '/demo-products/hisense-227l-double-door-refrigerator-2.svg', '/demo-products/hisense-227l-double-door-refrigerator-3.svg']::text[], 'home-kitchen', '00000000-0000-4000-8000-000000000d06', 'Hisense', 'DEMO-HK-003', 8, false, NULL::text, 1, 'Piece', '[]', '{"Total capacity": "227 litres", "Type": "Top-mount freezer, frost-free", "Compressor": "Inverter", "Dimensions": "About 55 x 58 x 143 cm", "Features": "Adjustable glass shelves, door storage, LED lighting", "Colour": "Silver", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1218),
  ('Midea 1.5HP Split Air Conditioner', 'midea-1-5hp-split-air-conditioner', $d$Midea 1.5HP Split Air Conditioner is a 1.5HP split air conditioner with fast cooling, an anti-corrosion coating and a sleek indoor unit with remote.

KEY FEATURES
• Capacity: 1.5HP (about 12,000 BTU)
• Type: Split wall-mounted, cooling only
• Coverage: Up to about 20 sqm
• Refrigerant: R410A
• Features: Sleep mode, timer, washable filter, anti-corrosion coating

GOOD TO KNOW
Make sure your power supply and available space suit the appliance. Installation, where needed, is arranged separately with the supplier.

WHAT'S IN THE BOX
Indoor unit, outdoor unit, remote, mounting plate, manual (installation not included).

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 420000, NULL::numeric, '/demo-products/midea-1-5hp-split-air-conditioner-1.svg', ARRAY['/demo-products/midea-1-5hp-split-air-conditioner-1.svg', '/demo-products/midea-1-5hp-split-air-conditioner-2.svg', '/demo-products/midea-1-5hp-split-air-conditioner-3.svg']::text[], 'home-kitchen', '00000000-0000-4000-8000-000000000d03', 'Midea', 'DEMO-HK-004', 12, false, 'Hot', 1, 'Piece', '[]', '{"Capacity": "1.5HP (about 12,000 BTU)", "Type": "Split wall-mounted, cooling only", "Coverage": "Up to about 20 sqm", "Refrigerant": "R410A", "Features": "Sleep mode, timer, washable filter, anti-corrosion coating", "Colour": "White", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 874),
  ('Xiaomi Robot Vacuum-Mop 2 Lite', 'xiaomi-robot-vacuum-mop-2-lite', $d$Xiaomi Robot Vacuum-Mop 2 Lite vacuums and mops in one pass with 2200Pa suction and LDS laser navigation, and you can schedule cleaning from the Mi Home app.

KEY FEATURES
• Suction: 2,200Pa
• Navigation: LDS laser, room mapping
• Battery: 2,600 mAh, up to 110 minutes
• Dustbin: 450ml
• Water tank: 270ml
• Control: Mi Home app, voice assistants

GOOD TO KNOW
Make sure your power supply and available space suit the appliance. Installation, where needed, is arranged separately with the supplier.

WHAT'S IN THE BOX
Robot vacuum, charging dock, mop, water tank, cleaning tool, power adapter.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 195000, 225000, '/demo-products/xiaomi-robot-vacuum-mop-2-lite-1.svg', ARRAY['/demo-products/xiaomi-robot-vacuum-mop-2-lite-1.svg', '/demo-products/xiaomi-robot-vacuum-mop-2-lite-2.svg', '/demo-products/xiaomi-robot-vacuum-mop-2-lite-3.svg']::text[], 'home-kitchen', '00000000-0000-4000-8000-000000000d06', 'Xiaomi', 'DEMO-HK-005', 14, false, NULL::text, 1, 'Piece', '[{"min_qty": 5, "price": 191000}, {"min_qty": 10, "price": 187000}, {"min_qty": 20, "price": 183500}]', '{"Suction": "2,200Pa", "Navigation": "LDS laser, room mapping", "Battery": "2,600 mAh, up to 110 minutes", "Dustbin": "450ml", "Water tank": "270ml", "Control": "Mi Home app, voice assistants", "Colour": "White", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1407),
  ('Nike Air Force 1 ''07 Sneakers (White)', 'nike-air-force-1-07-sneakers-white', $d$Nike Air Force 1 '07 Sneakers (White) is the classic basketball-born sneaker with a clean leather upper, Air cushioning and a durable cupsole.

KEY FEATURES
• Upper: Leather
• Sole: Rubber cupsole with Nike Air unit
• Fit: True to size
• Colour: White / White
• Available sizes: EU 40-46 (choose when ordering)

GOOD TO KNOW
Sizes and colours can be confirmed with the supplier before you order. Keep the original box for easy exchanges.

WHAT'S IN THE BOX
Pair of shoes, box.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, covered by a 30-day seller guarantee. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 118000, 135000, '/demo-products/nike-air-force-1-07-sneakers-white-1.svg', ARRAY['/demo-products/nike-air-force-1-07-sneakers-white-1.svg', '/demo-products/nike-air-force-1-07-sneakers-white-2.svg', '/demo-products/nike-air-force-1-07-sneakers-white-3.svg']::text[], 'fashion', '00000000-0000-4000-8000-000000000d04', 'Nike', 'DEMO-FS-001', 60, false, 'Best Seller', 2, 'Pair', '[{"min_qty": 10, "price": 112000}, {"min_qty": 25, "price": 107500}, {"min_qty": 50, "price": 102500}]', '{"Upper": "Leather", "Sole": "Rubber cupsole with Nike Air unit", "Fit": "True to size", "Colour": "White", "Available sizes": "EU 40-46 (choose when ordering)", "Condition": "Brand new", "Warranty": "30-day seller guarantee"}', 798),
  ('Adidas Ultraboost Light Running Shoes', 'adidas-ultraboost-light-running-shoes', $d$Adidas Ultraboost Light Running Shoes features the lightest Boost cushioning yet for energy return on every stride, with a Primeknit+ upper that adapts to your foot.

KEY FEATURES
• Upper: Primeknit+
• Midsole: Light BOOST
• Outsole: Continental rubber
• Fit: Snug, true to size
• Available sizes: EU 40-46 (choose when ordering)

GOOD TO KNOW
Sizes and colours can be confirmed with the supplier before you order. Keep the original box for easy exchanges.

WHAT'S IN THE BOX
Pair of shoes, box.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, covered by a 30-day seller guarantee. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 165000, 185000, '/demo-products/adidas-ultraboost-light-running-shoes-1.svg', ARRAY['/demo-products/adidas-ultraboost-light-running-shoes-1.svg', '/demo-products/adidas-ultraboost-light-running-shoes-2.svg', '/demo-products/adidas-ultraboost-light-running-shoes-3.svg']::text[], 'fashion', '00000000-0000-4000-8000-000000000d04', 'Adidas', 'DEMO-FS-002', 25, false, NULL::text, 2, 'Pair', '[]', '{"Upper": "Primeknit+", "Midsole": "Light BOOST", "Outsole": "Continental rubber", "Fit": "Snug, true to size", "Available sizes": "EU 40-46 (choose when ordering)", "Colour": "Black", "Condition": "Brand new", "Warranty": "30-day seller guarantee"}', 120),
  ('Casio G-Shock GA-2100-1A1 Analog-Digital Watch', 'casio-g-shock-ga-2100-1a1-analog-digital-watch', $d$Casio G-Shock GA-2100-1A1 Analog-Digital Watch is the slim, carbon-core "CasiOak" G-SHOCK with shock resistance, 200m water resistance and an LED light.

KEY FEATURES
• Case: Carbon Core Guard resin
• Display: Analog-digital
• Water resistance: 200m
• Functions: World time, stopwatch, countdown timer, alarm, LED light, auto calendar
• Shock resistance: Yes

GOOD TO KNOW
Sizes and colours can be confirmed with the supplier before you order. Keep the original box for easy exchanges.

WHAT'S IN THE BOX
Watch, box, manual.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, covered by a 30-day seller guarantee. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 98000, 112000, '/demo-products/casio-g-shock-ga-2100-1a1-analog-digital-watch-1.svg', ARRAY['/demo-products/casio-g-shock-ga-2100-1a1-analog-digital-watch-1.svg', '/demo-products/casio-g-shock-ga-2100-1a1-analog-digital-watch-2.svg', '/demo-products/casio-g-shock-ga-2100-1a1-analog-digital-watch-3.svg']::text[], 'fashion', '00000000-0000-4000-8000-000000000d04', 'Casio', 'DEMO-FS-003', 42, true, NULL::text, 2, 'Piece', '[{"min_qty": 10, "price": 93100}, {"min_qty": 25, "price": 89200}, {"min_qty": 50, "price": 85300}]', '{"Case": "Carbon Core Guard resin", "Display": "Analog-digital", "Water resistance": "200m", "Functions": "World time, stopwatch, countdown timer, alarm, LED light, auto calendar", "Shock resistance": "Yes", "Colour": "Black", "Condition": "Brand new", "Warranty": "30-day seller guarantee"}', 50),
  ('Anti-Theft Laptop Backpack 15.6" with USB Charging Port', 'anti-theft-laptop-backpack-15-6-with-usb-charging-port', $d$Anti-Theft Laptop Backpack 15.6" with USB Charging Port is a water-resistant, anti-theft backpack with a padded laptop compartment, hidden zippers and an external USB charging port.

KEY FEATURES
• Fits: Laptops up to 15.6 inches
• Material: Water-resistant polyester
• Features: Hidden anti-theft pocket, external USB port, padded straps
• Capacity: About 25 litres
• Colours: Black, navy, gray

GOOD TO KNOW
Sizes and colours can be confirmed with the supplier before you order. Keep the original box for easy exchanges.

WHAT'S IN THE BOX
Backpack.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, covered by a 30-day seller guarantee. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 22000, 28000, '/demo-products/anti-theft-laptop-backpack-15-6-with-usb-charging-port-1.svg', ARRAY['/demo-products/anti-theft-laptop-backpack-15-6-with-usb-charging-port-1.svg', '/demo-products/anti-theft-laptop-backpack-15-6-with-usb-charging-port-2.svg', '/demo-products/anti-theft-laptop-backpack-15-6-with-usb-charging-port-3.svg']::text[], 'fashion', '00000000-0000-4000-8000-000000000d04', 'Generic', 'DEMO-FS-004', 130, false, NULL::text, 5, 'Piece', '[]', '{"Fits": "Laptops up to 15.6 inches", "Material": "Water-resistant polyester", "Features": "Hidden anti-theft pocket, external USB port, padded straps", "Capacity": "About 25 litres", "Colours": "Black, navy, gray", "Colour": "Navy", "Condition": "Brand new", "Warranty": "30-day seller guarantee"}', 595),
  ('Philips OneBlade QP2724 Hybrid Trimmer and Shaver', 'philips-oneblade-qp2724-hybrid-trimmer-and-shaver', $d$Philips OneBlade QP2724 Hybrid Trimmer and Shaver trims, edges and shaves any length of hair with a unique dual-protection system for a comfortable result.

KEY FEATURES
• Use: Trim, edge and shave (wet or dry)
• Blade: OneBlade, lasts up to 4 months
• Battery: 45 minutes runtime, 8-hour charge
• Comb: 3 length guides (1, 3, 5mm)
• Washable: Fully washable

GOOD TO KNOW
For personal-care and home-health devices, follow the manufacturer's guidance. Home monitors are not a substitute for professional medical advice.

WHAT'S IN THE BOX
OneBlade handle, blade, 3 stubble combs, charger, cleaning brush.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 38000, 45000, '/demo-products/philips-oneblade-qp2724-hybrid-trimmer-and-shaver-1.svg', ARRAY['/demo-products/philips-oneblade-qp2724-hybrid-trimmer-and-shaver-1.svg', '/demo-products/philips-oneblade-qp2724-hybrid-trimmer-and-shaver-2.svg', '/demo-products/philips-oneblade-qp2724-hybrid-trimmer-and-shaver-3.svg']::text[], 'beauty-health', '00000000-0000-4000-8000-000000000d06', 'Philips', 'DEMO-BH-001', 48, false, NULL::text, 3, 'Piece', '[{"min_qty": 10, "price": 36100}, {"min_qty": 25, "price": 34600}, {"min_qty": 50, "price": 33100}]', '{"Use": "Trim, edge and shave (wet or dry)", "Blade": "OneBlade, lasts up to 4 months", "Battery": "45 minutes runtime, 8-hour charge", "Comb": "3 length guides (1, 3, 5mm)", "Washable": "Fully washable", "Colour": "Green", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 610),
  ('Oral-B iO Series 4 Electric Toothbrush', 'oral-b-io-series-4-electric-toothbrush', $d$Oral-B iO Series 4 Electric Toothbrush uses micro-vibrations and a round brush head to remove more plaque, with a pressure sensor and 3 cleaning modes.

KEY FEATURES
• Modes: 3 (Daily Clean, Sensitive, Whiten)
• Sensor: Pressure sensor with light
• Battery: Up to 2 weeks
• Timer: 2-minute timer with 30-second quadrant pacer
• Included: 1 brush head and travel case

GOOD TO KNOW
For personal-care and home-health devices, follow the manufacturer's guidance. Home monitors are not a substitute for professional medical advice.

WHAT'S IN THE BOX
Handle, brush head, charger, travel case.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 78000, 88000, '/demo-products/oral-b-io-series-4-electric-toothbrush-1.svg', ARRAY['/demo-products/oral-b-io-series-4-electric-toothbrush-1.svg', '/demo-products/oral-b-io-series-4-electric-toothbrush-2.svg', '/demo-products/oral-b-io-series-4-electric-toothbrush-3.svg']::text[], 'beauty-health', '00000000-0000-4000-8000-000000000d06', 'Oral-B', 'DEMO-BH-002', 35, false, NULL::text, 3, 'Piece', '[{"min_qty": 10, "price": 74100}, {"min_qty": 25, "price": 71000}, {"min_qty": 50, "price": 67900}]', '{"Modes": "3 (Daily Clean, Sensitive, Whiten)", "Sensor": "Pressure sensor with light", "Battery": "Up to 2 weeks", "Timer": "2-minute timer with 30-second quadrant pacer", "Included": "1 brush head and travel case", "Colour": "White", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 1201),
  ('Omron M2 Basic Upper Arm Blood Pressure Monitor', 'omron-m2-basic-upper-arm-blood-pressure-monitor', $d$Omron M2 Basic Upper Arm Blood Pressure Monitor is a clinically validated upper-arm monitor with an intelligent cuff for accurate home blood pressure readings and 30-reading memory.

KEY FEATURES
• Measurement: Oscillometric, upper arm
• Cuff: Intelli Wrap cuff, 22-42cm
• Memory: 30 readings
• Indicators: Irregular heartbeat detector, hypertension indicator
• Power: 4x AA batteries

GOOD TO KNOW
For personal-care and home-health devices, follow the manufacturer's guidance. Home monitors are not a substitute for professional medical advice.

WHAT'S IN THE BOX
Monitor, Intelli Wrap cuff, 4 AA batteries, storage case, manual.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, supplied with a 12 months warranty. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 65000, 72000, '/demo-products/omron-m2-basic-upper-arm-blood-pressure-monitor-1.svg', ARRAY['/demo-products/omron-m2-basic-upper-arm-blood-pressure-monitor-1.svg', '/demo-products/omron-m2-basic-upper-arm-blood-pressure-monitor-2.svg', '/demo-products/omron-m2-basic-upper-arm-blood-pressure-monitor-3.svg']::text[], 'beauty-health', '00000000-0000-4000-8000-000000000d06', 'Omron', 'DEMO-BH-003', 40, false, NULL::text, 2, 'Piece', '[{"min_qty": 10, "price": 61800}, {"min_qty": 25, "price": 59200}, {"min_qty": 50, "price": 56600}]', '{"Measurement": "Oscillometric, upper arm", "Cuff": "Intelli Wrap cuff, 22-42cm", "Memory": "30 readings", "Indicators": "Irregular heartbeat detector, hypertension indicator", "Power": "4x AA batteries", "Colour": "White", "Condition": "Brand new, factory sealed", "Warranty": "12 months"}', 406),
  ('Adjustable Dumbbell Set 20kg', 'adjustable-dumbbell-set-20kg', $d$Adjustable Dumbbell Set 20kg is an adjustable pair that replaces a rack of weights, with locking collars and a non-slip handle for home workouts.

KEY FEATURES
• Weight range: Adjustable up to 10kg per dumbbell (20kg pair)
• Material: Cast iron plates with chrome handles
• Collars: Spin-lock collars
• Handle: Non-slip knurled grip

GOOD TO KNOW
Start with a light routine and increase gradually. Ask the supplier about bulk orders for gyms, schools and teams.

WHAT'S IN THE BOX
2 dumbbell handles, plates, 4 collars.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, covered by a 30-day seller guarantee. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 58000, 68000, '/demo-products/adjustable-dumbbell-set-20kg-1.svg', ARRAY['/demo-products/adjustable-dumbbell-set-20kg-1.svg', '/demo-products/adjustable-dumbbell-set-20kg-2.svg', '/demo-products/adjustable-dumbbell-set-20kg-3.svg']::text[], 'sports-outdoors', '00000000-0000-4000-8000-000000000d06', 'Generic', 'DEMO-SP-001', 30, false, NULL::text, 2, 'Set', '[{"min_qty": 10, "price": 55100}, {"min_qty": 25, "price": 52800}, {"min_qty": 50, "price": 50500}]', '{"Weight range": "Adjustable up to 10kg per dumbbell (20kg pair)", "Material": "Cast iron plates with chrome handles", "Collars": "Spin-lock collars", "Handle": "Non-slip knurled grip", "Colour": "Black", "Condition": "Brand new, factory sealed", "Warranty": "30-day seller guarantee"}', 334),
  ('Xiaomi Mi Body Composition Scale 2', 'xiaomi-mi-body-composition-scale-2', $d$Xiaomi Mi Body Composition Scale 2 is a smart scale that tracks weight and 13 body metrics, including body fat, BMI and muscle mass, synced to the Mi Fit app.

KEY FEATURES
• Measurement: Weight and body composition (13 metrics)
• Capacity: 5-150 kg
• Connectivity: Bluetooth 5.0
• Power: 4x AAA batteries
• App: Mi Fit / Zepp Life

GOOD TO KNOW
Start with a light routine and increase gradually. Ask the supplier about bulk orders for gyms, schools and teams.

WHAT'S IN THE BOX
Scale, 4 AAA batteries, user manual.

SUPPLY & WARRANTY
All units are brand new, genuine and factory sealed, covered by a 30-day seller guarantee. Bulk price breaks (where listed) apply automatically at checkout, so the more you buy, the lower the unit price. Buying for a shop, office or school? Send an inquiry or chat with the supplier for custom quantities and delivery to your city.$d$, 22000, 26000, '/demo-products/xiaomi-mi-body-composition-scale-2-1.svg', ARRAY['/demo-products/xiaomi-mi-body-composition-scale-2-1.svg', '/demo-products/xiaomi-mi-body-composition-scale-2-2.svg', '/demo-products/xiaomi-mi-body-composition-scale-2-3.svg']::text[], 'sports-outdoors', '00000000-0000-4000-8000-000000000d06', 'Xiaomi', 'DEMO-SP-002', 95, false, NULL::text, 5, 'Piece', '[{"min_qty": 10, "price": 20900}, {"min_qty": 25, "price": 20000}, {"min_qty": 50, "price": 19100}]', '{"Measurement": "Weight and body composition (13 metrics)", "Capacity": "5-150 kg", "Connectivity": "Bluetooth 5.0", "Power": "4x AAA batteries", "App": "Mi Fit / Zepp Life", "Colour": "White", "Condition": "Brand new, factory sealed", "Warranty": "30-day seller guarantee"}', 78)
) AS v(name, slug, description, price, cmp, image_url, images, cat_slug, vendor_uid, brand, sku,
       stock, feat, badge, moq, unit, tiers, specs, hrs)
JOIN public.categories c ON c.slug = v.cat_slug
JOIN public.vendors vd ON vd.user_id = v.vendor_uid::uuid
ON CONFLICT (slug) DO NOTHING;

-- Quick check: how many demo products are now in the database?
-- SELECT count(*) FROM public.products WHERE sku LIKE 'DEMO-%';
