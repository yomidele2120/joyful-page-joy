import { Search, MessageCircle, PackageCheck } from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: Search,
    title: 'Discover',
    text: 'Browse thousands of listings by category, or swipe through vendor videos in Watch mode.',
  },
  {
    number: '02',
    icon: MessageCircle,
    title: 'Connect',
    text: 'Chat directly with the vendor, ask questions, and pay securely when you\u2019re ready.',
  },
  {
    number: '03',
    icon: PackageCheck,
    title: 'Receive',
    text: 'Your order is tracked from the vendor to your doorstep, wherever you are in the country.',
  },
];

export default function HowItWorks() {
  return (
    <section className="py-14 md:py-20">
      <div className="container">
        <div className="max-w-lg mb-10 md:mb-14">
          <span className="text-xs font-semibold tracking-wide text-primary uppercase">How it works</span>
          <h2 className="font-heading text-2xl md:text-3xl font-bold text-foreground mt-1">
            From browsing to your doorstep, in three steps
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8 md:gap-6 relative">
          {steps.map((step, i) => (
            <div key={step.number} className="relative">
              <span className="font-heading text-5xl md:text-6xl font-bold text-foreground/[0.06] leading-none absolute -top-3 -left-1 select-none" aria-hidden>
                {step.number}
              </span>
              <div className="relative pt-6">
                <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <step.icon className="w-5 h-5" />
                </div>
                <h3 className="font-heading text-base font-semibold text-foreground mb-1.5">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">{step.text}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-11 -right-3 w-6 border-t border-dashed border-border" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
