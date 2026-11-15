-- 1) Gold and Diamond get their own, higher values (they started as copies of Premium).
UPDATE public.call_plan_quotas SET daily_minutes = 90,  monthly_minutes = 2000, max_concurrent_calls = 2 WHERE plan_slug = 'gold';
UPDATE public.call_plan_quotas SET daily_minutes = 120, monthly_minutes = 4000, max_concurrent_calls = 2 WHERE plan_slug = 'diamond';
UPDATE public.call_queue_capacity SET max_waiting = 15 WHERE plan_slug = 'gold';
UPDATE public.call_queue_capacity SET max_waiting = 20 WHERE plan_slug = 'diamond';
UPDATE public.advertising_plan_features SET max_advertised_products = 100, banner_generations_allowed = 10, priority_weight = 5 WHERE plan_slug = 'gold';
UPDATE public.advertising_plan_features SET max_advertised_products = 200, banner_generations_allowed = 20, priority_weight = 8 WHERE plan_slug = 'diamond';

-- 2) One public read of everything a plan includes, so the plan screens list real numbers instead of hand-typed text.
CREATE OR REPLACE FUNCTION public.plan_catalog() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'slug', p.slug, 'name', p.name, 'price_kobo', p.price_kobo, 'period_days', p.period_days,
    'purchase_enabled', p.purchase_enabled, 'sort_order', p.sort_order,
    'product_limit', p.product_limit, 'pinned_limit', p.pinned_limit, 'renew_hours', p.renew_hours,
    'call_daily_minutes', q.daily_minutes, 'call_monthly_minutes', q.monthly_minutes, 'call_max_concurrent', q.max_concurrent_calls,
    'call_queue_waiting', c.max_waiting,
    'homepage_promotion', f.homepage_promotion_enabled, 'max_advertised_products', f.max_advertised_products,
    'external_ads', f.external_ads_enabled, 'sponsored_placement', f.sponsored_placement_enabled,
    'featured_banner', f.featured_banner_enabled, 'campaign_days', f.campaign_duration_days,
    'social_banner', f.social_banner_enabled, 'social_profiles', f.max_social_profiles,
    'banner_generations', f.banner_generations_allowed
  ) ORDER BY p.sort_order), '[]'::jsonb)
  FROM public.supplier_membership_plans p
  LEFT JOIN public.call_plan_quotas q ON q.plan_slug = p.slug
  LEFT JOIN public.call_queue_capacity c ON c.plan_slug = p.slug
  LEFT JOIN public.advertising_plan_features f ON f.plan_slug = p.slug
  WHERE p.is_active;
$$;
REVOKE ALL ON FUNCTION public.plan_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plan_catalog() TO anon, authenticated;
