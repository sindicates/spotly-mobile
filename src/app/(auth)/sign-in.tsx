import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/utils';

/**
 * AUTH-1..3. One screen for both signup and sign-in — there is no account to
 * "already have", so a sign-up / log-in split would ask the user a question the
 * app can answer itself.
 *
 * No password field exists anywhere in the app (AUTH-2), and there is nothing to
 * fill in beyond the address (AUTH-3): no display name, no avatar, no profile.
 */

/**
 * AUTH-1. A UX affordance for the error message, not the gate.
 *
 * The gate is `before_user_created_hook`, and it has to be — anyone can post to
 * the auth endpoint without going near this form. Loosening this regex does not
 * loosen the rule; it only produces a worse error later.
 *
 * `case.edu`, not any `.edu`: the wireframe says `.edu` but authentication.md
 * resolved it to `case.edu` to match the landing page's "CWRU only" claim, and
 * the feature doc wins.
 */
const CASE_EMAIL_RE = /^[^@\s]+@case\.edu$/i;

/**
 * Where Supabase should send the user after they click the magic link.
 *
 * Supabase matches this against an exact allowlist and, on a miss, silently
 * falls back to Site URL instead of erroring — so this has to be one fixed,
 * predictable string per platform.
 *
 * Deliberately NOT `Linking.createURL('/auth/callback')`. That helper folds
 * `Constants.expoConfig.hostUri` into the URL, so it emits
 * `spotly:///auth/callback` from a production build but
 * `spotly://192.168.x.x:8081/auth/callback` from a dev build attached to a dev
 * server. Neither is stable enough to allowlist, and the triple-slash form is
 * rejected outright by the Supabase dashboard's URL validator.
 *
 * `spotly://auth/callback` parses to host `auth` + path `/callback`, which
 * expo-router resolves to the `auth/callback` route — the same route the web
 * URL hits.
 */
function callbackURL(): string {
  return Platform.OS === 'web'
    ? `${window.location.origin}/auth/callback`
    : 'spotly://auth/callback';
}

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const address = email.trim();

  async function handleSend() {
    if (sending || !address) return;

    if (!CASE_EMAIL_RE.test(address)) {
      setError('That needs to be a case.edu address. Spotly is CWRU students only.');
      return;
    }
    setError('');
    setSending(true);

    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: address,
        // Called here rather than at module scope: on web it reads
        // window.location, which does not exist during the static prerender pass.
        options: { emailRedirectTo: callbackURL() },
      });

      // The server's wording wins — it is the side that actually enforces the
      // rule, so if the two disagree it is this form that is out of date.
      if (authError) {
        setError(authError.message);
        return;
      }
      setSentTo(address);
    } catch (cause) {
      setError(errorMessage(cause, "We couldn't send that link. Check your connection."));
    } finally {
      setSending(false);
    }
  }

  // The form is replaced rather than annotated: there is nothing left to do on
  // this screen, and leaving a live "Send me a link" button invites a second tap
  // that only rate-limits the first one.
  if (sentTo) {
    return (
      <Screen className="justify-center px-5">
        <View className="gap-3">
          <Text variant="h3">Check your email</Text>
          <Text className="text-muted-foreground">
            We sent a link to {sentTo}. Open it on this device and you&apos;ll land back here
            signed in.
          </Text>
          <Button
            variant="ghost"
            className="mt-2 self-start"
            onPress={() => {
              setSentTo('');
              setError('');
            }}>
            <Text>Use a different address</Text>
          </Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1 justify-center px-5"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="gap-2">
          <Text variant="h2" className="border-b-0 pb-0">
            Spotly
          </Text>
          <Text variant="lead">Real study spots, reviewed by the people sitting in them.</Text>
        </View>

        <View className="mt-8 gap-2">
          <Label nativeID="email">CWRU email</Label>
          <Input
            aria-labelledby="email"
            value={email}
            onChangeText={(next) => {
              setEmail(next);
              // Clear on edit, not on keystroke-validate. Telling someone their
              // half-typed address is wrong is noise; leaving a stale error under
              // a corrected field is worse.
              if (error) setError('');
            }}
            onBlur={() => {
              if (address && !CASE_EMAIL_RE.test(address)) {
                setError('That needs to be a case.edu address. Spotly is CWRU students only.');
              }
            }}
            placeholder="you@case.edu"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!sending}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          {error ? (
            <Text variant="small" className="text-destructive">
              {error}
            </Text>
          ) : null}
        </View>

        {/*
          Disabled is the feedback for "not yet"; the changed label is the
          feedback for "working". A spinner in place of the label would be a
          silent button to a screen reader and would resize the control.
        */}
        <Button className="mt-4" onPress={handleSend} disabled={!address || sending}>
          <Text>{sending ? 'Sending…' : 'Send me a link'}</Text>
        </Button>

        <Text variant="muted" className="mt-3">
          No password — we email you a link that signs you in.
        </Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}
