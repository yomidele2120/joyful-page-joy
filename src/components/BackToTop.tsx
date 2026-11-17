import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';

// Round "back to top" button, bottom-left. It appears after the visitor has scrolled down about a screen and a half,
// and is left out of pages that are not long scrolling pages (the video feed and chats).
const HIDDEN_ON = ['/feed', '/messages', '/calls'];
const SHOW_AFTER_PX = 700;

export default function BackToTop() {
  const { pathname } = useLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  if (HIDDEN_ON.some(p => pathname === p || pathname.startsWith(p + '/'))) return null;

  // On a phone the product page has its own fixed "buy" bar above the bottom menu, so the button sits higher there.
  const onProduct = pathname.startsWith('/product/');
  const toTop = () => {
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
      className={`fixed left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/10 transition-all duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:bottom-6 ${
        onProduct ? 'bottom-[calc(8.5rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]'
      } ${show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
