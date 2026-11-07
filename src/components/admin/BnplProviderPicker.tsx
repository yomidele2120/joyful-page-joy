import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { BNPL_PROVIDERS, type BnplProvider } from '@/lib/bnplProvider';

const KLUMP_PUBLIC_KEY = import.meta.env.VITE_KLUMP_PUBLIC_KEY as string | undefined;

export interface CreditDirectStatus { configured: boolean; missing: string[]; problems: string[]; unreachable?: string }

/** Asks the server which Credit Direct secrets are set (names only, never values). Admin-only on the server. */
export function useCreditDirectStatus() {
  return useQuery<CreditDirectStatus>({
    queryKey: ['creditdirect-status'],
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('creditdirect-initialize', { body: { status: true } });
      if (error || data?.error) {
        return { configured: false, missing: [], problems: [], unreachable: 'The server did not answer. Deploy the creditdirect-initialize function first.' };
      }
      return { configured: !!data.configured, missing: data.missing ?? [], problems: data.problems ?? [] };
    },
  });
}

interface Props {
  value: BnplProvider;
  onChange: (p: BnplProvider) => void;
  savedValue?: BnplProvider;
  status: CreditDirectStatus | undefined;
  checking: boolean;
  onRecheck: () => void;
}

/** Admin switch: which Pay later partner buyers see at checkout. */
export default function BnplProviderPicker({ value, onChange, savedValue, status, checking, onRecheck }: Props) {
  const klumpReady = !!KLUMP_PUBLIC_KEY;
  const cdReady = !!status?.configured;

  const options: { id: BnplProvider; ready: boolean | undefined; detail: React.ReactNode }[] = [
    {
      id: 'klump', ready: klumpReady,
      detail: klumpReady
        ? 'Public key found on Vercel. (The secret key lives on Supabase and cannot be checked from here.)'
        : 'VITE_KLUMP_PUBLIC_KEY is missing on Vercel, so buyers cannot start Klump checkout.',
    },
    {
      id: 'creditdirect', ready: checking ? undefined : cdReady,
      detail: checking ? 'Checking the server…'
        : cdReady ? 'All Credit Direct settings found on Supabase.'
        : status?.unreachable ? status.unreachable
        : <>Not ready. {status?.missing.length ? <>Add on Supabase (Edge Functions, Secrets): <span className="font-mono">{status.missing.join(', ')}</span>. </> : null}{status?.problems.map(p => <span key={p}>{p}. </span>)}</>,
    },
  ];

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <Label2>Active provider</Label2>
        <Button type="button" variant="ghost" size="sm" onClick={onRecheck} disabled={checking}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} /> Re-check keys
        </Button>
      </div>
      <div role="radiogroup" aria-label="Pay later provider" className="grid gap-3 sm:grid-cols-2">
        {options.map(o => {
          const selected = value === o.id;
          const blocked = o.id === 'creditdirect' && !cdReady && !checking;
          return (
            <button
              key={o.id} type="button" role="radio" aria-checked={selected}
              onClick={() => onChange(o.id)}
              className={`rounded-lg border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{BNPL_PROVIDERS[o.id].name}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {savedValue === o.id && <span className="rounded-full bg-secondary px-2 py-0.5">Live now</span>}
                  {selected && <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">Selected</span>}
                </span>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{BNPL_PROVIDERS[o.id].blurb}</span>
              <span className={`mt-2 flex items-start gap-1.5 text-xs ${blocked ? 'text-destructive' : 'text-muted-foreground'}`}>
                {o.ready === undefined ? null : o.ready
                  ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  : <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>{o.detail}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Only one provider is shown to buyers at a time. Changing it affects new checkouts only; a payment already started with the other provider will still finish and be recorded correctly.
      </p>
    </div>
  );
}

function Label2({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-medium leading-none">{children}</span>;
}
