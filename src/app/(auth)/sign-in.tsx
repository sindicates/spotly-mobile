import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';

// AUTH-1. This is a UX affordance for the error message, not the gate — the
// gate is the before_user_created hook, which this cannot be traded against.
const EDU_EMAIL_RE = /^[^@]+@case\.edu$/i;

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

  async function handleSend() {
    if (sending) return;

    // iOS autocomplete routinely appends a space.
    const address = email.trim();

    if (!EDU_EMAIL_RE.test(address)) {
      setError('Use your case.edu email address.');
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

      if (authError) {
        setError(authError.message);
        return;
      }
      setSentTo(address);
    } finally {
      setSending(false);
    }
  }

  if (sentTo) {
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-white px-8">
        <Text className="text-center text-lg font-semibold text-neutral-900">
          Check your email
        </Text>
        <Text className="text-center text-sm text-neutral-500">
          We sent a link to {sentTo}. Open it on this device to sign in.
        </Text>
        <TouchableOpacity onPress={() => setSentTo('')} className="pt-2">
          <Text className="text-sm font-semibold text-neutral-900">
            Use a different address
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-white px-8">
      <Text className="text-3xl font-semibold text-neutral-900">Spotly</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@case.edu"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!sending}
        returnKeyType="send"
        onSubmitEditing={handleSend}
        className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base"
      />
      {error ? <Text className="text-sm text-red-500">{error}</Text> : null}
      <TouchableOpacity
        onPress={handleSend}
        disabled={sending}
        className="w-full items-center rounded-lg bg-neutral-900 py-3"
      >
        {sending ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="font-semibold text-white">Send me a link</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
