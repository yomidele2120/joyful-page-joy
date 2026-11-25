import { supabase } from '@/integrations/supabase/client';

/** Wakes the banner worker so a new banner starts at once. Never throws: the scheduled run is the safety net. */
export function kickBannerWorker(): void {
  try { void supabase.functions.invoke('ad-kick', { body: {} }).then(() => {}, () => {}); } catch { /* ignore */ }
}
