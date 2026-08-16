import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // Starts true so protected routes wait for the saved session to be
  // restored instead of bouncing an already-signed-in user to /login.
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVendor, setIsVendor] = useState(false);
  const resolvedOnce = useRef(false);

  const checkRoles = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (error) throw error;

      const roles = data?.map((r) => r.role) || [];
      setIsAdmin(roles.includes('admin'));
      setIsVendor(roles.includes('vendor'));
      return roles;
    } catch {
      // Offline / transient failure: don't destroy the session, just leave
      // the previously known role flags as they are.
      return [] as string[];
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const syncAuthState = async (nextSession: Session | null) => {
      if (!mounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        await checkRoles(nextSession.user.id);
      } else {
        setIsAdmin(false);
        setIsVendor(false);
      }

      if (mounted) {
        resolvedOnce.current = true;
        setLoading(false);
      }
    };

    // Listener is registered first so a session restored from storage (or a
    // silent token refresh) is never missed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // TOKEN_REFRESHED / USER_UPDATED must not flip the app back into a
      // loading state — that's what made screens flash the login page.
      if (!resolvedOnce.current) setLoading(true);
      if (event === 'TOKEN_REFRESHED' && nextSession) {
        setSession(nextSession);
        setUser(nextSession.user);
        return;
      }
      void syncAuthState(nextSession);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      void syncAuthState(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [checkRoles]);

  const signIn = async (email: string, password: string) => {
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    const roles = !error && data.user ? await checkRoles(data.user.id) : [];
    return { error, roles };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
    setIsVendor(false);
    setUser(null);
    setSession(null);
  };

  return { user, session, loading, isAdmin, isVendor, signIn, signUp, signOut };
}
