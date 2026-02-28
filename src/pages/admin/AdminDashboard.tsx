import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { formatNaira } from '@/lib/format';
import { useCategories } from '@/hooks/useProducts';
import { Package, ShoppingCart, Users, DollarSign, Plus, LogOut, ArrowLeft, Pencil, Trash2, Store, CheckCircle, XCircle, Eye } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function AdminDashboard() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'orders' | 'suppliers' | 'users' | 'payments' | 'earnings' | 'add-product'>('overview');

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      navigate('/admin-login');
    }
  }, [user, isAdmin, loading, navigate]);

  const { data: products } = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*, categories(name), vendors(store_name)').order('created_at', { ascending: false });
      return data || [];
    },
    enabled: isAdmin,
  });

  const { data: orders } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      return data || [];
    },
    enabled: isAdmin,
  });

  const { data: vendors } = useQuery({
    queryKey: ['admin-vendors'],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('*').order('created_at', { ascending: false });
      return data || [];
    },
    enabled: isAdmin,
  });

  const { data: payments } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: async () => {
      const { data } = await supabase.from('payments').select('*').order('created_at', { ascending: false });
      return data || [];
    },
    enabled: isAdmin,
  });

  const { data: profiles } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      return data || [];
    },
    enabled: isAdmin,
  });

  const { data: categories } = useCategories();

  const successfulPayments = payments?.filter(p => p.status === 'success') || [];
  const totalRevenue = successfulPayments.reduce((s, p) => s + Number(p.amount), 0);
  const platformCommission = totalRevenue * 0.05; // 5% commission
  const supplierEarnings = totalRevenue - platformCommission;

  const stats = {
    products: products?.length || 0,
    orders: orders?.length || 0,
    revenue: totalRevenue,
    suppliers: vendors?.length || 0,
    users: profiles?.length || 0,
    commission: platformCommission,
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  if (!isAdmin) return null;

  const approveVendor = async (vendorId: string) => {
    const { error } = await supabase.from('vendors').update({ is_approved: true }).eq('id', vendorId);
    if (error) toast.error(error.message);
    else { toast.success('Supplier approved!'); queryClient.invalidateQueries({ queryKey: ['admin-vendors'] }); }
  };

  const rejectVendor = async (vendorId: string) => {
    const { error } = await supabase.from('vendors').update({ is_approved: false }).eq('id', vendorId);
    if (error) toast.error(error.message);
    else { toast.success('Supplier rejected'); queryClient.invalidateQueries({ queryKey: ['admin-vendors'] }); }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
            <h1 className="font-heading font-bold text-lg">Admin Dashboard</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { signOut(); navigate('/'); }}>
            <LogOut className="w-4 h-4 mr-1" /> Logout
          </Button>
        </div>
      </header>

      <div className="container py-6">
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'suppliers', label: 'Suppliers' },
            { key: 'users', label: 'Users' },
            { key: 'products', label: 'Products' },
            { key: 'orders', label: 'Orders' },
            { key: 'payments', label: 'Payments' },
            { key: 'earnings', label: 'Earnings' },
            { key: 'add-product', label: 'Add Product' },
          ].map(tab => (
            <Button key={tab.key} variant={activeTab === tab.key ? 'default' : 'outline'} size="sm"
              onClick={() => setActiveTab(tab.key as any)}>{tab.label}</Button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard icon={<Package className="w-5 h-5 text-primary" />} label="Products" value={String(stats.products)} />
              <StatCard icon={<ShoppingCart className="w-5 h-5 text-accent" />} label="Orders" value={String(stats.orders)} />
              <StatCard icon={<DollarSign className="w-5 h-5 text-primary" />} label="Total Revenue" value={formatNaira(stats.revenue)} />
              <StatCard icon={<DollarSign className="w-5 h-5 text-accent" />} label="Platform Commission (5%)" value={formatNaira(stats.commission)} />
              <StatCard icon={<Store className="w-5 h-5 text-primary" />} label="Suppliers" value={String(stats.suppliers)} />
              <StatCard icon={<Users className="w-5 h-5 text-accent" />} label="Users" value={String(stats.users)} />
            </div>
          </div>
        )}

        {activeTab === 'suppliers' && (
          <div className="bg-card rounded-lg card-shadow overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-heading font-bold">All Suppliers ({vendors?.length || 0})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary">
                  <tr>
                    <th className="text-left p-3 font-heading">Store</th>
                    <th className="text-left p-3 font-heading">Phone</th>
                    <th className="text-left p-3 font-heading">WhatsApp</th>
                    <th className="text-left p-3 font-heading">Status</th>
                    <th className="text-left p-3 font-heading">Docs</th>
                    <th className="text-left p-3 font-heading">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors?.map(v => (
                    <tr key={v.id} className="border-t border-border">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {v.logo_url ? <img src={v.logo_url} className="w-8 h-8 rounded object-cover" /> : <Store className="w-5 h-5 text-muted-foreground" />}
                          <div>
                            <span className="font-medium">{v.store_name}</span>
                            {v.company_name && <span className="block text-xs text-muted-foreground">{v.company_name}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">{v.phone || '-'}</td>
                      <td className="p-3 text-muted-foreground">{v.whatsapp_number || '-'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v.is_approved ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                          {v.is_approved ? 'Approved' : 'Pending'}
                        </span>
                      </td>
                      <td className="p-3">
                        {v.verification_document_url ? (
                          <a href={v.verification_document_url} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline">View Doc</a>
                        ) : <span className="text-xs text-muted-foreground">None</span>}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          {!v.is_approved && (
                            <Button size="sm" variant="outline" className="h-7 text-xs text-primary" onClick={() => approveVendor(v.id)}>
                              <CheckCircle className="w-3 h-3 mr-1" /> Approve
                            </Button>
                          )}
                          {v.is_approved && (
                            <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => rejectVendor(v.id)}>
                              <XCircle className="w-3 h-3 mr-1" /> Revoke
                            </Button>
                          )}
                          <Link to={`/shop/${v.id}`}>
                            <Button size="sm" variant="ghost" className="h-7 text-xs"><Eye className="w-3 h-3" /></Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="bg-card rounded-lg card-shadow overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-heading font-bold">All Users ({profiles?.length || 0})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary">
                  <tr>
                    <th className="text-left p-3 font-heading">Name</th>
                    <th className="text-left p-3 font-heading">Phone</th>
                    <th className="text-left p-3 font-heading">City</th>
                    <th className="text-left p-3 font-heading">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles?.map(p => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="p-3 font-medium">{p.full_name || 'Unknown'}</td>
                      <td className="p-3 text-muted-foreground">{p.phone || '-'}</td>
                      <td className="p-3 text-muted-foreground">{p.city || '-'}</td>
                      <td className="p-3 text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'products' && (
          <div className="bg-card rounded-lg card-shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary">
                  <tr>
                    <th className="text-left p-3 font-heading">Product</th>
                    <th className="text-left p-3 font-heading">Seller</th>
                    <th className="text-left p-3 font-heading">Category</th>
                    <th className="text-left p-3 font-heading">Price</th>
                    <th className="text-left p-3 font-heading">Stock</th>
                    <th className="text-left p-3 font-heading">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products?.map(p => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <img src={p.image_url || '/placeholder.svg'} alt="" className="w-8 h-8 rounded object-cover" />
                          <span className="font-medium line-clamp-1">{p.name}</span>
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">{(p.vendors as any)?.store_name || 'Admin'}</td>
                      <td className="p-3 text-muted-foreground">{(p.categories as any)?.name || '-'}</td>
                      <td className="p-3 font-medium">{formatNaira(p.price)}</td>
                      <td className="p-3">{p.stock_quantity}</td>
                      <td className="p-3">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          onClick={async () => {
                            await supabase.from('products').delete().eq('id', p.id);
                            queryClient.invalidateQueries({ queryKey: ['admin-products'] });
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
                      <th className="text-left p-3 font-heading">Email</th>
                      <th className="text-left p-3 font-heading">Status</th>
                      <th className="text-left p-3 font-heading">Total</th>
                      <th className="text-left p-3 font-heading">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id} className="border-t border-border">
                        <td className="p-3 font-mono text-xs">{o.id.slice(0, 8)}...</td>
                        <td className="p-3 text-muted-foreground">{o.email || '-'}</td>
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

        {activeTab === 'payments' && (
          <div className="bg-card rounded-lg card-shadow overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-heading font-bold">All Transactions ({payments?.length || 0})</h2>
            </div>
            {payments?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary">
                    <tr>
                      <th className="text-left p-3 font-heading">Reference</th>
                      <th className="text-left p-3 font-heading">Amount</th>
                      <th className="text-left p-3 font-heading">Status</th>
                      <th className="text-left p-3 font-heading">Method</th>
                      <th className="text-left p-3 font-heading">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="p-3 font-mono text-xs">{p.paystack_reference || p.transaction_reference || p.id.slice(0, 8)}</td>
                        <td className="p-3 font-medium">{formatNaira(Number(p.amount))}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === 'success' ? 'bg-primary/10 text-primary' : 'bg-secondary'}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground">{p.payment_method || '-'}</td>
                        <td className="p-3 text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-8 text-center text-muted-foreground">No transactions yet.</p>
            )}
          </div>
        )}

        {activeTab === 'earnings' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard icon={<DollarSign className="w-5 h-5 text-primary" />} label="Total Revenue" value={formatNaira(totalRevenue)} />
              <StatCard icon={<DollarSign className="w-5 h-5 text-accent" />} label="Platform Commission (5%)" value={formatNaira(platformCommission)} />
              <StatCard icon={<Store className="w-5 h-5 text-primary" />} label="Supplier Payouts" value={formatNaira(supplierEarnings)} />
            </div>
            <div className="bg-card rounded-lg card-shadow overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="font-heading font-bold">Supplier Earnings Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary">
                    <tr>
                      <th className="text-left p-3 font-heading">Supplier</th>
                      <th className="text-left p-3 font-heading">Subaccount</th>
                      <th className="text-left p-3 font-heading">Status</th>
                      <th className="text-left p-3 font-heading">Bank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors?.map(v => (
                      <tr key={v.id} className="border-t border-border">
                        <td className="p-3 font-medium">{v.store_name}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{(v as any).paystack_subaccount_code || 'Not created'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${(v as any).paystack_subaccount_code ? 'bg-primary/10 text-primary' : 'bg-secondary'}`}>
                            {(v as any).paystack_subaccount_code ? 'Active' : 'Pending'}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground">{v.bank_name || '-'} {v.bank_account_number ? `(***${v.bank_account_number.slice(-4)})` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'add-product' && (
          <AddProductForm categories={categories || []} onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-products'] });
            setActiveTab('products');
          }} />
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card p-4 rounded-lg card-shadow flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-heading text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}

function AddProductForm({ categories, onSuccess }: { categories: any[]; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '', price: '', compare_at_price: '', category_id: '', brand: '', stock_quantity: '10',
    description: '', image_url: '', badge: '', sku: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const slug = form.name.toLowerCase().replace(/[^\w ]+/g, '').replace(/ +/g, '-') + '-' + Date.now();
    const { error } = await supabase.from('products').insert({
      name: form.name, slug,
      price: Number(form.price),
      compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
      category_id: form.category_id || null,
      brand: form.brand || null,
      stock_quantity: Number(form.stock_quantity),
      description: form.description || null,
      image_url: form.image_url || null,
      badge: form.badge || null,
      sku: form.sku || null,
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
        <div><Label>Image URL</Label><Input value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} /></div>
        <div><Label>Badge</Label><Input placeholder="New, Sale, etc." value={form.badge} onChange={e => setForm(p => ({ ...p, badge: e.target.value }))} /></div>
      </div>
      <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
      <Button type="submit" disabled={loading}>{loading ? 'Adding...' : 'Add Product'}</Button>
    </form>
  );
}
