import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/mediaProcessing';
import { makeThumbnail } from '@/lib/images';
import ProductPager from '@/components/ProductPager';
import { useManagedProducts } from '@/hooks/useManagedProducts';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatProductCount } from '@/lib/productSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { removeProducts, removeSummary } from '@/lib/removeProducts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { PreorderEditor, PreorderFields, buildPreorderPayload, emptyPreorder, type PreorderForm } from '@/components/seller/PreorderFields';
import SellerDisputes from '@/components/seller/SellerDisputes';
import { PriceEditor } from '@/components/seller/PriceEditor';
import { ProductEditor } from '@/components/seller/ProductEditor';
import { functionErrorMessage } from '@/lib/functionError';
import { BANKS, BANK_PLACEHOLDER, isValidAccountNumber } from '@/lib/banks';
import { formatNaira } from '@/lib/format';
import { useCategories } from '@/hooks/useProducts';
import { Package, ShoppingCart, DollarSign, Plus, LogOut, ArrowLeft, Trash2, Store, Upload, MessageCircle, AlertCircle, Clock, CheckCircle, CreditCard, LayoutDashboard, Film, Settings, ExternalLink, Pencil } from 'lucide-react';
import DashboardShell, { Panel, StatCard, WelcomeBanner, useTabParam, type DashNavItem } from '@/components/dashboard/DashboardShell';
import { BrandFlyerBanner } from '@/components/flyers/BrandFlyerImage';
import { BRAND_FLYERS } from '@/lib/brandFlyers';
import { useUnreadCount } from '@/hooks/useChat';
import VendorVideosTab from '@/components/dashboard/VendorVideosTab';
import VendorOrdersTab, { type VendorOrder } from '@/components/dashboard/VendorOrdersTab';
import SupplierAgreementPanel from '@/components/dashboard/SupplierAgreementPanel';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function SupplierDashboard() {
  const unreadCount = useUnreadCount();
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useTabParam('overview', ['overview', 'products', 'videos', 'orders', 'disputes', 'add-product', 'shop-settings']);
  const [preorderProduct, setPreorderProduct] = useState<any>(null);
  const [priceProduct, setPriceProduct] = useState<any>(null);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [photoFilter, setPhotoFilter] = useState<'all' | 'with' | 'without'>('all');
  const autoCompose = searchParams.get('compose') === '1';

  const { data: vendor, isLoading: vendorLoading } = useQuery({
    queryKey: ['vendor-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('*').eq('user_id', user!.id).maybeSingle();
      if (!data) return null;
      // Bank details and the verification document are kept in a private table.
      const { data: priv } = await supabase.from('vendor_private').select('*').eq('vendor_id', data.id).maybeSingle();
      return {
        ...data,
        bank_name: priv?.bank_name ?? null,
        bank_account_number: priv?.bank_account_number ?? null,
        bank_account_name: priv?.bank_account_name ?? null,
        verification_document_url: priv?.verification_document_path ?? null,
      } as typeof data & {
        bank_name: string | null;
        bank_account_number: string | null;
        bank_account_name: string | null;
        verification_document_url: string | null;
      };
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!loading && !user) navigate('/suppliers-login');
  }, [user, loading, navigate]);

  const isApproved = vendor?.is_approved === true;

  // Automatic Paystack setup: once approved and bank details exist, create the
  // subaccount without anyone clicking anything (covers a failed first attempt).
  const autoTried = useRef(false);
  useEffect(() => {
    if (!vendor || !isApproved || vendor.paystack_subaccount_code || autoTried.current) return;
    if (!vendor.bank_name || !vendor.bank_account_number || !vendor.bank_account_name) return;
    autoTried.current = true;
    supabase.functions.invoke('create-subaccount', { body: { vendor_id: vendor.id } }).then(async ({ data, error }) => {
      if (error || data?.error) console.error('Auto subaccount setup failed:', await functionErrorMessage(error, data));
      else queryClient.invalidateQueries({ queryKey: ['vendor-profile'] });
    });
  }, [vendor, isApproved, queryClient]);
  const hasPaystack = !!vendor?.paystack_subaccount_code;

  // One page of this supplier's products at a time, searched and paged by the database.
  const [productPage, setProductPage] = useState(1);
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productSearch.trim(), 350);
  const { data: productData, isPlaceholderData: productsRefreshing } = useManagedProducts({
    scope: 'vendor', vendorId: vendor?.id, page: productPage, search: debouncedProductSearch, photo: photoFilter, enabled: !!vendor?.id && isApproved,
  });
  const products = productData?.items;

  // Tick products to remove several at once. A dialog asks first, and the result is reported honestly:
  // products buyers have ordered cannot be erased (they are part of the order history), so they are hidden instead.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [removing, setRemoving] = useState(false);
  useEffect(() => { setSelected(new Set()); }, [productPage, debouncedProductSearch, photoFilter]);
  const confirmRemove = async () => {
    if (!confirmIds?.length) return;
    setRemoving(true);
    try {
      const result = await removeProducts(confirmIds);
      toast.success(removeSummary(result));
      // Removing everything on the last page would leave an empty page behind: step back one.
      if (productPage > 1 && products && confirmIds.length >= products.length) setProductPage(productPage - 1);
      setSelected(new Set());
      setConfirmIds(null);
      queryClient.invalidateQueries({ queryKey: ['vendor-products'] });
    } catch (e: any) {
      toast.error(e?.message || 'Could not remove the products. Please try again.');
    } finally {
      setRemoving(false);
    }
  };
  const pageIds = (products ?? []).map(p => p.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));
  const someOnPageSelected = pageIds.some(id => selected.has(id));
  const toggleOne = (id: string, on: boolean) => setSelected(prev => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });
  const toggleAllOnPage = (on: boolean) => setSelected(on ? new Set(pageIds) : new Set());

  // The supplier's total for the overview card (a search in the list must not change it).
  const { data: productCount } = useQuery({
    queryKey: ['vendor-products', 'count', vendor?.id],
    queryFn: async () => {
      const { count } = await supabase.from('products').select('id', { count: 'estimated', head: true }).eq('vendor_id', vendor!.id);
      return count ?? 0;
    },
    enabled: !!vendor?.id && isApproved,
  });

  // The short list used to tag a product in a video post: the 100 newest (a post can also be made without one).
  const { data: pickableProducts } = useQuery({
    queryKey: ['vendor-products-pick', vendor?.id],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name').eq('vendor_id', vendor!.id).order('created_at', { ascending: false }).limit(100);
      return data || [];
    },
    enabled: !!vendor?.id && isApproved && activeTab === 'videos',
  });

  const { data: orders } = useQuery({
    queryKey: ['vendor-orders', vendor?.id],
    queryFn: async () => {
      // Server function: only this supplier's own items, and the delivery address only once paid.
      const { data, error } = await (supabase as any).rpc('vendor_order_list');
      if (error) throw error;
      return (data ?? []) as VendorOrder[];
    },
    enabled: !!vendor?.id && isApproved,
  });

  const { data: categories } = useCategories();

  const stats = {
    products: productCount ?? 0,
    orders: orders?.length || 0,
    revenue: orders?.filter(o => o.ship_status && o.ship_status !== 'refunded').reduce((s, o) => s + Number(o.gross), 0) || 0,
  };

  if (loading || vendorLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          <p className="text-muted-foreground text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="flex items-center justify-center min-h-screen flex-col gap-4 bg-background">
        <Store className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">No supplier profile found.</p>
        <Link to="/supplier-signup"><Button>Create Supplier Account</Button></Link>
      </div>
    );
  }

  const navItems: DashNavItem[] = isApproved
    ? [
        { key: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Store' },
        { key: 'products', label: 'My products', icon: Package, group: 'Store' },
        { key: 'add-product', label: 'Add product', icon: Plus, group: 'Store' },
        { key: 'orders', label: 'Orders', icon: ShoppingCart, group: 'Sales' },
        { key: 'disputes', label: 'Disputes', icon: AlertCircle, group: 'Sales' },
        { key: 'videos', label: 'Videos', icon: Film, group: 'Grow' },
        { key: 'shop-settings', label: 'Shop settings', icon: Settings, group: 'Account' },
      ]
    : [{ key: 'shop-settings', label: 'Shop settings', icon: Settings, group: 'Account' }];

  const drawerActions = isApproved ? (
    <>
      <Link to={`/shop/${vendor.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white">
        <ExternalLink className="h-[18px] w-[18px]" /> View my shop
      </Link>
      <Link to="/supplier-chat" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white">
        <MessageCircle className="h-[18px] w-[18px]" />
        <span className="flex-1">Customer chat</span>
        {unreadCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">{unreadCount}</span>}
      </Link>
    </>
  ) : undefined;

  const notice = (
    <>
        <SupplierAgreementPanel />
        {/* Pending Verification Banner */}
        {!isApproved && (
          <div className="bg-accent/10 border border-accent/30 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-lg mb-1">Account Pending Verification</h2>
                <p className="text-sm text-muted-foreground mb-3">
                  Your account is under review. Once your documents are verified and approved by the admin, 
                  your dashboard will be fully activated with product management, orders, and payment features.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    {vendor.verification_document_url
                      ? <CheckCircle className="w-4 h-4 text-primary" />
                      : <AlertCircle className="w-4 h-4 text-destructive" />}
                    <span>Verification document {vendor.verification_document_url ? 'uploaded' : 'not uploaded'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {vendor.bank_name
                      ? <CheckCircle className="w-4 h-4 text-primary" />
                      : <AlertCircle className="w-4 h-4 text-destructive" />}
                    <span>Bank details {vendor.bank_name ? 'provided' : 'missing'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-accent" />
                    <span>Admin approval pending</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-accent" />
                    <span>Paystack subaccount pending</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Approved but no Paystack */}
        {isApproved && !hasPaystack && (
          <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-6 flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-accent shrink-0" />
            <div>
              <p className="font-medium text-sm">{vendor.bank_name ? 'Payment account being set up' : 'Add your bank details to get paid'}</p>
              <p className="text-xs text-muted-foreground">{vendor.bank_name
                ? 'Your payment account is being configured automatically. Refresh in a moment; if it stays pending, check your bank details in Shop settings.'
                : 'Go to Shop settings and add your bank details. Your payment account is created automatically as soon as you save them.'}</p>
            </div>
          </div>
        )}

    </>
  );

  return (
    <DashboardShell
      panelLabel="Seller centre"
      title={vendor.store_name}
      subtitle={isApproved ? 'Approved seller' : 'Pending approval'}
      items={navItems}
      active={isApproved ? activeTab : 'shop-settings'}
      onSelect={setActiveTab}
      onSignOut={() => { signOut(); navigate('/'); }}
      drawerActions={drawerActions}
      notice={notice}
    >
        {/* Only show tabs/features if approved */}
        {isApproved ? (
          <>
            {activeTab === 'overview' && (
              <div className="space-y-5">
                <WelcomeBanner title={`Welcome back, ${vendor.store_name}`} text="Manage your catalogue, orders and videos from one place.">
                  <Button size="sm" variant="secondary" onClick={() => setActiveTab('add-product')}><Plus className="mr-1.5 h-4 w-4" />Add product</Button>
                  <Button size="sm" variant="secondary" asChild><Link to={`/shop/${vendor.id}`}>View my shop</Link></Button>
                </WelcomeBanner>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <StatCard icon={<Package />} label="Products" value={String(stats.products)} />
                  <StatCard icon={<ShoppingCart />} tone="accent" label="Orders" value={String(stats.orders)} />
                  <StatCard icon={<DollarSign />} tone="sky" label="Revenue" value={formatNaira(stats.revenue)} />
                </div>

                {hasPaystack && (
                  <Panel title="Payment account">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between gap-3"><span className="text-muted-foreground">Paystack subaccount</span><span className="truncate font-mono text-xs">{vendor.paystack_subaccount_code}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-muted-foreground">Bank</span><span>{vendor.bank_name} (***{vendor.bank_account_number?.slice(-4)})</span></div>
                      <div className="flex justify-between gap-3"><span className="text-muted-foreground">Status</span><span className="font-medium text-primary">Active</span></div>
                    </div>
                  </Panel>
                )}

                <BrandFlyerBanner flyer={BRAND_FLYERS.seamlessOlive} />
              </div>
            )}

            {activeTab === 'products' && (
              <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading font-bold">My products{productData ? ` (${formatProductCount(productData.total)})` : ''}</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={photoFilter} onValueChange={v => { setPhotoFilter(v as 'all' | 'with' | 'without'); setProductPage(1); }}>
                    <SelectTrigger className="w-44" aria-label="Filter products by photo"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All products</SelectItem>
                      <SelectItem value="with">With photos</SelectItem>
                      <SelectItem value="without">Without photos</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={productSearch}
                    onChange={e => { setProductSearch(e.target.value); setProductPage(1); }}
                    placeholder="Search my products"
                    className="max-w-xs"
                    aria-label="Search my products"
                  />
                </div>
              </div>
              {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm">
                  <span className="font-medium">{selected.size} selected</span>
                  <Button size="sm" variant="destructive" className="h-8" onClick={() => setConfirmIds(Array.from(selected))}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete selected
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected(new Set())}>Clear</Button>
                </div>
              )}
              <div className={`bg-card rounded-xl border border-border overflow-hidden transition-opacity ${productsRefreshing ? 'opacity-60' : ''}`}>
                {products?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary">
                        <tr>
                          <th className="w-10 p-3">
                            <Checkbox aria-label="Select all products on this page" checked={allOnPageSelected ? true : someOnPageSelected ? 'indeterminate' : false} onCheckedChange={v => toggleAllOnPage(v === true)} />
                          </th>
                          <th className="text-left p-3 font-heading">Product</th>
                          <th className="text-left p-3 font-heading">Price</th>
                          <th className="text-left p-3 font-heading">Stock</th>
                          <th className="text-left p-3 font-heading">Pay later</th>
                          <th className="text-left p-3 font-heading">Preorder</th>
                          <th className="text-left p-3 font-heading">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map(p => (
                          <tr key={p.id} className="border-t border-border">
                            <td className="w-10 p-3">
                              <Checkbox aria-label={`Select ${p.name}`} checked={selected.has(p.id)} onCheckedChange={v => toggleOne(p.id, v === true)} />
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <img src={p.thumb_url || p.image_url || '/placeholder.svg'} alt="" loading="lazy" decoding="async" className={`w-8 h-8 rounded object-cover ${p.is_active === false ? 'opacity-50' : ''}`} />
                                <span className="font-medium line-clamp-1">{p.name}</span>
                                {!p.image_url && !p.thumb_url && (
                                  <button type="button" onClick={() => setEditProductId(p.id)}
                                    className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/20">
                                    No photo
                                  </button>
                                )}
                                {p.is_active === false && (
                                  <span className="flex shrink-0 items-center gap-1.5">
                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Hidden</span>
                                    <button type="button" className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                                      onClick={async () => {
                                        const { error } = await supabase.from('products').update({ is_active: true }).eq('id', p.id);
                                        if (error) toast.error(error.message);
                                        else { queryClient.invalidateQueries({ queryKey: ['vendor-products'] }); toast.success('Product is showing in your shop again'); }
                                      }}>Show</button>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1">
                                <span>{formatNaira(p.price)}</span>
                                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit price of ${p.name}`} onClick={() => setPriceProduct(p)}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                            <td className="p-3">{p.stock_quantity}</td>
                            <td className="p-3">
                              <Switch checked={!!(p as any).bnpl_eligible} disabled={!!(p as any).is_preorder} aria-label="Allow Pay later"
                                onCheckedChange={async (v) => {
                                  const { error } = await supabase.from('products').update({ bnpl_eligible: v }).eq('id', p.id);
                                  if (error) toast.error(error.message);
                                  else { queryClient.invalidateQueries({ queryKey: ['vendor-products'] }); toast.success(v ? 'Pay later enabled' : 'Pay later disabled'); }
                                }} />
                            </td>
                            <td className="p-3">
                              <div className="flex flex-col items-start gap-1">
                                {(p as any).is_preorder && (
                                  <span className="text-xs text-muted-foreground">
                                    {!(p as any).preorder_approved ? 'Awaiting approval'
                                      : (p as any).preorder_status === 'open' ? 'Open' : (p as any).preorder_status === 'ready' ? 'Ready' : 'Closed'}
                                  </span>
                                )}
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setPreorderProduct(p)}>
                                  {(p as any).is_preorder ? 'Manage' : 'Set up'}
                                </Button>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1">
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" aria-label={`Edit ${p.name}`} onClick={() => setEditProductId(p.id)}>
                                  <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={`Delete ${p.name}`}
                                  onClick={() => setConfirmIds([p.id])}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-muted-foreground mb-4">{debouncedProductSearch ? 'No products match that search.' : photoFilter === 'without' ? 'Every product has a photo.' : photoFilter === 'with' ? 'No products have photos yet.' : 'No products yet.'}</p>
                    {!debouncedProductSearch && photoFilter === 'all' && <Button onClick={() => setActiveTab('add-product')}><Plus className="w-4 h-4 mr-1" /> Add Product</Button>}
                  </div>
                )}
              </div>
              <ProductPager page={productPage} pageCount={productData?.pageCount ?? 1} onChange={setProductPage} />
              <AlertDialog open={!!confirmIds} onOpenChange={open => { if (!open && !removing) setConfirmIds(null); }}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{confirmIds?.length === 1 ? 'Delete this product?' : `Delete ${confirmIds?.length ?? 0} products?`}</AlertDialogTitle>
                    <AlertDialogDescription>
                      Deleted products are gone for good. A product that buyers have already ordered cannot be erased, because it is part of their
                      order history. It is hidden from your shop instead, and you can show it again later.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
                    <AlertDialogAction disabled={removing} onClick={e => { e.preventDefault(); confirmRemove(); }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {removing ? 'Deleting...' : 'Delete'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              </div>
            )}

            {activeTab === 'orders' && (
              <VendorOrdersTab
                orders={orders ?? []}
                onChanged={() => queryClient.invalidateQueries({ queryKey: ['vendor-orders'] })}
              />
            )}

            {activeTab === 'videos' && (
              <VendorVideosTab
                vendorId={vendor.id}
                products={pickableProducts ?? []}
                autoOpenComposer={autoCompose}
              />
            )}

            {activeTab === 'disputes' && <SellerDisputes vendorId={vendor.id} />}

            {activeTab === 'add-product' && (
              <SupplierAddProduct vendorId={vendor.id} categories={categories || []} onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['vendor-products'] });
                setActiveTab('products');
              }} />
            )}

            {editProductId && (
              <ProductEditor
                productId={editProductId}
                onClose={() => setEditProductId(null)}
                onSaved={() => { setEditProductId(null); queryClient.invalidateQueries({ queryKey: ['vendor-products'] }); }}
              />
            )}
            {priceProduct && (
              <PriceEditor
                product={priceProduct}
                onClose={() => setPriceProduct(null)}
                onSaved={() => { setPriceProduct(null); queryClient.invalidateQueries({ queryKey: ['vendor-products'] }); }}
              />
            )}
            {preorderProduct && (
              <PreorderEditor
                product={preorderProduct}
                onClose={() => setPreorderProduct(null)}
                onSaved={() => { setPreorderProduct(null); queryClient.invalidateQueries({ queryKey: ['vendor-products'] }); }}
              />
            )}

            {activeTab === 'shop-settings' && (
              <ShopSettings vendor={vendor} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['vendor-profile'] })} />
            )}
          </>
        ) : (
          /* Show limited settings for pending suppliers */
          <div className="mt-4">
            <ShopSettings vendor={vendor} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['vendor-profile'] })} />
          </div>
        )}
    </DashboardShell>
  );
}

function SupplierAddProduct({ vendorId, categories, onSuccess }: { vendorId: string; categories: any[]; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '', price: '', compare_at_price: '', category_id: '', brand: '', stock_quantity: '10',
    description: '', image_url: '', badge: '', moq: '1', unit: 'Piece', video_url: '', bnpl_eligible: false,
  });
  const [tiers, setTiers] = useState<{ min_qty: string; price: string }[]>([{ min_qty: '', price: '' }]);
  const [specs, setSpecs] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }, { key: '', value: '' }]);
  const [extraImages, setExtraImages] = useState<File[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preorder, setPreorder] = useState<PreorderForm>(emptyPreorder);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const preorderResult = buildPreorderPayload(preorder, true);
    if ('error' in preorderResult) { toast.error(preorderResult.error); return; }
    setLoading(true);
    // Phone photos are several MB. Shrink them first (1200 px is plenty for a
    // product card) and upload them all at the same time instead of one by one.
    const uploadPhoto = async (file: File, name: string): Promise<string | null> => {
      const blob = await compressImage(file, 1200, 0.82);
      const ext = blob.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${vendorId}/products/${name}.${ext}`;
      const { error } = await supabase.storage.from('vendor-assets').upload(path, blob, { contentType: blob.type || file.type, cacheControl: '31536000' });
      return error ? null : supabase.storage.from('vendor-assets').getPublicUrl(path).data.publicUrl;
    };
    const stamp = Date.now();
    const mainUpload = imageFile ? uploadPhoto(imageFile, `${stamp}`) : Promise.resolve(null);
    // A small copy for product cards and lists (about 400 px). If it fails, cards simply use the full photo.
    const thumbUpload: Promise<string | null> = imageFile
      ? makeThumbnail(imageFile).then(async blob => {
          if (!blob) return null;
          const path = `${vendorId}/products/${stamp}_thumb.jpg`;
          const { error } = await supabase.storage.from('vendor-assets').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
          return error ? null : supabase.storage.from('vendor-assets').getPublicUrl(path).data.publicUrl;
        }).catch(() => null)
      : Promise.resolve(null);
    const extraUploads = Promise.all(extraImages.map((file, i) => uploadPhoto(file, `${stamp}-${i + 1}`)));
    // B2B fields: MOQ, quantity price breaks and specifications
    const moq = Math.max(1, Math.floor(Number(form.moq)) || 1);
    const priceTiers = tiers
      .filter(t => t.min_qty.trim() && t.price.trim())
      .map(t => ({ min_qty: Math.floor(Number(t.min_qty)), price: Number(t.price) }));
    if (priceTiers.some(t => !(t.min_qty > moq) || !(t.price >= 0))) {
      setLoading(false);
      toast.error(`Each price break must start above the minimum order (${moq}) and have a valid price`);
      return;
    }
    if (new Set(priceTiers.map(t => t.min_qty)).size !== priceTiers.length) {
      setLoading(false);
      toast.error('Two price breaks cannot start at the same quantity');
      return;
    }
    const specsObject: Record<string, string> = {};
    specs.forEach(sp => { if (sp.key.trim() && sp.value.trim()) specsObject[sp.key.trim()] = sp.value.trim(); });

    const [mainUrl, extraResults, thumbUrl] = await Promise.all([mainUpload, extraUploads, thumbUpload]);
    const imageUrl = mainUrl ?? form.image_url;
    const extraUrls = extraResults.filter((u): u is string => !!u);

    const slug = form.name.toLowerCase().replace(/[^\w ]+/g, '').replace(/ +/g, '-') + '-' + Date.now();
    const { error } = await supabase.from('products').insert({
      moq, unit: form.unit.trim() || 'Piece', price_tiers: priceTiers, specs: specsObject,
      video_url: form.video_url.trim() || null, images: extraUrls,
      name: form.name, slug, price: Number(form.price),
      compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
      category_id: form.category_id || null, brand: form.brand || null,
      stock_quantity: Number(form.stock_quantity), description: form.description || null,
      image_url: imageUrl || null, thumb_url: mainUrl ? thumbUrl : null, badge: form.badge || null, bnpl_eligible: form.bnpl_eligible,
      vendor_id: vendorId, is_active: true,
      ...preorderResult.data,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success('Product added!'); onSuccess(); }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card p-6 rounded-lg card-shadow max-w-2xl space-y-4">
      <h2 className="font-heading text-xl font-bold flex items-center gap-2"><Plus className="w-5 h-5" /> Add Product</h2>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required /></div>
        <div><Label>Brand</Label><Input value={form.brand} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))} /></div>
        <div><Label>Price (₦) *</Label><Input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} required /></div>
        <div><Label>Compare Price</Label><Input type="number" value={form.compare_at_price} onChange={e => setForm(p => ({ ...p, compare_at_price: e.target.value }))} /></div>
        <div>
          <Label>Category</Label>
          <Select value={form.category_id} onValueChange={v => setForm(p => ({ ...p, category_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Stock</Label><Input type="number" value={form.stock_quantity} onChange={e => setForm(p => ({ ...p, stock_quantity: e.target.value }))} /></div>
        <div>
          <Label>Product Image</Label>
          <label className="flex items-center gap-2 px-4 py-2 rounded-md border border-border cursor-pointer hover:bg-secondary transition-colors text-sm mt-1">
            <Upload className="w-4 h-4" />
            {imageFile ? imageFile.name : 'Upload Image'}
            <input type="file" accept="image/*" className="hidden" onChange={e => setImageFile(e.target.files?.[0] || null)} />
          </label>
        </div>
        <div><Label>Badge</Label><Input placeholder="New, Sale" value={form.badge} onChange={e => setForm(p => ({ ...p, badge: e.target.value }))} /></div>
      </div>
      <div><Label>Image URL (or upload above)</Label><Input value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Minimum order (MOQ)</Label>
          <Input type="number" min={1} value={form.moq} onChange={e => setForm(p => ({ ...p, moq: e.target.value }))} />
        </div>
        <div>
          <Label>Unit</Label>
          <Input placeholder="Piece, Carton, Kg..." value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} />
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border p-4">
        <Switch id="bnpl-eligible" checked={form.bnpl_eligible && !preorder.enabled} disabled={preorder.enabled} onCheckedChange={v => setForm(p => ({ ...p, bnpl_eligible: v }))} />
        <div>
          <Label htmlFor="bnpl-eligible" className="font-medium">Allow Pay later (buy now, pay later)</Label>
          <p className="text-xs text-muted-foreground">Buyers can pay in instalments through Klump, and you are paid in full after delivery like any other order. Best for higher-priced items such as laptops and phones.</p>
        </div>
      </div>

      <PreorderFields value={preorder} onChange={setPreorder} />

      <div>
        <Label>Price breaks (optional)</Label>
        <p className="text-xs text-muted-foreground mb-2">The price above applies from your MOQ. Add lower prices for bigger quantities, e.g. 20 pieces and above at a cheaper price.</p>
        <div className="space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input type="number" min={2} placeholder="From quantity" value={t.min_qty} onChange={e => setTiers(prev => prev.map((x, j) => j === i ? { ...x, min_qty: e.target.value } : x))} />
              <Input type="number" min={0} placeholder="Unit price (₦)" value={t.price} onChange={e => setTiers(prev => prev.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
              <Button type="button" variant="ghost" size="icon" onClick={() => setTiers(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : [{ min_qty: '', price: '' }])} aria-label="Remove price break"><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
        {tiers.length < 4 && (
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setTiers(prev => [...prev, { min_qty: '', price: '' }])}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add price break
          </Button>
        )}
      </div>

      <div>
        <Label>Specifications (optional)</Label>
        <div className="space-y-2 mt-1">
          {specs.map((sp, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input placeholder="e.g. Material" value={sp.key} onChange={e => setSpecs(prev => prev.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
              <Input placeholder="e.g. Stainless steel" value={sp.value} onChange={e => setSpecs(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
              <Button type="button" variant="ghost" size="icon" onClick={() => setSpecs(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : [{ key: '', value: '' }])} aria-label="Remove specification"><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
        {specs.length < 10 && (
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setSpecs(prev => [...prev, { key: '', value: '' }])}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add specification
          </Button>
        )}
      </div>

      <div>
        <Label>More product photos (optional)</Label>
        <label className="flex items-center gap-2 px-4 py-2 rounded-md border border-border cursor-pointer hover:bg-secondary transition-colors text-sm mt-1">
          <Upload className="w-4 h-4" />
          {extraImages.length ? `${extraImages.length} photo(s) selected` : 'Upload photos'}
          <input type="file" accept="image/*" multiple className="hidden" onChange={e => setExtraImages(Array.from(e.target.files ?? []).slice(0, 8))} />
        </label>
      </div>
      <div><Label>Product video URL (optional)</Label><Input placeholder="https://..." value={form.video_url} onChange={e => setForm(p => ({ ...p, video_url: e.target.value }))} /></div>

      <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
      <Button type="submit" disabled={loading}>{loading ? 'Adding...' : 'Add Product'}</Button>
    </form>
  );
}

function ShopSettings({ vendor, onUpdate }: { vendor: any; onUpdate: () => void }) {
  const [form, setForm] = useState({
    store_name: vendor.store_name || '',
    store_description: vendor.store_description || '',
    phone: vendor.phone || '',
    whatsapp_number: vendor.whatsapp_number || '',
    address: vendor.address || '',
    business_type: vendor.business_type || '',
    location: vendor.location || '',
    year_established: vendor.year_established ? String(vendor.year_established) : '',
  });
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    const { error } = await supabase.from('vendors').update({
      ...form,
      business_type: form.business_type.trim() || null,
      location: form.location.trim() || null,
      year_established: form.year_established ? Math.floor(Number(form.year_established)) : null,
    }).eq('id', vendor.id);
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success('Settings saved!'); onUpdate(); }
  };

  return (
    <div className="space-y-6">
    <div className="bg-card p-6 rounded-lg card-shadow max-w-2xl space-y-4">
      <h2 className="font-heading text-xl font-bold">Shop Settings</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><Label>Store Name</Label><Input value={form.store_name} onChange={e => setForm(p => ({ ...p, store_name: e.target.value }))} /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
        <div><Label>WhatsApp Number</Label><Input value={form.whatsapp_number} onChange={e => setForm(p => ({ ...p, whatsapp_number: e.target.value }))} /></div>
        <div><Label>Address</Label><Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
        <div><Label>Business type</Label><Input placeholder="Manufacturer, Wholesaler, Retailer..." value={form.business_type} onChange={e => setForm(p => ({ ...p, business_type: e.target.value }))} /></div>
        <div><Label>Location</Label><Input placeholder="City, State" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} /></div>
        <div><Label>Year established</Label><Input type="number" min={1900} max={2100} value={form.year_established} onChange={e => setForm(p => ({ ...p, year_established: e.target.value }))} /></div>
        <div className="col-span-full"><Label>Description</Label><Textarea value={form.store_description} onChange={e => setForm(p => ({ ...p, store_description: e.target.value }))} /></div>
      </div>
      <Button onClick={handleSave} disabled={loading}>{loading ? 'Saving...' : 'Save Settings'}</Button>
    </div>
    <BankDetails vendor={vendor} onUpdate={onUpdate} />
    </div>
  );
}

// Bank details for payouts. Saving them automatically creates (or updates) the
// Paystack subaccount once the supplier is approved.
function BankDetails({ vendor, onUpdate }: { vendor: any; onUpdate: () => void }) {
  const [bankName, setBankName] = useState<string>(vendor.bank_name || '');
  const [accountNumber, setAccountNumber] = useState<string>(vendor.bank_account_number || '');
  const [accountName, setAccountName] = useState<string>(vendor.bank_account_name || '');
  const [saving, setSaving] = useState(false);

  const valid = !!bankName && isValidAccountNumber(accountNumber) && !!accountName.trim();
  const changed =
    bankName !== (vendor.bank_name || '') ||
    accountNumber !== (vendor.bank_account_number || '') ||
    accountName !== (vendor.bank_account_name || '');

  const handleSave = async () => {
    if (!valid) { toast.error('Choose your bank and enter your 10-digit account number and account name'); return; }
    setSaving(true);
    const { error } = await supabase.from('vendor_private').upsert({
      vendor_id: vendor.id,
      user_id: vendor.user_id,
      bank_name: bankName,
      bank_account_number: accountNumber.trim(),
      bank_account_name: accountName.trim(),
    }, { onConflict: 'vendor_id' });
    if (error) { setSaving(false); toast.error(error.message); return; }

    if (vendor.is_approved) {
      const { data, error: fnError } = await supabase.functions.invoke('create-subaccount', {
        body: { vendor_id: vendor.id, refresh: !!vendor.paystack_subaccount_code },
      });
      if (fnError || data?.error) {
        toast.error(`Bank details saved, but payment setup failed: ${await functionErrorMessage(fnError, data)}`);
      } else {
        toast.success('Bank details saved and your payment account is ready.');
      }
    } else {
      toast.success('Bank details saved. Your payment account is created automatically once you are approved.');
    }
    setSaving(false);
    onUpdate();
  };

  return (
    <div className="bg-card p-6 rounded-lg card-shadow max-w-2xl space-y-4">
      <h2 className="font-heading text-xl font-bold">Bank details for payouts</h2>
      <p className="text-sm text-muted-foreground">Used to set up your payment account automatically. Only you and the admin can see these.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="col-span-full">
          <Label>Bank</Label>
          <Select value={bankName || undefined} onValueChange={setBankName}>
            <SelectTrigger><SelectValue placeholder={BANK_PLACEHOLDER} /></SelectTrigger>
            <SelectContent>{BANKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Account number (10 digits)</Label><Input inputMode="numeric" maxLength={10} value={accountNumber} onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))} /></div>
        <div><Label>Account name</Label><Input value={accountName} onChange={e => setAccountName(e.target.value)} /></div>
      </div>
      <Button onClick={handleSave} disabled={saving || !valid || !changed}>{saving ? 'Saving...' : 'Save bank details'}</Button>
    </div>
  );
}
