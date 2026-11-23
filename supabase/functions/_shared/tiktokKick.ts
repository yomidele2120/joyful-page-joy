// Asks tiktok-events-send to run now, right after a payment has been confirmed. Fire-and-forget:
// if it is missed, the next payment or the scheduled run picks the queued event up. It never affects the payment response.
export function kickTikTokEvents(): void {
  try {
    const base = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!base || !key || !Deno.env.get("TIKTOK_EVENTS_ACCESS_TOKEN")) return;
    const request = fetch(`${base}/functions/v1/tiktok-events-send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(30_000),
    }).then((r) => r.body?.cancel()).catch(() => { /* retried later */ });
    (globalThis as any).EdgeRuntime?.waitUntil?.(request);
  } catch { /* never throw into the payment flow */ }
}
