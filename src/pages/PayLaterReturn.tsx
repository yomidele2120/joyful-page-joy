import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/contexts/CartContext';
import { supabase } from '@/integrations/supabase/client';
import { functionErrorMessage } from '@/lib/functionError';
import { trackPurchase } from '@/lib/tracking';

// Where Credit Direct sends the buyer back. The address bar proves nothing, so this page only asks OUR server
// (creditdirect-verify), which asks Credit Direct directly. Credit Direct can take a moment to finish, so we keep asking.
const ATTEMPTS = 10;
const GAP_MS = 4000;

interface SavedCheckout { orderId: string; total: number; items: { id: string; quantity: number; unitPrice: number }[] }
function readSaved(): SavedCheckout | null {
  try { return JSON.parse(window.sessionStorage.getItem('pay-later-return') ?? 'null') as SavedCheckout | null; } catch { return null; }
}

type Phase = 'checking' | 'paid' | 'waiting' | 'failed' | 'error';

export default function PayLaterReturn() {
  const [params] = useSearchParams();
  const orderId = params.get('order') ?? '';
  const { user, loading: authLoading } = useAuth();
  const { clearCart } = useCart();
  const [phase, setPhase] = useState<Phase>('checking');
  const [message, setMessage] = useState('');
  const running = useRef(false);
  const reported = useRef(false);

  const finish = useCallback((next: Phase, text = '') => {
    setPhase(next); setMessage(text);
    if (next === 'paid' || next === 'waiting') {
      // The order exists and is being paid, so the cart has done its job.
      clearCart();
      const saved = readSaved();
      if (next === 'paid' && saved && saved.orderId === orderId && !reported.current) {
        reported.current = true;
        trackPurchase(orderId, saved.items, saved.total);   // only a confirmed payment counts as a purchase
      }
      try { window.sessionStorage.removeItem('pay-later-return'); } catch { /* ignore */ }
    }
  }, [clearCart, orderId]);

  const check = useCallback(async () => {
    if (running.current || !orderId) return;
    running.current = true;
    setPhase('checking'); setMessage('');
    try {
      for (let i = 0; i < ATTEMPTS; i++) {
        const { data, error } = await supabase.functions.invoke('creditdirect-verify', { body: { order_id: orderId } });
        if (data?.success) { finish('paid'); return; }
        if (data?.failed) { finish('failed', data.message ?? ''); return; }
        // "Still waiting" comes back as a normal 202 with { pending: true }; any real failure is an error.
        if (error || data?.error) throw new Error(await functionErrorMessage(error, data));
        if (i < ATTEMPTS - 1) await new Promise(r => setTimeout(r, GAP_MS));
      }
      finish('waiting');
    } catch (err: any) {
      finish('error', err?.message ?? 'Something went wrong');
    } finally { running.current = false; }
  }, [orderId, finish]);

  useEffect(() => {
    if (user && orderId) void check();
  }, [user, orderId, check]);

  const shell = (children: React.ReactNode) => (
    <Layout><div className="container max-w-lg py-16 text-center">{children}</div></Layout>
  );

  if (!orderId) return shell(<><h1 className="font-heading text-2xl font-bold">Nothing to confirm</h1><Link to="/my-orders"><Button className="mt-6">Go to my orders</Button></Link></>);
  if (authLoading && !user) return shell(<Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />);
  if (!user) return shell(<><h1 className="font-heading text-2xl font-bold">Please sign in to see your order</h1><p className="mt-2 text-sm text-muted-foreground">Sign in with the account you used at checkout.</p><Link to="/users-login"><Button className="mt-6">Sign in</Button></Link></>);

  if (phase === 'checking') return shell(<>
    <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
    <h1 className="mt-5 font-heading text-2xl font-bold">Confirming your payment</h1>
    <p className="mt-2 text-sm text-muted-foreground">We are checking with Credit Direct. This can take a minute. Please do not close this page.</p>
  </>);

  if (phase === 'paid') return shell(<>
    <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
    <h1 className="mt-5 font-heading text-2xl font-bold">Your Pay later order is placed</h1>
    <p className="mt-2 text-sm text-muted-foreground">Credit Direct confirmed your payment. You can follow your order and instalment status in My orders.</p>
    <Link to="/my-orders"><Button className="mt-6">View my orders</Button></Link>
  </>);

  if (phase === 'waiting') return shell(<>
    <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
    <h1 className="mt-5 font-heading text-2xl font-bold">Still waiting for Credit Direct</h1>
    <p className="mt-2 text-sm text-muted-foreground">Credit Direct has not confirmed yet. If you completed the payment, your order will update on its own shortly and you will be notified. You do not need to pay again.</p>
    <div className="mt-6 flex justify-center gap-3">
      <Button variant="outline" onClick={() => void check()}>Check again</Button>
      <Link to="/my-orders"><Button>My orders</Button></Link>
    </div>
  </>);

  if (phase === 'failed') return shell(<>
    <XCircle className="mx-auto h-12 w-12 text-destructive" />
    <h1 className="mt-5 font-heading text-2xl font-bold">Pay later was not completed</h1>
    <p className="mt-2 text-sm text-muted-foreground">{message || 'Credit Direct did not complete this payment.'} You have not been charged for this order. You can try again or pay by card.</p>
    <Link to="/checkout"><Button className="mt-6">Back to checkout</Button></Link>
  </>);

  return shell(<>
    <XCircle className="mx-auto h-12 w-12 text-destructive" />
    <h1 className="mt-5 font-heading text-2xl font-bold">We could not confirm your payment</h1>
    <p className="mt-2 text-sm text-muted-foreground">{message} If you completed the payment with Credit Direct, please contact support with your order reference rather than paying again.</p>
    <div className="mt-6 flex justify-center gap-3">
      <Button variant="outline" onClick={() => void check()}>Try again</Button>
      <Link to="/my-orders"><Button>My orders</Button></Link>
    </div>
  </>);
}
