import { supabase } from '@/integrations/supabase/client';

export interface RemoveResult { deleted: number; hidden: number }

/** Most products one request may remove (the database function enforces the same number). */
export const REMOVE_BATCH_MAX = 200;

/**
 * Removes products the signed-in supplier owns (an admin: any). Products nobody ever ordered are deleted; ones that
 * were ordered are hidden instead, because they are part of the buyers' order history. Throws on a real error.
 */
export async function removeProducts(ids: string[]): Promise<RemoveResult> {
  const { data, error } = await (supabase as any).rpc('remove_my_products', { _ids: ids });
  if (error) throw error;
  const r = (data ?? {}) as Partial<RemoveResult>;
  return { deleted: Number(r.deleted ?? 0), hidden: Number(r.hidden ?? 0) };
}

/** One honest sentence for the toast, covering every outcome. */
export function removeSummary({ deleted, hidden }: RemoveResult): string {
  const p = (n: number) => (n === 1 ? '1 product' : `${n} products`);
  if (!deleted && !hidden) return 'Nothing was removed.';
  if (deleted && !hidden) return `${p(deleted)} deleted.`;
  if (!deleted) return `${p(hidden)} hidden, not deleted, because buyers have ordered ${hidden === 1 ? 'it' : 'them'}. You can show ${hidden === 1 ? 'it' : 'them'} again any time.`;
  return `${p(deleted)} deleted. ${p(hidden)} hidden instead, because buyers have ordered ${hidden === 1 ? 'it' : 'them'}.`;
}
