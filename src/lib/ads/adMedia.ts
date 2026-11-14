// Responsive delivery URLs for banner artwork. The stored image is text-free artwork; Cloudinary crops it for each
// screen with smart gravity so the subject stays in frame. The shop name, logo, headline and button are drawn by the UI.
import { parseCloudinaryUrl } from '../cloudinaryUrl';

export const BANNER_FORMATS = {
  desktop: { ratio: '16:5', width: 1600 },
  tablet: { ratio: '2:1', width: 1024 },
  mobile: { ratio: '4:3', width: 720 },
} as const;
export type BannerDevice = keyof typeof BANNER_FORMATS;

const TRANSFORM = /^[a-z]{1,4}_[^/,]+(,[a-z]{1,4}_[^/,]+)*$/i;

export function bannerUrl(url: string, device: BannerDevice, widthOverride?: number): string {
  if (!parseCloudinaryUrl(url)) return url;      // not a Cloudinary link: leave untouched
  const f = BANNER_FORMATS[device];
  const w = Math.round(widthOverride ?? f.width);
  const u = new URL(url);
  const at = u.pathname.indexOf('/upload/');
  const head = u.pathname.slice(0, at + 8);
  const segs = u.pathname.slice(at + 8).split('/');
  while (segs.length > 1 && TRANSFORM.test(segs[0])) segs.shift();
  return `${u.origin}${head}ar_${f.ratio},c_fill,g_auto,w_${w},f_auto,q_auto/${segs.join('/')}`;
}

export function bannerSources(url: string) {
  return {
    desktop: bannerUrl(url, 'desktop'), tablet: bannerUrl(url, 'tablet'), mobile: bannerUrl(url, 'mobile'),
    fallback: bannerUrl(url, 'tablet'),
    media: { desktop: '(min-width: 1024px)', tablet: '(min-width: 640px)' },
  };
}
export const bannerAspect = (device: BannerDevice) => { const [a, b] = BANNER_FORMATS[device].ratio.split(':').map(Number); return a / b; };
