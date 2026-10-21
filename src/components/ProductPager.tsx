import { Button } from '@/components/ui/button';
import { MAX_PRODUCT_PAGES, PRODUCT_PAGE_SIZE } from '@/lib/productSearch';

export default function ProductPager({ page, pageCount, onChange, capped = false }: {
  page: number; pageCount: number; onChange: (page: number) => void; capped?: boolean;
}) {
  if (pageCount <= 1) return null;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1)
    .filter(p => p === 1 || p === pageCount || Math.abs(p - page) <= 1);
  return (
    <>
      <nav className="mt-6 flex flex-wrap items-center justify-center gap-1.5" aria-label="Pagination">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
        {pages.map((p, i) => (
          <span key={p} className="flex items-center gap-1.5">
            {i > 0 && p - pages[i - 1] > 1 && <span className="text-muted-foreground">...</span>}
            <Button variant={p === page ? 'default' : 'outline'} size="sm" onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined}>{p}</Button>
          </span>
        ))}
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>Next</Button>
      </nav>
      {capped && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Showing the first {(MAX_PRODUCT_PAGES * PRODUCT_PAGE_SIZE).toLocaleString('en-NG')} results. Use the search box or the filters to narrow it down.
        </p>
      )}
    </>
  );
}
