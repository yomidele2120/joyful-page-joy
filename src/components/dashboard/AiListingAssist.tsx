import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { suggestListing, type ListingResult } from '@/lib/aiAssistApi';

// Suggestions only: nothing changes until the vendor presses Use. The AI is told not to invent prices, warranties or specs.
export default function AiListingAssist({ name, description, categoryName, productId, onUseTitle, onUseDescription }: {
  name: string; description: string; categoryName?: string; productId?: string; onUseTitle: (v: string) => void; onUseDescription: (v: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ListingResult | null>(null);
  const run = async () => {
    setBusy(true);
    try { setRes(await suggestListing({ name, description, categoryName }, productId)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'The assistant could not answer.'); }
    finally { setBusy(false); }
  };
  const s = res?.suggestion;
  return (
    <div className="rounded-md border border-dashed border-border p-2 text-sm">
      <Button type="button" size="sm" variant="outline" disabled={busy || name.trim().length < 2} onClick={run}>{busy ? 'Thinking…' : 'Suggest a cleaner listing (AI)'}</Button>
      {s && (
        <div className="mt-2 space-y-2">
          {res!.duplicates.length > 0 && <p className="text-amber-700">Possible duplicate of: {res!.duplicates.map((d) => d.name).join(', ')}</p>}
          {s.title && <div><p className="text-xs text-muted-foreground">Title</p><p>{s.title}</p><Button type="button" size="sm" variant="ghost" onClick={() => onUseTitle(s.title)}>Use title</Button></div>}
          {s.description && <div><p className="text-xs text-muted-foreground">Description</p><p className="whitespace-pre-wrap">{s.description}</p><Button type="button" size="sm" variant="ghost" onClick={() => onUseDescription(s.description)}>Use description</Button></div>}
          {s.suggestedCategory && <p className="text-xs">Suggested category: {s.suggestedCategory}</p>}
          {s.tags.length > 0 && <p className="text-xs">Tags: {s.tags.join(', ')}</p>}
          {s.missing.length > 0 && <p className="text-xs">Buyers will want to know: {s.missing.join('; ')}. Add these yourself if true.</p>}
          <p className="text-xs text-muted-foreground">{res!.note}</p>
        </div>
      )}
    </div>
  );
}
