import { supabase } from '@/integrations/supabase/client';

export async function merchantCenterRequest<T = Record<string, unknown>>(
  action?: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) throw new Error('Sign in as an administrator to continue.');

  const response = await fetch('/api/merchant-center', {
    method: action ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(action ? { 'Content-Type': 'application/json' } : {}),
    },
    body: action ? JSON.stringify({ action, ...payload }) : undefined,
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || `Merchant Center request failed (${response.status}).`);
  return result;
}
