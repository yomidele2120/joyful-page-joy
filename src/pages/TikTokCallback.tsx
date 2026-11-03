import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { functionErrorMessage } from '@/lib/functionError';

// TikTok sends the vendor back here after they approve (or refuse) access. We hand the one-time code to the server,
// which checks it belongs to this signed-in seller, then return to the dashboard.
export default function TikTokCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Connecting your TikTok…');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // the code works once; never send it twice
    ran.current = true;
    const back = () => navigate('/supplier-dashboard?tab=videos', { replace: true });
    const code = params.get('code'), state = params.get('state'), denied = params.get('error');
    if (denied || !code || !state) {
      if (denied === 'access_denied') {
        toast.error('TikTok was not connected because access was declined.');
      } else if (denied) {
        // TikTok sent the seller back with a reason (for example invalid_scope): show it instead of hiding it.
        const detail = params.get('error_description') || denied;
        console.warn('TikTok returned an error:', denied, params.get('error_description'));
        toast.error(`TikTok could not connect: ${detail} (${denied})`, { duration: 15000 });
      } else {
        toast.error('This page is only for TikTok to return to. Go to Dashboard > Videos and tap Connect TikTok.');
      }
      back(); return;
    }
    (async () => {
      const { data, error } = await supabase.functions.invoke('tiktok', { body: { action: 'connect', code, state } });
      if (error || data?.error) { toast.error(await functionErrorMessage(error, data)); setMessage('Could not connect TikTok.'); }
      else toast.success(`TikTok connected${data?.display_name ? ` as ${data.display_name}` : ''}. Now choose which videos to show.`);
      back();
    })();
  }, [params, navigate]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {message}
    </div>
  );
}
