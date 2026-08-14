import { PortalHost } from '@rn-primitives/portal';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';

import { NAV_THEME } from '@/lib/theme';

import '../global.css';

/**
 * Root layout. Three jobs, in order:
 *
 * 1. Load the stylesheet. The `global.css` import is what registers every design
 *    token with NativeWind — without it, class names resolve to nothing.
 * 2. Hand the palette to React Navigation, so headers and card backgrounds match
 *    the app surface instead of defaulting to system white.
 * 3. Mount the `PortalHost`. React Native has no DOM portals, so every overlay
 *    component (Dialog, Select, AlertDialog) renders into this host rather than
 *    in place. It must be the LAST child of the providers, or overlays paint
 *    underneath the screen they were opened from.
 *
 * The session gate described in docs/ARCHITECTURE.md — routing to (auth),
 * (onboarding), or (app) based on session and `profiles.onboarding_complete` —
 * belongs here too, and is not built yet.
 */
export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme ?? 'light';

  return (
    <ThemeProvider value={NAV_THEME[scheme]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
      <PortalHost />
    </ThemeProvider>
  );
}
