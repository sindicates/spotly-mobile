import { useState } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { FieldError } from '@/components/field-error';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { useField } from '@/hooks/use-field';
import { error as hapticError, success } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/utils';
import { caseEmail } from '@/domain/validation';
import { useSession } from '@/lib/session';

/**
 * AUTH-1..3. One screen for both signup and sign-in — there is no account to
 * "already have", so a sign-up / log-in split would ask the user a question the
 * app can answer itself.
 *
 * No password field exists anywhere in the app (AUTH-2), and there is nothing to
 * fill in beyond the address (AUTH-3): no display name, no avatar, no profile.
 */

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
  const { enterJudgeMode } = useSession();
  // The `.edu` check is a `useField` validator now (domain/validation.ts) — the
  // canonical regex and message live there, so this screen no longer carries its
  // own copy. Emptiness stays the disabled button's job, not the validator's.
  const email = useField({ validators: [caseEmail()] });
  const [sentTo, setSentTo] = useState('');
  const [sending, setSending] = useState(false);
  const [enteringJudgeMode, setEnteringJudgeMode] = useState(false);
  // Server-side rejections (rate limit, a rule the client can't see) share the
  // field's message slot and take precedence — the server enforces, so when the
  // two disagree it is this form that is out of date.
  const [serverError, setServerError] = useState('');

  const address = email.value.trim();

  async function handleSend() {
    if (sending || !address) return;

    // Client validation is an affordance: reveal the field error and stop before
    // spending a round trip on an address the gate will reject anyway.
    if (!email.isValid) {
      email.revealErrors();
      return;
    }
    setServerError('');
    setSending(true);

    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: address,
        // Called here rather than at module scope: on web it reads
        // window.location, which does not exist during the static prerender pass.
        options: { emailRedirectTo: callbackURL() },
      });

      if (authError) {
        hapticError();
        setServerError(authError.message);
        return;
      }
      success();
      setSentTo(address);
    } catch (cause) {
      hapticError();
      setServerError(errorMessage(cause, "We couldn't send that link. Check your connection."));
    } finally {
      setSending(false);
    }
  }

  async function handleJudgePreview() {
    if (enteringJudgeMode) return;

    setServerError('');
    setEnteringJudgeMode(true);

    try {
      // Anonymous auth gives each judge a separate authenticated identity. The
      // server still derives every author from auth.uid(), just like students.
      const { error: authError } = await supabase.auth.signInAnonymously();
      if (authError) {
        hapticError();
        setServerError(authError.message);
        return;
      }

      success();
      enterJudgeMode();
      router.replace('/');
    } catch (cause) {
      hapticError();
      setServerError(errorMessage(cause, "We couldn't open judge access. Check your connection."));
    } finally {
      setEnteringJudgeMode(false);
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
              setServerError('');
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
            value={email.value}
            onChangeText={(next) => {
              // `useField` hides the field error while typing; clear the server
              // error too so a corrected address starts from a clean slate.
              email.onChangeText(next);
              if (serverError) setServerError('');
            }}
            onBlur={email.onBlur}
            placeholder="you@case.edu"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!sending}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          {/* Server rejection wins the slot; otherwise the blur-timed field error. */}
          <FieldError error={serverError || (email.showError ? email.error : null)} />
        </View>

        {/*
          Disabled is the feedback for "not yet"; the changed label is the
          feedback for "working". A spinner in place of the label would be a
          silent button to a screen reader and would resize the control.
        */}
        <Button className="mt-4" onPress={handleSend} disabled={!address || sending}>
          <Text>{sending ? 'Sending…' : 'Send me a link'}</Text>
        </Button>

        <Button
          variant="outline"
          className="mt-3"
          onPress={handleJudgePreview}
          disabled={enteringJudgeMode}>
          <Text>{enteringJudgeMode ? 'Opening judge access…' : "I'm a judge"}</Text>
        </Button>

        <Text variant="muted" className="mt-3">
          No password — we email you a link that signs you in.
        </Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}
