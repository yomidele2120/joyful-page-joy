import { useCallback } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const PAGE_SIZE = 6;

export interface FeedPost {
  id: string;
  vendor_id: string;
  product_id: string | null;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
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

// Cursor-paginated feed — only fetches PAGE_SIZE posts at a time so the
// client never has to hold the whole table in memory.
export function usePostsFeed() {
  return useInfiniteQuery({
    queryKey: ['posts-feed'],
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      let query = supabase
        .from('posts')
        .select('*, vendors(id, store_name, logo_url), products(id, name, slug, price, image_url)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (pageParam) {
        query = query.lt('created_at', pageParam);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as FeedPost[];
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.length === PAGE_SIZE ? lastPage[lastPage.length - 1].created_at : undefined,
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

export function useRecordView() {
  return useCallback((postId: string) => {
    // fire-and-forget, never blocks playback
    void supabase.rpc('increment_post_views', { post_id_input: postId });
  }, []);
}
