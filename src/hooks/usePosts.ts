import { useCallback } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const PAGE_SIZE = 6;

export interface FeedPost {
  id: string;
  vendor_id: string;
  product_id: string | null;
  video_url: string | null;
  hls_url: string | null;
  thumbnail_url: string | null;
  media_type: 'video' | 'images';
  image_urls: string[];
  caption: string | null;
  hashtags: string[];
  views_count: number;
  likes_count: number;
  comments_count: number;
  created_at: string;
  vendors: {
    id: string;
    store_name: string;
    logo_url: string | null;
  } | null;
  products: {
    id: string;
    name: string;
    slug: string;
    price: number;
    image_url: string | null;
  } | null;
}

// Ranked, offset-paginated feed — order comes from get_ranked_feed (a hot
// score: engagement decayed by age), not raw recency, so active posts
// surface even if they weren't posted five minutes ago. We then hydrate
// each page with vendor/product info in a second query since the ranking
// RPC returns bare post rows.
export function usePostsFeed(hashtag?: string) {
  return useInfiniteQuery({
    queryKey: ['posts-feed', hashtag ?? null],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      if (hashtag) {
        const { data, error } = await supabase
          .from('posts')
          .select('*, vendors(id, store_name, logo_url), products(id, name, slug, price, image_url)')
          .eq('is_active', true)
          .contains('hashtags', [hashtag.toLowerCase()])
          .order('created_at', { ascending: false })
          .range(pageParam, pageParam + PAGE_SIZE - 1);
        if (error) throw error;
        return (data ?? []) as unknown as FeedPost[];
      }

      const { data: ranked, error: rankedError } = await supabase.rpc('get_ranked_feed', {
        page_limit: PAGE_SIZE,
        page_offset: pageParam,
      });
      if (rankedError) throw rankedError;
      if (!ranked?.length) return [];

      const ids = ranked.map((p) => p.id);
      const { data: hydrated, error: hydrateError } = await supabase
        .from('posts')
        .select('*, vendors(id, store_name, logo_url), products(id, name, slug, price, image_url)')
        .in('id', ids);
      if (hydrateError) throw hydrateError;

      // Preserve the rank order returned by get_ranked_feed
      const byId = new Map((hydrated ?? []).map((p) => [p.id, p]));
      return ids.map((id) => byId.get(id)).filter(Boolean) as unknown as FeedPost[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
  });
}

export function useVendorPosts(vendorId: string | undefined) {
  return useQuery({
    queryKey: ['vendor-posts', vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('vendor_id', vendorId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!vendorId,
  });
}

export function useUserLikedPosts(postIds: string[]) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['post-likes', user?.id, postIds],
    queryFn: async () => {
      if (!postIds.length) return new Set<string>();
      const { data, error } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', user!.id)
        .in('post_id', postIds);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.post_id));
    },
    enabled: !!user && postIds.length > 0,
  });
}

export function useToggleLike() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, isLiked }: { postId: string; isLiked: boolean }) => {
      if (!user) throw new Error('Sign in to like posts');
      if (isLiked) {
        const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-likes'] });
      queryClient.invalidateQueries({ queryKey: ['posts-feed'] });
    },
  });
}

export function useComments(postId: string | null) {
  return useQuery({
    queryKey: ['post-comments', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_comments')
        .select('*')
        .eq('post_id', postId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!postId,
  });
}

export function useAddComment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, content }: { postId: string; content: string }) => {
      if (!user) throw new Error('Sign in to comment');
      const { error } = await supabase.from('post_comments').insert({ post_id: postId, user_id: user.id, content });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['post-comments', variables.postId] });
      queryClient.invalidateQueries({ queryKey: ['posts-feed'] });
    },
  });
}

export function useIsFollowing(vendorId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['is-following', user?.id, vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('follows')
        .select('vendor_id')
        .eq('follower_id', user!.id)
        .eq('vendor_id', vendorId!)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!user && !!vendorId,
  });
}

export function useToggleFollow() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ vendorId, isFollowing }: { vendorId: string; isFollowing: boolean }) => {
      if (!user) throw new Error('Sign in to follow vendors');
      if (isFollowing) {
        const { error } = await supabase.from('follows').delete().eq('vendor_id', vendorId).eq('follower_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('follows').insert({ vendor_id: vendorId, follower_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['is-following', user?.id, variables.vendorId] });
    },
  });
}

export function useVendorFollowerCount(vendorId: string | undefined) {
  return useQuery({
    queryKey: ['vendor-follower-count', vendorId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendorId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!vendorId,
  });
}

export function useRecordView() {
  return useCallback((postId: string) => {
    // fire-and-forget, never blocks playback
    void supabase.rpc('increment_post_views', { post_id_input: postId });
  }, []);
}
