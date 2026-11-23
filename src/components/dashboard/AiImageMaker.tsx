import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { call } from '@/lib/ads/adsApi';
import { formatNaira } from '@/lib/format';
import { ART_LOOKS } from '@/lib/ads/artLooks';
import type { CreativeFile } from '@/components/dashboard/AdCreativeUploader';

/** Reads the plain-language error the edge function sent, instead of the generic "non-2xx" message. */
async function replyError(error: any): Promise<string> {
  try { const j = await error?.context?.json?.(); if (j?.error) return String(j.error); } catch { /* fall through */ }
  return 'Could not reach the image service. You were not charged. Check your connection and try again.';
}

export default function AiImageMaker({ files, maxFiles, onAdd }: { files: CreativeFile[]; maxFiles: number; onAdd: (f: CreativeFile) => void }) {
  const qc = useQueryClient();
  const info = useQuery<any>({ queryKey: ['ai-image-info'], queryFn: () => call('ai_image_info'), staleTime: 10_000 });
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [look, setLook] = useState('surprise');
  const [lastLook, setLastLook] = useState<string | null>(null);
  const d = info.data;
  if (!d?.enabled) return null;
  const price = Number(d.price_kobo), balance = Number(d.balance_kobo);
  const enough = balance >= price;
  const tooShort = prompt.trim().length < 10;

  const generate = async () => {
    if (busy) return;
    setBusy(true); setPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke('ad-generate-image', { body: { prompt, look: look === 'surprise' ? undefined : look, last_look: lastLook } });
      if (error || !data?.ok) { toast.error(error ? await replyError(error) : (data?.error ?? 'Could not make the image.')); return; }
      onAdd({ kind: 'photo', path: data.path, name: 'AI image', size: Number(data.size) || 0 });
      const { data: signed } = await supabase.storage.from('ad-creatives').createSignedUrl(data.path, 600);
      setPreview(signed?.signedUrl ?? null);
      if (data.look) setLastLook(String(data.look));
      setPrompt('');
      toast.success(`Image added to your request. ${formatNaira(price / 100)} was taken from your advertising balance.`);
    } catch { toast.error('Could not reach the image service. If you were charged, it is refunded automatically within a few minutes.'); }
    finally { setBusy(false); qc.invalidateQueries({ queryKey: ['ai-image-info'] }); qc.invalidateQueries({ queryKey: ['my-ad-wallet'] }); }
  };

  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Or make a picture with AI ({formatNaira(price / 100)} each)</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Describe the picture and we create it for you. {formatNaira(price / 100)} is taken from your advertising balance when you press Generate (you have {formatNaira(balance / 100)}).
        If the image cannot be made or fails our safety check, the amount is refunded automatically. AI pictures are illustrations: use your own photo when you need to show the exact product.
        The picture has no text or logos. You have {d.left_this_hour} generation(s) left this hour.
      </p>
      <Textarea className="mt-2" rows={2} maxLength={400} value={prompt} onChange={(e) => setPrompt(e.target.value)}
        placeholder="Example: a stack of folded ankara fabrics in bright colours on a wooden table, soft morning light" />
      <label className="mt-2 block text-xs text-muted-foreground">Look
        <select className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={look} onChange={(e) => setLook(e.target.value)}>
          {ART_LOOKS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </label>
      {!enough && <p className="mt-1 text-xs text-destructive">Your balance is too low. Add funds in the advertising balance section above.</p>}
      {files.length >= maxFiles && <p className="mt-1 text-xs text-destructive">You already have {maxFiles} files. Remove one to add another.</p>}
      <Button type="button" size="sm" className="mt-2" disabled={busy || !enough || tooShort || files.length >= maxFiles || d.left_this_hour <= 0} onClick={generate}>
        {busy ? 'Making your picture… (up to a minute)' : `Generate for ${formatNaira(price / 100)}`}
      </Button>
      {preview && <img src={preview} alt="Your generated picture" className="mt-2 max-h-48 rounded" />}
    </div>
  );
}
