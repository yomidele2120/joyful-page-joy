import { useCallback, useEffect, useRef, useState } from 'react';

// Optional bot protection (Cloudflare Turnstile). It only appears when VITE_TURNSTILE_SITE_KEY is set.
// The token is checked by Supabase Auth itself, so turn on "Enable CAPTCHA protection" in
// Supabase > Authentication > Attack Protection AFTER the site key is live on the website.

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
}
declare global { interface Window { turnstile?: TurnstileApi } }

let scriptPromise: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { scriptPromise = null; reject(new Error('Turnstile failed to load')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function CaptchaWidget({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    setFailed(false);
    loadTurnstile()
      .then(() => {
        if (cancelled || !holder.current || !window.turnstile || !TURNSTILE_SITE_KEY) return;
        widgetId = window.turnstile.render(holder.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [resetKey, onToken]);

  return (
    <div className="my-3">
      <div ref={holder} />
      {failed && (
        <p role="alert" className="text-sm text-red-600">
          The security check could not load. Turn off any ad blocker for this site, refresh the page and try again.
        </p>
      )}
    </div>
  );
}

export function useCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const required = !!TURNSTILE_SITE_KEY;
  const onToken = useCallback((t: string | null) => setToken(t), []);
  // A token works once, so ask for a fresh one after every attempt.
  const reset = useCallback(() => { setToken(null); setResetKey(k => k + 1); }, []);
  return {
    required,
    token: token ?? undefined,
    ready: !required || !!token,
    reset,
    widget: required ? <CaptchaWidget onToken={onToken} resetKey={resetKey} /> : null,
  };
}
