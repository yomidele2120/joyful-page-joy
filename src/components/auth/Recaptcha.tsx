import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

// Google reCAPTCHA v2 ("I'm not a robot") loaded on demand, no extra npm package.
// Set VITE_RECAPTCHA_SITE_KEY in .env. The matching SECRET key lives only in the
// Supabase edge function secrets (RECAPTCHA_SECRET_KEY).

type GRecaptcha = {
  ready: (cb: () => void) => void;
  render: (el: HTMLElement, opts: Record<string, unknown>) => number;
  reset: (id?: number) => void;
};
declare global {
  interface Window { grecaptcha?: GRecaptcha }
}

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;

let loader: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (!loader) {
    loader = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      s.onload = () => window.grecaptcha!.ready(() => resolve());
      s.onerror = () => { loader = null; reject(new Error('Could not load reCAPTCHA')); };
      document.head.appendChild(s);
    });
  }
  return loader;
}

export type RecaptchaHandle = { reset: () => void };

export const Recaptcha = forwardRef<RecaptchaHandle, { onToken: (token: string | null) => void }>(
  ({ onToken }, ref) => {
    const box = useRef<HTMLDivElement>(null);
    const widgetId = useRef<number | null>(null);
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;
    const [failed, setFailed] = useState(!SITE_KEY);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetId.current !== null) window.grecaptcha?.reset(widgetId.current);
        onTokenRef.current(null);
      },
    }));

    useEffect(() => {
      if (!SITE_KEY) return;
      let cancelled = false;
      loadScript()
        .then(() => {
          if (cancelled || !box.current || widgetId.current !== null) return;
          widgetId.current = window.grecaptcha!.render(box.current, {
            sitekey: SITE_KEY,
            // the normal widget is 304px wide, too wide for very small phones
            size: window.innerWidth < 400 ? 'compact' : 'normal',
            callback: (token: string) => onTokenRef.current(token),
            'expired-callback': () => onTokenRef.current(null),
            'error-callback': () => onTokenRef.current(null),
          });
        })
        .catch(() => setFailed(true));
      return () => { cancelled = true; };
    }, []);

    return (
      <div className="my-4 flex justify-center">
        {failed ? (
          <p className="text-center text-sm text-red-600">
            The reCAPTCHA check could not load. Check your connection and refresh the page.
          </p>
        ) : (
          <div ref={box} />
        )}
      </div>
    );
  },
);
Recaptcha.displayName = 'Recaptcha';
