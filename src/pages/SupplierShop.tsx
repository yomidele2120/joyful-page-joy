import { useParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import ProductCard from '@/components/ProductCard';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, MapPin, Phone, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SupplierShop() {
  const { vendorId } = useParams();

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

  if (isLoading) return <Layout><div className="container py-16 text-center"><p>Loading shop...</p></div></Layout>;
  if (!vendor) return <Layout><div className="container py-16 text-center"><h1 className="font-heading text-2xl font-bold">Shop not found</h1></div></Layout>;

  const whatsappNumber = (vendor.whatsapp_number || vendor.phone || '').replace(/[^0-9]/g, '');

  return (
    <Layout>
      {/* Shop Header */}
      <div className="bg-secondary border-b border-border">
        <div className="container py-8">
          <div className="flex items-start gap-4">
            {vendor.logo_url ? (
              <img src={vendor.logo_url} alt={vendor.store_name} className="w-16 h-16 rounded-lg object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center">
                <Store className="w-8 h-8 text-primary" />
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading text-2xl font-bold">{vendor.store_name}</h1>
                {vendor.is_approved && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">✓ Verified</span>}
              </div>
              {vendor.store_description && <p className="text-sm text-muted-foreground mt-1">{vendor.store_description}</p>}
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                {vendor.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{vendor.address}</span>}
                {vendor.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{vendor.phone}</span>}
              </div>
            </div>
            {whatsappNumber && (
              <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">
                <Button className="bg-[hsl(142,70%,45%)] hover:bg-[hsl(142,70%,40%)] text-white gap-2">
                  <MessageCircle className="w-4 h-4" /> Chat on WhatsApp
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="container py-8">
        <h2 className="font-heading text-xl font-bold mb-4">{products?.length || 0} Products</h2>
        {products?.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {products.map(p => <ProductCard key={p.id} id={p.id} name={p.name} slug={p.slug} price={p.price} compare_at_price={p.compare_at_price} image_url={p.image_url} badge={p.badge} brand={p.brand} />)}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">This shop has no products yet.</p>
        )}
      </div>
    </Layout>
  );
}
