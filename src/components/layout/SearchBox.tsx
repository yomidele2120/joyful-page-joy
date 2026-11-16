import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Store } from 'lucide-react';
import { useSearchSuggestions } from '@/hooks/useSearchSuggestions';

/** One search box for everything: products and suppliers appear together while typing, and Enter shows full results for both. */
export default function SearchBox({ variant, onDone }: { variant: 'desktop' | 'mobile'; onDone?: () => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { data, loading } = useSearchSuggestions(text);

  const items = useMemo(() => [
    ...(data?.suppliers ?? []).map(s => ({ key: `s${s.id}`, to: `/shop/${s.id}`, label: s.store_name, image: s.logo_url, kind: 'Supplier' as const })),
    ...(data?.products ?? []).map(p => ({ key: `p${p.id}`, to: `/product/${p.slug}`, label: p.name, image: p.image_url, kind: 'Product' as const })),
  ], [data]);

  useEffect(() => { setActive(-1); }, [data]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const finish = () => { setOpen(false); onDone?.(); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (active >= 0 && items[active]) { navigate(items[active].to); finish(); return; }
    const q = text.trim();
    if (!q) return;
    navigate(`/products?search=${encodeURIComponent(q)}`);
    finish();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(i => (i + 1) % items.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i <= 0 ? items.length - 1 : i - 1)); }
  };

  const showList = open && text.trim().length >= 2;
  const wrap = variant === 'desktop'
    ? 'flex w-full items-stretch overflow-hidden rounded-full border-2 border-primary bg-background'
    : 'flex w-full items-center overflow-hidden rounded-2xl bg-background text-foreground shadow-md';

  return (
    <div ref={boxRef} className="relative w-full">
      <form onSubmit={submit} role="search" className={wrap}>
        {variant === 'mobile' && <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <input
          type="search" value={text} autoComplete="off" enterKeyHint="search"
          placeholder="Search products or suppliers" aria-label="Search products or suppliers"
          role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={e => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          className={`min-w-0 flex-1 bg-transparent text-sm focus:outline-none ${variant === 'desktop' ? 'h-10 px-4' : 'h-10 px-3'}`}
        />
        {variant === 'desktop' && (
          <button type="submit" aria-label="Search" className="flex shrink-0 items-center justify-center bg-primary px-5 text-primary-foreground">
            <Search className="h-4 w-4" />
          </button>
        )}
      </form>

      {showList && (
        <div id={listId} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-background shadow-xl">
          {items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">{loading ? 'Searching…' : `No quick matches. Press Enter to search everything for "${text.trim()}".`}</p>
          ) : (
            <ul>
              {items.map((it, i) => (
                <li key={it.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                  <Link to={it.to} onClick={finish}
                        className={`flex items-center gap-3 px-3 py-2 text-sm ${i === active ? 'bg-secondary' : 'hover:bg-secondary/60'}`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-secondary">
                      {it.image ? <img src={it.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <Store className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{it.kind}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to={`/products?search=${encodeURIComponent(text.trim())}`} onClick={finish} className="block border-t border-border px-4 py-2.5 text-sm font-medium text-primary hover:bg-secondary/60">
            See all results for "{text.trim()}"
          </Link>
        </div>
      )}
    </div>
  );
}
