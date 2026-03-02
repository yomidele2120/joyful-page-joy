import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatNaira } from '@/lib/format';
import { useCategories } from '@/hooks/useProducts';
import {
  Package, ShoppingCart, Users, DollarSign, Plus, LogOut, ArrowLeft,
  Trash2, Store, CheckCircle, XCircle, Eye, BarChart3, CreditCard,
  FileText, AlertCircle, TrendingUp, Layers, FolderPlus, Pencil
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function AdminDashboard() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('overview');

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      navigate('/admin-login');
    }
  }, [user, isAdmin, loading, navigate]);

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*, categories(name), vendors(store_name)').order('created_at', { ascending: false });
      return data || [];
    },
    enabled: isAdmin,
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      return data || [];
    },
    enabled: isAdmin,
  });

  const { data: vendors, isLoading: vendorsLoading } = useQuery({
    queryKey: ['admin-vendors'],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('*').order('created_at', { ascending: false });
      return data || [];
    },
    enabled: isAdmin,
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: async () => {
      const { data } = await supabase.from('payments').select('*').order('created_at', { ascending: false });
      return data || [];
    },
    enabled: isAdmin,
  });

  const { data: profiles, isLoading: profilesLoading } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      return data || [];
    },
    enabled: isAdmin,
  });

  const { data: categories, isLoading: categoriesLoading } = useCategories();

  const successfulPayments = payments?.filter(p => p.status === 'success') || [];
  const totalRevenue = successfulPayments.reduce((s, p) => s + Number(p.amount), 0);
  const platformCommission = totalRevenue * 0.05;
  const supplierEarnings = totalRevenue - platformCommission;
  const pendingOrders = orders?.filter(o => o.status === 'pending') || [];
  const paidOrders = orders?.filter(o => o.status === 'paid') || [];
  const pendingVendors = vendors?.filter(v => !v.is_approved) || [];
  const approvedVendors = vendors?.filter(v => v.is_approved) || [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          <p className="text-muted-foreground text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }
  if (!isAdmin) return null;

  const approveVendor = async (vendorId: string) => {
    const { error } = await supabase.from('vendors').update({ is_approved: true }).eq('id', vendorId);
    if (error) { toast.error(error.message); return; }

    // Trigger Paystack subaccount creation
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-subaccount', {
        body: { vendor_id: vendorId },
      });
      if (fnError) {
        console.error('Subaccount creation error:', fnError);
        toast.success('Supplier approved! Paystack subaccount may need manual setup.');
      } else {
        toast.success(`Supplier approved! Subaccount: ${data?.subaccount_code || 'created'}`);
      }
    } catch (e) {
      console.error('Subaccount error:', e);
      toast.success('Supplier approved! Paystack subaccount setup pending.');
    }
    queryClient.invalidateQueries({ queryKey: ['admin-vendors'] });
  };

  const rejectVendor = async (vendorId: string) => {
    const { error } = await supabase.from('vendors').update({ is_approved: false }).eq('id', vendorId);
    if (error) toast.error(error.message);
    else { toast.success('Supplier rejected'); queryClient.invalidateQueries({ queryKey: ['admin-vendors'] }); }
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
    if (error) toast.error(error.message);
    else { toast.success(`Order marked as ${status}`); queryClient.invalidateQueries({ queryKey: ['admin-orders'] }); }
  };

  const deleteProduct = async (productId: string) => {
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) toast.error(error.message);
    else { toast.success('Product deleted'); queryClient.invalidateQueries({ queryKey: ['admin-products'] }); }
  };

  const tabs = [
    { key: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'suppliers', label: `Suppliers${pendingVendors.length ? ` (${pendingVendors.length})` : ''}`, icon: <Store className="w-4 h-4" /> },
    { key: 'orders', label: 'Orders', icon: <ShoppingCart className="w-4 h-4" /> },
    { key: 'payments', label: 'Payments', icon: <CreditCard className="w-4 h-4" /> },
    { key: 'products', label: 'Products', icon: <Package className="w-4 h-4" /> },
    { key: 'categories', label: 'Categories', icon: <Layers className="w-4 h-4" /> },
    { key: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
    { key: 'earnings', label: 'Earnings', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/"><ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" /></Link>
            <h1 className="font-heading font-bold text-lg">Admin Dashboard</h1>
            {pendingVendors.length > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                {pendingVendors.length} pending
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => { signOut(); navigate('/'); }}>
            <LogOut className="w-4 h-4 mr-1" /> Logout
          </Button>
        </div>
      </header>

      <div className="container py-6">
        {/* Tabs */}
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-2 scrollbar-none">
          {tabs.map(tab => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? 'default' : 'outline'}
              size="sm"
              className="flex items-center gap-1.5 shrink-0"
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon} {tab.label}
            </Button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard icon={<DollarSign className="w-5 h-5 text-primary" />} label="Total Revenue" value={formatNaira(totalRevenue)} loading={paymentsLoading} />
              <StatCard icon={<DollarSign className="w-5 h-5 text-accent" />} label="Commission (5%)" value={formatNaira(platformCommission)} loading={paymentsLoading} />
              <StatCard icon={<ShoppingCart className="w-5 h-5 text-primary" />} label="Total Orders" value={String(orders?.length || 0)} loading={ordersLoading} />
              <StatCard icon={<Package className="w-5 h-5 text-accent" />} label="Products" value={String(products?.length || 0)} loading={productsLoading} />
              <StatCard icon={<Store className="w-5 h-5 text-primary" />} label="Suppliers" value={String(vendors?.length || 0)} loading={vendorsLoading} />
              <StatCard icon={<Users className="w-5 h-5 text-accent" />} label="Users" value={String(profiles?.length || 0)} loading={profilesLoading} />
            </div>

            {/* Quick alerts */}
            {pendingVendors.length > 0 && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                <div>
                  <p className="font-medium text-sm">{pendingVendors.length} supplier(s) awaiting verification</p>
                  <p className="text-xs text-muted-foreground">Review uploaded documents and approve or reject suppliers.</p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0 ml-auto" onClick={() => setActiveTab('suppliers')}>Review</Button>
              </div>
            )}

            {/* Quick stats rows */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-card rounded-lg card-shadow p-4">
                <h3 className="font-heading font-semibold text-sm mb-3">Order Status</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Pending</span><span className="font-medium">{pendingOrders.length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="font-medium">{paidOrders.length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-medium">{orders?.length || 0}</span></div>
                </div>
              </div>
              <div className="bg-card rounded-lg card-shadow p-4">
                <h3 className="font-heading font-semibold text-sm mb-3">Supplier Status</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Approved</span><span className="font-medium text-primary">{approvedVendors.length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Pending</span><span className="font-medium text-destructive">{pendingVendors.length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">With Paystack</span><span className="font-medium">{vendors?.filter(v => v.paystack_subaccount_code).length || 0}</span></div>
                </div>
              </div>
              <div className="bg-card rounded-lg card-shadow p-4">
                <h3 className="font-heading font-semibold text-sm mb-3">Revenue</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Gross Revenue</span><span className="font-medium">{formatNaira(totalRevenue)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Platform (5%)</span><span className="font-medium text-primary">{formatNaira(platformCommission)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Supplier Payouts</span><span className="font-medium">{formatNaira(supplierEarnings)}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Suppliers */}
        {activeTab === 'suppliers' && (
          <div className="space-y-4">
            {/* Pending suppliers first */}
            {pendingVendors.length > 0 && (
              <div className="bg-card rounded-lg card-shadow overflow-hidden">
                <div className="p-4 border-b border-border bg-destructive/5">
                  <h2 className="font-heading font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive" /> Pending Verification ({pendingVendors.length})
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <SupplierTable vendors={pendingVendors} onApprove={approveVendor} onReject={rejectVendor} />
                </div>
              </div>
            )}

            <div className="bg-card rounded-lg card-shadow overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="font-heading font-bold">All Suppliers ({vendors?.length || 0})</h2>
              </div>
              {vendorsLoading ? <TableSkeleton /> : (
                <div className="overflow-x-auto">
                  <SupplierTable vendors={vendors || []} onApprove={approveVendor} onReject={rejectVendor} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Orders */}
        {activeTab === 'orders' && (
          <div className="bg-card rounded-lg card-shadow overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-heading font-bold">All Orders ({orders?.length || 0})</h2>
            </div>
            {ordersLoading ? <TableSkeleton /> : orders?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary">
                    <tr>
                      <th className="text-left p-3 font-heading">Order ID</th>
                      <th className="text-left p-3 font-heading">Email</th>
                      <th className="text-left p-3 font-heading">Phone</th>
                      <th className="text-left p-3 font-heading">Status</th>
                      <th className="text-left p-3 font-heading">Total</th>
                      <th className="text-left p-3 font-heading">Date</th>
                      <th className="text-left p-3 font-heading">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id} className="border-t border-border">
                        <td className="p-3 font-mono text-xs">{o.id.slice(0, 8)}...</td>
                        <td className="p-3 text-muted-foreground">{o.email || '-'}</td>
                        <td className="p-3 text-muted-foreground">{o.phone || '-'}</td>
                        <td className="p-3">
                          <StatusBadge status={o.status} />
                        </td>
                        <td className="p-3 font-medium">{formatNaira(Number(o.total))}</td>
                        <td className="p-3 text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td>
                        <td className="p-3">
                          <Select value={o.status} onValueChange={v => updateOrderStatus(o.id, v)}>
                            <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="paid">Paid</SelectItem>
                              <SelectItem value="processing">Processing</SelectItem>
                              <SelectItem value="shipped">Shipped</SelectItem>
                              <SelectItem value="delivered">Delivered</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
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

        {/* Payments */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard icon={<DollarSign className="w-5 h-5 text-primary" />} label="Total Payments" value={formatNaira(totalRevenue)} loading={paymentsLoading} />
              <StatCard icon={<CreditCard className="w-5 h-5 text-accent" />} label="Successful" value={String(successfulPayments.length)} loading={paymentsLoading} />
              <StatCard icon={<AlertCircle className="w-5 h-5 text-destructive" />} label="Pending" value={String(payments?.filter(p => p.status === 'pending').length || 0)} loading={paymentsLoading} />
            </div>
            <div className="bg-card rounded-lg card-shadow overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="font-heading font-bold">All Transactions ({payments?.length || 0})</h2>
              </div>
              {paymentsLoading ? <TableSkeleton /> : payments?.length ? (
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
                          <td className="p-3"><StatusBadge status={p.status} /></td>
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
          </div>
        )}

        {/* Products */}
        {activeTab === 'products' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-bold">All Products ({products?.length || 0})</h2>
              <Button size="sm" onClick={() => setActiveTab('add-product')}><Plus className="w-4 h-4 mr-1" /> Add Product</Button>
            </div>
            <div className="bg-card rounded-lg card-shadow overflow-hidden">
              {productsLoading ? <TableSkeleton /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary">
                      <tr>
                        <th className="text-left p-3 font-heading">Product</th>
                        <th className="text-left p-3 font-heading">Seller</th>
                        <th className="text-left p-3 font-heading">Category</th>
                        <th className="text-left p-3 font-heading">Price</th>
                        <th className="text-left p-3 font-heading">Stock</th>
                        <th className="text-left p-3 font-heading">Status</th>
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
                          <td className="p-3"><StatusBadge status={p.is_active ? 'active' : 'inactive'} /></td>
                          <td className="p-3">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteProduct(p.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Categories */}
        {activeTab === 'categories' && (
          <CategoriesTab categories={categories || []} loading={categoriesLoading} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['categories'] })} />
        )}

        {/* Users */}
        {activeTab === 'users' && (
          <div className="bg-card rounded-lg card-shadow overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-heading font-bold">All Users ({profiles?.length || 0})</h2>
            </div>
            {profilesLoading ? <TableSkeleton /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary">
                    <tr>
                      <th className="text-left p-3 font-heading">Name</th>
                      <th className="text-left p-3 font-heading">Phone</th>
                      <th className="text-left p-3 font-heading">City</th>
                      <th className="text-left p-3 font-heading">State</th>
                      <th className="text-left p-3 font-heading">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles?.map(p => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="p-3 font-medium">{p.full_name || 'Unknown'}</td>
                        <td className="p-3 text-muted-foreground">{p.phone || '-'}</td>
                        <td className="p-3 text-muted-foreground">{p.city || '-'}</td>
                        <td className="p-3 text-muted-foreground">{p.state || '-'}</td>
                        <td className="p-3 text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Earnings */}
        {activeTab === 'earnings' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard icon={<DollarSign className="w-5 h-5 text-primary" />} label="Total Revenue" value={formatNaira(totalRevenue)} loading={paymentsLoading} />
              <StatCard icon={<DollarSign className="w-5 h-5 text-accent" />} label="Platform Commission (5%)" value={formatNaira(platformCommission)} loading={paymentsLoading} />
              <StatCard icon={<Store className="w-5 h-5 text-primary" />} label="Supplier Payouts" value={formatNaira(supplierEarnings)} loading={paymentsLoading} />
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
                      <th className="text-left p-3 font-heading">Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors?.map(v => (
                      <tr key={v.id} className="border-t border-border">
                        <td className="p-3 font-medium">{v.store_name}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{v.paystack_subaccount_code || 'Not created'}</td>
                        <td className="p-3"><StatusBadge status={v.paystack_subaccount_code ? 'active' : 'pending'} /></td>
                        <td className="p-3 text-muted-foreground">{v.bank_name || '-'} {v.bank_account_number ? `(***${v.bank_account_number.slice(-4)})` : ''}</td>
                        <td className="p-3"><StatusBadge status={v.is_approved ? 'approved' : 'pending'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Add Product */}
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

/* ── Helper Components ── */

function StatCard({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: string; loading?: boolean }) {
  if (loading) {
    return (
      <div className="bg-card p-4 rounded-lg card-shadow flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="w-16 h-3" />
          <Skeleton className="w-20 h-5" />
        </div>
      </div>
    );
  }
  return (
    <div className="bg-card p-4 rounded-lg card-shadow flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="font-heading text-lg font-bold truncate">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: 'bg-primary/10 text-primary',
    active: 'bg-primary/10 text-primary',
    approved: 'bg-primary/10 text-primary',
    paid: 'bg-primary/10 text-primary',
    delivered: 'bg-primary/10 text-primary',
    pending: 'bg-accent/10 text-accent',
    processing: 'bg-accent/10 text-accent',
    shipped: 'bg-accent/10 text-accent',
    inactive: 'bg-muted text-muted-foreground',
    failed: 'bg-destructive/10 text-destructive',
    cancelled: 'bg-destructive/10 text-destructive',
    rejected: 'bg-destructive/10 text-destructive',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-secondary text-foreground'}`}>
      {status}
    </span>
  );
}

function TableSkeleton() {
  return (
    <div className="p-4 space-y-3">
      {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

function SupplierTable({ vendors, onApprove, onReject }: { vendors: any[]; onApprove: (id: string) => void; onReject: (id: string) => void }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-secondary">
        <tr>
          <th className="text-left p-3 font-heading">Store</th>
          <th className="text-left p-3 font-heading">Phone</th>
          <th className="text-left p-3 font-heading">Bank</th>
          <th className="text-left p-3 font-heading">Status</th>
          <th className="text-left p-3 font-heading">Paystack</th>
          <th className="text-left p-3 font-heading">Docs</th>
          <th className="text-left p-3 font-heading">Actions</th>
        </tr>
      </thead>
      <tbody>
        {vendors.map(v => (
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
            <td className="p-3 text-muted-foreground text-xs">
              <div>{v.phone || '-'}</div>
              {v.whatsapp_number && <div className="text-[10px]">WA: {v.whatsapp_number}</div>}
            </td>
            <td className="p-3 text-muted-foreground text-xs">
              {v.bank_name ? (
                <div>
                  <div>{v.bank_name}</div>
                  <div>{v.bank_account_number || '-'}</div>
                  <div className="text-[10px]">{v.bank_account_name || '-'}</div>
                </div>
              ) : <span>-</span>}
            </td>
            <td className="p-3"><StatusBadge status={v.is_approved ? 'approved' : 'pending'} /></td>
            <td className="p-3">
              <StatusBadge status={v.paystack_subaccount_code ? 'active' : 'pending'} />
              {v.paystack_subaccount_code && (
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{v.paystack_subaccount_code}</div>
              )}
            </td>
            <td className="p-3">
              {v.verification_document_url ? (
                <a href={v.verification_document_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary text-xs hover:underline">
                  <FileText className="w-3 h-3" /> View
                </a>
              ) : <span className="text-xs text-muted-foreground">None</span>}
            </td>
            <td className="p-3">
              <div className="flex gap-1">
                {!v.is_approved && (
                  <Button size="sm" variant="outline" className="h-7 text-xs text-primary" onClick={() => onApprove(v.id)}>
                    <CheckCircle className="w-3 h-3 mr-1" /> Approve
                  </Button>
                )}
                {v.is_approved && (
                  <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => onReject(v.id)}>
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
  );
}

/* ── Categories Tab ── */

function CategoriesTab({ categories, loading, onRefresh }: { categories: any[]; loading: boolean; onRefresh: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const addCategory = async () => {
    if (!name || !slug) { toast.error('Name and slug are required'); return; }
    setSaving(true);
    const { error } = await supabase.from('categories').insert({
      name, slug: slug.toLowerCase().replace(/\s+/g, '-'),
      description: description || null, image_url: imageUrl || null,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success('Category added!');
      setName(''); setSlug(''); setDescription(''); setImageUrl('');
      onRefresh();
    }
  };

  const deleteCategory = async (id: string) => {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Category deleted'); onRefresh(); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card p-6 rounded-lg card-shadow max-w-lg space-y-4">
        <h2 className="font-heading text-lg font-bold flex items-center gap-2"><FolderPlus className="w-5 h-5" /> Add Category</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Name *</Label><Input value={name} onChange={e => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-')); }} /></div>
          <div><Label>Slug *</Label><Input value={slug} onChange={e => setSlug(e.target.value)} /></div>
          <div className="col-span-2"><Label>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} /></div>
          <div className="col-span-2"><Label>Image URL</Label><Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} /></div>
        </div>
        <Button onClick={addCategory} disabled={saving}>{saving ? 'Adding...' : 'Add Category'}</Button>
      </div>

      <div className="bg-card rounded-lg card-shadow overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-heading font-bold">All Categories ({categories.length})</h2>
        </div>
        {loading ? <TableSkeleton /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary">
                <tr>
                  <th className="text-left p-3 font-heading">Name</th>
                  <th className="text-left p-3 font-heading">Slug</th>
                  <th className="text-left p-3 font-heading">Description</th>
                  <th className="text-left p-3 font-heading">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(c => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{c.slug}</td>
                    <td className="p-3 text-muted-foreground text-xs">{c.description || '-'}</td>
                    <td className="p-3">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteCategory(c.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Add Product Form ── */

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
