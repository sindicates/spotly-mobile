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

      {/*
        Declaration order is the fallback order, so `survey` comes first: it is
        where onboarding starts, and `first-review` is only ever reached from it.
      */}
      <Stack.Protected guard={!!session && !onboardingComplete}>
        <Stack.Screen name="(onboarding)/survey" />
        <Stack.Screen name="(onboarding)/first-review" />
      </Stack.Protected>

      {/*
        The native tab bar is the root of the app stack and headerless — each of
        its three screens owns its own top bar. Everything else is pushed on top
        of the whole tab navigator with a native header, so a detail screen
        covers the tab bar rather than sitting inside one tab's history: the spot
        page is reached from all three tabs and belongs to none of them. The
        header is where the back button and the top inset come from; those
        screens render under it with `edges` dropping `top`. The spot page sets
        its own title from the loaded area name.
      */}
      <Stack.Protected guard={!!session && onboardingComplete}>
        <Stack.Screen name="(app)/(tabs)" />
        <Stack.Screen name="(app)/spot/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen
          name="(app)/spot/new"
          options={{ headerShown: true, title: 'Add a spot' }}
        />
        <Stack.Screen
          name="(app)/review/new"
          options={{ headerShown: true, title: 'Add your review' }}
        />
        <Stack.Screen
          name="(app)/content-policy"
          options={{ headerShown: true, title: 'Content policy' }}
        />
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
