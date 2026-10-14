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
  FileText, AlertCircle, TrendingUp, Layers, FolderPlus, Pencil, Flag, Image as ImageIcon,
  LayoutDashboard, Megaphone, Settings, Wallet, ChevronRight
} from 'lucide-react';
import DashboardShell, { Panel, StatCard, WelcomeBanner, useTabParam, type DashNavItem } from '@/components/dashboard/DashboardShell';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import FlyersTab from '@/components/admin/FlyersTab';
import { usePendingReports, useResolveReport, useDeactivatePost, useDeleteComment } from '@/hooks/useReports';

export default function AdminDashboard() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useTabParam('overview');

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      navigate('/admin-login');
    }
  }, [user, isAdmin, loading, navigate]);

  const canFetchAdminData = !loading && !!user && isAdmin;

  const { data: products, isLoading: productsLoading, error: productsError } = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name), vendors(store_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: canFetchAdminData,
  });

  const { data: orders, isLoading: ordersLoading, error: ordersError } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: canFetchAdminData,
  });

  const { data: vendors, isLoading: vendorsLoading, error: vendorsError } = useQuery({
    queryKey: ['admin-vendors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendors').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: canFetchAdminData,
  });

  const { data: payments, isLoading: paymentsLoading, error: paymentsError } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('payments').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: canFetchAdminData,
  });

  const { data: profiles, isLoading: profilesLoading, error: profilesError } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: canFetchAdminData,
  });

  const { data: categories, isLoading: categoriesLoading } = useCategories();

  // Hooks must run on every render, so they live above the early returns below.
  const { data: pendingReports } = usePendingReports();
  const resolveReport = useResolveReport();
  const deactivatePost = useDeactivatePost();
  const deleteComment = useDeleteComment();

  const successfulPayments = payments?.filter(p => p.status === 'success') || [];
  const totalRevenue = successfulPayments.reduce((s, p) => s + Number(p.amount), 0);
  const platformCommission = totalRevenue * 0.05;
  const supplierEarnings = totalRevenue - platformCommission;
  const pendingOrders = orders?.filter(o => o.status === 'pending') || [];
  const paidOrders = orders?.filter(o => o.status === 'paid') || [];
  const pendingVendors = vendors?.filter(v => !v.is_approved) || [];
  const approvedVendors = vendors?.filter(v => v.is_approved) || [];

  const allAdminErrors = [productsError, ordersError, vendorsError, paymentsError, profilesError].filter(Boolean);
  const hasAdminDataError = allAdminErrors.length > 0;

  const ordersPerDay = Object.entries(
    (orders || []).reduce((acc: Record<string, number>, order) => {
      const day = new Date(order.created_at).toLocaleDateString();
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {})
  ).slice(-7);

  const popularProducts = (products || [])
    .slice()
    .sort((a, b) => Number(b.stock_quantity || 0) - Number(a.stock_quantity || 0))
    .slice(0, 5);

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

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-muted-foreground text-sm">Redirecting to admin login...</p>
        </div>
      </div>
    );
  }

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

  const navItems: DashNavItem[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Dashboard' },
    { key: 'analytics', label: 'Analytics', icon: BarChart3, group: 'Dashboard' },
    { key: 'earnings', label: 'Earnings', icon: TrendingUp, group: 'Dashboard' },
    { key: 'suppliers', label: 'Suppliers', icon: Store, badge: pendingVendors.length, group: 'Marketplace' },
    { key: 'products', label: 'Products', icon: Package, group: 'Marketplace' },
    { key: 'add-product', label: 'Add product', icon: Plus, group: 'Marketplace' },
    { key: 'categories', label: 'Categories', icon: Layers, group: 'Marketplace' },
    { key: 'flyers', label: 'Flyers', icon: Megaphone, group: 'Marketplace' },
    { key: 'orders', label: 'Orders', icon: ShoppingCart, group: 'Sales' },
    { key: 'payments', label: 'Payments', icon: CreditCard, group: 'Sales' },
    { key: 'users', label: 'Users', icon: Users, group: 'Community' },
    { key: 'moderation', label: 'Moderation', icon: Flag, badge: pendingReports?.length ?? 0, group: 'Community' },
    { key: 'settings', label: 'Settings', icon: Settings, group: 'System' },
  ];

  const recentOrders = (orders ?? []).slice(0, 5);

  return (
    <DashboardShell
      panelLabel="Admin console"
      title="Administrator"
      subtitle={user?.email}
      items={navItems}
      active={activeTab}
      onSelect={setActiveTab}
      onSignOut={() => { signOut(); navigate('/'); }}
    >
        {hasAdminDataError && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm">Some dashboard data failed to load.</p>
              <p className="text-xs text-muted-foreground truncate">{String((allAdminErrors[0] as any)?.message || 'Unknown error')}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['admin-products'] });
                queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
                queryClient.invalidateQueries({ queryKey: ['admin-vendors'] });
                queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
                queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
                queryClient.invalidateQueries({ queryKey: ['categories'] });
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            <WelcomeBanner
              title="Marketplace at a glance"
              text="Track sales, review new suppliers and keep the marketplace healthy from one place."
            >
              <Button size="sm" variant="secondary" onClick={() => setActiveTab('suppliers')}>
                Review suppliers{pendingVendors.length > 0 ? ` (${pendingVendors.length})` : ''}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setActiveTab('flyers')}>Manage flyers</Button>
            </WelcomeBanner>

            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <StatCard icon={<Wallet />} label="Total revenue" value={formatNaira(totalRevenue)} loading={paymentsLoading} />
              <StatCard icon={<DollarSign />} tone="accent" label="Commission (5%)" value={formatNaira(platformCommission)} loading={paymentsLoading} />
              <StatCard icon={<ShoppingCart />} tone="sky" label="Orders" value={String(orders?.length || 0)} loading={ordersLoading} />
              <StatCard icon={<Package />} label="Products" value={String(products?.length || 0)} loading={productsLoading} />
              <StatCard icon={<Store />} tone="accent" label="Suppliers" value={String(vendors?.length || 0)} loading={vendorsLoading} />
              <StatCard icon={<Users />} tone="sky" label="Users" value={String(profiles?.length || 0)} loading={profilesLoading} />
            </div>

            {pendingVendors.length > 0 && (
              <div className="flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <div>
                    <p className="text-sm font-medium">{pendingVendors.length} supplier(s) awaiting verification</p>
                    <p className="text-xs text-muted-foreground">Review uploaded documents and approve or reject suppliers.</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => setActiveTab('suppliers')}>Review</Button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Panel title="Order status">
                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Pending</dt><dd className="font-medium">{pendingOrders.length}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Paid</dt><dd className="font-medium">{paidOrders.length}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Total</dt><dd className="font-medium">{orders?.length || 0}</dd></div>
                </dl>
              </Panel>
              <Panel title="Supplier status">
                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Approved</dt><dd className="font-medium text-primary">{approvedVendors.length}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Pending</dt><dd className="font-medium text-destructive">{pendingVendors.length}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">With Paystack</dt><dd className="font-medium">{vendors?.filter(v => v.paystack_subaccount_code).length || 0}</dd></div>
                </dl>
              </Panel>
              <Panel title="Revenue">
                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Gross revenue</dt><dd className="font-medium">{formatNaira(totalRevenue)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Platform (5%)</dt><dd className="font-medium text-primary">{formatNaira(platformCommission)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Supplier payouts</dt><dd className="font-medium">{formatNaira(supplierEarnings)}</dd></div>
                </dl>
              </Panel>
            </div>

            <Panel
              title="Recent orders"
              flush
              action={<Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setActiveTab('orders')}>View all <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button>}
            >
              {recentOrders.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {recentOrders.map((o: any) => (
                    <li key={o.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">Order #{String(o.id).slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</p>
                      </div>
                      <StatusBadge status={o.status} />
                      <span className="w-24 shrink-0 text-right font-semibold">{formatNaira(o.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}

        {/* Suppliers */}
        {activeTab === 'suppliers' && (
          <div className="space-y-4">
            {/* Pending suppliers first */}
            {pendingVendors.length > 0 && (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
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

            <div className="bg-card rounded-xl border border-border overflow-hidden">
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
          <div className="bg-card rounded-xl border border-border overflow-hidden">
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
                            <SelectTrigger className="h-7 te
