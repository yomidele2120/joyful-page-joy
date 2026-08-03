import { ShieldCheck, Truck, Store, Wallet } from 'lucide-react';

const points = [
  {
    icon: <Store className="w-5 h-5" />,
    title: 'Every Category, One Place',
    text: 'From fashion and electronics to home goods, beauty, groceries and more — shop everything in one marketplace.',
  },
  {
    icon: <ShieldCheck className="w-5 h-5" />,
    title: 'Verified Vendors',
    text: 'Every seller on our platform is vetted, so you can buy with confidence.',
  },
  {
    icon: <Wallet className="w-5 h-5" />,
    title: 'Secure Payments',
    text: 'Pay safely with trusted, encrypted payment options at checkout.',
  },
  {
    icon: <Truck className="w-5 h-5" />,
    title: 'Nationwide Delivery',
    text: 'Get your orders delivered wherever you are, tracked from vendor to doorstep.',
  },
];

export default function AboutSection() {
  return (
    <section className="py-10 bg-secondary/50">
      <div className="container">
        <div className="max-w-2xl mx-auto text-center mb-8">
          <h2 className="font-heading text-2xl md:text-3xl font-bold text-foreground mb-3">
            Welcome to MarketHub Africa
          </h2>
          <p className="text-muted-foreground text-sm md:text-base">
            MarketHub Africa is an online marketplace where everyday people and independent
            vendors buy and sell all kinds of goods — fashion, electronics, home essentials,
            beauty products, groceries and more. Whether you're shopping for something specific
            or discovering new finds, or you're a vendor looking to reach more customers, MarketHub
            Africa brings buyers and sellers together in one trusted place.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {points.map((p) => (
            <div
              key={p.title}
              className="bg-card rounded-xl p-4 text-center flex flex-col items-center gap-2 border border-border"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                {p.icon}
              </div>
              <h3 className="font-heading text-sm font-semibold text-foreground">{p.title}</h3>
              <p className="text-xs text-muted-foreground leading-snug">{p.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
