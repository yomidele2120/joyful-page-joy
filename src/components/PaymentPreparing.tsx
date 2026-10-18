import { useEffect, useState } from 'react';

// Dots that grow and shrink (. .. ... .. .) so the buyer can see the page is working.
const DOT_STEPS = ['.', '..', '...', '..'];

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function AnimatedDots() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = window.setInterval(() => setStep(s => (s + 1) % DOT_STEPS.length), 350);
    return () => window.clearInterval(timer);
  }, []);
  // Fixed width so the text next to it does not jump as the dots change.
  return <span aria-hidden="true" className="inline-block w-[1.1em] text-left">{prefersReducedMotion() ? '...' : DOT_STEPS[step]}</span>;
}

// Full-screen "please wait" panel for the slowest part of paying later: creating the order, asking
// Klump for the payment and loading its window. It is removed as soon as Klump's own window opens.
export function PaymentPreparingOverlay({ message = 'Preparing secure payment' }: { message?: string }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      aria-label={message}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background/85 p-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm border border-border bg-card p-8 text-center shadow-lg">
        <span className="mx-auto mb-5 block h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
        <p className="font-heading text-lg font-semibold">
          {message}<AnimatedDots />
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Please don't close or refresh this page.</p>
      </div>
    </div>
  );
}
