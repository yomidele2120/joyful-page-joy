// Where an admin-uploaded flyer can appear, and what image size suits each spot.
// The database stores the `value`; the admin form shows everything else.

export type FlyerPlacement = 'header_strip' | 'hero_slide' | 'hero_side' | 'row_banner' | 'feed_banner' | 'feed_card';

export interface PlacementInfo {
  value: FlyerPlacement;
  label: string;
  where: string;
  desktop: string;   // recommended size, width x height
  mobile: string;    // recommended phone size (optional upload)
  limit?: string;    // how many the site shows
}

export const PLACEMENTS: PlacementInfo[] = [
  {
    value: 'hero_slide', label: 'Hero slider',
    where: 'Big sliding banner at the top of the homepage',
    desktop: '1200 x 600 px', mobile: '800 x 400 px', limit: 'All of them slide in turn. Use a 2:1 shape (twice as wide as tall) so it fills the slide; other shapes are shown whole on soft blurred bars, never cropped',
  },
  {
    value: 'hero_side', label: 'Hero side tile',
    where: 'Small tiles beside the hero slider (under it on phones)',
    desktop: '600 x 400 px', mobile: '600 x 400 px', limit: 'The first 2 are shown',
  },
  {
    value: 'header_strip', label: 'Header strip',
    where: 'Thin banner across the very top of every page',
    desktop: '1600 x 80 px', mobile: '800 x 80 px', limit: 'Several rotate every 6 seconds',
  },
  {
    value: 'row_banner', label: 'Between product rows',
    where: 'Wide banners between the homepage product rows',
    desktop: '1600 x 400 px', mobile: '800 x 400 px', limit: 'The first 3 are shown, one per gap',
  },
  {
    value: 'feed_banner', label: 'Inside product list (wide)',
    where: 'Full-width banner inside the homepage feed and the Products page',
    desktop: '1600 x 400 px', mobile: '800 x 400 px', limit: 'Used in turn as people scroll',
  },
  {
    value: 'feed_card', label: 'Inside product list (card)',
    where: 'Card-sized flyer sitting among the product cards',
    desktop: '600 x 900 px', mobile: 'Not needed', limit: 'Used in turn as people scroll',
  },
];

/** Shape of the homepage hero slider (width : height). Flyers drawn at this shape fill it exactly. */
export const HERO_SLIDE_RATIO = 2;

export const placementInfo = (value: string) => PLACEMENTS.find(p => p.value === value);
