import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AppNotification {
  id: string;
  type: 'follow' | 'like' | 'comment' | 'new_post' | 'message' | 'inquiry' | 'quote';
  link: string | null;
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

// Where a notification should take the person. Newer notifications carry their own link; older ones (follow, like,
// comment, new post) only have ids, so the destination is worked out here. Generic dashboard links are narrowed to
// the section the notification is about. The database also fills a link on every new notification; this is the
// fallback for any row that still has none, so a click always lands somewhere.
export function notificationHref(n: AppNotification): string {
  const link = n.link && n.link.trim() ? n.link.trim() : null;
  const vendorTab = (tab: string) => `/supplier-dashboard?tab=${tab}`;
  const asType = n.type as string;

  if (link === '/supplier-dashboard') {
    if (asType === 'dispute') return vendorTab('disputes');
    if (asType === 'order' || asType === 'payment') return vendorTab('orders');
    if (asType === 'preorder') return vendorTab('products');
    return link;
  }
  if (link) return link;

  switch (asType) {
    case 'like':
    case 'comment':
    case 'new_post':
      return n.post_id ? `/feed?post=${n.post_id}` : '/feed';
    case 'follow':
      return vendorTab('followers');
    case 'review':
      return n.vendor_id ? `/shop/${n.vendor_id}` : '/user-dashboard?tab=notifications';
    case 'inquiry':
      return '/inquiries';
    case 'quote':
      return '/rfq';
    case 'message':
      return '/user-dashboard?tab=messages';
    case 'order':
    case 'payment':
    case 'bnpl':
    case 'preorder':
    case 'dispute':
      return '/my-orders';
    default:
      return '/user-dashboard?tab=notifications';
  }
}
