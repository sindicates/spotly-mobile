/**
 * Semantic haptic feedback. Screens and primitives call these; they never
 * import expo-haptics directly. Intensity lives here so a button press cannot
 * drift heavier on one screen than another.
 *
 * Press and selection fire from primitives. Success, warning, and error fire
 * from write results — a tap already buzzed, the outcome is a second, different
 * signal.
 *
 * Web (and therefore the Node prerender pass) is a no-op: Spotly is a mobile
 * app. Failures are swallowed — Low Power Mode, a disabled Taptic Engine, or a
 * missing vibrator must never break a press handler.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

function play(run: () => Promise<void>): void {
  if (Platform.OS === 'web') return;
  void run().catch(() => {});
}

/** Light impact — a control was pressed. Used by Button. */
export function press(): void {
  play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Selection tick — a choice changed. Toggle, SelectItem, review expand. */
export function selection(): void {
  play(() => Haptics.selectionAsync());
}

/** Task completed. Magic link sent, survey saved, review posted, check-in accepted. */
export function success(): void {
  play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Soft rejection. Rate-limited check-in, a write that cannot proceed as typed. */
export function warning(): void {
  play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** Hard failure. Network drop, submit rejected. */
export function error(): void {
  play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
