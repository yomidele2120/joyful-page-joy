import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Info } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import ProductCard from '@/components/ProductCard';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProducts } from '@/hooks/useProducts';
import { formatLongDate, useMarketplaceSettings, usePreorderTaken } from '@/hooks/useMarketplace';

const PAGE = 24;

export default function Preorders() {
  const { data: settings } = useMarketplaceSettings();
  const enabled = settings?.preorder_enabled !== false;
  const { data: products, isLoading } = useProducts({ preorderOnly: true, limit: 200 });
  const [sort, setSort] = useState('soonest');
  const [visible, setVisible] = useState(PAGE);

  const ids = useMemo(() => (products ?? []).map(p => p.id), [products]);
  const { data: taken } = usePreorderTaken(ids);

  const list = useMemo(() => {
    const items = (products ?? []).filter(p => {
      // Hide products whose preorder places are all taken.
      const left = p.preorder_quantity_limit != null ? p.preorder_quantity_limit - (taken?.get(p.id) ?? 0) : null;
      return left === null || left > 0;
    });
    return [...items].sort((a, b) => sort === 'newest'
      ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      : String(a.preorder_release_date ?? '9999').localeCompare(String(b.preorder_release_date ?? '9999')));
  }, [products, taken, sort]);

  return (
    <Layout>
      <section className="border-b border-border bg-secondary/40">
        <div className="container max-w-5xl py-10">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-primary"><CalendarClock className="h-4 w-4" /> Preorders</p>
          <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl">Order now, get it when it arrives</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Preorder products that are not in stock yet. You pay the full price now and the seller delivers once they are available. Expected dates are estimates, and you will be notified if they change.
          </p>
        </div>
      </section>

      <div className="container max-w-5xl py-8">
        <div className="mb-6 border border-border bg-card p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Before you preorder</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Payment is in full when you order. Deposits are not offered at the moment, and Pay later cannot be used.</li>
            <li>Preorders are paid for separately from in-stock items.</li>
            <li>If the expected date moves more than {settings?.preorder_delay_cancel_days ?? 14} days later, you can cancel for a full refund.</li>
            <li>Track your preorder and ask to cancel under <Link to="/my-orders" className="text-primary hover:underline">My orders</Link>. Read the <Link to="/preorder-policy" className="text-primary hover:underline">Preorder Policy</Link>.</li>
          </ul>
        </div>

        {!enabled ? (
          <p role="status" className="flex gap-3 border border-border bg-card p-4 text-sm"><Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Preorders are not available right now. Please check again later.</p>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{isLoading ? 'Loading...' : `${list.length} preorder product${list.length === 1 ? '' : 's'}`}</p>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-10 w-[190px] bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="soonest">Available soonest</SelectItem>
                  <SelectItem value="newest">Newest listings</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 sm:gap-3">
                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse bg-secondary" />)}
              </div>
            ) : list.length ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 sm:gap-3">
                  {list.slice(0, visible).map(product => {
                    const left = product.preorder_quantity_limit != null ? product.preorder_quantity_limit - (taken?.get(product.id) ?? 0) : null;
                    return (
                      <div key={product.id} className="flex flex-col">
                        <ProductCard {...product} />
                        <dl className="space-y-0.5 border border-t-0 border-border bg-card px-2 py-1.5 text-[11px] text-muted-foreground sm:px-3 sm:text-xs">
                          <div className="flex justify-between gap-2"><dt>Expected</dt><dd className="text-right font-medium text-foreground">{formatLongDate(product.preorder_release_date) || 'TBC'}</dd></div>
                          {product.preorder_delivery_estimate && <div className="flex justify-between gap-2"><dt>Delivery</dt><dd className="text-right font-medium text-foreground">{formatLongDate(product.preorder_delivery_estimate)}</dd></div>}
                          {left !== null && <div className="flex justify-between gap-2"><dt>Places left</dt><dd className="font-medium text-foreground">{left}</dd></div>}
                          {product.preorder_max_per_order != null && <div className="flex justify-between gap-2"><dt>Max per order</dt><dd className="font-medium text-foreground">{product.preorder_max_per_order}</dd></div>}
                        </dl>
                      </div>
                    );
                  })}
                </div>
                {visible < list.length && <div className="mt-6 text-center"><Button variant="outline" onClick={() => setVisible(v => v + PAGE)}>Show more</Button></div>}
              </>
            ) : (
              <p className="border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                There are no products open for preorder right now. <Link to="/products" className="text-primary hover:underline">Browse all products</Link>.
              </p>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
