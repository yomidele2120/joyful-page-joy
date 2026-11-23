// Pure logic for AI banner generation. No Deno, network or database calls in this file, so it can be unit-tested
// with Node:   node --test supabase/functions/_shared/adBannerCore.test.ts
//
// The copy rules mirror the database function public.ad_copy_is_safe so that text the worker accepts is also text
// the database accepts.

export type ArtCategory = 'electronics' | 'fashion' | 'beauty' | 'home' | 'food' | 'phones' | 'general';

export interface VendorForAd {
  storeName: string;
  storeDescription?: string | null;
  businessType?: string | null;
  categories?: string[] | null;          // vendors.product_categories
}
export interface ProductForAd {
  name: string;
  categoryName?: string | null;
}

// ------------------------------------------------------------------ category detection
const KEYWORDS: Record<Exclude<ArtCategory, 'general'>, string[]> = {
  phones: ['phone', 'phones', 'mobile', 'smartphone', 'smartphones', 'iphone', 'android', 'gsm', 'sim', 'earbuds', 'charger', 'chargers', 'powerbank', 'cases', 'accessories'],
  electronics: ['electronic', 'electronics', 'laptop', 'laptops', 'computer', 'computers', 'tv', 'television', 'audio', 'speaker', 'speakers', 'gadget', 'gadgets', 'camera', 'cameras', 'gaming', 'console', 'monitor', 'printer', 'tech'],
  fashion: ['fashion', 'cloth', 'clothes', 'clothing', 'wear', 'apparel', 'shoe', 'shoes', 'sneakers', 'bag', 'bags', 'ankara', 'fabric', 'fabrics', 'jewelry', 'jewellery', 'dress', 'dresses', 'tailoring', 'textile', 'textiles'],
  beauty: ['beauty', 'cosmetic', 'cosmetics', 'skincare', 'skin', 'hair', 'makeup', 'perfume', 'perfumes', 'fragrance', 'fragrances', 'wig', 'wigs', 'salon', 'grooming', 'nails'],
  home: ['home', 'furniture', 'kitchen', 'decor', 'bed', 'beds', 'sofa', 'sofas', 'household', 'appliance', 'appliances', 'lighting', 'mattress', 'curtain', 'curtains', 'interior'],
  food: ['food', 'foods', 'grocery', 'groceries', 'snack', 'snacks', 'drink', 'drinks', 'beverage', 'spice', 'spices', 'bakery', 'restaurant', 'catering', 'farm', 'fresh', 'produce', 'agro'],
};
// Used to break ties (earlier wins).
const PRIORITY: Exclude<ArtCategory, 'general'>[] = ['phones', 'electronics', 'fashion', 'beauty', 'home', 'food'];

function words(text: string | null | undefined): string[] {
  return (text ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

export function detectArtCategory(vendor: VendorForAd, products: ProductForAd[] = []): ArtCategory {
  const score: Record<string, number> = {};
  const add = (list: string[], weight: number) => {
    for (const w of list) {
      for (const cat of PRIORITY) if (KEYWORDS[cat].includes(w)) score[cat] = (score[cat] ?? 0) + weight;
    }
  };
  add((vendor.categories ?? []).flatMap(words), 3);
  add(words(vendor.businessType), 2);
  add(products.flatMap((p) => words(p.categoryName)), 2);
  add(words(vendor.storeDescription), 1);
  add(products.flatMap((p) => words(p.name)), 1);
  let best: ArtCategory = 'general';
  let bestScore = 0;
  for (const cat of PRIORITY) {
    if ((score[cat] ?? 0) > bestScore) { best = cat; bestScore = score[cat]; }
  }
  return best;
}

// ------------------------------------------------------------------ text safety
const UNSAFE_TERMS = /\b(nude|naked|nsfw|porn|sex|sexy|erotic|gore|blood|kill|killing|murder|suicide|terror|terrorist|bomb|gun|guns|rifle|weapon|weapons|drug|drugs|cocaine|heroin|marijuana|cannabis|hate|racist|nazi|swastika|isis|fraud|scam)\b/i;

export function containsUnsafeTerms(text: string | null | undefined): boolean {
  return UNSAFE_TERMS.test(text ?? '');
}

/** Reduces vendor-written text to a few harmless words that are safe to place inside an image prompt. */
export function sanitizeForPrompt(text: string | null | undefined, maxChars = 80): string {
  const cleaned = (text ?? '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[^A-Za-z\s,'-]/g, ' ')       // letters only: no digits, symbols, markup or punctuation-based instructions
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)
    .trim();
  if (!cleaned || containsUnsafeTerms(cleaned)) return '';
  if (/\b(ignore|disregard|forget|system|prompt|instruction|instructions|override|jailbreak)\b/i.test(cleaned)) return '';
  return cleaned;
}

// ------------------------------------------------------------------ copy rules (mirror of ad_copy_is_safe)
const COPY_BAD_CHARS = /[<>0-9%₦$€£#]/;
const COPY_LINKS = /(https?:|www\.|@)/i;
const COPY_WORDS = /\b(free|guarantee|guaranteed|guarantees|warranty|certified|certification|authentic|genuine|official|cheapest|cheap|discount|discounts|sale|clearance|stock|bargain|giveaway)\b/i;
const COPY_PHRASES = /(lowest price|best price|price drop|money back|limited time|while stocks)/i;

export function copyIsSafe(text: string | null | undefined): boolean {
  const t = text ?? '';
  return t.trim().length > 0 && !COPY_BAD_CHARS.test(t) && !COPY_LINKS.test(t) && !COPY_WORDS.test(t) && !COPY_PHRASES.test(t)
    && !containsUnsafeTerms(t);
}

export interface Copy { headline: string; description: string }
export interface CopyCheck { ok: boolean; reasons: string[]; copy?: Copy }

export function validateCopy(headline: unknown, description: unknown): CopyCheck {
  const reasons: string[] = [];
  const h = typeof headline === 'string' ? headline.replace(/\s+/g, ' ').trim() : '';
  const d = typeof description === 'string' ? description.replace(/\s+/g, ' ').trim() : '';
  if (h.length < 3 || h.length > 60) reasons.push('headline length must be 3-60 characters');
  if (d.length < 10 || d.length > 160) reasons.push('description length must be 10-160 characters');
  if (!copyIsSafe(h)) reasons.push('headline contains a number, price, link or restricted claim');
  if (!copyIsSafe(d)) reasons.push('description contains a number, price, link or restricted claim');
  return reasons.length ? { ok: false, reasons } : { ok: true, reasons, copy: { headline: h, description: d } };
}

/** Parses a model reply that should be JSON, tolerating code fences and surrounding text. */
export function parseCopyResponse(raw: string | null | undefined): CopyCheck {
  if (!raw) return { ok: false, reasons: ['empty response'] };
  const stripped = raw.replace(/```(?:json)?/gi, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, reasons: ['no JSON object found'] };
  try {
    const obj = JSON.parse(stripped.slice(start, end + 1));
    return validateCopy(obj?.headline, obj?.description);
  } catch {
    return { ok: false, reasons: ['response was not valid JSON'] };
  }
}

// ------------------------------------------------------------------ template copy (always-valid fallback)
const TEMPLATES: Record<ArtCategory, Copy[]> = {
  electronics: [
    { headline: 'Discover Premium Electronics', description: 'Browse a curated range of electronics from a shop on the ITHUBAFRICA marketplace.' },
    { headline: 'Explore Quality Electronics', description: 'See what this shop has to offer and find your next favourite device.' },
  ],
  phones: [
    { headline: 'Find Your Next Phone', description: 'Browse phones and accessories from a trusted shop on the ITHUBAFRICA marketplace.' },
    { headline: 'Discover Phones And Accessories', description: 'Visit the shop to see the latest phones and accessories on offer.' },
  ],
  fashion: [
    { headline: 'Shop The Latest Fashion', description: 'Explore styles and collections from a shop on the ITHUBAFRICA marketplace.' },
    { headline: 'Discover Fresh Styles', description: 'Visit the shop to browse clothing, footwear and accessories.' },
  ],
  beauty: [
    { headline: 'Discover Beauty Essentials', description: 'Browse beauty and personal care products from a shop on the ITHUBAFRICA marketplace.' },
    { headline: 'Explore Beauty And Care', description: 'Visit the shop to see skincare, hair and beauty products on offer.' },
  ],
  home: [
    { headline: 'Explore Quality Home Essentials', description: 'Browse furniture and home products from a shop on the ITHUBAFRICA marketplace.' },
    { headline: 'Make Your Space Feel Like Home', description: 'Visit the shop to see furniture, decor and household products.' },
  ],
  food: [
    { headline: 'Discover Fresh Flavours', description: 'Browse food and drink products from a shop on the ITHUBAFRICA marketplace.' },
    { headline: 'Explore Tasty Favourites', description: 'Visit the shop to see the food and groceries on offer.' },
  ],
  general: [
    { headline: 'Find Your Next Favourite Product', description: 'Browse a wide range of products from a shop on the ITHUBAFRICA marketplace.' },
    { headline: 'Discover Something New Today', description: 'Visit the shop to explore the products on offer.' },
  ],
};

/** Deterministic pick so the same shop gets stable copy. `seed` is any string (vendor or campaign id). */
export function templateCopy(category: ArtCategory, seed: string): Copy {
  const list = TEMPLATES[category] ?? TEMPLATES.general;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

// ------------------------------------------------------------------ prompts
const SCENES: Record<ArtCategory, { scene: string; palette: string }> = {
  electronics: { scene: 'a sleek modern tech workspace with abstract glowing devices, soft reflections and clean geometric shapes', palette: 'deep navy, electric blue and cool silver' },
  phones: { scene: 'floating abstract smartphones and accessory shapes with soft light trails over a clean gradient', palette: 'midnight blue, violet and bright cyan highlights' },
  fashion: { scene: 'an elegant fashion boutique atmosphere with draped fabric, soft studio lighting and tasteful abstract garment shapes, no people', palette: 'warm cream, deep burgundy and gold accents' },
  beauty: { scene: 'a calm luxurious beauty setting with soft petals, glass surfaces and gentle light, abstract product silhouettes without labels', palette: 'blush pink, soft peach and champagne gold' },
  home: { scene: 'a bright welcoming living space with warm natural light, abstract furniture shapes and plants', palette: 'warm oak, soft white and sage green' },
  food: { scene: 'a fresh colourful table of ingredients and produce in warm natural light, appetising and clean, no packaging or labels', palette: 'warm orange, fresh green and cream' },
  general: { scene: 'an inviting modern marketplace atmosphere with abstract shapes, soft depth and gentle lighting', palette: 'ITHUBAFRICA teal, warm gold and soft white' },
};

// ------------------------------------------------------------------ variety
// Every banner is drawn with a different look. A "variant" is one choice from each list below. The worker picks one at
// random for each generation and avoids the looks used by the most recent banners on the platform, so neighbouring
// ads do not look alike. All options are text-free, people-free and brand-free by construction.
const PALETTES: Record<ArtCategory, string[]> = {
  electronics: ['deep navy, electric blue and cool silver', 'charcoal black, neon cyan and soft white', 'graphite grey, amber orange and warm white', 'deep teal, mint green and silver', 'midnight purple, magenta glow and pale lilac', 'slate blue, ice white and bright lime accents'],
  phones: ['midnight blue, violet and bright cyan highlights', 'warm coral, deep plum and soft peach', 'emerald green, black and champagne', 'sunset orange, rose pink and deep indigo', 'ice blue, white and pale silver', 'forest green, mustard yellow and cream'],
  fashion: ['warm cream, deep burgundy and gold accents', 'dusty rose, ivory and soft taupe', 'emerald green, gold and off-white', 'terracotta, sand beige and chocolate brown', 'royal blue, white and silver', 'black, blush pink and rose gold'],
  beauty: ['blush pink, soft peach and champagne gold', 'sage green, cream and pale gold', 'lavender, white and soft silver', 'warm terracotta, apricot and ivory', 'deep plum, rose and gold', 'aqua, pearl white and pale coral'],
  home: ['warm oak, soft white and sage green', 'deep olive, terracotta and linen beige', 'soft grey, navy blue and brass', 'sunny yellow, white and light wood', 'charcoal, warm copper and cream', 'dusty blue, ivory and walnut brown'],
  food: ['warm orange, fresh green and cream', 'deep red, golden yellow and warm brown', 'leafy green, lemon yellow and white', 'rich brown, caramel and cream', 'purple aubergine, fresh green and orange', 'turquoise, sunny yellow and coral'],
  general: ['ITHUBAFRICA teal, warm gold and soft white', 'deep indigo, coral and cream', 'forest green, sand and bright orange', 'charcoal, electric blue and white', 'warm magenta, gold and deep navy', 'ocean blue, sunny yellow and soft grey'],
};
export const STYLES = [
  'polished commercial photography with realistic materials',
  'refined three-dimensional render with soft studio lighting',
  'minimal flat vector illustration with layered translucent shapes and soft gradients',
  'clean isometric digital illustration with precise geometry',
  'layered paper-cut illustration with gentle shadows and depth',
  'cinematic macro photography with shallow depth of field',
  'soft frosted-glass render with translucent forms and glowing edges',
  'bold abstract geometric composition with smooth gradients and fine grain',
];
export const MOODS = [
  'bright fresh morning light',
  'warm golden-hour glow',
  'cool dramatic evening lighting',
  'soft diffused overcast light',
  'vibrant high-contrast studio lighting',
  'calm minimal airy atmosphere',
];
export const ANGLES = [
  'wide straight-on view',
  'slightly elevated three-quarter view',
  'low angle looking gently upward',
  'top-down flat-lay view',
  'close-up view with soft background blur',
];

export interface Variant { palette: number; style: number; mood: number; angle: number }
export const variantKey = (v: Variant) => `${v.palette}-${v.style}-${v.mood}-${v.angle}`;
export function isVariant(x: unknown): x is Variant {
  const v = x as Variant | null;
  return !!v && [v.palette, v.style, v.mood, v.angle].every((n) => Number.isInteger(n) && n >= 0);
}

/** Small deterministic PRNG so a given seed always gives the same look (tests rely on it). */
function rng(seed: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^= h >>> 16) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Picks a look for one banner. `recent` lists the looks of the newest banners (newest first). Each choice avoids what
 * was used by the last few banners: 5 palettes, 3 styles, 2 moods, 2 angles. If every option was recently used, all
 * options are allowed again, so a pick is always possible.
 */
export function pickVariant(category: ArtCategory, seed: string, recent: readonly Variant[] = []): Variant {
  const r = rng(`${category}:${seed}`);
  const choose = (count: number, used: number[]) => {
    const fresh = Array.from({ length: count }, (_, i) => i).filter((i) => !used.includes(i));
    const pool = fresh.length ? fresh : Array.from({ length: count }, (_, i) => i);
    return pool[Math.floor(r() * pool.length)];
  };
  const last = (key: keyof Variant, n: number) => recent.slice(0, n).map((v) => v[key]);
  return {
    palette: choose((PALETTES[category] ?? PALETTES.general).length, last('palette', 5)),
    style: choose(STYLES.length, last('style', 3)),
    mood: choose(MOODS.length, last('mood', 2)),
    angle: choose(ANGLES.length, last('angle', 2)),
  };
}

export interface PromptInput {
  category: ArtCategory;
  vendorHint?: string | null;         // vendor's promotional message or description, sanitised below
  subjects?: string[];                // generic category / product-type words ONLY (never product or brand names)
  variant?: Variant;                  // look for this banner (see pickVariant); omitted = the original default look
}

/**
 * The image prompt. The SHOP NAME IS DELIBERATELY NOT INCLUDED, and the model is told to draw no text at all: the
 * name, logo and wording are drawn later by the website from real data, so the art can never show a wrong or invented name.
 */
export function buildImagePrompt(input: PromptInput): string {
  const s = SCENES[input.category] ?? SCENES.general;
  const v = input.variant && isVariant(input.variant) ? input.variant : null;
  const hint = sanitizeForPrompt(input.vendorHint, 80);
  const subjects = (input.subjects ?? []).map((n) => sanitizeForPrompt(n, 30)).filter(Boolean).slice(0, 3);
  const lines = [
    'Create a premium, professional e-commerce advertising banner background image.',
    `Scene: ${s.scene}.`,
    `Colour palette: ${v ? (PALETTES[input.category] ?? PALETTES.general)[v.palette] ?? s.palette : s.palette}.`,
    'Composition: ultra-wide landscape banner. Keep the main visual interest in the centre and right two thirds, and leave the left third calm and uncluttered with soft gradient so text can be placed over it later.',
    v
      ? `Style: ${STYLES[v.style] ?? STYLES[0]}. Lighting and mood: ${MOODS[v.mood] ?? MOODS[0]}. Viewpoint: ${ANGLES[v.angle] ?? ANGLES[0]}. Sharp, high quality, premium finish.`
      : 'Style: polished commercial photography / refined digital render, sharp, high quality, balanced lighting, subtle depth of field.',
  ];
  if (subjects.length) lines.push(`Loose subject inspiration (product types only): ${subjects.join(', ')}.`);
  if (hint) lines.push(`Mood hint: ${hint}.`);
  lines.push(
    'STRICT RULES: The image must contain absolutely NO text, letters, numbers, words, captions, logos, brand marks, watermarks, signs, labels, price tags, badges or UI elements.',
    'Do not show identifiable people or faces. Do not depict real brands or trademarked products. Nothing violent, sexual, political or offensive.',
  );
  return lines.join('\n');
}

export function buildCopyPrompt(vendor: VendorForAd, category: ArtCategory, vendorMessage?: string | null): { system: string; user: string } {
  const desc = sanitizeForPrompt(vendor.storeDescription, 160);
  const msg = sanitizeForPrompt(vendorMessage, 100);
  return {
    system: [
      'You write short promotional copy for online marketplace shop banners.',
      'Return ONLY a JSON object: {"headline": string, "description": string}.',
      'headline: 3 to 6 words. description: one sentence of 8 to 20 words.',
      'Hard rules: no digits or numbers, no prices, no percentages, no currency symbols, no discounts or sales, no guarantees or warranties,',
      'no certifications or claims of being official, genuine or authentic, no claims about stock or availability, no superlatives like cheapest or best price,',
      'no links, no @handles, no emojis, no hashtags. Do not invent facts about the shop. Be inviting and general.',
    ].join(' '),
    user: [
      `Shop category: ${category}.`,
      desc ? `Shop description (context only): ${desc}.` : '',
      msg ? `Vendor message (tone hint only): ${msg}.` : '',
      'Examples of the style wanted: "Discover Premium Electronics", "Shop the Latest Fashion", "Explore Quality Home Essentials".',
    ].filter(Boolean).join('\n'),
  };
}

export const MODERATION_PROMPT = [
  'You are a strict ad-image reviewer for a family-friendly marketplace.',
  'Look at the image and answer ONLY with JSON: {"safe": boolean, "contains_text": boolean, "contains_logo": boolean, "contains_face": boolean, "reasons": string[]}.',
  'safe=false for violence, nudity, sexual or suggestive content, hate symbols, drugs, weapons or anything misleading.',
  'contains_text=true if ANY readable letters, numbers or words appear anywhere. contains_logo=true if any brand mark or logo appears.',
  'contains_face=true if a human face is clearly visible.',
].join(' ');

/** Reviewer rules for vendor-described pictures. Safety is as strict as above; only the text and logo rule is practical:
 *  tiny incidental markings (key labels, small screen details, faint stitching) are fine, prominent words and brand marks are not. */
export const MODERATION_PROMPT_PICTURE = [
  'You are an ad-image reviewer for a family-friendly marketplace.',
  'Look at the image and answer ONLY with JSON: {"safe": boolean, "contains_text": boolean, "contains_logo": boolean, "contains_face": boolean, "reasons": string[]}.',
  'safe=false for violence, nudity, sexual or suggestive content, hate symbols, drugs, weapons or anything misleading.',
  'contains_text=true ONLY if clearly readable words, slogans, captions, signs, price tags or watermarks are a visible part of the picture. Ignore tiny, blurred or incidental markings such as keyboard keys, small screen details, buttons and tiny labels.',
  'contains_logo=true ONLY if a clearly recognisable brand logo or brand name is prominent. Ignore small or unreadable marks.',
  'contains_face=true if a human face is clearly visible. Put a short plain reason in reasons whenever any flag is true.',
].join(' ');

export interface ModerationResult { safe: boolean; contains_text: boolean; contains_logo: boolean; contains_face: boolean; reasons: string[] }

export function parseModerationResponse(raw: string | null | undefined): ModerationResult | null {
  if (!raw) return null;
  const stripped = raw.replace(/```(?:json)?/gi, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(stripped.slice(start, end + 1));
    if (typeof o.safe !== 'boolean') return null;
    return {
      safe: o.safe,
      contains_text: o.contains_text === true,
      contains_logo: o.contains_logo === true,
      contains_face: o.contains_face === true,
      reasons: Array.isArray(o.reasons) ? o.reasons.filter((r: unknown) => typeof r === 'string').slice(0, 5) : [],
    };
  } catch {
    return null;
  }
}

/** An image is accepted only when it is safe and free of text, logos and faces. */
export function moderationDecision(r: ModerationResult): { pass: boolean; flags: string[] } {
  const flags: string[] = [];
  if (!r.safe) flags.push('unsafe');
  if (r.contains_text) flags.push('contains_text');
  if (r.contains_logo) flags.push('contains_logo');
  if (r.contains_face) flags.push('contains_face');
  return { pass: flags.length === 0, flags };
}

// ------------------------------------------------------------------ image inspection
export interface ImageInfo { ok: boolean; reason?: string; mime?: string; width?: number; height?: number; bytes: number }

const MIN_BYTES = 20_000;
const MAX_BYTES = 10 * 1024 * 1024;
const MIN_WIDTH = 800;

/** Checks the real file signature (never trusts the declared type) and reads the pixel size. */
export interface InspectOptions { minBytes?: number; minWidth?: number; minRatio?: number; maxRatio?: number }
/** Limits for a SQUARE picture (product photos and vendor ad images). Banners keep the wide defaults above. */
export const SQUARE_IMAGE: InspectOptions = { minBytes: 4_000, minWidth: 512, minRatio: 0.8, maxRatio: 1.25 };

export function inspectImage(bytes: Uint8Array, opts: InspectOptions = {}): ImageInfo {
  const n = bytes.length;
  const minBytes = opts.minBytes ?? MIN_BYTES, minWidth = opts.minWidth ?? MIN_WIDTH, minRatio = opts.minRatio ?? 1.2, maxRatio = opts.maxRatio ?? 3.6;
  if (n < minBytes) return { ok: false, reason: 'image is too small', bytes: n };
  if (n > MAX_BYTES) return { ok: false, reason: 'image is too large', bytes: n };
  let mime: string | undefined; let width = 0; let height = 0;

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    mime = 'image/png';
    const dv = new DataView(bytes.buffer, bytes.byteOffset, n);
    width = dv.getUint32(16); height = dv.getUint32(20);
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    mime = 'image/jpeg';
    let i = 2;
    while (i + 9 < n) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        height = (bytes[i + 5] << 8) | bytes[i + 6]; width = (bytes[i + 7] << 8) | bytes[i + 8];
        break;
      }
      i += 2 + len;
    }
  } else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    mime = 'image/webp';
    const tag = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (tag === 'VP8X') { width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)); height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)); }
    else if (tag === 'VP8 ') { width = (bytes[26] | (bytes[27] << 8)) & 0x3fff; height = (bytes[28] | (bytes[29] << 8)) & 0x3fff; }
    else if (tag === 'VP8L') { const b = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24); width = 1 + (b & 0x3fff); height = 1 + ((b >> 14) & 0x3fff); }
  } else {
    return { ok: false, reason: 'not a PNG, JPEG or WebP image', bytes: n };
  }

  if (!width || !height) return { ok: false, reason: 'could not read image size', mime, bytes: n };
  if (width < minWidth) return { ok: false, reason: `image is only ${width}px wide`, mime, width, height, bytes: n };
  const ratio = width / height;
  if (ratio < minRatio || ratio > maxRatio) return { ok: false, reason: `unsuitable shape (${width}x${height})`, mime, width, height, bytes: n };
  return { ok: true, mime, width, height, bytes: n };
}

// ------------------------------------------------------------------ misc
export function estimateCostUsd(imageCostUsd: number, textCalls: number, visionCalls: number): number {
  const TEXT_CALL = 0.001;   // rough: a short text or vision call. An estimate only, not Google's billing.
  return Math.round((imageCostUsd + (textCalls + visionCalls) * TEXT_CALL) * 10000) / 10000;
}

export type FailureKind = { code: string; retryable: boolean };

/** Maps an HTTP status from the AI provider to a failure code and whether retrying can help. */
export function classifyProviderStatus(status: number): FailureKind {
  if (status === 401 || status === 403) return { code: 'provider_auth', retryable: false };
  if (status === 429) return { code: 'provider_rate_limited', retryable: true };
  if (status === 404) return { code: 'provider_model_not_found', retryable: false };
  if (status >= 500) return { code: 'provider_unavailable', retryable: true };
  if (status === 400) return { code: 'provider_rejected_request', retryable: true };
  return { code: `provider_http_${status}`, retryable: true };
}

// ------------------------------------------------------------------ art directions for vendor-requested pictures
// Each direction is a complete, designed look. The vendor's own description of the subject is always kept; only the
// treatment changes. A new direction is picked each time (never the one just used), so pictures stop looking alike.
// Every direction is text-free by construction: wording is added later by the website, never drawn by the model.
export interface ArtDirection { id: string; label: string; look: string }
export const ART_DIRECTIONS: ArtDirection[] = [
  { id: 'clean', label: 'Clean photo', look: 'polished commercial product photograph on a softly lit studio set, natural shadows, true colours, crisp detail' },
  { id: 'pedestal', label: 'Pedestal showcase', look: 'the subject displayed on a rounded stone or glossy pedestal in a minimal colour-blocked set, soft spotlight from above, gentle floor reflection, magazine-cover elegance' },
  { id: 'neon', label: 'Neon night', look: 'dark moody scene with vivid magenta and cyan neon rim lighting, glossy reflections, subtle haze, cinematic night-city energy' },
  { id: 'burst', label: 'Colour burst', look: 'bold saturated background in one strong colour with a lighter radial burst behind the subject, floating geometric confetti shapes, energetic poster feel' },
  { id: 'papercut', label: 'Paper-cut layers', look: 'layered paper-cut diorama with soft drop shadows between layers, warm tactile textures and a handmade craft feel' },
  { id: 'glass', label: 'Frosted glass', look: 'soft frosted-glass panels and glowing translucent orbs behind the subject, pastel gradient background, airy modern interface-style depth' },
  { id: 'afro', label: 'African pattern', look: 'rich warm background inspired by African wax-print geometry in deep earth tones with gold accents, subject sharply lit in front, proud and celebratory' },
  { id: 'duotone', label: 'Duotone', look: 'striking two-colour duotone treatment with high contrast, bold graphic shapes and strong negative space, contemporary editorial feel' },
  { id: 'flatlay', label: 'Flat-lay lifestyle', look: 'top-down flat-lay on a textured surface with a few tasteful props arranged around the subject, natural window light, styled lifestyle magazine look' },
  { id: 'render3d', label: '3D render', look: 'playful glossy three-dimensional render with rounded forms, soft global illumination and a clean pastel backdrop' },
  { id: 'sunset', label: 'Golden hour', look: 'warm golden-hour glow with long soft shadows and a gradient sunset sky, lens flare kept subtle, aspirational and inviting' },
  { id: 'abstract', label: 'Abstract motion', look: 'dynamic abstract swooshes and light trails curving around the subject on a deep gradient background, sense of speed and energy' },
];
export const isArtDirectionId = (id: unknown): id is string => typeof id === 'string' && ART_DIRECTIONS.some((d) => d.id === id);

/** Picks a direction at random from a seed, never the same as `avoid` (the one used last), so back-to-back pictures differ. */
export function pickArtDirection(seed: string, avoid?: string | null): ArtDirection {
  const r = rng(`art:${seed}`);
  const pool = ART_DIRECTIONS.filter((d) => d.id !== avoid);
  return pool[Math.floor(r() * pool.length)];
}

/** The prompt for a vendor-described picture. The vendor's words are only the subject; everything else is fixed here. */
export function buildDesignedPicturePrompt(subject: string, dir: ArtDirection): string {
  return [
    `Premium advertising artwork, square composition. Subject described by the shop owner: "${subject}".`,
    `Art direction: ${dir.look}.`,
    'Design it like a professionally art-directed promotional visual: one clear focal point, generous breathing room, confident colour choices, depth and light that make the subject feel desirable.',
    'Rules: no text, no letters, no numbers, no logos, no watermarks, no brand names, no real or famous people, no recognisable celebrities, no sale stickers or price tags. Show the subject honestly and attractively.',
  ].join(' ');
}
