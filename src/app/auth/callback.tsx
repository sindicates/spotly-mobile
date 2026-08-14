import { useLinkingURL } from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from 'react-native';

import { parseMagicLinkURL } from '@/lib/auth-url';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

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
  const { session, onboardingComplete, refreshProfile } = useSession();
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

      await refreshProfile();
      if (!cancelled) setPhase('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [url, phase, refreshProfile]);

  // Navigate in a separate effect so it runs after a render where the guards
  // already reflect the refreshed onboardingComplete. Navigating from inside
  // the async block above can beat the state flush and flash the wrong screen.
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
      <View className="flex-1 items-center justify-center gap-3 bg-white px-8">
        <Text className="text-center text-lg font-semibold text-neutral-900">
          That link didn&apos;t work
        </Text>
        <Text className="text-center text-sm text-neutral-500">{message}</Text>
        <TouchableOpacity
          onPress={() => router.replace('/sign-in')}
          className="w-full items-center rounded-lg bg-neutral-900 py-3"
        >
          <Text className="font-semibold text-white">Request a new link</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-white px-8">
      <ActivityIndicator />
      <Text className="text-sm text-neutral-500">Signing you in…</Text>
    </View>
  );
}
