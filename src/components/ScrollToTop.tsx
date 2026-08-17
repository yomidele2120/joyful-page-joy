import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Every other page in the app scrolls the window, so window.scrollTo covers
// them. /feed is the one exception — it's a fixed-position, full-screen
// page with its own internal scroll container (the vertical video list),
// so there's no window scroll to reset there; it always renders at its own
// top on mount regardless.
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  return null;
}
