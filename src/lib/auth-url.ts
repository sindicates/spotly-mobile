/**
 * Parses the URL Supabase redirects to after a magic link is clicked.
 *
 * The tokens arrive in the URL *fragment*, not the query string, because
 * `@supabase/auth-js` defaults to `flowType: 'implicit'`. That is also why the
 * callback calls `setSession` rather than `exchangeCodeForSession`.
 *
 * This has to be parsed by hand: expo-router discards the fragment on native
 * (its path extraction concatenates host + pathname + search and never touches
 * hash), so `useLocalSearchParams` is web-only and useless here. The callback
 * screen reads the raw URL via `useLinkingURL()` and hands it to this module.
 */

export type MagicLinkResult =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'none' };

/**
 * Supabase puts tokens in the fragment but can report failures in either the
 * fragment or the query string, so both are merged with the fragment winning.
 */
function paramsFrom(url: string): URLSearchParams {
  const hashAt = url.indexOf('#');
  const merged = new URLSearchParams(hashAt >= 0 ? url.slice(hashAt + 1) : '');

  const queryAt = url.indexOf('?');
  if (queryAt >= 0 && (hashAt < 0 || queryAt < hashAt)) {
    const query = url.slice(queryAt + 1, hashAt >= 0 ? hashAt : undefined);
    new URLSearchParams(query).forEach((value, key) => {
      if (!merged.has(key)) merged.set(key, value);
    });
  }

  return merged;
}

export function parseMagicLinkURL(url: string | null | undefined): MagicLinkResult {
  if (!url) return { kind: 'none' };

  const params = paramsFrom(url);

  // A reused or stale link lands here, not on the token branch:
  // #error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid…
  const code = params.get('error_code') ?? params.get('error');
  if (code) {
    return {
      kind: 'error',
      code,
      message: params.get('error_description') ?? 'This link is no longer valid.',
    };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken };
  }

  // A plain visit to /auth/callback with nothing attached.
  return { kind: 'none' };
}
