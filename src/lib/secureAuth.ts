import { supabase } from '@/integrations/supabase/client';

// Sign in / sign up through the `secure-auth` edge function, which verifies the
// Google reCAPTCHA token on the server before touching Supabase Auth.

interface SecureAuthInput {
  action: 'signin' | 'signup';
  email: string;
  password: string;
  captchaToken: string;
  fullName?: string;
  metadata?: Record<string, string | boolean>;
}

export async function secureAuth(input: SecureAuthInput) {
  const { data, error } = await supabase.functions.invoke('secure-auth', { body: input });

  if (error) {
    // The function replies with { error } and a 4xx status; pull that message out.
    let message = error.message;
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) message = body.error;
    } catch { /* keep the default message */ }
    return { error: new Error(message), user: null };
  }
  if (data?.error) return { error: new Error(data.error), user: null };

  const session = data?.session;
  if (!session?.access_token || !session?.refresh_token) {
    return { error: new Error('Authentication failed'), user: null };
  }

  const { data: set, error: setError } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (setError) return { error: setError as Error, user: null };
  return { error: null, user: set.user };
}
