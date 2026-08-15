import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

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
 *
 * The `<Database>` parameter is what makes the generated schema load-bearing
 * rather than decorative: every `.from()` table name, selected column, and
 * `.rpc()` argument is checked against it, so a migration that renames a column
 * fails `npm run typecheck` instead of returning undefined at runtime. Regenerate
 * with `npm run gen:types` after any migration.
 */
const storage =
  typeof window === 'undefined'
    ? {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      }
    : AsyncStorage;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/** The shape supabase-js returns in `error`, narrowed to what is used here. */
type ServerError = { message: string; code?: string; hint?: string | null };

/**
 * A PostgREST failure, rethrown as a real `Error`.
 *
 * supabase-js returns errors rather than throwing them, and a `PostgrestError`
 * is a plain object — `instanceof Error` is false, so it does not survive a
 * `catch` that expects one. Wrapping is what lets a screen `try`/`catch` around
 * a whole write path.
 *
 * The message/reason split matters. Spotly's RPCs raise machine tokens
 * (`review_exists`, `spot_exists`, `not_authenticated`) and put the sentence a
 * person should read in `hint`. So `message` is the hint when there is one —
 * that is what screens render — and `reason` keeps the token, which is what
 * code branches on. Branching on a hint would break the moment anyone reworded
 * it; showing a raw token would put `review_exists` in front of a user.
 */
export class RequestError extends Error {
  /** SQLSTATE. P0001 for a `raise exception`, 23505 for a unique violation. */
  readonly code?: string;
  /** The server's raw message — a token for RPC-raised errors. */
  readonly reason: string;

  constructor({ message, code, hint }: ServerError) {
    super(hint || message);
    this.name = 'RequestError';
    this.code = code;
    this.reason = message;
  }
}

/** Turns the `{ data, error }` pair into a value or a throw. */
export function unwrap<T>(result: { data: T | null; error: ServerError | null }): T {
  if (result.error) throw new RequestError(result.error);
  return result.data as T;
}

/**
 * The sentence an Edge Function actually sent, not supabase-js's summary of it.
 *
 * On any non-2xx, `FunctionsHttpError.message` is the fixed string "Edge
 * Function returned a non-2xx code" — identical whether the function is
 * undeployed, a secret is missing, or the caller is signed out. The real
 * explanation is the `{ error }` body, reachable through `context`, which is the
 * undrained `Response`. Reading it is the difference between a bug report that
 * says what broke and one that says nothing. Shared by every `functions.invoke`
 * caller (`embed`, `search`) so the extraction cannot drift between them.
 */
export async function functionErrorMessage(error: Error): Promise<string> {
  const response = (error as { context?: Response }).context;
  if (!(response instanceof Response)) return error.message;
  try {
    const payload = (await response.clone().json()) as { error?: unknown };
    if (typeof payload.error === 'string' && payload.error) return payload.error;
  } catch {
    // Non-JSON body (a gateway 404 for an undeployed function, say). Fall through
    // to the status, which at least distinguishes the failures from each other.
  }
  return `${error.message} (HTTP ${response.status})`;
}
