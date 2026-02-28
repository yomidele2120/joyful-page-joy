import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { User, ShoppingBag, Heart, Bell, Package, MapPin, Phone, Mail } from 'lucide-react';
import { formatNaira } from '@/lib/format';

export default function UserDashboard() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');

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

  const handleProfileLoad = () => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        address: profile.address || '',
        city: profile.city || '',
        state: profile.state || '',
      });
    }
  };

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
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'delivered': return 'bg-green-500/10 text-green-700';
      case 'shipped': return 'bg-blue-500/10 text-blue-700';
      case 'pending': return 'bg-yellow-500/10 text-yellow-700';
      case 'cancelled': return 'bg-red-500/10 text-red-700';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Layout>
      <div className="container py-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-bold">
                Welcome, {profile?.full_name || user?.email?.split('@')[0]}
              </h1>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>Logout</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ShoppingBag className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{orders?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Orders</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Heart className="w-8 h-8 text-destructive" />
              <div>
                <p className="text-2xl font-bold">{wishlist?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Wishlist</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Package className="w-8 h-8 text-accent-foreground" />
              <div>
                <p className="text-2xl font-bold">
                  {orders?.filter(o => o.status === 'delivered').length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Delivered</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Bell className="w-8 h-8 text-accent-foreground" />
              <div>
                <p className="text-2xl font-bold">
                  {orders?.filter(o => o.status === 'pending').length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="wishlist">Wishlist</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Full Name</Label>
                    <Input
                      value={profileForm.full_name}
                      onChange={e => setProfileForm(p => ({ ...p, full_name: e.target.value }))}
                      onFocus={handleProfileLoad}
                      placeholder={profile?.full_name || 'Your name'}
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input value={user?.email || ''} disabled />
                  </div>
                  <div>
                    <Label><Phone className="w-3 h-3 inline mr-1" />Phone</Label>
                    <Input
                      value={profileForm.phone}
                      onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                      onFocus={handleProfileLoad}
                      placeholder={profile?.phone || 'Phone number'}
                    />
                  </div>
                  <div>
                    <Label><MapPin className="w-3 h-3 inline mr-1" />Address</Label>
                    <Input
                      value={profileForm.address}
                      onChange={e => setProfileForm(p => ({ ...p, address: e.target.value }))}
                      onFocus={handleProfileLoad}
                      placeholder={profile?.address || 'Address'}
                    />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input
                      value={profileForm.city}
                      onChange={e => setProfileForm(p => ({ ...p, city: e.target.value }))}
                      onFocus={handleProfileLoad}
                      placeholder={profile?.city || 'City'}
                    />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Input
                      value={profileForm.state}
                      onChange={e => setProfileForm(p => ({ ...p, state: e.target.value }))}
                      onFocus={handleProfileLoad}
                      placeholder={profile?.state || 'State'}
                    />
                  </div>
                </div>
                <Button onClick={handleSaveProfile}>Save Changes</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders">
            {orders?.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No orders yet. Start shopping!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {orders?.map(order => (
                  <Card key={order.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-medium text-sm">Order #{order.id.slice(0, 8)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(order.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={statusColor(order.status)}>{order.status}</Badge>
                          <span className="font-bold">{formatNaira(order.total)}</span>
                        </div>
                      </div>
                      {order.order_items?.map((item: any) => (
                        <div key={item.id} className="flex items-center gap-3 py-2 border-t border-border">
                          <img
                            src={item.products?.image_url || '/placeholder.svg'}
                            alt={item.products?.name}
                            className="w-10 h-10 rounded object-cover"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{item.products?.name}</p>
                            <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                          </div>
                          <p className="text-sm font-medium">{formatNaira(item.price)}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Wishlist Tab */}
          <TabsContent value="wishlist">
            {wishlist?.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Heart className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Your wishlist is empty.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {wishlist?.map((item: any) => (
                  <Card key={item.id}>
                    <CardContent className="p-4">
                      <img
                        src={item.products?.image_url || '/placeholder.svg'}
                        alt={item.products?.name}
                        className="w-full h-40 object-cover rounded mb-3"
                      />
                      <h3 className="font-medium text-sm mb-1">{item.products?.name}</h3>
                      <p className="font-bold text-primary mb-3">{formatNaira(item.products?.price)}</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1" asChild>
                          <a href={`/product/${item.products?.slug}`}>View</a>
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => removeFromWishlist(item.id)}>
                          Remove
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
