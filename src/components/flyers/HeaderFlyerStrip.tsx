import { useEffect, useState } from 'react';
import { useFlyers } from '@/hooks/useFlyers';
import { ImageFlyerBanner } from './ImageFlyers';

// Thin image banner above the header on every page. Not sticky: it scrolls
// away so it never eats screen space while browsing. Several flyers rotate.
export default function HeaderFlyerStrip() {
  const { forPlacement } = useFlyers();
  const strips = forPlacement('header_strip');
  const [i, setI] = useState(0);

  useEffect(() => {
    if (strips.length < 2) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setI(n => n + 1), 6000);
    return () => window.clearInterval(id);
  }, [strips.length]);

  if (!strips.length) return null;
  const flyer = strips[i % strips.length];
  return <ImageFlyerBanner key={flyer.id} flyer={flyer} className="rounded-none" />;
}
