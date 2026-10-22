import { useEffect, useMemo, useRef, useState } from 'react';
import { trackSearch } from '@/lib/tracking';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BadgeCheck, LayoutGrid, List, MessageSquare, Search, Send, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import ProductCard, { ProductPrice } from '@/components/ProductCard';
import SupplierCard from '@/components/SupplierCard';
import InquiryDialog, { type InquiryDialogTarget } from '@/components/InquiryDialog';
import { useCategories, useSuppliers, type ProductListRow } from '@/hooks/useProducts';
import { usePagedProducts, type ProductPageParams } from '@/hooks/usePagedProducts';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import ProductPager from '@/components/ProductPager';
import { formatProductCount, type ProductSort } from '@/lib/productSearch';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatMoq, getMoq } from '@/lib/pricing';
import { FlyerCard, pickImages } from '@/components/flyers/Flyers';
import { FLYERS } from '@/lib/flyers';
import { useFlyers } from '@/hooks/useFlyers';
import { ImageFlyerBanner, ImageFlyerFill } from '@/components/flyers/ImageFlyers';
import { BrandFlyerBanner, BrandFlyerFill } from '@/components/flyers/BrandFlyerImage';
import { BRAND_FLYERS } from '@/lib/brandFlyers';

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

  // The database does the searching, filtering, sorting and paging: only this page's 24 products are downloaded.
  // The search waits until typing pauses, so it does not fire on every key.
  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const pageParams: ProductPageParams = useMemo(() => ({
    page,
    search: debouncedSearch || undefined,
    categoryId: filters.category !== 'all' ? filters.category : undefined,
    minPrice: filters.minPrice ? Number(filters.minPrice) : null,
    maxPrice: filters.maxPrice ? Number(filters.maxPrice) : null,
    maxMoq: filters.maxMoq ? Number(filters.maxMoq) : null,
    verifiedOnly: filters.verifiedOnly,
    inStockOnly: filters.inStockOnly,
    sort: sortBy as ProductSort,
    withDescription: true,
  }), [page, debouncedSearch, filters, sortBy]);
  const { data: pageData, isLoading, isPlaceholderData } = usePagedProducts(pageParams, tab === 'products');
  const pageItems = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const pageCount = pageData?.pageCount ?? 1;
  const current = Math.min(page, pageCount);

  // Record each search once, with how many products it found, so the admin can see searches that came up empty.
  const trackedSearch = useRef('');
  useEffect(() => {
    if (!searchFromUrl || isLoading || isPlaceholderData || !pageData || debouncedSearch !== searchFromUrl) return;
    if (trackedSearch.current === searchFromUrl) return;
    trackedSearch.current = searchFromUrl;
    trackSearch(searchFromUrl, pageData.total);
  }, [searchFromUrl, debouncedSearch, isLoading, isPlaceholderData, pageData]);
  const { data: categories } = useCategories();
  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers({ search: search || undefined, limit: 48 });

  const { ready: flyersReady, forPlacement } = useFlyers();
  const feedBanners = forPlacement('feed_banner');
  const feedCards = forPlacement('feed_card');
  const photos = useMemo(() => pageItems.map(p => p.image_url).filter((u): u is string => !!u), [pageItems]);
  const activeFilterCount =
    (filters.category !== 'all' ? 1 : 0) + (filters.minPrice || filters.maxPrice ? 1 : 0) + (filters.maxMoq ? 1 : 0) +
    (filters.verifiedOnly ? 1 : 0) + (filters.inStockOnly ? 1 : 0);

  const setTab = (next: 'products' | 'suppliers') => {
    const params = new URLSearchParams(searchParams);
    if (next === 'suppliers') params.set('tab', 'suppliers'); else params.delete('tab');
    setSearchParams(params);
  };

  const openInquiry = (p: ProductListRow) => {
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
          <p className="text-xs font-semibold uppercase text-primary">IT Hub Africa marketplace</p>
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
                <p className="mb-3 text-sm text-muted-foreground">{isLoading ? 'Loading products...' : `${formatProductCount(total)} product${total === 1 ? '' : 's'}`}</p>

                {isLoading ? (
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-3 xl:grid-cols-4 sm:gap-3">
                    {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse bg-secondary" />)}
                  </div>
                ) : pageItems.length ? (
                  view === 'grid' ? (
                    <div className="grid grid-flow-dense grid-cols-4 gap-1.5 sm:grid-cols-3 xl:grid-cols-4 sm:gap-3">
                      {pageItems.flatMap((product, i) => {
                        const cells: React.ReactNode[] = [<ProductCard key={product.id} {...product} />];
                        // Flyers inside the listing: one card-sized after the 6th product,
                        // one full-width banner after the 12th.
                        // The picture flyers are two columns wide and two rows tall on a phone, so the next
                        // products fill the space beside them (no empty gap). That needs at least 2 more products
                        // after it, otherwise it is left out.
                        const roomBesideFlyer = pageItems.length - (i + 1) >= 2;
                        if (i === 5 && flyersReady) {
                          if (feedCards.length) {
                            if (roomBesideFlyer) cells.push(<div key="fc" className="col-span-2 row-span-2 min-h-[260px] sm:col-span-1 sm:row-span-1"><ImageFlyerFill flyer={feedCards[(current - 1) % feedCards.length]} /></div>);
                          } else if (current % 2 === 1) {
                            if (roomBesideFlyer) cells.push(<div key="fc" className="col-span-2 row-span-2 min-h-[260px] sm:col-span-1 sm:row-span-1"><BrandFlyerFill flyer={BRAND_FLYERS.mysteryDeal} fit="contain" /></div>);
                          } else {
                            cells.push(<div key="fc" className="col-span-2 sm:col-span-1"><FlyerCard flyer={FLYERS.rfq} images={pickImages(photos, current * 3, 2)} /></div>);
                          }
                        }
                        if (i === 11 && flyersReady) {
                          cells.push(feedBanners.length
                            ? <ImageFlyerBanner key="fb" className="col-span-full" flyer={feedBanners[(current - 1) % feedBanners.length]} />
                            : <BrandFlyerBanner key="fb" className="col-span-full" flyer={current % 2 ? BRAND_FLYERS.seamlessOlive : BRAND_FLYERS.seamlessPurple} />);
                        }
                        return cells;
                      })}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pageItems.map(product => (
                        <article key={product.id} className="flex gap-3 border border-border bg-card p-3 sm:gap-4 sm:p-4">
                          <Link to={`/product/${product.slug}`} className="h-28 w-28 shrink-0 overflow-hidden bg-white sm:h-36 sm:w-36">
                            <img src={product.image_url || '/placeholder.svg'} alt={product.name} className="h-full w-full object-contain p-1" loading="lazy" />
                          </Link>
                          <div className="min-w-0 flex-1">
                            <Link to={`/product/${product.slug}`} className="line-clamp-2 text-sm font-medium hover:text-primary sm:text-base">{product.name}</Link>
                            <ProductPrice product={product} className="mt-1" />
                            <p className="text-xs text-muted-foreground">{formatMoq(product)}</p>
                            {product.description && <p className="mt-1.5 hidden line-clamp-2 text-xs text-muted-foreground sm:block">{product.description}</p>}
                            <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                              {product.vendors?.is_approved && <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-label="Verified supplier" />}
                              <span className="truncate">{product.vendors?.store_name || product.brand || 'IT Hub Africa seller'}</span>
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

                <ProductPager
                  page={current} pageCount={pageCount} capped={pageData?.capped}
                  onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                />
              </>
            ) : suppliersLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse bg-secondary" />)}</div>
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
          <Button className="mt-6 w-full" onClick={() => setFiltersOpen(false)}>Show {formatProductCount(total)} result{total === 1 ? '' : 's'}</Button>
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
