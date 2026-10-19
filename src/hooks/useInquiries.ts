import { trackLead } from '@/lib/tracking';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMyVendor } from '@/hooks/useMyVendor';
import { getOrCreateConversation, sendMessage } from '@/hooks/useChat';

export type InquiryStatus = 'open' | 'replied' | 'closed';

export interface InquiryRow {
  id: string;
  buyer_id: string;
  vendor_id: string;
  product_id: string | null;
  quantity: number;
  message: string;
  status: InquiryStatus;
  created_at: string;
  products: { name: string; slug: string; image_url: string | null; unit: string | null } | null;
  vendors: { store_name: string; logo_url: string | null; user_id: string } | null;
  buyer_name?: string | null;
}

const SELECT = '*, products(name, slug, image_url, unit), vendors(store_name, logo_url, user_id)';

// Inquiries the signed-in buyer has sent.
export function useMyInquiries() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['inquiries', 'sent', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inquiries')
        .select(SELECT)
        .eq('buyer_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InquiryRow[];
    },
    enabled: !!user,
  });
}

// Inquiries other people have sent to the signed-in vendor's store.
export function useVendorInquiries() {
  const { data: vendor } = useMyVendor();
  return useQuery({
    queryKey: ['inquiries', 'received', vendor?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inquiries')
        .select(SELECT)
        .eq('vendor_id', vendor!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as InquiryRow[];

      const buyerIds = [...new Set(rows.map(r => r.buyer_id))];
      if (buyerIds.length) {
        const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', buyerIds);
        const names = new Map<string, string | null>((profiles ?? []).map(p => [p.user_id, p.full_name] as [string, string | null]));
        rows.forEach(r => { r.buyer_name = names.get(r.buyer_id) ?? null; });
      }
      return rows;
    },
    enabled: !!vendor,
  });
}

export function useUpdateInquiryStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: InquiryStatus }) => {
      const { error } = await supabase.from('inquiries').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inquiries'] }),
  });
}

export interface InquiryTarget {
  vendorId: string;
  vendorUserId: string;
  productId: string | null;
  productName: string | null;
  quantity: number;
}

/**
 * Sends one inquiry: records it (so the vendor sees it under Inquiries) AND
 * drops it into the in-app chat with the product attached, so the
 * conversation starts with full context.
 */
export async function submitInquiry(buyerId: string, target: InquiryTarget, message: string) {
  const text = message.trim();
  const { error } = await supabase.from('inquiries').insert({
    buyer_id: buyerId,
    vendor_id: target.vendorId,
    product_id: target.productId,
    quantity: target.quantity,
    message: text,
  });
  if (error) throw error;
  trackLead('inquiry', target.productId ?? undefined);

  const convo = await getOrCreateConversation(buyerId, target.vendorUserId);
  const intro = target.productName
    ? `Inquiry about ${target.productName} (qty ${target.quantity}): ${text}`
    : text;
  await sendMessage(convo.id, buyerId, target.vendorUserId, intro, undefined, undefined, target.productId);
  return convo.id;
}
