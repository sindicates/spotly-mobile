import { Easing, ReduceMotion } from 'react-native-reanimated';

/**
 * The app's motion vocabulary. Three durations, three easings, no others.
 *
 * These exist because React Native has no stylesheet to hang `--ease-out` on, so
 * the alternative is a `{ duration: 180 }` literal at every call site and an app
 * where nothing quite agrees with anything else. Reach for a named value; if a
 * moment genuinely needs a fourth, add it here rather than inline.
 *
 * Motion in Spotly is meant to explain, not decorate. If you cannot say what a
 * transition tells the user, it should not be there.
 */

export const DUR = {
  /** Press feedback, colour shifts, a toggle ticking over. */
  micro: 120,
  /** The common case: a card lifting, a badge appearing, a card leaving. */
  short: 220,
  /** Screens and sheets. */
  long: 420,
} as const;

/**
 * Exits run at roughly three-quarters of their entrance. Something arriving
 * should settle; something leaving should get out of the way.
 *
 * Marked `'worklet'` so it can be called from the UI thread as well as the JS
 * one. Gesture callbacks and animated styles are worklets, and a plain function
 * called from inside one throws at runtime — "Tried to synchronously call a
 * Remote Function" — rather than failing to compile. Every helper in this file
 * is a candidate to be used from a worklet, so they all carry the directive.
 */
export function exitOf(duration: number) {
  'worklet';
  return Math.round(duration * 0.75);
}

export const EASE = {
  /** Entering. Decelerates into place. */
  out: Easing.bezier(0.16, 1, 0.3, 1),
  /** Leaving. Accelerates away. */
  in: Easing.bezier(0.7, 0, 0.84, 0),
  /** Toggling between two resting states. */
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
} as const;

/**
 * The one spring in the app, for the card that snaps back when a swipe is
 * abandoned. Damped hard on purpose — an overshoot here would read as a toy.
 */
export const SPRING = { damping: 18, stiffness: 180 } as const;

/**
 * Every layout animation passes this so the system accessibility setting is
 * honoured without each call site remembering to check it.
 */
export const REDUCE_MOTION = ReduceMotion.System;
