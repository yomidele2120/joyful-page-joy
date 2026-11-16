// Builds the picture prompt for a product that has no photo. The product TYPE is described, never a brand or model code:
// image models draw an invented logo or lettering when they see "HP 335A", and the safety review (rightly) rejects it.
const BRANDS = ['hp', 'hewlett', 'packard', 'dell', 'lenovo', 'canon', 'epson', 'samsung', 'apple', 'asus', 'acer', 'brother', 'xerox', 'ricoh', 'kyocera',
  'sharp', 'toshiba', 'sony', 'lg', 'huawei', 'tecno', 'infinix', 'itel', 'xiaomi', 'oppo', 'microsoft', 'logitech', 'tp-link', 'tplink', 'cisco', 'ubiquiti',
  'mikrotik', 'apc', 'eaton', 'seagate', 'western', 'digital', 'sandisk', 'kingston', 'hikvision', 'dahua', 'original', 'genuine', 'oem', 'laserjet', 'officejet',
  'deskjet', 'thinkpad', 'inspiron', 'latitude', 'macbook', 'iphone', 'ipad', 'galaxy', 'pavilion', 'probook', 'elitebook', 'zbook', 'ecotank', 'pixma'];

/** Removes brand words, model codes (anything with a digit) and punctuation, leaving the plain product type. */
export function plainProductName(name: string, brand: string | null): string {
  const extra = (brand ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const drop = new Set([...BRANDS, ...extra]);
  const words = name.replace(/[()\[\],;:/\\|"'’]/g, ' ').split(/\s+/).filter(Boolean)
    .filter((w) => !/\d/.test(w) && !drop.has(w.toLowerCase()));
  return words.join(' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function buildProductPrompt(p: { name: string; brand: string | null; category: string | null }): string {
  const type = plainProductName(p.name, p.brand);
  const category = (p.category ?? '').replace(/[^\p{L}\p{N} &-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
  const subject = [type, category && !type.toLowerCase().includes(category.toLowerCase()) ? `(${category})` : ''].filter(Boolean).join(' ') || category || 'product';
  return `Clean studio product photograph on a plain light background, soft even lighting, square composition. Subject: a generic, plain, unmarked ${subject}. ` +
    'The product must have completely blank surfaces: no labels, no stickers, no printed words, no letters, no numbers, no symbols, no logos, no brand marks, ' +
    'no screens showing anything, no packaging text, no watermarks, no people. Matte, plain, neutral colours. Show the product type clearly and honestly.';
}
