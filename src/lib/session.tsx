import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/lib/supabase';

type SessionState = {
  session: Session | null;
  onboardingComplete: boolean;
  /** True until both the session and the first profile read have settled. */
  loading: boolean;
  /** Re-reads the profile and resolves *after* state is set, so a caller that
   *  awaits it can navigate knowing the route guards already agree. */
  refreshProfile: () => Promise<boolean>;
};

const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

/**
 * A missing profile row is treated as "not onboarded", never as an error.
 *
 * `maybeSingle` rather than `single`, which throws on zero rows. If the signup
 * trigger ever fails to fire, the cost of this choice is that the user repeats
 * onboarding; the cost of the alternative is an account that can never route
 * anywhere. The same reasoning applies to `complete_onboarding` later — it
 * should upsert rather than update.
 */
export async function readOnboardingComplete(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding_complete')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[session] profile read failed:', error.message);
    return false;
  }

  return data?.onboarding_complete ?? false;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function apply(next: Session | null) {
      const complete = next ? await readOnboardingComplete(next.user.id) : false;
      if (cancelled) return;
      setSession(next);
      setOnboardingComplete(complete);
      // Deliberately cleared only after the profile read. If this flipped as
      // soon as getSession resolved, a returning onboarded user would render
      // one frame with onboardingComplete still false and flash the survey.
      setLoading(false);
    }

    void supabase.auth.getSession().then(({ data }) => apply(data.session));

    // Synchronous callback on purpose. auth-js marks the async overload
    // deprecated — an async callback can deadlock on a nested token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      void apply(next);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    const complete = uid ? await readOnboardingComplete(uid) : false;
    setSession(data.session);
    setOnboardingComplete(complete);
    return complete;
  }, []);

  return (
    <SessionContext.Provider
      value={{ session, onboardingComplete, loading, refreshProfile }}
    >
      {children}
    </SessionContext.Provider>
  );
}
