import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

/**
 * The palette from src/global.css, in TypeScript.
 *
 * Class names cover almost everything. This object exists for the places a
 * class name cannot reach: React Navigation's theme, status-bar and system-UI
 * colours, map markers, and any animated style driven by Reanimated worklets.
 *
 * This file is a mirror, not a source. If you change a variable in global.css,
 * change it here too — they drift silently, and the symptom is a navigation
 * header that stays light while the app goes dark.
 *
 * Expo Router 57 re-exports the navigation theming primitives from its root
 * entry. The React Native Reusables docs import them from
 * `expo-router/react-navigation`, which is the SDK 56 path.
 */
export const THEME = {
  light: {
    background: 'hsl(210 28% 96%)',
    foreground: 'hsl(222 24% 11%)',
    card: 'hsl(0 0% 100%)',
    cardForeground: 'hsl(222 24% 11%)',
    popover: 'hsl(0 0% 100%)',
    popoverForeground: 'hsl(222 24% 11%)',
    primary: 'hsl(209 87% 53%)',
    primaryForeground: 'hsl(0 0% 100%)',
    secondary: 'hsl(210 32% 93%)',
    secondaryForeground: 'hsl(222 24% 16%)',
    muted: 'hsl(210 30% 93%)',
    mutedForeground: 'hsl(215 16% 45%)',
    accent: 'hsl(205 80% 92%)',
    accentForeground: 'hsl(209 87% 30%)',
    destructive: 'hsl(0 72% 51%)',
    destructiveForeground: 'hsl(0 0% 100%)',
    border: 'hsl(214 22% 88%)',
    input: 'hsl(214 22% 88%)',
    ring: 'hsl(209 87% 53%)',
    radius: '1rem',
    /** Elevation hue. `Card` composes it with a per-level alpha. */
    shadow: 'hsl(215 45% 18%)',
    occupancyEmpty: 'hsl(152 58% 34%)',
    occupancyEmptySurface: 'hsl(150 52% 94%)',
    occupancySome: 'hsl(32 90% 40%)',
    occupancySomeSurface: 'hsl(42 94% 92%)',
    occupancyPacked: 'hsl(0 72% 48%)',
    occupancyPackedSurface: 'hsl(0 86% 96%)',
  },
  dark: {
    background: 'hsl(222 24% 7%)',
    foreground: 'hsl(210 20% 96%)',
    card: 'hsl(222 20% 13%)',
    cardForeground: 'hsl(210 20% 96%)',
    popover: 'hsl(222 20% 13%)',
    popoverForeground: 'hsl(210 20% 96%)',
    primary: 'hsl(209 90% 61%)',
    primaryForeground: 'hsl(222 40% 10%)',
    secondary: 'hsl(217 18% 19%)',
    secondaryForeground: 'hsl(210 20% 96%)',
    muted: 'hsl(217 19% 15%)',
    mutedForeground: 'hsl(215 15% 65%)',
    accent: 'hsl(209 44% 23%)',
    accentForeground: 'hsl(205 90% 88%)',
    destructive: 'hsl(0 62% 55%)',
    destructiveForeground: 'hsl(0 0% 100%)',
    border: 'hsl(217 17% 26%)',
    input: 'hsl(217 17% 26%)',
    ring: 'hsl(209 90% 61%)',
    radius: '1rem',
    shadow: 'hsl(222 40% 2%)',
    occupancyEmpty: 'hsl(152 52% 56%)',
    occupancyEmptySurface: 'hsl(152 34% 15%)',
    occupancySome: 'hsl(38 88% 60%)',
    occupancySomeSurface: 'hsl(36 40% 16%)',
    occupancyPacked: 'hsl(0 70% 63%)',
    occupancyPackedSurface: 'hsl(0 38% 17%)',
  },
} as const;

/**
 * Elevation. Four levels, and a card only ever sits on one of them.
 *
 * This lives in TypeScript rather than as a `shadow-*` class because NativeWind's
 * native preset replaces Tailwind's shadow scale with its own values, pins
 * `shadowOpacity` to 1 so the alpha has to ride on the colour, and emits the
 * Android `elevation` prop only when compiling for Android. One object that both
 * platforms read is easier to keep honest than a class that means two things.
 *
 * Each level is a *single* shadow. Stacking two is how a card starts looking
 * like a sticker, and NativeWind would drop the second one anyway.
 *
 * Dark mode gets `NONE` at every level — see the note in global.css. Depth there
 * comes from `--card` sitting lighter than `--background`, because a shadow on a
 * dark surface reads as a glow.
 */
export type ElevationLevel = 'flat' | 'resting' | 'lifted' | 'dragged';

type ElevationStyle = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  /** Android ignores colour and offset; it interpolates its own from this. */
  elevation: number;
};

const NO_SHADOW: ElevationStyle = {
  shadowColor: 'transparent',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0,
  shadowRadius: 0,
  elevation: 0,
};

export const ELEVATION: Record<'light' | 'dark', Record<ElevationLevel, ElevationStyle>> = {
  light: {
    flat: NO_SHADOW,
    resting: {
      shadowColor: THEME.light.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    lifted: {
      shadowColor: THEME.light.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 6,
    },
    dragged: {
      shadowColor: THEME.light.shadow,
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.16,
      shadowRadius: 40,
      elevation: 12,
    },
  },
  dark: {
    flat: NO_SHADOW,
    resting: NO_SHADOW,
    lifted: NO_SHADOW,
    dragged: NO_SHADOW,
  },
};

/** Feeds `<ThemeProvider>` so navigation chrome matches the app surface. */
export const NAV_THEME: Record<'light' | 'dark', Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
};
