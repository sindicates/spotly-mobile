import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env and fill in ' +
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

/**
 * Single Supabase client for the app.
 *
 * `detectSessionInUrl` MUST stay false: it is a web-only behaviour that breaks
 * native, where the magic link arrives through the `spotly://` deep link and is
 * handed to `setSession` by the auth callback route instead.
 *
 * Only the anon key belongs here. The OpenAI key lives in Edge Function secrets
 * and the service-role key is seed-script-only — neither may ever be given an
 * EXPO_PUBLIC_ prefix, which would inline it into the shipped bundle.
 *
 * `expo-router`'s web build prerenders routes in Node before the browser takes
 * over. AsyncStorage's web implementation reads `window.localStorage`, which
 * doesn't exist during that Node pass, so the client falls back to a no-op
 * storage there and only touches AsyncStorage once actually running in a browser.
 */
const storage =
  typeof window === 'undefined'
    ? {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      }
    : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
