import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConsent } from '@/contexts/ConsentContext';

const CATEGORIES = [
  {
    key: 'essential' as const,
    title: 'Essential',
    text: 'Needed for the site to work: keeping you signed in, your cart, secure checkout and remembering your cookie choice. These cannot be switched off.',
  },
  {
    key: 'analytics' as const,
    title: 'Analytics',
    text: 'Help us understand how the site is used so we can improve it. Off unless you allow it.',
  },
  {
    key: 'marketing' as const,
    title: 'Marketing',
    text: 'Used to show relevant offers and measure advertising. Off unless you allow it.',
  },
];

export default function CookieConsent() {
  const { consent, decided, preferencesOpen, acceptAll, rejectAll, savePreferences, openPreferences, closePreferences } = useConsent();
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  // Start the switches from the saved choice whenever the dialog opens.
  useEffect(() => {
    if (preferencesOpen) {
      setAnalytics(!!consent?.analytics);
      setMarketing(!!consent?.marketing);
    }
  }, [preferencesOpen, consent]);

  return (
    <>
      {!decided && !preferencesOpen && (
        <div
          role="region"
          aria-label="Cookie consent"
          className="fixed inset-x-0 bottom-14 z-[60] border-t border-border bg-card p-4 shadow-lg md:bottom-0"
        >
          <div className="container flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted-foreground">
              We use essential cookies and similar storage to make this site work. Optional analytics and marketing cookies stay off unless you allow them.
              See our <Link to="/cookie-policy" className="font-medium text-primary underline-offset-2 hover:underline">Cookie Policy</Link>.
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button size="sm" onClick={rejectAll}>Reject all</Button>
              <Button size="sm" onClick={acceptAll}>Accept all</Button>
              <Button size="sm" variant="outline" onClick={openPreferences}>Manage preferences</Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={preferencesOpen} onOpenChange={open => { if (!open) closePreferences(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cookie preferences</DialogTitle>
            <DialogDescription>Choose which optional cookies you allow. You can change this at any time from "Cookie settings" in the footer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {CATEGORIES.map(category => {
              const checked = category.key === 'essential' ? true : category.key === 'analytics' ? analytics : marketing;
              return (
                <div key={category.key} className="flex items-start justify-between gap-4 border-b border-border pb-4 last:border-0">
                  <div>
                    <p className="font-medium">{category.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{category.text}</p>
                  </div>
                  <Switch
                    checked={checked}
                    disabled={category.key === 'essential'}
                    aria-label={`${category.title} cookies`}
                    onCheckedChange={v => { if (category.key === 'analytics') setAnalytics(v); if (category.key === 'marketing') setMarketing(v); }}
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={rejectAll}>Reject all</Button>
            <Button variant="outline" onClick={acceptAll}>Accept all</Button>
            <Button onClick={() => savePreferences({ analytics, marketing })}>Save preferences</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
