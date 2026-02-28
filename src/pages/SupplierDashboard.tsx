import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { formatNaira } from '@/lib/format';
import { useCategories } from '@/hooks/useProducts';
import { Package, ShoppingCart, DollarSign, Plus, LogOut, ArrowLeft, Pencil, Trash2, Store, Upload, MessageCircle } from 'lucide-react';
import { useUnreadCount } from '@/hooks/useChat';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function SupplierDashboard() {
  const unreadCount = useUnreadCount();
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'orders' | 'add-product' | 'shop-settings'>('overview');

  const { data: vendor, isLoading: vendorLoading } = useQuery({
    queryKey: ['vendor-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('*').eq('user_id', user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!loading && !user) navigate('/suppliers-login');
  }, [user, loading, navigate]);

  const { data: products } = useQuery({
    queryKey: ['vendor-products', vendor?.id],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*, categories(name)').eq('vendor_id', vendor!.id).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!vendor?.id,
  });

  const { data: orders } = useQuery({
    queryKey: ['vendor-orders', vendor?.id],
    queryFn: async () => {
      // Get orders that contain this vendor's products
      const { data: vendorProductIds } = await supabase.from('products').select('id').eq('vendor_id', vendor!.id);
      if (!vendorProductIds?.length) return [];
      const ids = vendorProductIds.map(p => p.id);
      const { data: orderItems } = await supabase.from('order_items').select('order_id, quantity, price, product_id').in('product_id', ids);
      if (!orderItems?.length) return [];
      const orderIds = [...new Set(orderItems.map(oi => oi.order_id))];
      const { data: orderData } = await supabase.from('orders').select('*').in('id', orderIds).order('created_at', { ascending: false });
      return orderData || [];
    },
    enabled: !!vendor?.id,
  });

  const { data: categories } = useCategories();

  const stats = {
    products: products?.length || 0,
    orders: orders?.length || 0,
    revenue: orders?.reduce((s, o) => s + Number(o.total), 0) || 0,
  };

  if (loading || vendorLoading) return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  if (!vendor) {
    return (
      <div className="flex items-center justify-center min-h-screen flex-col gap-4">
        <p className="text-muted-foreground">No supplier profile found.</p>
        <Link to="/supplier-signup"><Button>Create Supplier Account</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
            <Store className="w-5 h-5 text-primary" />
            <div>
              <h1 className="font-heading font-bold text-sm leading-none">{vendor.store_name}</h1>
              <span className={`text-[10px] ${vendor.is_approved ? 'text-primary' : 'text-muted-foreground'}`}>
                {vendor.is_approved ? '✓ Approved' : '⏳ Pending Approval'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/shop/${vendor.id}`}>
              <Button variant="outline" size="sm" className="text-xs">View Shop</Button>
            </Link>
            <Link to="/supplier-chat">
              <Button variant="outline" size="sm" className="text-xs relative">
                <MessageCircle className="w-4 h-4 mr-1" /> Chat
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full text-[10px] flex items-center justify-center">{unreadCount}</span>
                )}
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={() => { signOut(); navigate('/'); }}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container py-6">
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'products', label: 'My Products' },
            { key: 'orders', label: 'Orders' },
            { key: 'add-product', label: 'Add Product' },
            { key: 'shop-settings', label: 'Settings' },
          ].map(tab => (
            <Button key={tab.key} variant={activeTab === tab.key ? 'default' : 'outline'} size="sm"
              onClick={() => setActiveTab(tab.key as any)}>{tab.label}</Button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard icon={<Package className="w-6 h-6 text-primary" />} label="Products" value={String(stats.products)} />
            <StatCard icon={<ShoppingCart className="w-6 h-6 text-accent" />} label="Orders" value={String(stats.orders)} />
            <StatCard icon={<DollarSign className="w-6 h-6 text-primary" />} label="Revenue" value={formatNaira(stats.revenue)} />
          </div>
        )}

        {activeTab === 'products' && (
          <div className="bg-card rounded-lg card-shadow overflow-hidden">
            {products?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary">
                    <tr>
                      <th className="text-left p-3 font-heading">Product</th>
                      <th className="text-left p-3 font-heading">Price</th>
                      <th className="text-left p-3 font-heading">Stock</th>
                      <th className="text-left p-3 font-heading">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <img src={p.image_url || '/placeholder.svg'} alt="" className="w-8 h-8 rounded object-cover" />
                            <span className="font-medium line-clamp-1">{p.name}</span>
                          </div>
                        </td>
                        <td className="p-3">{formatNaira(p.price)}</td>
                        <td className="p-3">{p.stock_quantity}</td>
                        <td className="p-3">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            onClick={async () => {
                              await supabase.from('products').delete().eq('id', p.id);
                              queryClient.invalidateQueries({ queryKey: ['vendor-products'] });
                              toast.success('Product deleted');
                            }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No products yet.</p>
                <Button onClick={() => setActiveTab('add-product')}><Plus className="w-4 h-4 mr-1" /> Add Product</Button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="bg-card rounded-lg card-shadow overflow-hidden">
            {orders?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary">
                    <tr>
                      <th className="text-left p-3 font-heading">Order ID</th>
                      <th className="text-left p-3 font-heading">Status</th>
                      <th className="text-left p-3 font-heading">Total</th>
                      <th className="text-left p-3 font-heading">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id} className="border-t border-border">
                        <td className="p-3 font-mono text-xs">{o.id.slice(0, 8)}...</td>
                        <td className="p-3"><span className="px-2 py-0.5 rounded-full text-xs bg-secondary font-medium">{o.status}</span></td>
                        <td className="p-3 font-medium">{formatNaira(Number(o.total))}</td>
                        <td className="p-3 text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-8 text-center text-muted-foreground">No orders yet.</p>
            )}
          </div>
        )}

        {activeTab === 'add-product' && (
          <SupplierAddProduct vendorId={vendor.id} categories={categories || []} onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['vendor-products'] });
            setActiveTab('products');
          }} />
        )}

        {activeTab === 'shop-settings' && (
          <ShopSettings vendor={vendor} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['vendor-profile'] })} />
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card p-6 rounded-lg card-shadow flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">{icon}</div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-heading text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}

function SupplierAddProduct({ vendorId, categories, onSuccess }: { vendorId: string; categories: any[]; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '', price: '', compare_at_price: '', category_id: '', brand: '', stock_quantity: '10',
    description: '', image_url: '', badge: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    let imageUrl = form.image_url;
    if (imageFile) {
      const ext = imageFile.name.split('.').pop();
      const path = `${vendorId}/products/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('vendor-assets').upload(path, imageFile);
      if (!error) {
        const { data } = supabase.storage.from('vendor-assets').getPublicUrl(path);
        imageUrl = data.publicUrl;
      }
    }

    const slug = form.name.toLowerCase().replace(/[^\w ]+/g, '').replace(/ +/g, '-') + '-' + Date.now();
    const { error } = await supabase.from('products').insert({
      name: form.name, slug, price: Number(form.price),
      compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
      category_id: form.category_id || null, brand: form.brand || null,
      stock_quantity: Number(form.stock_quantity), description: form.description || null,
      image_url: imageUrl || null, badge: form.badge || null,
      vendor_id: vendorId, is_active: true,
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
  });
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    const { error } = await supabase.from('vendors').update(form).eq('id', vendor.id);
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success('Settings saved!'); onUpdate(); }
  };

  return (
    <div className="bg-card p-6 rounded-lg card-shadow max-w-2xl space-y-4">
      <h2 className="font-heading text-xl font-bold">Shop Settings</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><Label>Store Name</Label><Input value={form.store_name} onChange={e => setForm(p => ({ ...p, store_name: e.target.value }))} /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
        <div><Label>WhatsApp Number</Label><Input value={form.whatsapp_number} onChange={e => setForm(p => ({ ...p, whatsapp_number: e.target.value }))} /></div>
        <div><Label>Address</Label><Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
        <div className="col-span-full"><Label>Description</Label><Textarea value={form.store_description} onChange={e => setForm(p => ({ ...p, store_description: e.target.value }))} /></div>
      </div>
      <Button onClick={handleSave} disabled={loading}>{loading ? 'Saving...' : 'Save Settings'}</Button>
    </div>
  );
}
