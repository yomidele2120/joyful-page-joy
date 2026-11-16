import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import AiImageMaker from '@/components/dashboard/AiImageMaker';

// Photos / one short video a vendor attaches to an external ad request. Files go to the private "ad-creatives" bucket,
// under the vendor's own folder. The request function re-checks every path on the server.
export interface CreativeFile { kind: 'photo' | 'video'; path: string; name: string; size: number }

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_FILES = 6;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };

/** Returns a plain-language reason the file cannot be used, or null when it is fine. */
export function checkCreative(file: { type: string; size: number }, existing: CreativeFile[]): string | null {
  const photo = PHOTO_TYPES.includes(file.type), video = VIDEO_TYPES.includes(file.type);
  if (!photo && !video) return 'Use a JPG, PNG or WebP photo, or an MP4, MOV or WebM video.';
  if (file.size === 0) return 'That file is empty.';
  if (photo && file.size > MAX_PHOTO_BYTES) return 'That photo is larger than 10 MB. Choose a smaller one.';
  if (video && file.size > MAX_VIDEO_BYTES) return 'That video is larger than 50 MB. Trim it or export it at a lower quality.';
  if (video && existing.some((f) => f.kind === 'video')) return 'You can attach one video. Remove the current one first.';
  if (existing.length >= MAX_FILES) return `You can attach up to ${MAX_FILES} files.`;
  return null;
}

export default function AdCreativeUploader({ vendorId, files, onChange }: { vendorId: string; files: CreativeFile[]; onChange: (f: CreativeFile[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const add = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setBusy(true);
    let next = [...files];
    try {
      for (const file of Array.from(list)) {
        const problem = checkCreative(file, next);
        if (problem) { toast.error(`${file.name}: ${problem}`); continue; }
        const path = `${vendorId}/${crypto.randomUUID()}.${EXT[file.type]}`;
        const { error } = await supabase.storage.from('ad-creatives').upload(path, file, { contentType: file.type, upsert: false });
        if (error) { toast.error(`${file.name} could not be uploaded. ${error.message}`); continue; }
        next = [...next, { kind: VIDEO_TYPES.includes(file.type) ? 'video' : 'photo', path, name: file.name.slice(0, 120), size: file.size }];
        onChange(next);
      }
    } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };

  const remove = async (f: CreativeFile) => {
    onChange(files.filter((x) => x.path !== f.path));
    await supabase.storage.from('ad-creatives').remove([f.path]).catch(() => undefined);   // not yet attached to a request, so it is safe to delete
  };

  return (
    <div className="sm:col-span-3 rounded-md border border-dashed border-border p-3">
      <p className="text-sm font-medium">Your photos or video for the ad</p>
      <p className="mt-1 text-xs text-muted-foreground">
        This is the picture or clip people will see in your ad on Google, Facebook, Instagram or TikTok. ITHUBAFRICA does not publish ads automatically:
        our team uses what you upload here to set the ad up, so send clear, good-looking material of what you sell. Only you and ITHUBAFRICA admins can see these files,
        and they are not shown on your shop page. Use files you own or have the right to advertise.
      </p>
      <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
        <li>Photos: JPG, PNG or WebP, up to 10 MB each. Square or vertical photos work best.</li>
        <li>Video: one MP4, MOV or WebM, up to 50 MB. 15 to 30 seconds is enough.</li>
        <li>Up to {MAX_FILES} files in total. You need at least one to submit the request.</li>
      </ul>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f) => (
            <li key={f.path} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1 text-xs">
              <span className="truncate">{f.kind === 'video' ? 'Video' : 'Photo'}: {f.name} ({(f.size / 1048576).toFixed(1)} MB)</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => remove(f)}>Remove</Button>
            </li>))}
        </ul>)}
      <input ref={input} type="file" multiple className="sr-only" aria-label="Choose photos or a video"
        accept={[...PHOTO_TYPES, ...VIDEO_TYPES].join(',')} onChange={(e) => add(e.target.files)} />
      <Button type="button" variant="outline" size="sm" className="mt-2" disabled={busy || files.length >= MAX_FILES} onClick={() => input.current?.click()}>
        {busy ? 'Uploading…' : files.length ? 'Add more' : 'Choose photos or a video'}
      </Button>
      <AiImageMaker files={files} maxFiles={MAX_FILES} onAdd={(f) => onChange([...files, f])} />
    </div>
  );
}
