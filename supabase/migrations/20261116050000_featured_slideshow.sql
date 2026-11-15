-- The featured banner on the homepage is now a slideshow that moves to the next vendor's banner every 15 seconds.
-- "featured_banner_limit" is how many vendors' banners can be in that slideshow (1 to 10). The old default of 1 would
-- mean no slideshow, so a setting still at 1 is raised to 6. Anything an admin already chose above 1 is left alone.
-- Safe to run twice.
ALTER TABLE public.advertising_settings ALTER COLUMN featured_banner_limit SET DEFAULT 6;
UPDATE public.advertising_settings SET featured_banner_limit = 6 WHERE featured_banner_limit = 1;
