-- Marketplace terminology update: notification message text only.
-- No table, column, or trigger name changes — just the human-readable
-- copy stored in notifications.message, so existing relationships,
-- RLS, and the 'follow' type value are untouched.

CREATE OR REPLACE FUNCTION public.notify_new_follow()
RETURNS TRIGGER AS $$
DECLARE
  vendor_user_id UUID;
BEGIN
  SELECT user_id INTO vendor_user_id FROM public.vendors WHERE id = NEW.vendor_id;
  IF vendor_user_id IS NOT NULL AND vendor_user_id != NEW.follower_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, vendor_id, message)
    VALUES (vendor_user_id, NEW.follower_id, 'follow', NEW.vendor_id, 'A new shopper connected with your shop');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.notify_followers_new_post()
RETURNS TRIGGER AS $$
DECLARE
  store TEXT;
BEGIN
  SELECT store_name INTO store FROM public.vendors WHERE id = NEW.vendor_id;
  INSERT INTO public.notifications (recipient_id, actor_id, type, post_id, vendor_id, message)
  SELECT f.follower_id, NULL, 'new_post', NEW.id, NEW.vendor_id, COALESCE(store, 'A shop you''re connected with') || ' just posted a new video'
  FROM public.follows f
  WHERE f.vendor_id = NEW.vendor_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
