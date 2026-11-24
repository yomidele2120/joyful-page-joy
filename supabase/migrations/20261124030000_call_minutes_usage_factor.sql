-- Call minutes are counted with a built-in allowance: every 800 minutes of real calling count as 1,000 minutes used.
-- The admin screens only ever show "bought", "used" and "left" minutes, never the allowance itself. It is stored here and
-- applied inside the used-minutes calculation, so the low-minutes alerts and the "calls pause when minutes run out" rule use
-- the same numbers the admin sees.
-- To change it later (1.25 = 800 -> 1,000): UPDATE public.platform_subscriptions SET usage_factor = 1.25 WHERE slug = 'zegocloud';
ALTER TABLE public.platform_subscriptions ADD COLUMN IF NOT EXISTS usage_factor numeric(5,3) NOT NULL DEFAULT 1 CHECK (usage_factor >= 1 AND usage_factor <= 5);
UPDATE public.platform_subscriptions SET usage_factor = 1.25 WHERE slug = 'zegocloud' AND kind = 'minutes' AND usage_factor = 1;

CREATE OR REPLACE FUNCTION public.zego_minutes_stats(_sub public.platform_subscriptions)
RETURNS TABLE (used_minutes bigint, calls_counted bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ceil(COALESCE(sum(ceil(c.duration_seconds / 60.0)), 0) * _sub.participants_counted * _sub.usage_factor)::bigint, count(*)
  FROM public.call_logs c
  WHERE c.duration_seconds > 0 AND c.answered_at >= _sub.counts_from;
$$;
REVOKE ALL ON FUNCTION public.zego_minutes_stats(public.platform_subscriptions) FROM PUBLIC, anon, authenticated;
