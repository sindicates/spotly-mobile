import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { SessionProvider, useSession } from '@/lib/session';

import '../global.css';

// Module scope on purpose — calling this from inside a component is too late,
// the splash has already auto-hidden by then.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}

function RootNavigator() {
  const { session, onboardingComplete, loading } = useSession();

  useEffect(() => {
    if (!loading) SplashScreen.hide();
  }, [loading]);

  // The native splash is still covering the app, so there is nothing to see.
  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/*
        Children of a false guard are filtered out of the navigator entirely and
        the router falls back to the first screen still standing, in declaration
        order. The three guards below are mutually exclusive, so exactly one is
        live at any moment.
      */}
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)/sign-in" />
      </Stack.Protected>

      <Stack.Protected guard={!!session && !onboardingComplete}>
        <Stack.Screen name="(onboarding)/survey" />
      </Stack.Protected>

      <Stack.Protected guard={!!session && onboardingComplete}>
        <Stack.Screen name="(app)/index" />
      </Stack.Protected>

      {/*
        Never guarded: the user arrives here signed out and leaves signed in, so
        neither guard state can be allowed to filter it away. Declared last so
        it is never what the router falls back to — landing here without a URL
        to parse would just spin.
      */}
      <Stack.Screen name="auth/callback" />
    </Stack>
  );
}
