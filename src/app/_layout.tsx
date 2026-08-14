import { PortalHost } from '@rn-primitives/portal';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'nativewind';
import { useEffect } from 'react';

import { SessionProvider, useSession } from '@/lib/session';
import { NAV_THEME } from '@/lib/theme';

import '../global.css';

// Module scope on purpose — calling this from inside a component is too late,
// the splash has already auto-hidden by then.
void SplashScreen.preventAutoHideAsync();

/**
 * Root layout. Jobs, in order:
 *
 * 1. Load the stylesheet. The `global.css` import is what registers every design
 *    token with NativeWind — without it, class names resolve to nothing.
 * 2. Hand the palette to React Navigation, so headers and card backgrounds match
 *    the app surface instead of defaulting to system white.
 * 3. Gate the three route groups on session + onboarding.
 * 4. Mount the `PortalHost`. React Native has no DOM portals, so every overlay
 *    component (Dialog, Select, AlertDialog) renders into this host rather than
 *    in place. It must be the LAST child of the providers, or overlays paint
 *    underneath the screen they were opened from.
 */
export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme ?? 'light';

  return (
    <ThemeProvider value={NAV_THEME[scheme]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
      <PortalHost />
    </ThemeProvider>
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
