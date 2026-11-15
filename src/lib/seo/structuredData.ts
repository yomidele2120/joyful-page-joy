// Builders for schema.org JSON-LD. Pure functions, so they can be tested. Everything comes from real page content:
// an FAQ answer here is the very text shown on the page (search engines and AI assistants compare the two).

type Json = Record<string, unknown>;
export const SITE = 'https://www.ithubafrica.com';

const clean = (s: string, max = 1000) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Plain text of a React node (strings, arrays and elements with children). */
export function nodeText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (typeof node === 'object' && 'props' in (node as Json)) return nodeText(((node as Json).props as Json)?.children);
  return '';
}

export function faqPage(items: Array<{ q: string; a: unknown }>): Json | null {
  const entities = items
    .map((i) => ({ q: clean(i.q, 300), a: clean(nodeText(i.a), 1500) }))
    .filter((i) => i.q && i.a)
    .map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } }));
  return entities.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: entities } : null;
}

export function breadcrumbs(trail: Array<{ name: string; path: string }>, site = SITE): Json {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: clean(t.name, 120), item: `${site}${t.path}` })),
  };
}

const httpsUrl = (v: unknown) => (typeof v === 'string' && /^https:\/\/\S+$/i.test(v) ? v : undefined);

/** A supplier's shop as an organization, from public shop fields only. Nothing is added that the vendor did not provide. */
export function shopOrganization(v: { id: string; store_name: string; store_description?: string | null; logo_url?: string | null; location?: string | null; year_established?: number | null }, site = SITE): Json {
  const out: Json = { '@context': 'https://schema.org', '@type': 'Organization', name: clean(v.store_name, 120), url: `${site}/shop/${v.id}` };
  const desc = clean(v.store_description ?? '', 500); if (desc) out.description = desc;
  const logo = httpsUrl(v.logo_url); if (logo) out.logo = logo;
  const place = clean(v.location ?? '', 120); if (place) out.address = { '@type': 'PostalAddress', addressLocality: place, addressCountry: 'NG' };
  if (v.year_established && v.year_established > 1800 && v.year_established <= new Date().getFullYear()) out.foundingDate = String(v.year_established);
  return out;
}

/** JSON for a <script type="application/ld+json">: "<" is escaped so page text can never close the tag. */
export const serialize = (data: Json) => JSON.stringify(data).replace(/</g, '\\u003c');
