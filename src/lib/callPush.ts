import { supabase } from '@/integrations/supabase/client';
import { urlBase64ToUint8Array } from '@/lib/webPushKey';

// "Someone is calling you" alerts for when the site is closed (Web Push). Needs VITE_VAPID_PUBLIC_KEY on Vercel and the call-push
// function with its VAPID secrets on Supabase (see ZEGO_SETUP.md). Where the browser or the setup does not allow it, every function
// here quietly does nothing and calls keep working exactly as before.

const WORKER_URL = '/call-push-sw.js';
const WORKER_SCOPE = '/call-push/';   // its own scope, so it never conflicts with the site's main service worker
// The generated database types do not list these call functions, so call them through a small typed view of the client.
const db = supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }> };

const vapidKey = () => String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!vapidKey();

async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register(WORKER_URL, { scope: WORKER_SCOPE });
  if (reg.active) return reg;
  const worker = reg.installing ?? reg.waiting;
  if (!worker) return reg;
  await new Promise<void>((resolve) => {
    if (worker.state === 'activated') { resolve(); return; }
    worker.addEventListener('statechange', () => { if (worker.state === 'activated') resolve(); });
    window.setTimeout(resolve, 8000);
  });
  return reg;
}

async function subscribeAndSave(): Promise<boolean> {
  const reg = await activeRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey()) as BufferSource });
  const json = sub.toJSON();
  const keys = json.keys ?? {};
  if (!json.endpoint || !keys.p256dh || !keys.auth) return false;
  const { error } = await db.rpc('save_push_subscription', {
    _endpoint: json.endpoint, _p256dh: keys.p256dh, _auth: keys.auth, _ua: navigator.userAgent.slice(0, 200),
  });
  return !error;
}

export type EnableResult = 'enabled' | 'denied' | 'unsupported' | 'error';

/** Asks the browser for permission (call this from a tap) and registers this device for call alerts. */
export async function enableCallAlerts(): Promise<EnableResult> {
  if (!pushSupported()) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    return (await subscribeAndSave()) ? 'enabled' : 'error';
  } catch (e) {
    console.warn('Call alerts could not be enabled', e);
    return 'error';
  }
}

/** Already allowed on this device? Keep the saved subscription fresh (it can change). Silent. */
export async function refreshCallAlerts(): Promise<void> {
  try { if (pushSupported() && Notification.permission === 'granted') await subscribeAndSave(); } catch { /* ignore */ }
}

/** Turn alerts off for this device. */
export async function disableCallAlerts(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration(WORKER_SCOPE);
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await db.rpc('remove_push_subscription', { _endpoint: sub.endpoint });
    await sub.unsubscribe();
  } catch { /* ignore */ }
}

/** Asks the server to alert the callee's devices. Resolves to how many devices were alerted (0 on any problem). */
export async function sendCallAlert(callId: string): Promise<number> {
  try {
    const { data, error } = await supabase.functions.invoke('call-push', { body: { callId } });
    if (error) return 0;
    return Number((data as { sent?: number } | null)?.sent ?? 0) || 0;
  } catch { return 0; }
}
