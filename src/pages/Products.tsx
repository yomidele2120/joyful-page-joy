import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BadgeCheck, LayoutGrid, List, MessageSquare, Search, Send, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import ProductCard, { ProductPrice } from '@/components/ProductCard';
import SupplierCard from '@/components/SupplierCard';
import InquiryDialog, { type InquiryDialogTarget } from '@/components/InquiryDialog';
import { useProducts, useCategories, useSuppliers } from '@/hooks/useProducts';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatMoq, getMoq, priceRange } from '@/lib/pricing';
import { FlyerBanner, FlyerCard, pickImages } from '@/components/flyers/Flyers';
import { FLYERS } from '@/lib/flyers';
import { useFlyers } from '@/hooks/useFlyers';
import { ImageFlyerBanner, ImageFlyerFill } from '@/components/flyers/ImageFlyers';

const PAGE_SIZE = 24;

interface Filters {
  category: string;
  minPrice: string;
  maxPrice: string;
  maxMoq: string;
  verifiedOnly: boolean;
  inStockOnly: boolean;
}
const DEFAULT_FILTERS: Filters = { category: 'all', minPrice: '', maxPrice: '', maxMoq: '', verifiedOnly: false, inStockOnly: false };

export default function Products() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tab = searchParams.get('tab') === 'suppliers' ? 'suppliers' : 'products';
  const searchFromUrl = searchParams.get('search') || '';

  const [search, setSearch] = useState(searchFromUrl);
  const [sortBy, setSortBy] = useState('newest');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [inquiryTarget, setInquiryTarget] = useState<InquiryDialogTarget | null>(null);

  // Keep the box in step with the header search (which changes the URL).
  useEffect(() => { setSearch(searchFromUrl); }, [searchFromUrl]);
  useEffect(() => { setPage(1); }, [search, sortBy, filters, tab]);

  const { data: products, isLoading } = useProducts({ search: search || undefined });
  const { data: categories } = useCategories();
  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers({ search: search || undefined });

  const filtered = useMemo(() => {
    const min = filters.minPrice ? Number(filters.minPrice) : null;
    const max = filters.maxPrice ? Number(filters.maxPrice) : null;
    const maxMoq = filters.maxMoq ? Number(filters.maxMoq) : null;
    return (products ?? [])
      .filter(p => filters.category === 'all' || p.category_id === filters.category)
      .filter(p => {
        const range = priceRange(p);
        return (min === null || range.max >= min) && (max === null || range.min <= max);
      })
      .filter(p => maxMoq === null || getMoq(p) <= maxMoq)
      .filter(p => !filters.verifiedOnly || !!p.vendors?.is_approved)
      .filter(p => !filters.inStockOnly || p.stock_quantity > 0)
      .sort((a, b) => {
        if (sortBy === 'price-low') return priceRange(a).min - priceRange(b).min;
        if (sortBy === 'price-high') return priceRange(b).min - priceRange(a).min;
        if (sortBy === 'moq-low') return getMoq(a) - getMoq(b);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [products, filters, sortBy]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageItems = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const { ready: flyersReady, forPlacement } = useFlyers();
  const feedBanners = forPlacement('feed_banner');
  const feedCards = forPlacement('feed_card');
  const photos = useMemo(() => (products ?? []).map(p => p.image_url).filter((u): u is string => !!u), [products]);
  const activeFilterCount =
    (filters.category !== 'all' ? 1 : 0) + (filters.minPrice || filters.maxPrice ? 1 : 0) + (filters.maxMoq ? 1 : 0) +
    (filters.verifiedOnly ? 1 : 0) + (filters.inStockOnly ? 1 : 0);

  const setTab = (next: 'products' | 'suppliers') => {
    const params = new URLSearchParams(searchParams);
    if (next === 'suppliers') params.set('tab', 'suppliers'); else params.delete('tab');
    setSearchParams(params);
  };

  const openInquiry = (p: NonNullable<typeof products>[number]) => {
    if (!p.vendors) { toast.error('This product has no supplier to contact'); return; }
    setInquiryTarget({
      vendorId: p.vendors.id, vendorUserId: p.vendors.user_id, vendorName: p.vendors.store_name,
      productId: p.id, productName: p.name, moq: getMoq(p), unit: (p.unit || 'Piece').trim(),
    });
  };

  const openChat = (vendorUserId: string | undefined, productId: string) => {
    if (!user) { toast.error('Please log in to chat with the seller'); navigate('/users-login'); return; }
    if (!vendorUserId) return;
    if (vendorUserId === user.id) { toast.info('This is your own product'); return; }
    navigate(`/messages?vendor=${vendorUserId}&product=${productId}`);
  };

  const filterPanel = (
    <FilterPanel filters={filters} setFilters={setFilters} categories={categories ?? []} onReset={() => setFilters(DEFAULT_FILTERS)} activeCount={activeFilterCount} />
  );

  return (
    <Layout>
      <div className="container max-w-[1440px] py-5 sm:py-8">
        <div className="mb-4 border-b border-border pb-4">
          <p className="text-xs font-semibold uppercase text-primary">MarketHub marketplace</p>
          <h1 className="mt-1 font-heading text-2xl font-bold sm:text-3xl">
            {search ? `Results for "${search}"` : tab === 'suppliers' ? 'Suppliers' : 'Products'}
          </h1>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-6 border-b border-border text-sm" role="tablist">
          {([['products', 'Product List'], ['suppliers', 'Supplier List']] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 pb-2.5 font-medium transition-colors ${tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={`grid gap-5 ${tab === 'products' ? 'lg:grid-cols-[230px_minmax(0,1fr)]' : ''}`}>
          {tab === 'products' && (
            <aside className="hidden lg:block">
              <div className="sticky top-32 max-h-[calc(100vh-9rem)] overflow-y-auto border-r border-border pr-4">{filterPanel}</div>
            </aside>
          )}

          <section className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={tab === 'products' ? 'Search products' : 'Search suppliers'}
                  aria-label="Search"
                  className="h-10 rounded-full bg-card pl-10 pr-10"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {!!search && (
                  <button type="button" onClick={() => { setSearch(''); const p = new URLSearchParams(searchParams); p.delete('search'); setSearchParams(p); }} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {tab === 'products' && (
                <>
                  <Button variant="outline" className="h-10 gap-2 lg:hidden" onClick={() => setFiltersOpen(true)}>
                    <SlidersHorizontal className="h-4 w-4" /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
                  </Button>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="h-10 w-[180px] bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest first</SelectItem>
                      <SelectItem value="price-low">Price: low to high</SelectItem>
                      <SelectItem value="price-high">Price: high to low</SelectItem>
                      <SelectItem value="moq-low">MOQ: low to high</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label="View">
                    <button onClick={() => setView('list')} aria-label="List view" aria-pressed={view === 'list'} className={`p-2.5 ${view === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card'}`}><List className="h-4 w-4" /></button>
                    <button onClick={() => setView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'} className={`p-2.5 ${view === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-card'}`}><LayoutGrid className="h-4 w-4" /></button>
                  </div>
                </>
              )}
            </div>

            {tab === 'products' ? (
              <>
                <p className="mb-3 text-sm text-muted-foreground">{isLoading ? 'Loading products...' : `${filtered.length} product${filtered.length === 1 ? '' : 's'}`}</p>

                {isLoading ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 sm:gap-3">
                    {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-secondary" />)}
                  </div>
                ) : pageItems.length ? (
                  view === 'grid' ? (
                    <div className="grid grid-flow-dense grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 sm:gap-3">
                      {pageItems.flatMap((product, i) => {
                        const cells: React.ReactNode[] = [<ProductCard key={product.id} {...product} />];
                        // Flyers inside the listing: one card-sized after the 6th product,
                        // one full-width banner after the 12th.
                        if (i === 5 && flyersReady) {
                          cells.push(feedCards.length
                            ? <div key="fc" className="min-h-[260px]"><ImageFlyerFill flyer={feedCards[(current - 1) % feedCards.length]} /></div>
                            : <FlyerCard key="fc" flyer={FLYERS.rfq} images={pickImages(photos, current * 3, 2)} />);
                        }
                        if (i === 11 && flyersReady) {
                          cells.push(feedBanners.length
                            ? <ImageFlyerBanner key="fb" className="col-span-full" flyer={feedBanners[(current - 1) % feedBanners.length]} />
                            : <FlyerBanner key="fb" className="col-span-full" flyer={FLYERS.sell} images={pickImages(photos, current * 3 + 4, 3)} />);
                        }
                        return cells;
                      })}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pageItems.map(product => (
                        <article key={product.id} className="flex gap-3 rounded-lg border border-border bg-card p-3 sm:gap-4 sm:p-4">
                          <Link to={`/product/${product.slug}`} className="h-28 w-28 shrink-0 overflow-hidden rounded-md bg-white sm:h-36 sm:w-36">
                            <img src={product.image_url || '/placeholder.svg'} alt={product.name} className="h-full w-full object-contain p-1" loading="lazy" />
                          </Link>
                          <div className="min-w-0 flex-1">
                            <Link to={`/product/${product.slug}`} className="line-clamp-2 text-sm font-medium hover:text-primary sm:text-base">{product.name}</Link>
                            <ProductPrice product={product} className="mt-1" />
                            <p className="text-xs text-muted-foreground">{formatMoq(product)}</p>
                            {product.description && <p className="mt-1.5 hidden line-clamp-2 text-xs text-muted-foreground sm:block">{product.description}</p>}
                            <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                              {product.vendors?.is_approved && <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-label="Verified supplier" />}
                              <span className="truncate">{product.vendors?.store_name || product.brand || 'MarketHub seller'}</span>
                            </p>
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              <Button size="sm" className="gap-1.5" onClick={() => openInquiry(product)}><Send className="h-3.5 w-3.5" /> Send inquiry</Button>
                              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openChat(product.vendors?.user_id, product.id)}><MessageSquare className="h-3.5 w-3.5" /> Chat</Button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="border-y border-border py-16 text-center">
                    <p className="font-semibold">No products found</p>
                    <p className="mt-1 text-sm text-muted-foreground">Try another search or clear some filters.</p>
                    <Link to="/rfq/new"><Button variant="outline" size="sm" className="mt-4">Post a request instead</Button></Link>
                  </div>
                )}

                {pageCount > 1 && (
                  <Pager page={current} pageCount={pageCount} onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                )}
              </>
            ) : suppliersLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-secondary" />)}</div>
            ) : suppliers?.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {suppliers.map(s => <SupplierCard key={s.id} supplier={s} layout="row" />)}
              </div>
            ) : (
              <div className="border-y border-border py-16 text-center">
                <p className="font-semibold">No suppliers found</p>
                <p className="mt-1 text-sm text-muted-foreground">Try a different name.</p>
              </div>
            )}
          </section>
        </div>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="left" className="w-[85vw] overflow-y-auto sm:w-80">
          <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
          <div className="mt-4">{filterPanel}</div>
          <Button className="mt-6 w-full" onClick={() => setFiltersOpen(false)}>Show {filtered.length} result{filtered.length === 1 ? '' : 's'}</Button>
        </SheetContent>
      </Sheet>

      <InquiryDialog open={!!inquiryTarget} onOpenChange={open => { if (!open) setInquiryTarget(null); }} target={inquiryTarget} />
    </Layout>
  );
}

function FilterPanel({ filters, setFilters, categories, onReset, activeCount }: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  categories: { id: string; name: string }[];
  onReset: () => void;
  activeCount: number;
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-semibold">Filters</h2>
        {activeCount > 0 && <button onClick={onReset} className="text-xs text-primary hover:underline">Clear all</button>}
      </div>

      <div>
        <h3 className="mb-2 font-medium">Category</h3>
        <div className="max-h-56 overflow-y-auto">
          {[{ id: 'all', name: 'All categories' }, ...categories].map(category => (
            <button
              type="button"
              key={category.id}
              onClick={() => set('category', category.id)}
              className={`mb-0.5 block w-full rounded-md px-2.5 py-1.5 text-left ${filters.category === category.id ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-medium">Price (naira)</h3>
        <div className="flex items-center gap-2">
          <Input type="number" min={0} placeholder="Min" aria-label="Minimum price" value={filters.minPrice} onChange={e => set('minPrice', e.target.value)} className="h-9" />
          <span className="text-muted-foreground">-</span>
          <Input type="number" min={0} placeholder="Max" aria-label="Maximum price" value={filters.maxPrice} onChange={e => set('maxPrice', e.target.value)} className="h-9" />
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-medium">Min. order (MOQ)</h3>
        <Input type="number" min={1} placeholder="Up to..." aria-label="Maximum MOQ" value={filters.maxMoq} onChange={e => set('maxMoq', e.target.value)} className="h-9" />
        <p className="mt-1 text-xs text-muted-foreground">Show products you can order at this quantity or below.</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox id="f-verified" checked={filters.verifiedOnly} onCheckedChange={v => set('verifiedOnly', v === true)} />
          <Label htmlFor="f-verified" className="cursor-pointer font-normal">Verified suppliers only</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="f-stock" checked={filters.inStockOnly} onCheckedChange={v => set('inStockOnly', v === true)} />
          <Label htmlFor="f-stock" className="cursor-pointer font-normal">In stock only</Label>
        </div>
      </div>
    </div>
  );
}

function Pager({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1)
    .filter(p => p === 1 || p === pageCount || Math.abs(p - page) <= 1);
  return (
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
  );
}
