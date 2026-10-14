import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HEADER_MESSAGES } from '@/lib/flyers';

// One-line flyer in the header's top bar. Rotates through the messages; stops
// rotating on hover/focus and for people who prefer reduced motion.
export default function HeaderTicker() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setI(n => (n + 1) % HEADER_MESSAGES.length), 4500);
    return () => window.clearInterval(id);
  }, [paused]);

  const msg = HEADER_MESSAGES[i];
  return (
    <div
      className="flex min-w-0 items-center gap-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span key={i} className="truncate animate-in fade-in duration-500" aria-live="off">{msg.text}</span>
      <Link to={msg.href} className="shrink-0 rounded-full bg-primary-foreground/15 px-2 py-0.5 font-semibold hover:bg-primary-foreground/25">
        {msg.cta}
      </Link>
    </div>
  );
}
