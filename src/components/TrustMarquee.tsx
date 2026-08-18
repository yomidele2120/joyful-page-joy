import { ShieldCheck, Truck, Wallet, Headset, BadgeCheck } from 'lucide-react';

const points = [
  { icon: ShieldCheck, text: 'Verified vendors only' },
  { icon: Wallet, text: 'Secure, encrypted payments' },
  { icon: Truck, text: 'Nationwide delivery' },
  { icon: Headset, text: 'Real human support' },
  { icon: BadgeCheck, text: 'Buyer protection on every order' },
];

// Duplicated once so the CSS animation can loop seamlessly at -50%.
const track = [...points, ...points];

export default function TrustMarquee() {
  return (
    <div className="bg-strip text-strip-foreground overflow-hidden py-2.5 border-b border-white/10">
      <div className="flex w-max animate-marquee motion-reduce:animate-none gap-10">
        {track.map((p, i) => (
          <span key={i} className="flex items-center gap-2 text-xs font-medium whitespace-nowrap shrink-0">
            <p.icon className="w-3.5 h-3.5 text-primary shrink-0" />
            {p.text}
          </span>
        ))}
      </div>
    </div>
  );
}
