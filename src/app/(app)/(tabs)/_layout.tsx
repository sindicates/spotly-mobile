import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'nativewind';

import { THEME } from '@/lib/theme';

/**
 * The three places you can be in Spotly: the feed, a search, your saved spots.
 *
 * `NativeTabs` renders the real platform tab bar — UITabBarController on iOS,
 * BottomNavigationView on Android — rather than a JS reimplementation of one.
 * That is what buys the system behaviours we would otherwise have to fake and
 * would get subtly wrong: the iOS 26 liquid-glass bar and its scroll-edge
 * translucency, tap-the-active-tab-to-scroll-to-top, VoiceOver's "tab 2 of 3",
 * and the Dynamic Type / bold-text / reduce-motion settings, all for free.
 *
 * The trade is that this bar is native, so NativeWind cannot reach it. Colours
 * come from `THEME`, the TypeScript mirror of `global.css` that exists for
 * exactly this — native chrome that class names cannot style. Read the scheme
 * here rather than passing one colour: a native prop set once does not re-read
 * itself when the system flips to dark.
 *
 * Everything pushed on top of a tab — spot detail, the two forms, the content
 * policy — stays in the root stack above this navigator, so those screens cover
 * the tab bar and keep their back button. Only destinations are tabs.
 *
 * Native tabs is still an alpha API in SDK 57, hence the `unstable-` import
 * path. https://docs.expo.dev/router/advanced/native-tabs/
 */
export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme ?? 'light'];

  return (
    <NativeTabs
      // Selected is `primary`, unselected is `muted-foreground` — the same two
      // roles every other selected/unselected pair in the app uses.
      tintColor={theme.primary}
      iconColor={{ default: theme.mutedForeground, selected: theme.primary }}
      labelStyle={{
        default: { color: theme.mutedForeground },
        selected: { color: theme.primary },
      }}
      indicatorColor={theme.accent}
      rippleColor={theme.accent}>
      {/*
        Icons are the platform's own symbol sets — SF Symbols on iOS, Material
        Symbols on Android — not the Lucide set the rest of the app draws from.
        A tab bar is the one surface where matching the OS beats matching the
        app, and it costs no bundle: both ship with the system.

        The filled/outline pair is the platform convention for selection, and it
        is what keeps the state legible without relying on the tint alone.
      */}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          md={{ default: 'home', selected: 'home_filled' }}
        />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="favorites">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'heart', selected: 'heart.fill' }}
          md={{ default: 'favorite_border', selected: 'favorite' }}
        />
        <NativeTabs.Trigger.Label>Favourites</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
