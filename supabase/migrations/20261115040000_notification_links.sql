-- Every notification gets a link to the page it is about.
-- A BEFORE INSERT trigger fills the link whenever the code that creates a notification did not set one,
-- and the existing rows without a link are filled in once below.

CREATE OR REPLACE FUNCTION public.notification_default_link(
  _recipient uuid, _type text, _post uuid, _vendor uuid
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _is_vendor boolean := EXISTS (SELECT 1 FROM public.vendors v WHERE v.user_id = _recipient);
  _is_admin  boolean := public.has_role(_recipient, 'admin');
  _home      text;
BEGIN
  _home := CASE WHEN _is_admin THEN '/admin'
                WHEN _is_vendor THEN '/supplier-dashboard?tab=notifications'
                ELSE '/user-dashboard?tab=notifications' END;
  RETURN CASE _type
    WHEN 'like'     THEN CASE WHEN _post IS NOT NULL THEN '/feed?post=' || _post::text ELSE '/feed' END
    WHEN 'comment'  THEN CASE WHEN _post IS NOT NULL THEN '/feed?post=' || _post::text ELSE '/feed' END
    WHEN 'new_post' THEN CASE WHEN _post IS NOT NULL THEN '/feed?post=' || _post::text ELSE '/feed' END
    WHEN 'follow'   THEN CASE WHEN _is_vendor THEN '/supplier-dashboard?tab=followers' ELSE _home END
    WHEN 'review'   THEN CASE WHEN _vendor IS NOT NULL AND NOT _is_vendor THEN '/shop/' || _vendor::text
                              WHEN _is_vendor THEN '/supplier-dashboard?tab=products' ELSE _home END
    WHEN 'inquiry'  THEN '/inquiries'
    WHEN 'quote'    THEN '/rfq'
    WHEN 'message'  THEN CASE WHEN _is_vendor THEN '/supplier-chat' ELSE '/user-dashboard?tab=messages' END
    WHEN 'order'    THEN CASE WHEN _is_vendor THEN '/supplier-dashboard?tab=orders' ELSE '/my-orders' END
    WHEN 'payment'  THEN CASE WHEN _is_vendor THEN '/supplier-dashboard?tab=orders' ELSE '/my-orders' END
    WHEN 'bnpl'     THEN '/my-orders'
    WHEN 'preorder' THEN CASE WHEN _is_vendor THEN '/supplier-dashboard?tab=products' ELSE '/my-orders' END
    WHEN 'dispute'  THEN CASE WHEN _is_vendor THEN '/supplier-dashboard?tab=disputes' ELSE '/my-orders' END
    ELSE _home
  END;
END $$;
REVOKE ALL ON FUNCTION public.notification_default_link(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notifications_fill_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.link IS NULL OR btrim(NEW.link) = '' THEN
    NEW.link := public.notification_default_link(NEW.recipient_id, NEW.type, NEW.post_id, NEW.vendor_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notifications_fill_link ON public.notifications;
CREATE TRIGGER trg_notifications_fill_link
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_fill_link();

-- Existing notifications that have no link.
UPDATE public.notifications
   SET link = public.notification_default_link(recipient_id, type, post_id, vendor_id)
 WHERE link IS NULL OR btrim(link) = '';

-- Vendor dispute/order notifications created before this carry a bare '/supplier-dashboard': point them at the section.
UPDATE public.notifications SET link = '/supplier-dashboard?tab=disputes' WHERE link = '/supplier-dashboard' AND type = 'dispute';
UPDATE public.notifications SET link = '/supplier-dashboard?tab=orders'   WHERE link = '/supplier-dashboard' AND type IN ('order','payment');
UPDATE public.notifications SET link = '/supplier-dashboard?tab=products' WHERE link = '/supplier-dashboard' AND type = 'preorder';
