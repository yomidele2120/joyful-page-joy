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

UPDATE public.notifications
SET message = 'A new shopper connected with your shop'
WHERE type = 'follow' AND message = 'Someone started following your shop';