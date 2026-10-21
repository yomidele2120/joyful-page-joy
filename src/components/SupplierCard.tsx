import { Link } from 'react-router-dom';
import { BadgeCheck, MapPin, MessageSquare, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SupplierSummary } from '@/hooks/useProducts';
import { formatSupplierProductCount } from '@/lib/productSearch';

export default function SupplierCard({ supplier, layout = 'card' }: { supplier: SupplierSummary; layout?: 'card' | 'row' }) {
  const meta = [
    supplier.business_type,
    supplier.year_established ? `Since ${supplier.year_established}` : null,
    `${formatSupplierProductCount(supplier.product_count)} product${supplier.product_count === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' - ');

  const logo = supplier.logo_url ? (
    <img src={supplier.logo_url} alt="" className="h-12 w-12 shrink-0 bg-white object-cover" />
  ) : (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center bg-primary/10"><Store className="h-6 w-6 text-primary" /></span>
  );

  return (
    <div className={`border border-border bg-card p-4 ${layout === 'row' ? 'flex flex-col gap-3 sm:flex-row sm:items-center' : 'h-full'}`}>
      <Link to={`/shop/${supplier.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        {logo}
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-sm font-semibold">
            <span className="truncate">{supplier.store_name}</span>
            {supplier.is_approved && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Verified supplier" />}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta}</span>
          {supplier.location && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {supplier.location}</span>
          )}
        </span>
      </Link>
      {supplier.store_description && layout === 'card' && (
        <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{supplier.store_description}</p>
      )}
      <div className={`flex gap-2 ${layout === 'card' ? 'mt-3' : ''}`}>
        <Link to={`/shop/${supplier.id}`} className="flex-1"><Button variant="outline" size="sm" className="w-full">View store</Button></Link>
        <Link to={`/messages?vendor=${supplier.user_id}`}>
          <Button size="sm" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Contact</Button>
        </Link>
      </div>
    </div>
  );
}
