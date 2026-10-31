import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { videoUploadQueue } from '@/lib/videoUploadQueue';

// Mounted once for the whole site (renders nothing). When a seller opens the site it brings back any video that
// was still on its way (closed browser, restart, dead battery) and carries on, on whatever page they are on.
// Buyers never start the queue.
export default function VideoUploadResumer() {
  const { user, isVendor, loading } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (loading) return;
    if (!user || !isVendor) { videoUploadQueue.stop(); return; }
    void videoUploadQueue.start(user.id, {
      onPostsChanged: () => {
        queryClient.invalidateQueries({ queryKey: ['vendor-posts'] });
        queryClient.invalidateQueries({ queryKey: ['posts-feed'] });
      },
      onPublished: () => toast.success('Your video is live on the feed'),
    });
  }, [user, isVendor, loading, queryClient]);

  return null;
}
