// supabase.functions.invoke() reports any 4xx/5xx as the generic
// "Edge Function returned a non-2xx status code". The real reason is in the
// response body, so pull it out to show (and debug) the actual error.
export async function functionErrorMessage(error: unknown, data?: any): Promise<string> {
  if (data?.error) return String(data.error);
  const e = error as any;
  try {
    const res: Response | undefined = e?.context;
    if (res && typeof res.text === 'function') {
      const raw = await res.text();
      try {
        const body = JSON.parse(raw);
        const msg = body?.error ?? body?.message ?? body?.msg;
        if (msg) return `${msg} (${res.status})`;
      } catch { /* not JSON */ }
      if (raw) return `${raw.slice(0, 200)} (${res.status})`;
      return `Edge function failed with status ${res.status}`;
    }
  } catch { /* fall through */ }
  return e?.message ?? 'Edge function call failed';
}
