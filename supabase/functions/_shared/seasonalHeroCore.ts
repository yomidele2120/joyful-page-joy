// Monthly seasonal hero banners. Pure functions only (no network, no database), so they are unit-tested.
//
// Words are NEVER written by the AI. Every headline, line and button label below is written by hand, passes the same
// copy-safety rules as vendor ads (no numbers, prices, links or claim words such as free, sale, discount, guaranteed),
// and is drawn by the website over text-free artwork. The AI only paints the picture.
import { STYLES, MOODS, ANGLES, copyIsSafe, type Variant } from './adBannerCore.ts';

export interface HeroCopy { h: string; s: string; c: string }
export interface MonthTheme {
  month: number;                 // 1-12
  name: string;
  slides: [HeroCopy, HeroCopy, HeroCopy];
  tile: HeroCopy;                // first side tile (the second is always the "sell with us" tile)
  scenes: [string, string, string, string, string];   // one picture idea per banner (3 slides + 2 tiles)
  palettes: [string, string, string, string, string];
}

export const SELL_TILE: HeroCopy = { h: 'Open your shop this season', s: 'Reach buyers on ITHUBAFRICA.', c: 'Start selling' };

export const MONTHS: MonthTheme[] = [
  { month: 1, name: 'January',
    slides: [
      { h: 'A fresh start for your workspace', s: 'Laptops, printers and office essentials from verified suppliers.', c: 'Shop office tech' },
      { h: 'New year, new devices', s: 'Phones, tablets and accessories for the year ahead.', c: 'Browse devices' },
      { h: 'Set up for a strong year', s: 'Equipment for shops, offices and home desks.', c: 'See what is new' }],
    tile: { h: 'Start the year well equipped', s: 'Find what your work needs.', c: 'Browse products' },
    scenes: ['a tidy modern desk at sunrise with abstract laptop and monitor shapes and soft golden light',
      'a calm minimalist workspace with glowing abstract devices and a gentle morning haze',
      'a city skyline at dawn with soft light trails and abstract technology shapes',
      'clean geometric shapes rising like a new beginning over a soft gradient horizon',
      'an organised abstract office shelf with warm morning light and plants'],
    palettes: ['warm gold, deep navy and soft white', 'sunrise orange, teal and cream', 'pale blue, white and champagne', 'emerald, gold and ivory', 'sage green, oak and soft white'] },
  { month: 2, name: 'February',
    slides: [
      { h: 'Gifts for the people you love', s: 'Phones, gadgets and accessories to give and to keep.', c: 'Find a gift' },
      { h: 'Thoughtful tech gifts', s: 'Pick something useful from trusted suppliers.', c: 'Browse gifts' },
      { h: 'Say it with a great gift', s: 'Ideas for partners, family and friends.', c: 'See gift ideas' }],
    tile: { h: 'Gift ideas for everyone', s: 'Browse by what they would use.', c: 'Browse gifts' },
    scenes: ['abstract wrapped gift boxes with satin ribbons and soft heart-shaped bokeh lights, no text',
      'warm romantic bokeh lights with soft abstract gadget silhouettes',
      'a rose-toned minimal still life with glass surfaces and gentle highlights',
      'floating soft petals and ribbons over a blush gradient',
      'candlelit warm glow with abstract gift shapes'],
    palettes: ['deep rose, blush pink and gold', 'burgundy, warm cream and rose gold', 'soft pink, white and champagne', 'crimson, blush and ivory', 'plum, rose and gold'] },
  { month: 3, name: 'March',
    slides: [
      { h: 'Mother\'s Day gift ideas', s: 'Thoughtful picks from suppliers across Nigeria.', c: 'Find a gift' },
      { h: 'Treat her to something useful', s: 'Appliances, gadgets and home essentials.', c: 'Browse home' },
      { h: 'A gift she will use every day', s: 'Browse gifts for mums and mother figures.', c: 'See gift ideas' }],
    tile: { h: 'Gifts for mum', s: 'From kitchen to tech.', c: 'Browse gifts' },
    scenes: ['a soft floral arrangement beside abstract gift boxes in warm daylight, no text',
      'a bright welcoming kitchen and home setting with warm natural light and abstract appliances',
      'delicate flowers and ribbons over a pastel gradient',
      'a cosy living room corner with soft light and plants',
      'abstract petals drifting over a warm peach background'],
    palettes: ['soft coral, cream and sage', 'warm peach, white and light wood', 'lavender, blush and ivory', 'sage green, cream and gold', 'apricot, rose and white'] },
  { month: 4, name: 'April',
    slides: [
      { h: 'Fresh picks for the Easter season', s: 'Home, tech and family essentials from verified suppliers.', c: 'Start shopping' },
      { h: 'Get the house ready', s: 'Appliances and home essentials for the holiday.', c: 'Browse home' },
      { h: 'Time to treat the family', s: 'Gadgets and gifts the whole family will enjoy.', c: 'See gift ideas' }],
    tile: { h: 'Holiday essentials', s: 'Everything for a good break.', c: 'Browse products' },
    scenes: ['pastel spring colours with soft light, fresh leaves and abstract gift shapes, no text',
      'a bright airy home interior with spring flowers and gentle sunlight',
      'a family table scene suggested by abstract plates and warm light, no people',
      'soft green hills and light with abstract floating shapes',
      'fresh pastel ribbons and flowers over a clean gradient'],
    palettes: ['pastel mint, lemon and white', 'sky blue, cream and soft green', 'warm yellow, peach and ivory', 'fresh green, white and gold', 'lilac, pale yellow and white'] },
  { month: 5, name: 'May',
    slides: [
      { h: 'Power up your business', s: 'Equipment and supplies for growing shops and offices.', c: 'Shop business tech' },
      { h: 'Tools for people who work hard', s: 'Printers, computers and everyday work essentials.', c: 'Browse equipment' },
      { h: 'Buy in bulk from verified suppliers', s: 'Quantity prices set by each supplier.', c: 'Browse suppliers' }],
    tile: { h: 'Built for working Nigeria', s: 'Gear to keep your business moving.', c: 'Browse equipment' },
    scenes: ['a modern busy shop and office scene suggested by abstract devices, shelves and warm light, no people',
      'sleek abstract printers, laptops and monitors on a clean desk with confident lighting',
      'rows of neatly stacked abstract boxes in a bright warehouse with soft depth',
      'a strong geometric composition of rising bars and glowing nodes over a blue gradient',
      'an abstract workshop with tidy tools and warm light'],
    palettes: ['navy, electric blue and silver', 'charcoal, amber and white', 'deep green, gold and cream', 'indigo, cyan and white', 'slate, orange and light grey'] },
  { month: 6, name: 'June',
    slides: [
      { h: 'Father\'s Day, sorted', s: 'Gadgets, tools and accessories he will actually use.', c: 'Find a gift' },
      { h: 'Gifts for dad', s: 'Browse phones, speakers and workshop picks.', c: 'Browse gifts' },
      { h: 'Something useful for dad', s: 'Thoughtful ideas from trusted suppliers.', c: 'See gift ideas' }],
    tile: { h: 'Gifts for dad', s: 'From tech to tools.', c: 'Browse gifts' },
    scenes: ['abstract gift boxes beside sleek gadget silhouettes on a dark wood surface with warm light, no text',
      'an abstract tool bench with clean shapes and golden lamplight',
      'a confident navy and gold composition with soft reflections and abstract headphones and speaker shapes',
      'a calm study corner with leather textures and warm light, no people',
      'bold geometric shapes in deep blue over a warm gradient'],
    palettes: ['navy, gold and cream', 'dark wood brown, amber and white', 'deep green, brass and ivory', 'charcoal, copper and soft white', 'royal blue, silver and sand'] },
  { month: 7, name: 'July',
    slides: [
      { h: 'Ready for the rainy season', s: 'Power backups, devices and home essentials.', c: 'Shop essentials' },
      { h: 'Stay connected, rain or shine', s: 'Phones, routers and accessories you can rely on.', c: 'Browse devices' },
      { h: 'Cosy up at home', s: 'Appliances and entertainment for rainy days.', c: 'Browse home' }],
    tile: { h: 'Rainy season essentials', s: 'Keep your home and work running.', c: 'Browse products' },
    scenes: ['rain on a window with a warm glowing interior and abstract device shapes, no people',
      'soft rain over a city at dusk with gentle light reflections and abstract connectivity lines',
      'a cosy living room with warm lamps and rain outside the window',
      'abstract raindrops and glowing power symbols suggested by light shapes only, no text',
      'a calm green garden after rain with soft light'],
    palettes: ['deep teal, warm amber and grey', 'storm blue, cyan and silver', 'warm orange lamplight, navy and cream', 'forest green, aqua and white', 'slate, gold and mist white'] },
  { month: 8, name: 'August',
    slides: [
      { h: 'Back to school starts here', s: 'Laptops, tablets and supplies for the new term.', c: 'Shop school tech' },
      { h: 'Get ready for the new term', s: 'Study-ready devices from verified suppliers.', c: 'Browse devices' },
      { h: 'Help them learn better', s: 'Computers, printers and accessories for students.', c: 'Browse products' }],
    tile: { h: 'Ready for the new term', s: 'Devices and supplies for students.', c: 'Browse products' },
    scenes: ['a bright study desk with abstract laptop and tablet shapes and cheerful morning light, no people',
      'colourful abstract books, pencils and devices arranged neatly with soft depth',
      'a sunny classroom corner suggested by abstract shapes and light',
      'geometric graduation-cap-like shapes and light rays over a blue gradient, no text',
      'a clean bright desk with a plant and warm light'],
    palettes: ['bright blue, yellow and white', 'teal, orange and cream', 'sky blue, lime and white', 'indigo, gold and ivory', 'green, sunny yellow and white'] },
  { month: 9, name: 'September',
    slides: [
      { h: 'Back to school, back to work', s: 'Devices and essentials for a strong new term.', c: 'Start shopping' },
      { h: 'New term, new tech', s: 'Laptops, phones and accessories from trusted suppliers.', c: 'Browse devices' },
      { h: 'Everything for a productive term', s: 'Printers, computers and study essentials.', c: 'Browse products' }],
    tile: { h: 'New term essentials', s: 'Get what you need for the term.', c: 'Browse products' },
    scenes: ['a fresh organised desk with abstract devices and crisp daylight, no people',
      'a modern campus feel suggested by abstract buildings and light with a blue-green gradient',
      'glowing abstract notebooks and tablets floating over a soft gradient',
      'bright geometric shapes and light beams suggesting energy and focus',
      'a tidy home study space with warm lamp light and plants'],
    palettes: ['blue, mint and white', 'navy, orange and cream', 'teal, lemon and white', 'violet, sky blue and white', 'green, gold and ivory'] },
  { month: 10, name: 'October',
    slides: [
      { h: 'Celebrate Nigeria, shop local suppliers', s: 'Find products from suppliers across the country.', c: 'Shop local' },
      { h: 'Made easier for Nigerian businesses', s: 'Source what your business needs in one place.', c: 'Browse suppliers' },
      { h: 'Get ready for the busy season', s: 'Equip your shop or office before the rush.', c: 'Start shopping' }],
    tile: { h: 'Shop from Nigerian suppliers', s: 'Verified shops, one marketplace.', c: 'Browse suppliers' },
    scenes: ['abstract flowing ribbons of green and white light over a clean gradient, no flag, no emblem, no text',
      'a lively market-inspired composition of abstract shapes and warm light, no people',
      'a bright modern city skyline at golden hour with abstract light trails',
      'abstract rising shapes in fresh green over a soft white gradient',
      'a tidy abstract storefront and shelves with warm lighting, no signs or text'],
    palettes: ['fresh green, white and gold', 'emerald, cream and warm orange', 'forest green, sky blue and white', 'green, white and soft silver', 'olive, gold and ivory'] },
  { month: 11, name: 'November',
    slides: [
      { h: 'Black Friday season is here', s: 'Browse laptops, phones and more from verified suppliers.', c: 'Start shopping' },
      { h: 'Plan your Black Friday shopping', s: 'Compare suppliers and save your favourites.', c: 'Browse products' },
      { h: 'Get a head start on gifts', s: 'Find tech and home gifts before the rush.', c: 'See gift ideas' }],
    tile: { h: 'Shop smart this season', s: 'Compare suppliers in one place.', c: 'Browse products' },
    scenes: ['bold dark scene with glowing abstract shopping bags and gift boxes, light trails and sparks, no text',
      'sleek dark surface with neon-lit abstract devices and soft reflections',
      'abstract floating gift boxes and glowing orbs over a deep gradient',
      'dramatic spotlight beams over abstract laptop and phone silhouettes',
      'glowing geometric shapes with a festive shimmer'],
    palettes: ['black, electric yellow and white', 'charcoal, neon magenta and silver', 'deep navy, gold and white', 'black, orange and cream', 'midnight purple, cyan and white'] },
  { month: 12, name: 'December',
    slides: [
      { h: 'Gifts for every Christmas wish', s: 'Tech and home gifts from verified suppliers.', c: 'Find a gift' },
      { h: 'Make the season brighter', s: 'Phones, speakers, TVs and festive home picks.', c: 'Browse gifts' },
      { h: 'Celebrate in style this December', s: 'Everything for gifting, hosting and relaxing.', c: 'Start shopping' }],
    tile: { h: 'Gift ideas for everyone', s: 'Browse by what they love.', c: 'Browse gifts' },
    scenes: ['warm glowing string lights and abstract wrapped gift boxes with ribbons, no text',
      'a festive living room with warm lights, a decorated tree shape and abstract gifts, no people',
      'sparkling golden bokeh over deep red and green with abstract gift shapes',
      'a cosy hearth glow with soft lights and abstract ornaments',
      'a celebration scene of floating lights and confetti shapes over a rich gradient'],
    palettes: ['deep red, gold and evergreen', 'warm gold, cream and emerald', 'burgundy, champagne and green', 'midnight blue, gold and white', 'forest green, ruby and ivory'] },
];

/** 'YYYY-MM' in Lagos time (UTC+1, no daylight saving). */
export function seasonKey(now: Date): string {
  const lagos = new Date(now.getTime() + 60 * 60_000);
  return `${lagos.getUTCFullYear()}-${String(lagos.getUTCMonth() + 1).padStart(2, '0')}`;
}
export const isSeasonKey = (s: unknown): s is string => typeof s === 'string' && /^20\d\d-(0[1-9]|1[0-2])$/.test(s);
export const themeFor = (season: string): MonthTheme => MONTHS[Number(season.slice(5, 7)) - 1];

/** The banners are live from the first of the month (Lagos) until 5 days into the next month, so a late or failed next run never leaves the hero empty. */
export function flyerWindow(season: string): { starts_at: string; ends_at: string } {
  const y = Number(season.slice(0, 4)); const m = Number(season.slice(5, 7));
  const start = Date.UTC(y, m - 1, 1, 0, 0, 0) - 60 * 60_000;                  // 00:00 Lagos = 23:00 UTC the day before
  const end = Date.UTC(y, m, 6, 0, 0, 0) - 60 * 60_000;                        // 00:00 Lagos on the 6th of the next month
  return { starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() };
}

export interface HeroSlot {
  slot: string; placement: 'hero_slide' | 'hero_side'; ratio: '2:1' | '4:3'; width: number; sortOrder: number;
  copy: HeroCopy; link: string; scene: string; palette: string; title: string;
}

/** The five banners made each month: three for the slider, two side tiles. */
export function heroSlots(season: string): HeroSlot[] {
  const t = themeFor(season);
  const mk = (slot: string, placement: HeroSlot['placement'], i: number, copy: HeroCopy, link: string, sort: number): HeroSlot => ({
    slot, placement, ratio: placement === 'hero_slide' ? '2:1' : '4:3', width: placement === 'hero_slide' ? 1600 : 900, sortOrder: sort,
    copy, link, scene: t.scenes[i], palette: t.palettes[i], title: `${t.name} ${season.slice(0, 4)}: ${copy.h}`,
  });
  return [
    mk('slide-1', 'hero_slide', 0, t.slides[0], '/products', 10),
    mk('slide-2', 'hero_slide', 1, t.slides[1], '/products', 11),
    mk('slide-3', 'hero_slide', 2, t.slides[2], '/products', 12),
    mk('tile-1', 'hero_side', 3, t.tile, '/products', 10),
    mk('tile-2', 'hero_side', 4, SELL_TILE, '/sell', 11),
  ];
}

/** Picture prompt: seasonal scene + colours + a look. Same strict no-text, no-people, no-brand rules as vendor banners. */
export function buildSeasonalPrompt(slot: HeroSlot, variant: Variant): string {
  return [
    'Create a premium, professional e-commerce homepage hero banner background image for a Nigerian online marketplace.',
    `Scene: ${slot.scene}.`,
    `Colour palette: ${slot.palette}.`,
    `Style: ${STYLES[variant.style] ?? STYLES[0]}. Lighting and mood: ${MOODS[variant.mood] ?? MOODS[0]}. Viewpoint: ${ANGLES[variant.angle] ?? ANGLES[0]}. Sharp, high quality, premium finish.`,
    'Composition: ultra-wide landscape banner. Keep the main visual interest in the centre and right two thirds, and leave the left third calm and uncluttered with soft gradient so text can be placed over it later.',
    'STRICT RULES: The image must contain absolutely NO text, letters, numbers, words, captions, logos, brand marks, watermarks, signs, labels, price tags, badges or UI elements.',
    'Do not show identifiable people or faces. Do not depict real brands, flags, emblems or trademarked products. Nothing violent, sexual, political, religious or offensive.',
  ].join('\n');
}

/** Cloudinary delivery URL cropped to the slot's shape (smart gravity keeps the subject in frame). Non-Cloudinary URLs are returned unchanged. */
export function croppedUrl(url: string, ratio: '2:1' | '4:3', width: number): string {
  let u: URL;
  try { u = new URL(url); } catch { return url; }
  const at = u.pathname.indexOf('/upload/');
  if (u.hostname !== 'res.cloudinary.com' || at < 0) return url;
  const head = u.pathname.slice(0, at + 8);
  const tail = u.pathname.slice(at + 8).replace(/^(?:[a-z]{1,4}_[^/,]+(?:,[a-z]{1,4}_[^/,]+)*\/)+/i, '');
  return `${u.origin}${head}ar_${ratio},c_fill,g_auto,w_${Math.round(width)},f_auto,q_auto/${tail}`;
}

/** Every piece of banner text must pass the vendor-ad copy rules. Used by the tests and checked again before publishing. */
export function allCopySafe(): { ok: boolean; bad: string[] } {
  const bad: string[] = [];
  const all: HeroCopy[] = [SELL_TILE, ...MONTHS.flatMap((m) => [...m.slides, m.tile])];
  for (const c of all) for (const t of [c.h, c.s, c.c]) if (!copyIsSafe(t)) bad.push(t);
  return { ok: bad.length === 0, bad };
}
