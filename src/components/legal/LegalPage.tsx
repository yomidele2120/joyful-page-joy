import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { BUSINESS, LEGAL_LINKS } from '@/config/business';

// A value the business still has to provide. Empty values show as a visible placeholder
// so nothing is silently invented.
export function Fill({ value, label }: { value?: string | number | null; label: string }) {
  const text = value === undefined || value === null ? '' : String(value).trim();
  if (text) return <>{text}</>;
  return <mark className="rounded-none bg-amber-200/70 px-1 text-foreground dark:bg-amber-400/30">[{label} - to be added]</mark>;
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return <ul className="list-disc space-y-1.5 pl-5">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>;
}

interface LegalPageProps {
  title: string;
  intro?: React.ReactNode;
  /** Paths of related pages shown at the bottom. */
  related?: string[];
  showUpdated?: boolean;
  children: React.ReactNode;
}

export default function LegalPage({ title, intro, related, showUpdated = true, children }: LegalPageProps) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | ${BUSINESS.brand}`;
    return () => { document.title = previous; };
  }, [title]);

  const links = LEGAL_LINKS.filter(l => related?.includes(l.to));
  return (
    <Layout>
      <article className="container max-w-3xl py-8 sm:py-12">
        <h1 className="font-heading text-3xl font-bold">{title}</h1>
        {showUpdated && <p className="mt-2 text-xs text-muted-foreground">Last updated: {BUSINESS.policiesLastUpdated}</p>}
        {intro && <div className="mt-5 text-sm leading-7 text-muted-foreground">{intro}</div>}
        {children}
        {(
          <nav aria-label="Related pages" className="mt-12 border-t border-border pt-6">
            <p className="font-heading text-sm font-semibold">Related</p>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              {links.map(l => <li key={l.to}><Link to={l.to} className="text-primary hover:underline">{l.label}</Link></li>)}
              <li><Link to="/contact" className="text-primary hover:underline">Contact us</Link></li>
              <li><Link to="/faq" className="text-primary hover:underline">FAQ</Link></li>
            </ul>
          </nav>
        )}
      </article>
    </Layout>
  );
}
