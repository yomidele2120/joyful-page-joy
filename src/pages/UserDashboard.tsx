import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ShoppingBag, Heart, Package, MapPin, Phone, MessageCircle, LayoutDashboard, UserRound,
  ChevronRight, ShoppingCart, FileText, Store,
} from 'lucide-react';
import { formatNaira } from '@/lib/format';
import { useUnreadCount } from '@/hooks/useChat';
import UserMessages from '@/components/dashboard/UserMessages';
import OrderShipments, { type Shipment } from '@/components/dashboard/OrderShipments';
import DashboardShell, { Panel, StatCard, WelcomeBanner, useTabParam, type DashNavItem } from '@/components/dashboard/DashboardShell';
import { BrandFlyerBanner } from '@/components/flyers/BrandFlyerImage';
import { BRAND_FLYERS } from '@/lib/brandFlyers';

export default function UserDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useTabParam('overview', ['overview', 'orders', 'wishlist', 'messages', 'profile']);
  const unreadCount = useUnreadCount();

  // Fetch profile
  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Fetch orders
  const { data: orders } = useQuery({
    queryKey: ['user-orders', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*, products(name, image_url))')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  // Shipments (one per supplier per order): shipped, confirm receipt, report a problem
  const { data: shipments } = useQuery({
    queryKey: ['user-shipments', user?.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from('order_shipments').select('*, vendors(store_name)');
      return (data ?? []) as Shipment[];
    },
    enabled: !!user,
  });

  // Fetch wishlist
  const { data: wishlist } = useQuery({
    queryKey: ['user-wishlist', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('wishlist')
        .select('*, products(name, price, image_url, slug)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    phone: '',
    address: '',
    city: '',
    state: '',
  });

  // Fill the form as soon as the profile arrives.
  useEffect(() => {
    if (!profile) return;
    setProfileForm({
      full_name: profile.full_name || '',
      phone: profile.phone || '',
      address: profile.address || '',
      city: profile.city || '',
      state: profile.state || '',
    });
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!user) return;
    const { error } = await supabase
      .from('profiles')
      .update(profileForm)
      .eq('user_id', user.id);
    if (error) {
      toast.error('Failed to update profile');
    } else {
      toast.success('Profile updated!');
      refetchProfile();
    }
  };

  const removeFromWishlist = async (id: string) => {
    await supabase.from('wishlist').delete().eq('id', id);
    toast.success('Removed from wishlist');
    queryClient.invalidateQueries({ queryKey: ['user-wishlist'] });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'delivered': return 'bg-green-500/10 text-green-700 dark:text-green-400';
      case 'shipped': return 'bg-blue-500/10 text-blue-700';
      case 'pending': return 'bg-yellow-500/10 text-yellow-700';
      case 'cancelled': return 'bg-red-500/10 text-red-700';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'there';
  const delivered = orders?.filter(o => o.status === 'delivered').length || 0;
  const recent = (orders ?? []).slice(0, 3);

  const navItems: DashNavItem[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'My account' },
    { key: 'orders', label: 'My orders', icon: ShoppingBag, group: 'My account' },
    { key: 'wishlist', label: 'Wishlist', icon: Heart, group: 'My account' },
    { key: 'messages', label: 'Messages', icon: MessageCircle, badge: unreadCount, group: 'Connect' },
    { key: 'profile', label: 'Profile', icon: UserRound, group: 'Settings' },
  ];

  const drawerActions = (
    <>
      <Link to="/cart" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white">
        <ShoppingCart className="h-[18px] w-[18px]" /> My cart
      </Link>
      <Link to="/rfq" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white">
        <FileText className="h-[18px] w-[18px]" /> My quotations
      </Link>
    </>
  );

  return (
    <DashboardShell
      panelLabel="My account"
      title={displayName}
      subtitle={user?.email}
      items={navItems}
      active={activeTab}
      onSelect={setActiveTab}
      onSignOut={() => { signOut(); navigate('/'); }}
      drawerActions={drawerActions}
    >
      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <WelcomeBanner title={`Welcome, ${displayName}`} text="Track your orders, saved products and conversations with suppliers.">
            <Button size="sm" variant="secondary" asChild><Link to="/products"><Store className="mr-1.5 h-4 w-4" />Browse products</Link></Button>
            <Button size="sm" variant="secondary" asChild><Link to="/rfq/new">Request a quote</Link></Button>
          </WelcomeBanner>

          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<ShoppingBag />} label="Orders" value={String(orders?.length || 0)} />
            <StatCard icon={<Heart />} tone="rose" label="Wishlist" value={String(wishlist?.length || 0)} />
            <StatCard icon={<Package />} tone="accent" label="Delivered" value={String(delivered)} />
            <StatCard icon={<MessageCircle />} tone="sky" label="Unread messages" value={String(unreadCount)} />
          </div>

          <Panel
            title="Recent orders" flush
            action={<Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setActiveTab('orders')}>View all <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button>}
          >
            {recent.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No orders yet. Start shopping!</p>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map(order => (
                  <li key={order.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">Order #{order.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</p>
                    </div>
                    <Badge className={statusColor(order.status)}>{order.status}</Badge>
                    <span className="w-24 shrink-0 text-right font-semibold">{formatNaira(order.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <BrandFlyerBanner flyer={BRAND_FLYERS.seamlessPurple} />
        </div>
      )}

      {/* Orders */}
      {activeTab === 'orders' && (
        orders?.length === 0 ? (
          <EmptyState icon={<ShoppingBag className="mx-auto mb-3 h-12 w-12 opacity-50" />} text="No orders yet. Start shopping!" />
        ) : (
          <div className="space-y-4">
            {orders?.map(order => (
              <Panel key={order.id} flush>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Order #{order.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColor(order.status)}>{order.status}</Badge>
                    <span className="font-bold">{formatNaira(order.total)}</span>
                  </div>
                </div>
                {order.order_items?.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                    <img src={item.products?.image_url || '/placeholder.svg'} alt={item.products?.name} className="h-11 w-11 rounded-md bg-white object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.products?.name}</p>
                      <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-medium">{formatNaira(item.price)}</p>
                  </div>
                ))}
                <OrderShipments
                  shipments={(shipments ?? []).filter(s => s.order_id === order.id)}
                  onChanged={() => queryClient.invalidateQueries({ queryKey: ['user-shipments'] })}
                />
              </Panel>
            ))}
          </div>
        )
      )}

      {/* Wishlist */}
      {activeTab === 'wishlist' && (
        wishlist?.length === 0 ? (
          <EmptyState icon={<Heart className="mx-auto mb-3 h-12 w-12 opacity-50" />} text="Your wishlist is empty." />
        ) : (
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-3">
            {wishlist?.map((item: any) => (
              <Panel key={item.id}>
                <img src={item.products?.image_url || '/placeholder.svg'} alt={item.products?.name} className="mb-3 h-40 w-full rounded-lg bg-white object-contain" />
                <h3 className="mb-1 line-clamp-2 text-sm font-medium">{item.products?.name}</h3>
                <p className="mb-3 font-bold text-primary">{formatNaira(item.products?.price)}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" asChild>
                    <Link to={`/product/${item.products?.slug}`}>View</Link>
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => removeFromWishlist(item.id)}>Remove</Button>
                </div>
              </Panel>
            ))}
          </div>
        )
      )}

      {/* Messages */}
      {activeTab === 'messages' && <UserMessages />}

      {/* Profile */}
      {activeTab === 'profile' && (
        <Panel title="Personal information" className="max-w-3xl">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="pf-name">Full name</Label>
              <Input id="pf-name" value={profileForm.full_name} onChange={e => setProfileForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Your name" />
            </div>
            <div>
              <Label htmlFor="pf-email">Email</Label>
              <Input id="pf-email" value={user?.email || ''} disabled />
            </div>
            <div>
              <Label htmlFor="pf-phone"><Phone className="mr-1 inline h-3 w-3" />Phone</Label>
              <Input id="pf-phone" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone number" />
            </div>
            <div>
              <Label htmlFor="pf-address"><MapPin className="mr-1 inline h-3 w-3" />Address</Label>
              <Input id="pf-address" value={profileForm.address} onChange={e => setProfileForm(p => ({ ...p, address: e.target.value }))} placeholder="Address" />
            </div>
            <div>
              <Label htmlFor="pf-city">City</Label>
              <Input id="pf-city" value={profileForm.city} onChange={e => setProfileForm(p => ({ ...p, city: e.target.value }))} placeholder="City" />
            </div>
            <div>
              <Label htmlFor="pf-state">State</Label>
              <Input id="pf-state" value={profileForm.state} onChange={e => setProfileForm(p => ({ ...p, state: e.target.value }))} placeholder="State" />
            </div>
          </div>
          <Button className="mt-5" onClick={handleSaveProfile}>Save changes</Button>
        </Panel>
      )}
    </DashboardShell>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
      {icon}
      <p>{text}</p>
    </div>
  );
}
