import { useLinkingURL } from 'expo-linking';
import { router } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { parseMagicLinkURL } from '@/lib/auth-url';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { THEME } from '@/lib/theme';

/**
 * Deep-link target for the magic link (AUTH-2).
 *
 * This route is intentionally NOT inside the `(auth)` group. expo-router strips
 * group segments from URLs, so `(auth)/callback.tsx` would answer to `/callback`
 * and never to `/auth/callback` — which is the URL baked into config.toml, the
 * remote redirect allowlist, and every email already sent.
 *
 * `useLinkingURL()` is the only API that returns the raw URL on both platforms:
 * expo-router drops the fragment on native, and the tokens live in the fragment.
 */
export default function AuthCallback() {
  const url = useLinkingURL();
  const { colorScheme } = useColorScheme();
  const { session, onboardingComplete } = useSession();
  const [phase, setPhase] = useState<'working' | 'ready' | 'error'>('working');
  const [message, setMessage] = useState('');

  // Consume the URL exactly once.
  useEffect(() => {
    if (phase !== 'working' || !url) return;

    const result = parseMagicLinkURL(url);
    if (result.kind === 'none') return; // not our URL yet — wait for the listener

    let cancelled = false;

    void (async () => {
      if (result.kind === 'error') {
        if (!cancelled) {
          setMessage(result.message);
          setPhase('error');
        }
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      if (cancelled) return;

      if (error) {
        setMessage(error.message);
        setPhase('error');
        return;
      }

      // Get the tokens out of the address bar before they can be copied,
      // bookmarked, or picked up by anything reading location.
      if (Platform.OS === 'web') {
        window.history.replaceState(null, '', window.location.pathname);
      }

      // No profile fetch to await: `setSession` fires onAuthStateChange, and the
      // provider reads the onboarding flag out of device storage synchronously
      // in that same handler.
      if (!cancelled) setPhase('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [url, phase]);

  // Navigate in a separate effect, gated on `session` having actually landed in
  // provider state — that is the render where the guards agree. Navigating from
  // inside the async block above can beat the state flush and flash the wrong
  // screen.
  useEffect(() => {
    if (phase !== 'ready' || !session) return;
    router.replace(onboardingComplete ? '/' : '/survey');
  }, [phase, session, onboardingComplete]);

  // A malformed link would otherwise leave the user on a spinner forever.
  useEffect(() => {
    if (phase !== 'working') return;
    const timer = setTimeout(() => {
      setMessage("We couldn't read that sign-in link.");
      setPhase('error');
    }, 8000);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === 'error') {
    return (
      <Screen className="justify-center px-5">
        <View className="gap-3">
          <Text variant="h3">That link didn&apos;t work</Text>
          {/*
            The server's wording, not a paraphrase. "Expired" and "already used"
            are different problems with the same fix, and only it knows which.
          */}
          <Text className="text-muted-foreground">{message}</Text>
          <Button className="mt-2" onPress={() => router.replace('/sign-in')}>
            <Text>Request a new link</Text>
          </Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen className="items-center justify-center gap-3 px-5">
      {/*
        A spinner rather than a skeleton, and the one place in the app that is
        correct: nothing is loading into a known layout here — the screen exists
        only to hand tokens to `setSession` and get out of the way.

        `color` is a prop, not a style, so `className` cannot reach it. THEME is
        the mirror of the same tokens for exactly this case.
      */}
      <ActivityIndicator color={THEME[colorScheme ?? 'light'].mutedForeground} />
      <Text variant="muted">Signing you in…</Text>
    </Screen>
  );
}
