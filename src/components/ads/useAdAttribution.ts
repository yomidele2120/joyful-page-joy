import { useEffect } from 'react';
import { readAttribution, recallAttribution, rememberAttribution } from '@/lib/ads/adTracking';
import { adSessionStore, trackAd } from '@/lib/ads/adsApi';

/** Shop page: if the visitor came from an ad (?ad=<campaign>), remember it for this session and count one shop visit. */
export function useShopAdAttribution(search: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const id = readAttribution(search);
    if (!id) return;
    rememberAttribution(adSessionStore(), id);
    trackAd({ event: 'shop_visit', campaign: id, placement: 'shop_page' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, search]);
}

/** Product page: a visitor who arrived through an ad and opens one of that vendor's products counts a product visit. */
export function useProductAdAttribution(productId: string | undefined) {
  useEffect(() => {
    if (!productId) return;
    const id = recallAttribution(adSessionStore());
    if (id) trackAd({ event: 'product_visit', campaign: id, placement: 'product_page', product: productId });
  }, [productId]);
}
