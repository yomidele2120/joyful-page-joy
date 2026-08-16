-- ============================================================
-- Feed v2: ranking, hashtags/discovery, notifications, moderation
-- ============================================================

-- 1. HASHTAGS — parsed from caption at insert/update time
ALTER TABLE public.posts ADD COLUMN hashtags TEXT[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.extract_hashtags()
RETURNS TRIGGER AS $$
BEGIN
  NEW.hashtags := COALESCE(
    (SELECT array_agg(DISTINCT lower(tag)) FROM regexp_matches(COALESCE(NEW.caption, ''), '#([[:alnum:]_]+)', 'g') AS m(tag)),
    '{}'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_extract_hashtags
BEFORE INSERT OR UPDATE OF caption ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.extract_hashtags();

CREATE INDEX idx_posts_hashtags ON public.posts USING GIN (hashtags);

-- 2. RANKING — a simple "hot score" (engagement, decayed by age) so the
--    feed isn't purely reverse-chronological. Offset-paginated: good enough
--    up to tens of thousands of posts without needing a dedicated ranking
--    service.
CREATE OR REPLACE FUNCTION public.get_ranked_feed(page_limit INT, page_offset INT)
RETURNS SETOF public.posts AS $$
  SELECT *
  FROM public.posts
  WHERE is_active = true
  ORDER BY
    (likes_count * 2 + comments_count * 3 + views_count * 0.1)
      / POWER(EXTRACT(EPOCH FROM (now() - created_at)) / 3600 + 2, 1.5) DESC,
    created_at DESC
  LIMIT page_limit OFFSET page_offset;
$$ LANGUAGE sql STABLE;

-- 3. NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL,
  actor_id UUID,
  type TEXT NOT NULL CHECK (type IN ('follow', 'like', 'comment', 'new_post')),
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient ON public.notifications (recipient_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = recipient_id);
CREATE POLICY "Users can mark own notifications read" ON public.notifications
  FOR UPDATE USING (auth.uid() = recipient_id);

-- Notify vendor on new follower
CREATE OR REPLACE FUNCTION public.notify_new_follow()
RETURNS TRIGGER AS $$
DECLARE
  vendor_user_id UUID;
BEGIN
  SELECT user_id INTO vendor_user_id FROM public.vendors WHERE id = NEW.vendor_id;
  IF vendor_user_id IS NOT NULL AND vendor_user_id != NEW.follower_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, vendor_id, message)
    VALUES (vendor_user_id, NEW.follower_id, 'follow', NEW.vendor_id, 'Someone started following your shop');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_notify_follow
AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.notify_new_follow();

-- Notify vendor on new like
CREATE OR REPLACE FUNCTION public.notify_new_like()
RETURNS TRIGGER AS $$
DECLARE
  vendor_user_id UUID;
BEGIN
  SELECT v.user_id INTO vendor_user_id FROM public.posts p JOIN public.vendors v ON v.id = p.vendor_id WHERE p.id = NEW.post_id;
  IF vendor_user_id IS NOT NULL AND vendor_user_id != NEW.user_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, post_id, message)
    VALUES (vendor_user_id, NEW.user_id, 'like', NEW.post_id, 'Someone liked your video');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_notify_like
AFTER INSERT ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.notify_new_like();

-- Notify vendor on new comment
CREATE OR REPLACE FUNCTION public.notify_new_comment()
RETURNS TRIGGER AS $$
DECLARE
  vendor_user_id UUID;
BEGIN
  SELECT v.user_id INTO vendor_user_id FROM public.posts p JOIN public.vendors v ON v.id = p.vendor_id WHERE p.id = NEW.post_id;
  IF vendor_user_id IS NOT NULL AND vendor_user_id != NEW.user_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, post_id, message)
    VALUES (vendor_user_id, NEW.user_id, 'comment', NEW.post_id, 'Someone commented on your video');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_notify_comment
AFTER INSERT ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_new_comment();

-- Notify followers when a vendor they follow posts a new video
CREATE OR REPLACE FUNCTION public.notify_followers_new_post()
RETURNS TRIGGER AS $$
DECLARE
  store TEXT;
BEGIN
  SELECT store_name INTO store FROM public.vendors WHERE id = NEW.vendor_id;
  INSERT INTO public.notifications (recipient_id, actor_id, type, post_id, vendor_id, message)
  SELECT f.follower_id, NULL, 'new_post', NEW.id, NEW.vendor_id, COALESCE(store, 'A shop you follow') || ' just posted a new video'
  FROM public.follows f
  WHERE f.vendor_id = NEW.vendor_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_notify_followers_new_post
AFTER INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.notify_followers_new_post();

-- 4. REPORTS / MODERATION
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.post_comments(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (post_id IS NOT NULL OR comment_id IS NOT NULL)
);

CREATE INDEX idx_reports_status ON public.reports (status, created_at DESC);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can file reports" ON public.reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Admins can view all reports" ON public.reports
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update reports" ON public.reports
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Admins need to moderate (deactivate) any post, and remove any comment
CREATE POLICY "Admins can view all posts" ON public.posts
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can moderate posts" ON public.posts
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete comments" ON public.post_comments
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
