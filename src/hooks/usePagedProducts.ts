import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CACHE } from '@/lib/cachePolicy';
import { LIST_COLUMNS, LIST_JOINS, useCategories, type ProductListRow } from '@/hooks/useProducts';
import {
  MAX_PRODUCT_PAGES, PRODUCT_PAGE_SIZE, cleanLike, pageCountFor, sortKeys, toPrefixQuery, type ProductSort,
} from '@/lib/productSearch';

// One page of products from the database, filtered, searched and sorted THERE (not in the browser).
// Needs the 20261021090000_product_search_scale migration (is_public, price_min/price_max, search_vector).

export interface ProductPageParams {
  page: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  categorySlug?: string;
  vendorId?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  maxMoq?: number | null;
  verifiedOnly?: boolean;
  inStockOnly?: boolean;
  sort?: ProductSort;
  withDescription?: boolean;
}

export interface ProductPage {
  items: ProductListRow[];
  /** Exact for small result sets, the database's estimate for large ones. */
  total: number;
  pageCount: number;
  /** True when there are more results than the pages a visitor can reach. */
  capped: boolean;
}

type Mode = 'none' | 'words' | 'inside';

async function fetchProductPage(p: ProductPageParams): Promise<ProductPage> {
  const size = p.pageSize ?? PRODUCT_PAGE_SIZE;
  const page = Math.min(Math.max(1, p.page), MAX_PRODUCT_PAGES);
  const from = (page - 1) * size;
  const to = from + size - 1;

  // The supplier join only becomes an inner join when "verified suppliers only" is on.
  const joins = p.verifiedOnly ? LIST_JOINS.replace('vendors(', 'vendors!inner(') : LIST_JOINS;
  const columns = `${LIST_COLUMNS}${p.withDescription ? ', description' : ''}, ${joins}`;
  const term = (p.search ?? '').trim();

  const build = (mode: Mode) => {
    // The new columns are not in the generated Supabase types yet, so the builder is untyped here.
    let q: any = (supabase as any).from('products').select(columns, { count: 'estimated' }).eq('is_public', true);
    if (p.vendorId) q = q.eq('vendor_id', p.vendorId);
    if (p.categoryId) q = q.eq('category_id', p.categoryId);
    if (p.minPrice != null) q = q.gte('price_max', p.minPrice);
    if (p.maxPrice != null) q = q.lte('price_min', p.maxPrice);
    if (p.maxMoq != null) q = q.lte('moq', p.maxMoq);
    if (p.inStockOnly) q = q.gt('stock_quantity', 0);
    if (p.verifiedOnly) q = q.eq('vendors.is_approved', true);
    if (mode === 'words') q = q.textSearch('search_vector', toPrefixQuery(term), { config: 'simple' });
    if (mode === 'inside') q = q.ilike('name', `%${cleanLike(term)}%`);
    for (const key of sortKeys(p.sort)) q = q.order(key.column, { ascending: key.ascending });
    return q.range(from, to);
  };

  const wordQuery = term ? toPrefixQuery(term) : null;
  let res = await build(!term ? 'none' : wordQuery ? 'words' : 'inside');
  if (res.error) throw res.error;

  // Nothing started with those words: try matching inside words ("phone" inside "iPhone").
  if (term && wordQuery && page === 1 && !(res.data?.length) && cleanLike(term).length >= 2) {
    const retry = await build('inside');
    if (!retry.error && retry.data?.length) res = retry;
  }

  const items = (res.data ?? []) as ProductListRow[];
  const total = Math.max(res.count ?? 0, items.length ? from + items.length : 0);
  return { items, total, ...pageCountFor(total, size) };
}

export function usePagedProducts(params: ProductPageParams, enabled = true) {
  const { data: categories } = useCategories();
  const slugId = params.categorySlug ? categories?.find(c => c.slug === params.categorySlug)?.id : undefined;
  const waitingForCategories = !!params.categorySlug && !categories;
  const unknownCategory = !!params.categorySlug && !!categories && !slugId;
  const resolved: ProductPageParams = { ...params, categoryId: params.categoryId ?? slugId, categorySlug: undefined };

  const query = useQuery({
    queryKey: ['products-page', resolved],
    ...CACHE.products,
    enabled: enabled && !waitingForCategories && !unknownCategory,
    // While the next page loads, keep showing the current one instead of flashing empty.
    placeholderData: keepPreviousData,
    queryFn: () => fetchProductPage(resolved),
  });
  return { ...query, unknownCategory };
}
