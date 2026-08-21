import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { readOnboardingComplete, writeOnboardingComplete } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

type SessionState = {
  session: Session | null;
  /** True while a judge is previewing the app without an account. */
  judgeMode: boolean;
  onboardingComplete: boolean;
  /** True until the stored session has been read back. */
  loading: boolean;
  /** Marks onboarding done for the signed-in account and flips the guard. */
  completeOnboarding: () => void;
  /** Opens the judge preview without creating an auth session. */
  enterJudgeMode: () => void;
};

const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

/**
 * Session comes from Supabase; the onboarding flag comes from device storage.
 *
 * The flag is deliberately *not* a column on `profiles`. Onboarding gating is
 * app routing rather than a data invariant (onboarding.md), so nothing on the
 * server reads it — which makes a round trip to fetch it pure latency on every
 * cold start. Reading it locally is synchronous, so session and flag always land
 * in the same render and the guards can never briefly disagree.
 *
 * The cost is that it is per-install: a reinstall or a second device sends the
 * user through onboarding again. See onboarding.md for that trade.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [judgeMode, setJudgeMode] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    function apply(next: Session | null) {
      if (cancelled) return;
      setSession(next);
      // Supabase anonymous users are authenticated for RLS/RPC purposes, but
      // they must skip the student onboarding gate.
      setJudgeMode(next?.user.is_anonymous ?? false);
      setOnboardingComplete(next ? readOnboardingComplete(next.user.id) : false);
      setLoading(false);
    }

    void supabase.auth.getSession().then(({ data }) => apply(data.session));

    // Synchronous callback on purpose. auth-js marks the async overload
    // deprecated — an async callback can deadlock on a nested token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      apply(next);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;

  const completeOnboarding = useCallback(() => {
    // Unreachable from the survey, which only mounts behind a session guard.
    if (!userId) {
      console.warn('[session] completeOnboarding called while signed out');
      return;
    }
    writeOnboardingComplete(userId, true);
    setOnboardingComplete(true);
  }, [userId]);

  // The anonymous Supabase session is isolated to this device and can be
  // revoked with the normal sign-out flow; it never becomes a student account.
  const enterJudgeMode = useCallback(() => {
    setJudgeMode(true);
  }, []);

  return (
    <SessionContext.Provider
      value={{
        session,
        judgeMode,
        onboardingComplete,
        loading,
        completeOnboarding,
        enterJudgeMode,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
