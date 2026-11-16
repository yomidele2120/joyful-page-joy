import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { campaignBrief, EXPORT_FORMATS, exportUrl, externalDestination } from '@/lib/ads/adExports';

// Manual-publishing helper for one external ad request: platform-sized crops of the vendor's APPROVED banner artwork
// plus a copy-paste brief. Nothing is sent to any ad platform from here.
export default function ExternalExportPanel({ request: r }: { request: any }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['ext-export-source', r.vendor_id], enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from('vendor_advertising_campaigns')
        .select('id, banner_image_url, headline, description, cta_text')
        .eq('vendor_id', r.vendor_id).not('banner_image_url', 'is', null).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const src: any = q.data;
  const files: { kind: 'photo' | 'video'; path: string; name: string }[] = Array.isArray(r.creative_files) ? r.creative_files : [];
  const media = useQuery({
    queryKey: ['ext-vendor-media', r.id], enabled: open && files.length > 0, staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('ad-creatives').createSignedUrls(files.map((f) => f.path), 3600);
      if (error) throw error;
      return data;
    },
  });
  const site = typeof window !== 'undefined' ? window.location.origin : 'https://ithubafrica.com';
  const dest = externalDestination(site, r.vendor_id, r.platform, r.id);
  const formats = EXPORT_FORMATS.filter((f) => f.platform === r.platform);
  const brief = src ? campaignBrief({ store_name: r.store_name, platform: r.platform, scope: r.scope, objective: r.objective, duration_days: r.duration_days,
    budget_amount: r.budget_amount, headline: src.headline ?? r.store_name, description: src.description, cta: src.cta_text, destination: dest }) : '';

  return (
    <div className="mt-1">
      <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Creatives & brief'}</Button>
      {open && (
        <div className="mt-1 space-y-2 rounded bg-muted/40 p-2 text-xs">
          <div className="rounded border border-border p-2">
            <p className="font-medium">Vendor's own photos / video ({files.length})</p>
            {files.length === 0 && <p>The vendor attached nothing (draft).</p>}
            {r.creative_note && <p className="mt-1">Note from vendor: {r.creative_note}</p>}
            {media.isError && <p className="text-destructive">Could not load the files.</p>}
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              {files.map((f, i) => { const url = media.data?.[i]?.signedUrl; return (
                <div key={f.path}>
                  {!url ? <p>Loading {f.name}…</p> : f.kind === 'video'
                    ? <video src={url} controls preload="metadata" className="max-h-40 w-full rounded" />
                    : <img src={url} alt={f.name} loading="lazy" className="max-h-40 w-auto rounded" />}
                  {url && <a className="underline" href={url} download={f.name}>Download</a>}
                </div>); })}
            </div>
            <p className="mt-1 text-muted-foreground">Download links expire after an hour. Reopen this panel for fresh ones.</p>
          </div>
          {q.isLoading && <p>Loading…</p>}
          {q.isError && <p className="text-destructive">Could not load the vendor's banner.</p>}
          {!q.isLoading && !src && <p>This vendor has no approved banner artwork yet, so there is nothing to export.</p>}
          {src && <>
            <div className="grid gap-2 sm:grid-cols-2">{formats.map((f) => {
              const view = exportUrl({ imageUrl: src.banner_image_url, storeName: r.store_name, headline: src.headline ?? r.store_name, cta: src.cta_text }, f);
              const dl = exportUrl({ imageUrl: src.banner_image_url, storeName: r.store_name, headline: src.headline ?? r.store_name, cta: src.cta_text, download: true }, f);
              if (!view || !dl) return <p key={f.key}>{f.label}: artwork is not a Cloudinary image, cannot resize.</p>;
              return (<div key={f.key} className="rounded border border-border p-2">
                <img src={view} alt={f.label} loading="lazy" className="max-h-40 w-auto rounded" />
                <div className="mt-1 flex items-center justify-between gap-2"><span>{f.label} · {f.width}×{f.height}</span>
                  <a className="underline" href={dl} download>Download</a></div></div>);
            })}</div>
            <pre className="whitespace-pre-wrap rounded bg-background p-2">{brief}</pre>
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(brief).then(() => toast.success('Brief copied.'), () => toast.error('Copy failed.'))}>Copy brief</Button>
            <p>Check each platform's current size and policy rules before uploading. After the platform confirms the ad is live, keep this request's status truthful.</p>
          </>}
        </div>
      )}
    </div>
  );
}
