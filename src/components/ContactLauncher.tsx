import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MapPin, MessageCircle, Phone, X } from 'lucide-react';
import { BUSINESS } from '@/config/business';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { StoreVisitPanel } from '@/components/StoreVisit';

// One floating button that opens a small menu: Visit us, Call an agent, WhatsApp.
// It sits above the bottom nav on phones, slides away while you scroll down and comes back when you scroll up,
// so it no longer covers the product cards. (It replaces the old WhatsApp-only button.)

/** Pages where a floating button would sit on top of something the visitor is using. */
const HIDE_ON = ['/messages', '/chat', '/supplier-chat', '/checkout', '/cart'];

export default function ContactLauncher() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => { setOpen(false); setCallOpen(false); }, [pathname]);

  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (Math.abs(y - last) > 8) { setHidden(y > last && y > 120); last = y; }
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setCallOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (HIDE_ON.some(p => pathname === p || pathname.startsWith(`${p}/`))) return null;

  const close = () => { setOpen(false); setCallOpen(false); };
  const pill = 'flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95';

  return (
    <>
      {open && <button aria-label="Close contact menu" className="fixed inset-0 z-30 cursor-default" onClick={close} />}

      <div
        className={`fixed right-4 z-40 flex flex-col items-end gap-2 transition-all duration-200 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 ${
          hidden && !open ? 'pointer-events-none translate-y-24 opacity-0' : 'translate-y-0 opacity-100'
        }`}
      >
        {open && callOpen && (
          <div className="w-64 overflow-hidden rounded-2xl bg-card text-card-foreground shadow-xl ring-1 ring-border">
            <div className="border-b border-border px-4 py-3">
              <p className="font-heading text-sm font-semibold">Call an agent</p>
              <p className="text-xs text-muted-foreground">Tap a number to dial</p>
            </div>
            <ul>
              {BUSINESS.agentPhones.map(p => (
                <li key={p.href} className="border-b border-border last:border-0">
                  <a href={p.href} className="flex items-center gap-3 px-4 py-3 text-sm font-medium tabular-nums hover:bg-secondary/60">
                    <Phone className="h-4 w-4 shrink-0 text-primary" /> {p.display}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {open && (
          <>
            <button className={pill} onClick={() => { close(); setStoreOpen(true); }}>
              <MapPin className="h-4 w-4" /> Visit us
            </button>
            <button className={pill} onClick={() => setCallOpen(v => !v)} aria-expanded={callOpen}>
              <Phone className="h-4 w-4" /> Call an agent
            </button>
            <a className={pill} href={BUSINESS.whatsappHref} target="_blank" rel="noopener noreferrer" onClick={close}>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </>
        )}

        <button
          onClick={() => { setOpen(v => !v); setCallOpen(false); }}
          aria-expanded={open}
          aria-label={open ? 'Close contact menu' : 'Contact us'}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
        >
          {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        </button>
      </div>

      <Sheet open={storeOpen} onOpenChange={setStoreOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>Visit us</SheetTitle>
            <SheetDescription>Come and meet the team in Computer Village, Ikeja.</SheetDescription>
          </SheetHeader>
          <StoreVisitPanel layout="stack" />
        </SheetContent>
      </Sheet>
    </>
  );
}
