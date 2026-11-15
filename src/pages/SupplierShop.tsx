import { useEffect, useState } from 'react';
import JsonLd from '@/components/seo/JsonLd';
import { shopOrganization } from '@/lib/seo/structuredData';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import ProductCard from '@/components/ProductCard';
import ProductPager from '@/components/ProductPager';
import { usePagedProducts } from '@/hooks/usePagedProducts';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import VerifiedSupplierBadge, { useSupplierTier } from '@/components/VerifiedSupplierBadge';
import { useCategories } from '@/hooks/useProducts';
import { MessageCircle, MapPin, Store, Search, X, MessageSquare, Heart, Images, Film, UserPlus, UserCheck, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useVendorPosts, useVendorFollowerCount, useIsFollowing, useToggleFollow } from '@/hooks/usePosts';
import { formatCompactNumber } from '@/lib/format';
import { toast } from 'sonner';
import CallButtons from '@/components/calls/CallButtons';
import { formatResponseTime, useVendorReputation } from '@/hooks/useVendorReputation';
import ShopSocialBanner from '@/components/ads/ShopSocialBanner';
import { useShopAdAttribution } from '@/components/ads/useAdAttribution';

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function SupplierShop() {
  const { vendorId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('view') === 'posts' ? 'posts' : 'products';

  const { data: vendor, isLoading } = useQuery({
    queryKey: ['shop-vendor', vendorId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('*').eq('id', vendorId).single();
      return data;
    },
    enabled: !!vendorId,
  });
  const { data: reputation } = useVendorReputation(vendor?.id);
  const { data: tier } = useSupplierTier(vendor?.id);
  useShopAdAttribution(searchParams.toString() ? `?${searchParams.toString()}` : '', !!vendor && user?.id !== vendor.user_id);

  // A shop can hold hundreds of thousands of products, so it loads one page at a time from the database.
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const debounced = useDebounced(search, 300);
  const { data: productPage } = usePagedProducts({ page, vendorId, search: debounced, categoryId: categoryId || undefined }, !!vendorId);
  // Category chips: only the categories this shop actually sells in.
  const { data: allCategories } = useCategories();
  const { data: shopCategoryIds } = useQuery({
    queryKey: ['shop-category-ids', vendorId],
    enabled: !!vendorId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('products').select('category_id').eq('vendor_id', vendorId!).eq('is_public', true).not('category_id', 'is', null).limit(1000);
      return Array.from(new Set((data ?? []).map((r: any) => r.category_id as string)));
    },
  });
  const shopCategories = (allCategories ?? []).filter(c => shopCategoryIds?.includes(c.id)).map(c => ({ id: c.id, name: c.name }));
  const products = productPage?.items ?? [];
  const productTotal = productPage?.total ?? 0;

  const { data: posts } = useVendorPosts(vendorId);
  const { data: followerCount } = useVendorFollowerCount(vendorId);
  const { data: isFollowing } = useIsFollowing(vendorId);
  const toggleFollow = useToggleFollow();

  if (isLoading) return <Layout><div className="container py-16 text-center"><p>Loading shop...</p></div></Layout>;
  if (!vendor) return <Layout><div className="container py-16 text-center"><h1 className="font-heading text-2xl font-bold">Shop not found</h1></div></Layout>;

  const whatsappNumber = (vendor.whatsapp_number || vendor.phone || '').replace(/[^0-9]/g, '');
  const isOwnShop = user?.id === vendor.user_id;

  const handleInAppChat = () => {
    if (!user) {
      toast.error('Please log in to chat with the seller');
      navigate('/users-login');
      return;
    }
    if (isOwnShop) {
      toast.info("This is your own shop");
      return;
    }
    navigate(`/messages?vendor=${vendor.user_id}`);
  };

  const handleFollow = () => {
    if (!user) {
      toast.error('Sign in to connect with this shop');
      navigate('/users-login');
      return;
    }
    if (isOwnShop) {
      toast.info("This is your own shop");
      return;
    }
    toggleFollow.mutate({ vendorId: vendor.id, isFollowing: !!isFollowing });
  };

  const tabBtn = (active: boolean) =>
    `flex-1 rounded-full py-2 text-sm font-medium transition-colors ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`;
  const filtering = !!search.trim() || !!categoryId;
  const featured = !filtering && page === 1 ? products.slice(0, 8) : [];
  const reply = formatResponseTime(reputation?.average_response_minutes);
  const rated = reputation?.average_rating != null && reputation.review_count > 0;
  const stats = [
    { label: 'Shoppers', value: formatCompactNumber(followerCount ?? 0) },
    { label: 'Products', value: productTotal.toLocaleString('en-NG') },
    ...(rated ? [{ label: `${reputation!.review_count} review${reputation!.review_count === 1 ? '' : 's'}`, value: reputation!.average_rating!.toFixed(1), star: true }] : []),
    ...(reply ? [{ label: 'Reply time', value: reply }] : []),
  ];

  return (
    <Layout>
      {/* Cover + identity */}
      <div className="bg-primary">
        <div className="h-20 sm:h-28" aria-hidden />
      </div>
      <div className="container px-4">
        <div className="-mt-10 rounded-2xl border border-border bg-card p-4 shadow-sm sm:-mt-14 sm:p-5">
          <div className="flex items-start gap-3">
            {vendor.logo_url ? (
              <img src={vendor.logo_url} alt={vendor.store_name} className="-mt-9 h-16 w-16 shrink-0 rounded-2xl border-4 border-card bg-card object-cover sm:-mt-12 sm:h-20 sm:w-20" />
            ) : (
              <div className="-mt-9 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-4 border-card bg-secondary sm:-mt-12 sm:h-20 sm:w-20">
                <Store className="h-7 w-7 text-primary" />
              </div>
            )}
            <div className="min-w-0 flex-1 pt-1">
              <h1 className="font-heading text-lg font-bold leading-tight break-words sm:text-2xl">{vendor.store_name}</h1>
              {vendor.is_approved && tier && tier !== 'free' && <div className="mt-1"><VerifiedSupplierBadge prominent tier={tier} /></div>}
            </div>
          </div>
          {vendor.store_description && <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{vendor.store_description}</p>}
          {vendor.address && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" /><span>{vendor.address}</span></p>
          )}

          <dl className="mt-4 grid divide-x divide-border rounded-xl bg-secondary py-2.5" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
            {stats.map(st => (
              <div key={st.label} className="px-2 text-center">
                <dd className="flex items-center justify-center gap-1 text-sm font-bold text-foreground">
                  {'star' in st && st.star && <Star className="h-3.5 w-3.5 fill-current text-amber-500" />}{st.value}
                </dd>
                <dt className="text-[11px] text-muted-foreground">{st.label}</dt>
              </div>
            ))}
          </dl>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:items-center">
            {!isOwnShop && (
              <Button onClick={handleFollow} disabled={toggleFollow.isPending} variant={isFollowing ? 'outline' : 'default'} size="sm" className="flex-1 gap-1.5 text-xs">
                {isFollowing ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                {isFollowing ? 'Connected' : 'Connect'}
              </Button>
            )}
            <Button onClick={handleInAppChat} variant="outline" size="sm" className={`flex-1 gap-1.5 text-xs ${isOwnShop ? 'col-span-2 sm:col-span-1' : ''}`}>
              <MessageSquare className="h-3.5 w-3.5" /> Message
            </Button>
            <CallButtons layout="labelled" peerUserId={vendor.user_id} peerName={vendor.store_name} peerIsVendor />
            {whatsappNumber && (
              <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="col-span-2 sm:col-span-1 sm:flex-1">
                <Button size="sm" className="w-full gap-1.5 text-xs"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</Button>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Sticky: search + switch */}
      <div className="sticky top-0 z-10 mt-4 border-b border-border bg-background/95 backdrop-blur">
        <div className="container space-y-2 px-4 py-2.5">
          {activeTab === 'products' && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder={`Search in ${vendor.store_name}`}
                aria-label="Search this shop"
                className="h-10 w-full rounded-xl border border-border bg-secondary pl-9 pr-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              {search && (
                <button onClick={() => { setSearch(''); setPage(1); }} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <div className="flex gap-1 rounded-full bg-secondary p-1">
            <button onClick={() => setSearchParams({})} className={tabBtn(activeTab === 'products')}>Products</button>
            <button onClick={() => setSearchParams({ view: 'posts' })} className={tabBtn(activeTab === 'posts')}>Videos &amp; posts ({posts?.length || 0})</button>
          </div>
        </div>
      </div>

      <div className="container px-4 py-5">
        {activeTab === 'products' ? (
          <>
            {shopCategories.length > 1 && (
              <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {[{ id: '', name: 'All' }, ...shopCategories].map(c => (
                  <button
                    key={c.id || 'all'}
                    onClick={() => { setCategoryId(c.id); setPage(1); }}
                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      categoryId === c.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'
                    }`}
                  >{c.name}</button>
                ))}
              </div>
            )}

            {featured.length > 3 && (
              <section className="mb-6">
                <h2 className="mb-2 font-heading text-base font-bold">New in this shop</h2>
                <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
                  {featured.map(p => (
                    <div key={p.id} className="w-40 shrink-0 snap-start sm:w-48">
                      <ProductCard id={p.id} name={p.name} slug={p.slug} price={p.price} compare_at_price={p.compare_at_price} image_url={p.image_url} thumb_url={p.thumb_url} badge={p.badge} brand={p.brand} moq={p.moq} unit={p.unit} price_tiers={p.price_tiers} bnpl_eligible={p.bnpl_eligible} is_preorder={p.is_preorder} preorder_approved={p.preorder_approved} preorder_release_date={p.preorder_release_date} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {products.length ? (
              <>
                <h2 className="mb-2 font-heading text-base font-bold">{filtering ? `${productTotal.toLocaleString('en-NG')} result${productTotal === 1 ? '' : 's'}` : 'All products'}</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {products.map(p => <ProductCard key={p.id} id={p.id} name={p.name} slug={p.slug} price={p.price} compare_at_price={p.compare_at_price} image_url={p.image_url} thumb_url={p.thumb_url} badge={p.badge} brand={p.brand} moq={p.moq} unit={p.unit} price_tiers={p.price_tiers} bnpl_eligible={p.bnpl_eligible} is_preorder={p.is_preorder} preorder_approved={p.preorder_approved} preorder_release_date={p.preorder_release_date} />)}
                </div>
                <ProductPager
                  page={Math.min(page, productPage?.pageCount ?? 1)} pageCount={productPage?.pageCount ?? 1} capped={productPage?.capped}
                  onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                />
              </>
            ) : (
              <p className="py-10 text-center text-muted-foreground">{filtering ? 'No products match. Try another word or category.' : 'This shop has no products yet.'}</p>
            )}
          </>
        ) : posts?.length ? (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 sm:gap-3">
            {posts.map((post) => (
              <button
                key={post.id}
                onClick={() => navigate(`/feed?post=${post.id}`)}
                className="relative aspect-[9/16] overflow-hidden rounded-xl bg-muted text-left transition-transform active:scale-[0.98]"
              >
                {post.thumbnail_url ? (
                  <img src={post.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    {post.media_type === 'images' ? <Images className="h-6 w-6" /> : <Film className="h-6 w-6" />}
                  </div>
                )}
                {post.media_type === 'tiktok' && <span className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white">TikTok</span>}
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/60 px-2 py-1 text-[11px] text-white">
                  <Heart className="h-3 w-3" /> {post.likes_count}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-muted-foreground">This shop hasn't posted any videos yet.</p>
        )}
      </div>
      <JsonLd id="shop" data={shopOrganization(vendor as any)} />
      <ShopSocialBanner vendorId={vendor.id} isOwnShop={isOwnShop} />
    </Layout>
  );
}
