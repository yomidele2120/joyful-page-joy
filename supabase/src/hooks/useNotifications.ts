import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AppNotification {
  id: string;
  type: 'follow' | 'like' | 'comment' | 'new_post';
  message: string;
  post_id: string | null;
  vendor_id: string | null;
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
    enabled: !!user,
    // Polling keeps this simple and reliable without standing up realtime
    // channels; 30s is frequent enough for a notification bell.
    refetchInterval: 30_000,
  });
}

export function useUnreadNotificationCount() {
  const { data } = useNotifications();
  return data?.filter((n) => !n.is_read).length ?? 0;
}

export function useMarkNotificationsRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationIds: string[]) => {
      if (!user || !notificationIds.length) return;
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', notificationIds)
        .eq('recipient_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });
}
