import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'chat-media';

// Chat media is stored in a private bucket. New messages store the file's
// storage path; older ones stored a public URL. Both resolve to a short-lived
// signed URL here.
export function chatMediaPath(urlOrPath: string): string {
  const marker = `/${BUCKET}/`;
  const index = urlOrPath.indexOf(marker);
  if (urlOrPath.startsWith('http') && index !== -1) {
    return decodeURIComponent(urlOrPath.slice(index + marker.length).split('?')[0]);
  }
  return urlOrPath;
}

export function useSignedMediaUrl(urlOrPath: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!urlOrPath) { setUrl(null); return; }
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(chatMediaPath(urlOrPath), 60 * 60)
      .then(({ data }) => { if (!cancelled) setUrl(data?.signedUrl ?? null); });
    return () => { cancelled = true; };
  }, [urlOrPath]);

  return url;
}
