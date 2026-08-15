import { ShieldCheck, Truck, Store, Wallet } from 'lucide-react';

const points = [
  {
    icon: <Store className="w-5 h-5" />,
    title: 'Every Category, One Place',
    text: 'Fashion, electronics, home goods, beauty, groceries and more — all in one marketplace.',
  },
  {
    icon: <ShieldCheck className="w-5 h-5" />,
    title: 'Verified Vendors',
    text: 'Every seller is vetted, so you can buy with confidence.',
  },
  {
    icon: <Wallet className="w-5 h-5" />,
    title: 'Secure Payments',
    text: 'Pay safely with trusted, encrypted checkout.',
  },
  {
    icon: <Truck className="w-5 h-5" />,
    title: 'Nationwide Delivery',
    text: 'Tracked delivery from vendor to your doorstep.',
  },
];

export default function AboutSection() {
  return (
    <section className="py-12 md:py-16 bg-secondary/40 border-y border-border">
      <div className="container">
        <div className="max-w-xl mb-8">
          <span className="text-xs font-semibold tracking-wide text-primary uppercase">Why MarketHub</span>
          <h2 className="font-heading text-2xl md:text-3xl font-bold text-foreground mt-1">
            Built for buyers and sellers who want it done right
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {points.map((p) => (
            <div key={p.title} className="flex flex-col gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                {p.icon}
              </div>
              <div>
                <h3 className="font-heading text-sm font-semibold text-foreground mb-1">{p.title}</h3>
                <p className="text-xs text-muted-foreground leading-snug">{p.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
