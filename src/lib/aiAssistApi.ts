import { supabase } from '@/integrations/supabase/client';

export interface ListingSuggestion { title: string; description: string; tags: string[]; keywords: string[]; suggestedCategory: string | null; attributes: Record<string, string>; missing: string[] }
export interface ListingResult { suggestion: ListingSuggestion; dropped: string[]; duplicates: Array<{ id: string; name: string; score: number }>; note: string }
export interface SearchFilters { query: string; category: string | null; minPrice: number | null; maxPrice: number | null; sort: 'relevance' | 'price_asc' | 'price_desc' | 'newest' }

async function invoke<T>(body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai-product-assist', { body });
  if (error) {
    let msg = 'The assistant could not answer right now.';
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = String(j.error); } catch { /* keep default */ }
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error(String((data as any).error));
  return data as T;
}
export const suggestListing = (product: { name: string; description?: string; categoryName?: string }, productId?: string) =>
  invoke<ListingResult>({ action: 'listing', product, productId });
/** Turns a sentence into search filters. Not yet wired into the Products page. */
export const parseSearchText = (text: string) => invoke<{ filters: SearchFilters }>({ action: 'search', text }).then((r) => r.filters);
