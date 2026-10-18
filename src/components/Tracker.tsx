import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initTracking, trackPageView } from '@/lib/tracking';

// Starts tracking once and reports a page view on every page change.
// The app is a single-page site, so the browser never reloads between pages;
// without this, only the first page a visitor opened would be counted.
export default function Tracker() {
  const { pathname } = useLocation();

  useEffect(() => { initTracking(); }, []);
  useEffect(() => { trackPageView(pathname); }, [pathname]);

  return null;
}
