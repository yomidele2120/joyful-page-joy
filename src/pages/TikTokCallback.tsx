import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { functionErrorMessage, mapTikTokOAuthError } from '@/lib/functionError';

const TIKTOK_CALLBACK_STORAGE_KEY = 'tiktok_oauth_callback';

type StoredTikTokCallback = { code: string; state: string };

function isUnauthorized(error: unknown, data?: { error_code?: string } | null): boolean {
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  return status === 401 || data?.error_code === 'missing_authorization' || data?.error_code === 'invalid_session';
}

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
    const denied = params.get('error');
    if (denied) {
      if (denied === 'access_denied') {
        toast.error(mapTikTokOAuthError(denied, params.get('error_description') || ''));
      } else toast.error(mapTikTokOAuthError(denied, params.get('error_description') || ''), { duration: 15000 });
      back(); return;
    }

    (async () => {
      let callback: StoredTikTokCallback | null = null;
      try {
        const stored = sessionStorage.getItem(TIKTOK_CALLBACK_STORAGE_KEY);
        const saved = stored ? JSON.parse(stored) as StoredTikTokCallback : null;
        callback = {
          code: params.get('code') || saved?.code || '',
          state: params.get('state') || saved?.state || '',
        };
      } catch {
        sessionStorage.removeItem(TIKTOK_CALLBACK_STORAGE_KEY);
        toast.error('The saved TikTok sign-in could not be read. Start again from Dashboard > Videos.');
        back();
        return;
      }

      const { code, state } = callback;
      if (!code || !state) {
        toast.error('This page is only for TikTok to return to. Go to Dashboard > Videos and tap Connect TikTok.');
        back();
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!sessionData.session) {
        try {
          sessionStorage.setItem(TIKTOK_CALLBACK_STORAGE_KEY, JSON.stringify({ code, state }));
        } catch {
          toast.error('Could not save this TikTok sign-in. Sign in, then start again from Dashboard > Videos.');
          back();
          return;
        }
        if (sessionError) {
          toast.error(`Could not restore your sign-in: ${sessionError.message} Sign in to resume this TikTok connection.`);
        }
        setMessage('Sign in to your supplier account to finish connecting TikTok…');
        navigate('/suppliers-login', { replace: true });
        return;
      }
      if (sessionError) toast.error(`Could not restore your sign-in: ${sessionError.message}`);

      try {
        const invokeConnect = () => supabase.functions.invoke('tiktok', { body: { action: 'connect', code, state } });
        let result = await invokeConnect();
        if (isUnauthorized(result.error, result.data)) {
          try {
            await supabase.auth.refreshSession();
          } catch {
            // Still retry once; the second response determines the recovery guidance.
          }
          result = await invokeConnect();
          if (isUnauthorized(result.error, result.data)) {
            throw new Error('Your session could not be refreshed. Sign out, sign in again in this same browser window, then start again from Connect TikTok.');
          }
        }
        if (result.error || result.data?.error) {
          toast.error(await functionErrorMessage(result.error, result.data));
          setMessage('Could not connect TikTok.');
        } else {
          const identity = result.data?.display_name ? ` as ${result.data.display_name}` : '';
          toast.success(result.data?.video_list_available === false
            ? `TikTok connected${identity}. Video selection is unavailable until video.list is granted.`
            : `TikTok connected${identity}. Now choose which videos to show.`);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not connect TikTok.');
        setMessage('Could not connect TikTok.');
      } finally {
        sessionStorage.removeItem(TIKTOK_CALLBACK_STORAGE_KEY);
        back();
      }
    })();
  }, [params, navigate]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {message}
    </div>
  );
}
