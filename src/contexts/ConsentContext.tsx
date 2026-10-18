import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getStoredConsent, saveConsent, onConsentChange, type ConsentState } from '@/lib/consent';

interface ConsentContextValue {
  consent: ConsentState | null;
  /** True once the visitor has made a choice (accept, reject or custom). */
  decided: boolean;
  preferencesOpen: boolean;
  acceptAll: () => void;
  rejectAll: () => void;
  savePreferences: (choice: { analytics: boolean; marketing: boolean }) => void;
  openPreferences: () => void;
  closePreferences: () => void;
}

const ConsentContext = createContext<ConsentContextValue | undefined>(undefined);

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<ConsentState | null>(() => getStoredConsent());
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => onConsentChange(state => setConsent(state)), []);

  const savePreferences = useCallback((choice: { analytics: boolean; marketing: boolean }) => {
    setConsent(saveConsent(choice));
    setPreferencesOpen(false);
  }, []);

  const value = useMemo<ConsentContextValue>(() => ({
    consent,
    decided: consent !== null,
    preferencesOpen,
    acceptAll: () => savePreferences({ analytics: true, marketing: true }),
    rejectAll: () => savePreferences({ analytics: false, marketing: false }),
    savePreferences,
    openPreferences: () => setPreferencesOpen(true),
    closePreferences: () => setPreferencesOpen(false),
  }), [consent, preferencesOpen, savePreferences]);

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent() {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent must be used within ConsentProvider');
  return ctx;
}
