import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ScrollRowProps {
  title: string;
  eyebrow?: string;
  linkTo?: string;
  linkLabel?: string;
  children: React.ReactNode;
}

// A titled, horizontally scrolling row (snap on touch, arrow buttons on desktop).
export default function ScrollRow({ title, eyebrow, linkTo, linkLabel = 'View all', children }: ScrollRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.8), behavior: 'smooth' });

  return (
    <section className="mt-8 sm:mt-10">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>}
          <h2 className="font-heading text-xl font-bold sm:text-2xl">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {linkTo && <Link to={linkTo} className="shrink-0 text-sm font-medium text-primary hover:underline">{linkLabel}</Link>}
          <button onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`} className="hidden rounded-full border border-border p-1.5 hover:bg-secondary md:block"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => scroll(1)} aria-label={`Scroll ${title} right`} className="hidden rounded-full border border-border p-1.5 hover:bg-secondary md:block"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div ref={ref} className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-2 scrollbar-hide sm:gap-3 md:mx-0 md:px-0">
        {children}
      </div>
    </section>
  );
}

export function ScrollItem({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={`shrink-0 snap-start ${wide ? 'w-64 sm:w-72' : 'w-[44vw] max-w-[190px] sm:w-48 sm:max-w-none lg:w-52'}`}>{children}</div>;
}
