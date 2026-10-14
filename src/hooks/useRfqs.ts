import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMyVendor } from '@/hooks/useMyVendor';

export interface RfqRow {
  id: string;
  buyer_id: string;
  title: string;
  description: string;
  category_id: string | null;
  quantity: number;
  unit: string;
  target_price: number | null;
  destination: string | null;
  status: 'open' | 'closed';
  created_at: string;
  expires_at: string;
  categories: { name: string } | null;
  rfq_quotes?: { id: string }[];
}

export interface QuoteRow {
  id: string;
  rfq_id: string;
  vendor_id: string;
  unit_price: number;
  moq: number | null;
  lead_time: string | null;
  message: string | null;
  created_at: string;
  vendors: { store_name: string; logo_url: string | null; user_id: string; is_approved: boolean | null } | null;
}

// RFQs the signed-in buyer posted, with a quote count for each.
export function useMyRfqs() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['rfqs', 'mine', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rfqs')
        .select('*, categories(name), rfq_quotes(id)')
        .eq('buyer_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RfqRow[];
    },
    enabled: !!user,
  });
}

// Open requests that an approved vendor can answer.
export function useOpenRfqs() {
  const { data: vendor } = useMyVendor();
  return useQuery({
    queryKey: ['rfqs', 'open', vendor?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rfqs')
        .select('*, categories(name)')
        .eq('status', 'open')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RfqRow[];
    },
    enabled: !!vendor,
  });
}

export function useRfqQuotes(rfqId: string | null) {
  return useQuery({
    queryKey: ['rfq-quotes', rfqId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rfq_quotes')
        .select('*, vendors(store_name, logo_url, user_id, is_approved)')
        .eq('rfq_id', rfqId!)
        .order('unit_price', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as QuoteRow[];
    },
    enabled: !!rfqId,
  });
}

// Quotes the signed-in vendor has already sent (rfq_id -> quote).
export function useMyQuotes() {
  const { data: vendor } = useMyVendor();
  return useQuery({
    queryKey: ['rfq-quotes', 'mine', vendor?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('rfq_quotes').select('*').eq('vendor_id', vendor!.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!vendor,
  });
}

export interface NewRfq {
  title: string;
  description: string;
  category_id: string | null;
  quantity: number;
  unit: string;
  target_price: number | null;
  destination: string | null;
}

export function useCreateRfq() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rfq: NewRfq) => {
      const { error } = await supabase.from('rfqs').insert({ ...rfq, buyer_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rfqs'] }),
  });
}

export function useCloseRfq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rfqs').update({ status: 'closed' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rfqs'] }),
  });
}

export function useSubmitQuote() {
  const { data: vendor } = useMyVendor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (quote: { rfq_id: string; unit_price: number; moq: number | null; lead_time: string | null; message: string | null }) => {
      if (!vendor) throw new Error('Only suppliers can send quotes');
      const { error } = await supabase.from('rfq_quotes').insert({ ...quote, vendor_id: vendor.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rfq-quotes'] }),
  });
}
