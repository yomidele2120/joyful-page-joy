import { useEffect } from 'react';
import JsonLd from '@/components/seo/JsonLd';
import { faqPage } from '@/lib/seo/structuredData';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/layout/Layout';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useProducts } from '@/hooks/useProducts';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

// Supplier landing page. Everything here is true of the platform as built: no sales figures, no testimonials, no promised
// timings. Plan prices are read live from the database, so the page can never show a price an admin did not set.

const SIGN = { fontFamily: '"Big Shoulders Display", "Space Grotesk", system-ui, sans-serif' } as const;

const PERKS: Array<{ title: string; text: string }> = [
  { title: 'A shop page of your own', text: 'Your name, logo and description, with every product you list. Approved suppliers carry the verified badge.' },
  { title: 'Paid through Paystack', text: 'Buyers pay on the site. The money goes to your bank account, so you are not chasing transfers.' },
  { title: 'Buyers who ask for quotes', text: 'Shoppers post what they need in bulk. You see the request and reply with your price.' },
  { title: 'Chat and calls in the app', text: 'Buyers message or call you from your shop. When you are on a call, the next caller waits in a queue instead of getting a dead line.' },
  { title: 'Upload hundreds, not one by one', text: 'Import your product list in bulk. An AI helper can tidy a title or description, and you decide what to keep.' },
  { title: 'Promotion on the homepage', text: 'Paid plans include a banner built from your real shop details, shown on the homepage and your shop page.' },
];

const STEPS: Array<{ title: string; text: string }> = [
  { title: 'Create your account', text: 'Sign up with your email and your business details.' },
  { title: 'We check it', text: 'The team reviews your shop before it goes public.' },
  { title: 'List your products', text: 'Add them one at a time or import a spreadsheet.' },
  { title: 'Take orders, get paid', text: 'Buyers order and pay. Paystack sends your money to your bank.' },
];

const FAQ: Array<{ q: string; a: string }> = [
  { q: 'Does it cost anything to start?', a: 'No. The Free plan lets you open a shop and list products. Paid plans add visibility and advertising; their prices are in the plans section above.' },
  { q: 'How do I get paid?', a: 'Buyers pay through Paystack. You add your bank details in your dashboard and payouts are sent there.' },
  { q: 'Who approves my shop?', a: 'The ITHUBAFRICA team reviews each new supplier. You will be told in the app once a decision is made.' },
  { q: 'What am I allowed to sell?', a: 'Anything legal that meets our rules. Read the seller agreement and the policies linked in the footer before you list.' },
  { q: 'Can I list many products at once?', a: 'Yes. Use bulk import in your dashboard. You can still edit every product afterwards.' },
];

type Plan = { slug: string; name: string; price_kobo: number | null; period_days: number | null; visibility_boost: number; purchase_enabled: boolean };

function usePlans() {
  return useQuery({
    queryKey: ['public-supplier-plans'], staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('supplier_membership_plans')
        .select('slug, name, price_kobo, period_days, visibility_boost, purchase_enabled').eq('is_active', true);
      if (error) throw error;
      const order = ['free', 'silver', 'premium', 'gold', 'diamond'];
      return ((data ?? []) as Plan[]).sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
    },
  });
}

function priceLine(p: Plan): { big: string; small: string } {
  if (p.slug === 'free') return { big: 'Free', small: 'to open a shop' };
  if (p.price_kobo && p.purchase_enabled) {
    return { big: `₦${(p.price_kobo / 100).toLocaleString('en-NG')}`, small: p.period_days ? `every ${p.period_days} days` : '' };
  }
  return { big: 'Soon', small: 'price not announced yet' };
}

export default function SellOnIthub() {
  const { isVendor } = useAuth();
  const { data: products } = useProducts({ limit: 24 });
  const { data: plans } = usePlans();
  const crates = (products ?? []).filter(p => p.image_url).slice(0, 6);
  const cta = isVendor ? { to: '/supplier-dashboard', label: 'Go to my shop' } : { to: '/supplier-signup', label: 'Open your shop' };

  useEffect(() => {
    const old = document.title;
    document.title = 'Sell on IT Hub Africa';
    return () => { document.title = old; };
  }, []);

  return (
    <Layout>
      <JsonLd id="sell-faq" data={faqPage(FAQ.map(f => ({ q: f.q, a: f.a })))} />
      <style>{`
        @keyframes ithaCrate { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .itha-crate { animation: ithaCrate .5s cubic-bezier(.2,.7,.2,1) both; }
        @media (prefers-reduced-motion: reduce) { .itha-crate { animation: none; } }
      `}</style>

      {/* Hero */}
      <section className="bg-[#0a2236] text-white">
        <div className="container max-w-[1200px] grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:py-20">
          <div>
            <h1 style={SIGN} className="text-[3.4rem] font-extrabold uppercase leading-[0.92] sm:text-[5rem] lg:text-[6.2rem]">
              Sell to buyers across Nigeria
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-white/75 sm:text-lg">
              Open a shop, list your products and get paid into your bank account. Start on the free plan.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to={cta.to} className="rounded-xl bg-[#f26a1b] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[#d95c12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{cta.label}</Link>
              <a href="#how" className="px-3 py-3 text-base font-medium text-white/80 underline-offset-4 hover:text-white hover:underline">See how it works</a>
            </div>
          </div>

          {/* The stall: a painted fascia board over a counter of real products */}
          <div aria-hidden={crates.length === 0} className="mx-auto w-full max-w-md">
            <div className="rounded-t-md border-x-[6px] border-t-[6px] border-[#f26a1b] bg-[#0a2236] px-4 py-3 text-center">
              <p style={SIGN} className="text-3xl font-black uppercase leading-none tracking-wide text-white sm:text-4xl">Your shop name</p>
            </div>
            <div className="grid grid-cols-3 gap-[6px] border-x-[6px] border-b-[6px] border-[#f26a1b] bg-[#f26a1b] p-0">
              {(crates.length ? crates : Array.from({ length: 6 }, () => null)).map((p, i) => (
                <div key={p?.id ?? i} className="itha-crate aspect-square overflow-hidden bg-white/10" style={{ animationDelay: `${i * 70}ms` }}>
                  {p?.image_url && <img src={p.thumb_url || p.image_url} alt="" loading={i < 3 ? 'eager' : 'lazy'} className="h-full w-full object-cover" />}
                </div>
              ))}
            </div>
            <div className="h-3 bg-[#061624]" />
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="container max-w-[1200px] py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <h2 style={SIGN} className="text-4xl font-extrabold uppercase leading-[0.95] sm:text-6xl lg:sticky lg:top-24 lg:self-start">
            What a shop here can do
          </h2>
          <ul className="divide-y divide-border border-y border-border">
            {PERKS.map(perk => (
              <li key={perk.title} className="grid gap-1 py-6 sm:grid-cols-[14rem_1fr] sm:gap-8">
                <h3 className="font-heading text-lg font-semibold">{perk.title}</h3>
                <p className="max-w-prose leading-relaxed text-muted-foreground">{perk.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it starts: a real sequence */}
      <section id="how" className="scroll-mt-20 bg-secondary/60 py-16 sm:py-24">
        <div className="container max-w-[1200px]">
          <h2 style={SIGN} className="mb-12 text-4xl font-extrabold uppercase leading-[0.95] sm:text-6xl">From sign-up to first order</h2>
          <ol className="grid gap-10 md:grid-cols-4 md:gap-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative md:pt-9">
                <span className="hidden md:absolute md:left-0 md:right-[-1.5rem] md:top-[0.85rem] md:block md:border-t-2 md:border-dashed md:border-foreground/30 md:last:hidden" aria-hidden="true" />
                <span style={SIGN} className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#f26a1b] text-xl font-extrabold text-white md:absolute md:left-0 md:top-0 md:h-7 md:w-7 md:text-base">{i + 1}</span>
                <h3 className="mt-3 font-heading text-lg font-semibold md:mt-0">{s.title}</h3>
                <p className="mt-1 max-w-xs leading-relaxed text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Plans, read live */}
      <section className="container max-w-[1200px] py-16 sm:py-24">
        <h2 style={SIGN} className="text-4xl font-extrabold uppercase leading-[0.95] sm:text-6xl">Plans</h2>
        <p className="mt-4 max-w-xl text-muted-foreground">Start free. Paid plans rank your products higher in search and listings and include homepage advertising. Prices are set by IT Hub Africa and shown here as they are today.</p>
        {plans && plans.length > 0 && (
          <div className="mt-10 grid divide-y divide-border border-y border-border md:grid-cols-3 md:divide-x md:divide-y-0">
            {plans.map(p => {
              const price = priceLine(p);
              return (
                <div key={p.slug} className="py-8 md:px-8 md:first:pl-0 md:last:pr-0">
                  <h3 className="font-heading text-lg font-semibold">{p.name}</h3>
                  <p style={SIGN} className="mt-2 text-5xl font-extrabold leading-none">{price.big}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{price.small}</p>
                  <p className="mt-4 text-sm leading-relaxed">
                    {p.slug === 'free' ? 'Shop page, product listings, orders, chat and calls.'
                      : p.visibility_boost > 0 ? 'Everything in Free, a ranking boost in search and listings, and homepage advertising.' : 'Everything in Free, plus homepage advertising.'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* FAQ */}
      <section className="container max-w-[1200px] pb-16 sm:pb-24">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <h2 style={SIGN} className="text-4xl font-extrabold uppercase leading-[0.95] sm:text-6xl">Questions sellers ask</h2>
          <Accordion type="single" collapsible className="border-t border-border">
            {FAQ.map((f, i) => (
              <AccordionItem key={f.q} value={`q${i}`}>
                <AccordionTrigger className="text-left font-heading text-base font-semibold">{f.q}</AccordionTrigger>
                <AccordionContent className="max-w-prose leading-relaxed text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Close */}
      <section className="bg-[#0a2236] py-14 text-white sm:py-20">
        <div className="container max-w-[1200px] flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <p style={SIGN} className="max-w-2xl text-4xl font-extrabold uppercase leading-[0.95] sm:text-5xl">Your products, in front of buyers today</p>
          <Link to={cta.to} className="rounded-xl bg-[#f26a1b] px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[#d95c12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{cta.label}</Link>
        </div>
      </section>
    </Layout>
  );
}
