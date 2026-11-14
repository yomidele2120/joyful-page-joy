// Asks the ad-process-jobs worker to run now. Called (fire-and-forget) right after a membership payment has been
// verified and finalised, so a new banner starts generating immediately. It is only a speed-up: if it is missed
// for any reason, the scheduled run of the worker (see ADVERTISING_BUILD_STATUS.md) picks the queued job up.
// Failure here must never affect the payment response.

export function kickAdWorker(): void {
  try {
    const base = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!base || !key) return;
    const request = fetch(`${base}/functions/v1/ad-process-jobs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ max: 2 }),
      signal: AbortSignal.timeout(140_000),
    }).then((r) => r.body?.cancel()).catch(() => { /* the scheduled run is the safety net */ });
    // Keep the runtime alive after the HTTP response has been sent, where the platform supports it.
    (globalThis as any).EdgeRuntime?.waitUntil?.(request);
  } catch { /* never throw into the payment flow */ }
}
