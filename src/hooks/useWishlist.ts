import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// The shopper's saved products. One small query is shared by every product card on the page, so a page of 50 cards
// still makes a single request. Saving needs a signed-in account; guests are sent to sign in.
const KEY = 'wishlist-ids';

export function useWishlist() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const { data: ids } = useQuery({
    queryKey: [KEY, userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('wishlist').select('product_id').eq('user_id', userId!);
      if (error) throw error;
      return new Set((data ?? []).map(r => r.product_id as string));
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ productId, save }: { productId: string; save: boolean }) => {
      if (save) {
        const { error } = await supabase.from('wishlist').insert({ user_id: userId!, product_id: productId });
        if (error && error.code !== '23505') throw error; // 23505 = already saved, which is fine
      } else {
        const { error } = await supabase.from('wishlist').delete().eq('user_id', userId!).eq('product_id', productId);
        if (error) throw error;
      }
    },
    // Update the heart straight away; put it back if saving failed.
    onMutate: async ({ productId, save }) => {
      await queryClient.cancelQueries({ queryKey: [KEY, userId] });
      const previous = queryClient.getQueryData<Set<string>>([KEY, userId]);
      const next = new Set(previous ?? []);
      if (save) next.add(productId); else next.delete(productId);
      queryClient.setQueryData([KEY, userId], next);
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData([KEY, userId], ctx?.previous);
      toast.error('Could not update your wishlist. Please try again.');
    },
    onSuccess: (_d, { save }) => {
      toast.success(save ? 'Saved to your wishlist' : 'Removed from your wishlist');
      queryClient.invalidateQueries({ queryKey: ['user-wishlist'] });
    },
  });

  const isSaved = useCallback((productId: string) => !!ids?.has(productId), [ids]);
  const toggleSaved = useCallback((productId: string) => {
    if (!userId) {
      toast.info('Sign in to save products to your wishlist');
      navigate('/users-login');
      return;
    }
    toggle.mutate({ productId, save: !ids?.has(productId) });
  }, [userId, ids, toggle, navigate]);

  return { isSaved, toggleSaved };
}
