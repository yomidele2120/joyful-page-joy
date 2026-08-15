import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import ProductCard from '@/components/ProductCard';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, MapPin, Phone, Store, MessageSquare, Heart, Images, Film, UserPlus, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useVendorPosts, useVendorFollowerCount, useIsFollowing, useToggleFollow } from '@/hooks/usePosts';
import { toast } from 'sonner';

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

  const { data: products } = useQuery({
    queryKey: ['shop-products', vendorId],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*, categories(name)').eq('vendor_id', vendorId).eq('is_active', true).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!vendorId,
  });

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
    navigate(`/chat?vendor=${vendor.user_id}`);
  };

  const handleFollow = () => {
    if (!user) {
      toast.error('Sign in to follow this shop');
      navigate('/users-login');
      return;
    }
    if (isOwnShop) {
      toast.info("This is your own shop");
      return;
    }
    toggleFollow.mutate({ vendorId: vendor.id, isFollowing: !!isFollowing });
  };

  return (
    <Layout>
      {/* Shop Header */}
      <div className="bg-secondary border-b border-border">
        <div className="container py-6 px-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              {vendor.logo_url ? (
                <img src={vendor.logo_url} alt={vendor.store_name} className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Store className="w-7 h-7 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-heading text-lg sm:text-2xl font-bold break-words">{vendor.store_name}</h1>
                  {vendor.is_approved && <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full whitespace-nowrap">✓ Verified</span>}
                </div>
                {vendor.store_description && <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">{vendor.store_description}</p>}
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                  {vendor.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{vendor.address}</span></span>}
                  {vendor.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3 shrink-0" />{vendor.phone}</span>}
                  <span className="font-medium text-foreground">{(followerCount ?? 0).toLocaleString()} followers</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isOwnShop && (
                <Button
                  onClick={handleFollow}
                  disabled={toggleFollow.isPending}
                  variant={isFollowing ? 'outline' : 'default'}
                  size="sm"
                  className="flex-1 gap-1.5 text-xs"
                >
                  {isFollowing ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                  {isFollowing ? 'Following' : 'Follow'}
                </Button>
              )}
              <Button onClick={handleInAppChat} variant="outline" size="sm" className="flex-1 gap-1.5 text-xs">
                <MessageSquare className="w-3.5 h-3.5" /> Message
              </Button>
              {whatsappNumber && (
                <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button size="sm" className="w-full bg-[hsl(142,70%,45%)] hover:bg-[hsl(142,70%,40%)] text-white gap-1.5 text-xs">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Products / Posts tabs */}
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="container flex px-4">
          <button
            onClick={() => setSearchParams({})}
            className={`flex-1 sm:flex-none sm:px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'products' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            }`}
          >
            {products?.length || 0} Products
          </button>
          <button
            onClick={() => setSearchParams({ view: 'posts' })}
            className={`flex-1 sm:flex-none sm:px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'posts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            }`}
          >
            {posts?.length || 0} Posts
          </button>
        </div>
      </div>

      <div className="container py-6 px-4">
        {activeTab === 'products' ? (
          products?.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
              {products.map(p => <ProductCard key={p.id} id={p.id} name={p.name} slug={p.slug} price={p.price} compare_at_price={p.compare_at_price} image_url={p.image_url} badge={p.badge} brand={p.brand} />)}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">This shop has no products yet.</p>
          )
        ) : posts?.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
            {posts.map((post) => (
              <button
                key={post.id}
                onClick={() => navigate(`/feed?post=${post.id}`)}
                className="relative aspect-[9/16] rounded-lg overflow-hidden bg-muted text-left active:scale-[0.98] transition-transform"
              >
                {post.thumbnail_url ? (
                  <img src={post.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                    {post.media_type === 'images' ? <Images className="w-6 h-6" /> : <Film className="w-6 h-6" />}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[11px] px-2 py-1 flex items-center gap-1">
                  <Heart className="w-3 h-3" /> {post.likes_count}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">This shop hasn't posted any videos yet.</p>
        )}
      </div>
    </Layout>
  );
}
