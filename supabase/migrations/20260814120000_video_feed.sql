-- ============================================================
-- TikTok-style video feed layer
-- Adds: posts, post_likes, post_comments, follows
-- Reuses existing: vendors, products, auth.users
-- ============================================================

-- 1. POSTS (short vendor videos, optionally linked to a product)
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  views_count INT NOT NULL DEFAULT 0,
  likes_count INT NOT NULL DEFAULT 0,
  comments_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_feed ON public.posts (is_active, created_at DESC);
CREATE INDEX idx_posts_vendor ON public.posts (vendor_id, created_at DESC);
CREATE INDEX idx_posts_product ON public.posts (product_id);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active posts" ON public.posts
  FOR SELECT USING (is_active = true);

CREATE POLICY "Vendors can view own posts" ON public.posts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );

CREATE POLICY "Vendors can insert own posts" ON public.posts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );

CREATE POLICY "Vendors can update own posts" ON public.posts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );

CREATE POLICY "Vendors can delete own posts" ON public.posts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );

-- 2. POST LIKES
CREATE TABLE public.post_likes (
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX idx_post_likes_user ON public.post_likes (user_id);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view likes" ON public.post_likes FOR SELECT USING (true);
CREATE POLICY "Users can like posts" ON public.post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike own likes" ON public.post_likes FOR DELETE USING (auth.uid() = user_id);

-- 3. POST COMMENTS
CREATE TABLE public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_comments_post ON public.post_comments (post_id, created_at DESC);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view comments" ON public.post_comments FOR SELECT USING (true);
CREATE POLICY "Users can add comments" ON public.post_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.post_comments FOR DELETE USING (auth.uid() = user_id);

-- 4. FOLLOWS (buyer -> vendor)
CREATE TABLE public.follows (
  follower_id UUID NOT NULL,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, vendor_id)
);

CREATE INDEX idx_follows_vendor ON public.follows (vendor_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view follows" ON public.follows FOR SELECT USING (true);
CREATE POLICY "Users can follow" ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow" ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- 5. Counter triggers (keep likes_count / comments_count denormalized so the
--    feed never has to run a COUNT() join while scrolling)
CREATE OR REPLACE FUNCTION public.handle_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_post_like_count
AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.handle_post_like_count();

CREATE OR REPLACE FUNCTION public.handle_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_post_comment_count
AFTER INSERT OR DELETE ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.handle_post_comment_count();

-- Simple atomic view-count bump, callable from the client via RPC
CREATE OR REPLACE FUNCTION public.increment_post_views(post_id_input UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.posts SET views_count = views_count + 1 WHERE id = post_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Storage bucket for post videos + thumbnails
INSERT INTO storage.buckets (id, name, public) VALUES ('post-videos', 'post-videos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view post videos" ON storage.objects
  FOR SELECT USING (bucket_id = 'post-videos');

CREATE POLICY "Authenticated users can upload post videos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'post-videos');

CREATE POLICY "Owners can delete their post videos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'post-videos' AND owner = auth.uid());
