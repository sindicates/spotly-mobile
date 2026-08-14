import { createMMKV } from 'react-native-mmkv';

/**
 * Device-local key-value store, backed by MMKV.
 *
 * This is for state that is genuinely a property of *this install* rather than
 * of the account — currently just the onboarding flag. Anything another device
 * or another session needs to agree on belongs in Postgres, not here.
 *
 * MMKV is synchronous, which is the whole reason it is used for the onboarding
 * flag: the route guards in `_layout.tsx` can read it during render, so there is
 * no window where the session exists but the flag has not resolved yet.
 *
 * Platform notes:
 * - Native: JSI-backed, so it needs a dev build. It will not load in Expo Go.
 * - Web: the package resolves a `.web` implementation over `localStorage`.
 * - Static prerender: expo-router renders web routes in Node first, where there
 *   is no `localStorage` and MMKV's web build throws on any access. The
 *   in-memory fallback below keeps that pass from crashing. Nothing is persisted
 *   during prerender, which is correct — there is no user there to persist for.
 */

// Structural, and intentionally only the two methods this module uses — it is
// what lets the prerender fallback stand in for a real MMKV instance.
type Store = {
  getBoolean(key: string): boolean | undefined;
  set(key: string, value: boolean): void;
};

function createMemoryStore(): Store {
  const map = new Map<string, boolean>();
  return {
    getBoolean: (key) => map.get(key),
    set: (key, value) => void map.set(key, value),
  };
}

// Constructed lazily. At module scope this would run during the Node prerender
// pass and during any future test import, neither of which wants a real store.
//
// v4 dropped the `new MMKV()` constructor for the `createMMKV()` factory, and
// exports `MMKV` as a type only — importing it as a value is a compile error.
let store: Store | undefined;

function getStore(): Store {
  if (store === undefined) {
    store =
      typeof window === 'undefined' ? createMemoryStore() : createMMKV({ id: 'spotly' });
  }
  return store;
}

/**
 * Keyed by account id, not a bare `onboarding_complete`.
 *
 * A shared or reassigned device is the case that matters: if one person finishes
 * onboarding, the next person to sign in on that phone must still be sent
 * through it. Namespacing by `auth.uid()` is what makes a device-local flag safe
 * to keep across sign-out — and keeping it across sign-out is the point, so a
 * returning user is not asked to onboard twice.
 */
function onboardingKey(userId: string): string {
  return `onboarding_complete:${userId}`;
}

export function readOnboardingComplete(userId: string): boolean {
  return getStore().getBoolean(onboardingKey(userId)) ?? false;
}

export function writeOnboardingComplete(userId: string, complete: boolean): void {
  getStore().set(onboardingKey(userId), complete);
}
