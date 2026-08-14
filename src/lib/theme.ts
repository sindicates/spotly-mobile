import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

/**
 * The palette from src/global.css, in TypeScript.
 *
 * Class names cover almost everything. This object exists for the places a
 * class name cannot reach: React Navigation's theme, status-bar and system-UI
 * colours, and any animated style driven by Reanimated worklets.
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
    background: 'hsl(0 0% 100%)',
    foreground: 'hsl(222 24% 11%)',
    card: 'hsl(0 0% 100%)',
    cardForeground: 'hsl(222 24% 11%)',
    popover: 'hsl(0 0% 100%)',
    popoverForeground: 'hsl(222 24% 11%)',
    primary: 'hsl(209 87% 53%)',
    primaryForeground: 'hsl(0 0% 100%)',
    secondary: 'hsl(210 40% 96%)',
    secondaryForeground: 'hsl(222 24% 16%)',
    muted: 'hsl(210 33% 96%)',
    mutedForeground: 'hsl(215 16% 45%)',
    accent: 'hsl(205 91% 95%)',
    accentForeground: 'hsl(209 87% 30%)',
    destructive: 'hsl(0 72% 51%)',
    destructiveForeground: 'hsl(0 0% 100%)',
    border: 'hsl(214 24% 90%)',
    input: 'hsl(214 24% 90%)',
    ring: 'hsl(209 87% 53%)',
    radius: '0.75rem',
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
    card: 'hsl(222 22% 10%)',
    cardForeground: 'hsl(210 20% 96%)',
    popover: 'hsl(222 22% 10%)',
    popoverForeground: 'hsl(210 20% 96%)',
    primary: 'hsl(209 90% 61%)',
    primaryForeground: 'hsl(222 40% 10%)',
    secondary: 'hsl(217 19% 17%)',
    secondaryForeground: 'hsl(210 20% 96%)',
    muted: 'hsl(217 19% 17%)',
    mutedForeground: 'hsl(215 15% 65%)',
    accent: 'hsl(209 44% 20%)',
    accentForeground: 'hsl(205 90% 88%)',
    destructive: 'hsl(0 62% 55%)',
    destructiveForeground: 'hsl(0 0% 100%)',
    border: 'hsl(217 17% 22%)',
    input: 'hsl(217 17% 24%)',
    ring: 'hsl(209 90% 61%)',
    radius: '0.75rem',
    occupancyEmpty: 'hsl(152 52% 56%)',
    occupancyEmptySurface: 'hsl(152 34% 15%)',
    occupancySome: 'hsl(38 88% 60%)',
    occupancySomeSurface: 'hsl(36 40% 16%)',
    occupancyPacked: 'hsl(0 70% 63%)',
    occupancyPackedSurface: 'hsl(0 38% 17%)',
  },
} as const;

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
