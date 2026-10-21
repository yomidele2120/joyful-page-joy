-- =====================================================================
-- MORE CATEGORIES (32): everyday goods, trade and industry first, then extra tech and office.
-- Paste into the Supabase SQL Editor and run. Safe to run twice: a slug that already exists is skipped.
-- Edit the list first: delete lines you don't want, change names, add your own.
--   name        what shoppers see
--   slug        the web address part: /category/<slug>   (lowercase, words joined with "-")
--   sort_order  position in menus and on the home page. Your 15 existing categories use 1 to 15.
-- =====================================================================
INSERT INTO public.categories (name, slug, description, sort_order) VALUES
  -- Everyday goods
  ('Clothing & Apparel', 'clothing', 'Men''s, women''s and children''s clothing, uniforms and wholesale bundles.', 16),
  ('Food & Groceries', 'groceries', 'Packaged foods, grains, oils, spices and household staples in bulk.', 17),
  ('Beverages & Drinks', 'beverages', 'Soft drinks, juices, water, tea, coffee and drink mixes.', 18),
  ('Baby & Kids', 'baby-kids', 'Baby care, children''s clothing, school items and nursery supplies.', 19),
  ('Books & Stationery', 'books-stationery', 'Books, notebooks, pens, art supplies and office stationery.', 20),
  ('Toys & Games', 'toys-games', 'Toys, puzzles, board games and educational play.', 21),
  ('Jewellery & Accessories', 'jewelry-accessories', 'Jewellery, hair accessories, sunglasses and fashion extras.', 22),
  ('Fabrics & Textiles', 'textiles', 'Ankara, lace, cotton, material by the yard and tailoring supplies.', 23),
  ('Furniture & Decor', 'furniture', 'Sofas, beds, tables, office furniture and home decor.', 24),
  ('Cleaning & Hygiene', 'cleaning-hygiene', 'Detergents, disinfectants, tissue, soap and janitorial supplies.', 25),
  ('Pet Supplies', 'pets', 'Pet food, accessories, grooming and animal-care products.', 26),
  ('Musical Instruments', 'music-instruments', 'Guitars, keyboards, drums, sound gear and accessories.', 27),
  -- Trade, farming and industry
  ('Automotive & Spare Parts', 'automotive', 'Car and bike parts, tyres, oils, batteries and accessories.', 28),
  ('Building & Construction', 'building-construction', 'Cement, roofing, tiles, plumbing, paint and building materials.', 29),
  ('Tools & Hardware', 'tools-hardware', 'Hand tools, power tools, fasteners, locks and workshop supplies.', 30),
  ('Agriculture & Farming', 'agriculture', 'Seeds, fertiliser, farm tools, irrigation and livestock supplies.', 31),
  ('Industrial & Machinery', 'industrial-machinery', 'Generators, pumps, processing machines and factory equipment.', 32),
  ('Packaging & Printing', 'packaging-printing', 'Boxes, bags, labels, bottles, branding and print services.', 33),
  ('Medical & Lab Supplies', 'medical-supplies', 'Consumables, diagnostic kits, clinic equipment and PPE.', 34),
  ('Safety & Workwear', 'safety-workwear', 'Safety boots, helmets, high-visibility wear, gloves and fire safety.', 35),
  -- More tech and office
  ('Networking & Wi-Fi', 'networking', 'Routers, switches, access points, modems and network cabling.', 36),
  ('Solar & Power Backup', 'solar-power', 'Solar panels, inverters, batteries and UPS units for steady power.', 37),
  ('CCTV & Security', 'cctv-security', 'Security cameras, recorders, alarms and access control.', 38),
  ('Computer Components', 'computer-components', 'Processors, graphics cards, motherboards, RAM and power supplies.', 39),
  ('Storage & Memory', 'storage-memory', 'SSDs, hard drives, flash drives and memory cards.', 40),
  ('Office Equipment', 'office-equipment', 'Projectors, shredders, scanners, copiers and office electronics.', 41),
  ('POS & Retail Equipment', 'pos-retail', 'Point-of-sale terminals, barcode scanners and receipt printers.', 42),
  ('Audio & Speakers', 'audio-speakers', 'Speakers, soundbars, microphones and headphones.', 43),
  ('Servers & Data Centre', 'servers-datacenter', 'Servers, racks and enterprise storage.', 44),
  ('Cables & Adapters', 'cables-adapters', 'HDMI, USB, power and network cables, plus adapters and hubs.', 45),
  ('Lighting & Electrical', 'lighting-electrical', 'LED lighting, extension cords, sockets and electrical accessories.', 46),
  ('Software & Licences', 'software-licenses', 'Operating systems, office suites and security software.', 47)
ON CONFLICT (slug) DO NOTHING;

-- Optional: the first two categories (by sort_order) become the two big tiles on the home page.
-- To feature different ones, swap their positions, for example:
--   UPDATE public.categories SET sort_order = 1 WHERE slug = 'groceries';
--   UPDATE public.categories SET sort_order = 2 WHERE slug = 'clothing';
-- Hide a category from menus without deleting it:
--   UPDATE public.categories SET is_visible = false WHERE slug = 'software-licenses';
