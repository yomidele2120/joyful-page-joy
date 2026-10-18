import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Info, Wallet } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import ProductCard from '@/components/ProductCard';
import { Button } from '@/components/ui/button';
import { useProducts } from '@/hooks/useProducts';
import { bnplEligibleForPrice, usePayLaterAvailable, usePublicFinance } from '@/hooks/useMarketplace';
import { formatNaira } from '@/lib/format';

const PAGE = 24;

const STEPS = [
  { title: 'Pick an eligible product', text: 'Look for the "Pay later" label. Only products the seller allowed, within the limits below, are shown here.' },
  { title: 'Choose Pay later at checkout', text: 'Add it to your cart, enter your delivery details and choose "Buy now, pay later with Klump".' },
  { title: 'Klump reviews you', text: 'Klump opens its own window. It decides whether you are approved and shows your instalment plan before you confirm.' },
  { title: 'We confirm your order', text: 'After Klump confirms, our system checks the result with Klump directly. Your order is marked paid and you get a notification.' },
];

export default function PayLater() {
  const { data: finance } = usePublicFinance();
  const available = usePayLaterAvailable();
  const { data: products, isLoading } = useProducts({ bnplOnly: true, limit: 200 });
  const [visible, setVisible] = useState(PAGE);

  // Only products that really fit right now (switched on, within the amount limits) are advertised.
  const eligible = useMemo(
    () => (products ?? []).filter(p => bnplEligibleForPrice(p, finance, available)),
    [products, finance, available],
  );

  const fee = finance ? Number(finance.bnpl_fee_percent) : 0;

  return (
    <Layout>
      <section className="border-b border-border bg-secondary/40">
        <div className="container max-w-5xl py-10">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-primary"><Wallet className="h-4 w-4" /> Buy now, pay later</p>
          <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl">Spread the cost of eligible orders</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Pay later is provided by Klump, not by us. Klump decides whether you are approved and shows your instalment plan before you confirm.
            Being shown the option does not guarantee approval.
          </p>
        </div>
      </section>

      <div className="container max-w-5xl py-8">
        {!available && (
          <p role="status" className="mb-8 flex gap-3 border border-border bg-card p-4 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Pay later is not available right now, so no products are listed here. You can still pay by card at checkout. Please check again later.</span>
          </p>
        )}

        <h2 className="font-heading text-xl font-semibold">How it works</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3 border border-border bg-card p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
              <span><span className="block font-medium">{step.title}</span><span className="mt-1 block text-sm text-muted-foreground">{step.text}</span></span>
            </li>
          ))}
        </ol>

        <h2 className="mt-10 font-heading text-xl font-semibold">Who can use it</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {[
            'You are signed in and have a delivery address and phone number on your order.',
            'Every item in your cart is marked "Pay later" by its seller.',
            finance
              ? `The order total, including 7.5% VAT, is between ${formatNaira(Number(finance.bnpl_min_order))} and ${formatNaira(Number(finance.bnpl_max_order))}.`
              : 'The order total, including VAT, is within the limits shown at checkout.',
            'Klump approves your application. Preorders cannot be paid for with Pay later.',
          ].map(text => (
            <li key={text} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> <span>{text}</span></li>
          ))}
        </ul>

        <h2 className="mt-10 font-heading text-xl font-semibold">What it costs</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {finance && fee > 0
            ? <>A Pay later fee of {fee}% of the order total applies. {finance.bnpl_fee_bearer === 'customer' ? 'It is added to your total and shown before you confirm.' : 'You do not pay it: it is covered by the seller or the marketplace.'} </>
            : <>Any fee that applies to you is shown at checkout before you confirm. </>}
          The number of instalments, their dates and amounts, and any late-payment charges are set by Klump and shown to you when you apply.
          You can follow the status of your order under <Link to="/my-orders" className="text-primary hover:underline">My orders</Link>.
          Read the full <Link to="/bnpl-terms" className="text-primary hover:underline">BNPL Terms and Conditions</Link>.
        </p>

        {available && (
          <>
            <h2 className="mt-12 font-heading text-xl font-semibold">Products you can pay for later</h2>
            {isLoading ? (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 sm:gap-3">
                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse bg-secondary" />)}
              </div>
            ) : eligible.length ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 sm:gap-3">
                  {eligible.slice(0, visible).map(product => <ProductCard key={product.id} {...product} />)}
                </div>
                {visible < eligible.length && (
                  <div className="mt-6 text-center"><Button variant="outline" onClick={() => setVisible(v => v + PAGE)}>Show more</Button></div>
                )}
              </>
            ) : (
              <p className="mt-4 border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No products are marked for Pay later at the moment. <Link to="/products" className="text-primary hover:underline">Browse all products</Link>.
              </p>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
