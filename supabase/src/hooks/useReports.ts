import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useReportContent() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { postId?: string; commentId?: string; reason: string }) => {
      if (!user) throw new Error('Sign in to report content');
      const { error } = await supabase.from('reports').insert({
        reporter_id: user.id,
        post_id: input.postId ?? null,
        comment_id: input.commentId ?? null,
        reason: input.reason,
      });
      if (error) throw error;
    },
  });
}

export interface ReportRow {
  id: string;
  reporter_id: string;
  post_id: string | null;
  comment_id: string | null;
  reason: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  created_at: string;
}

// Admin-only: pulls pending reports plus the underlying post so moderators
// can preview what was flagged before acting on it.
export function usePendingReports() {
  return useQuery({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      const { data: reports, error } = await supabase
        .from('reports')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!reports?.length) return [];

      const postIds = [...new Set(reports.map((r) => r.post_id).filter(Boolean))] as string[];
      const { data: posts } = postIds.length
        ? await supabase.from('posts').select('id, caption, video_url, thumbnail_url, vendor_id, is_active').in('id', postIds)
        : { data: [] };

      const commentIds = [...new Set(reports.map((r) => r.comment_id).filter(Boolean))] as string[];
      const { data: comments } = commentIds.length
        ? await supabase.from('post_comments').select('id, content, post_id').in('id', commentIds)
        : { data: [] };

      const postsById = new Map((posts ?? []).map((p) => [p.id, p]));
      const commentsById = new Map((comments ?? []).map((c) => [c.id, c]));
      return (reports as ReportRow[]).map((r) => ({
        ...r,
        post: r.post_id ? postsById.get(r.post_id) : null,
        comment: r.comment_id ? commentsById.get(r.comment_id) : null,
      }));
    },
  });
}

export function useResolveReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportId, status }: { reportId: string; status: 'reviewed' | 'dismissed' }) => {
      const { error } = await supabase.from('reports').update({ status }).eq('id', reportId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-reports'] }),
  });
}

export function useDeactivatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, isActive }: { postId: string; isActive: boolean }) => {
      const { error } = await supabase.from('posts').update({ is_active: isActive }).eq('id', postId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
      queryClient.invalidateQueries({ queryKey: ['posts-feed'] });
    },
  });
}

// Admin removes a reported comment outright (RLS: "Admins can delete
// comments"). Also usable by a user deleting their own comment, since that
// policy already exists too.
export function useDeleteComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ commentId, postId }: { commentId: string; postId: string }) => {
      const { error } = await supabase.from('post_comments').delete().eq('id', commentId);
      if (error) throw error;
      return postId;
    },
    onSuccess: (postId) => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
      queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts-feed'] });
    },
  });
}
