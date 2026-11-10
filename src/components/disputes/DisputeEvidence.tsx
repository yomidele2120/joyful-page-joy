import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

export default function DisputeEvidence({ disputeId, buyerId }: { disputeId: string; buyerId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data: files, isLoading, isError, error } = useQuery({
    queryKey: ['dispute-evidence', disputeId],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('dispute-evidence').list(`${disputeId}/${buyerId}`);
      if (error) throw error;
      const entries = (data ?? []).filter(file => !!file.id);
      return Promise.all(entries.map(async file => {
        const path = `${disputeId}/${buyerId}/${file.name}`;
        const { data: signed, error: signedError } = await supabase.storage.from('dispute-evidence').createSignedUrl(path, 300);
        if (signedError) throw signedError;
        return { name: file.name, url: signed.signedUrl };
      }));
    },
    enabled: expanded,
    staleTime: 60_000,
  });

  return (
    <div className="mt-2">
      <Button type="button" size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => setExpanded(value => !value)}>
        {expanded ? 'Hide buyer evidence' : 'View buyer evidence'}
      </Button>
      {expanded && isLoading && <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading evidence...</p>}
      {expanded && isError && <p className="mt-1 text-xs text-destructive">{error instanceof Error ? error.message : 'Could not load evidence'}</p>}
      {expanded && !isLoading && !isError && !files?.length && <p className="mt-1 text-xs text-muted-foreground">No evidence attached.</p>}
      {expanded && !!files?.length && (
        <ul className="mt-1 flex flex-wrap gap-2">
          {files.map(file => (
            <li key={file.name}>
              <a href={file.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-primary hover:underline">
                <FileText className="h-3 w-3" /> {file.name.replace(/^[0-9a-f-]{36}-/i, '') || 'View attachment'}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
