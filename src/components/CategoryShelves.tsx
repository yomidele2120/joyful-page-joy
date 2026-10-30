import { useCallback, useEffect, useRef, useState } from 'react';
import ScrollRow, { ScrollItem } from '@/components/ScrollRow';
import ProductCard, { ProductCardSkeleton } from '@/components/ProductCard';
import { useCategoryShelfProducts, useCategoryShelves, type CategoryShelf } from '@/hooks/useCategoryShelves';

// How many category rows appear straight away; the rest are added as the visitor scrolls down.
const FIRST_BATCH = 6;
const NEXT_BATCH = 6;

/** True once the element has come within `margin` of the screen (and stays true). */
function useNearScreen<T extends Element>(margin = '500px') {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) setNear(true);
    }, { rootMargin: margin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, margin]);
  return [ref, near] as const;
}

function ShelfRow({ shelf, verified }: { shelf: CategoryShelf; verified: boolean }) {
  const [ref, near] = useNearScreen<HTMLDivElement>();
  const { data: products, isLoading } = useCategoryShelfProducts(shelf.id, near);

  // A category with nothing to show leaves no gap (only possible before the database function is installed).
  if (near && !isLoading && !products?.length && !verified) return null;

  return (
    <div ref={ref} className="min-h-[1px]">
      <ScrollRow title={shelf.name} linkTo={`/category/${shelf.slug}`}>
        {!near || isLoading
          ? Array.from({ length: 6 }).map((_, i) => <ScrollItem key={i}><ProductCardSkeleton /></ScrollItem>)
          : (products ?? []).map(p => <ScrollItem key={p.id}><ProductCard {...p} /></ScrollItem>)}
      </ScrollRow>
    </div>
  );
}

/** Fires once when it comes near the screen. A new one is mounted after each batch, so it triggers again. */
function ShelfSentinel({ onNear }: { onNear: () => void }) {
  const [ref, near] = useNearScreen<HTMLDivElement>('800px');
  useEffect(() => { if (near) onNear(); }, [near, onNear]);
  return <div ref={ref} className="h-px" aria-hidden="true" />;
}

/** One scrolling row per category that has products, like "New arrivals", with a "View all" link to that category. */
export default function CategoryShelves() {
  const { data } = useCategoryShelves();
  const [count, setCount] = useState(FIRST_BATCH);
  const shelves = data?.shelves ?? [];
  const more = useCallback(() => setCount(c => c + NEXT_BATCH), []);

  if (!shelves.length) return null;
  return (
    <>
      {shelves.slice(0, count).map(s => <ShelfRow key={s.id} shelf={s} verified={!!data?.verified} />)}
      {count < shelves.length && <ShelfSentinel key={count} onNear={more} />}
    </>
  );
}
