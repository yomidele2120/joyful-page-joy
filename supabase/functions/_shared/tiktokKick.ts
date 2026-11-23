// Asks tiktok-events-send to run now, right after a payment has been confirmed. Fire-and-forget:
// if it is missed, the next payment or the scheduled run picks the queued event up. It never affects the payment response.
export function kickTikTokEvents(): void {
  kickOne("tiktok-events-send", "TIKTOK_EVENTS_ACCESS_TOKEN");
  kickOne("meta-events-send", "META_CONVERSIONS_ACCESS_TOKEN");   // same moment: a payment was just confirmed
}

function kickOne(fn: string, tokenSecret: string): void {
  try {
    const base = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!base || !key || !Deno.env.get(tokenSecret)) return;
    const request = fetch(`${base}/functions/v1/${fn}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(30_000),
    }).then((r) => r.body?.cancel()).catch(() => { /* retried later */ });
    (globalThis as any).EdgeRuntime?.waitUntil?.(request);
  } catch { /* never throw into the payment flow */ }
}
