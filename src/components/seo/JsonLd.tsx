import { useEffect } from 'react';
import { serialize } from '@/lib/seo/structuredData';

/** Adds one JSON-LD block to the page head while the page is shown, and removes it when the visitor leaves. */
export default function JsonLd({ id, data }: { id: string; data: Record<string, unknown> | null }) {
  const text = data ? serialize(data) : '';
  useEffect(() => {
    if (!text) return;
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = `jsonld-${id}`;
    el.textContent = text;
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, [id, text]);
  return null;
}
