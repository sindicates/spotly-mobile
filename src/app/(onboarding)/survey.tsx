import { Text, TouchableOpacity, View } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Placeholder for the taste survey (ONB-2), which is followed by the guided
 * first review (ONB-3). Both are blocked on the full schema and the review
 * write path, so this only proves the onboarding_complete branch routes here.
 */
export default function Survey() {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-white px-8">
      <Text className="text-xl font-semibold text-neutral-900">Welcome to Spotly</Text>
      <Text className="text-center text-sm text-neutral-500">
        Onboarding goes here — a short survey, then one review to unlock the app.
      </Text>
      <TouchableOpacity
        onPress={() => supabase.auth.signOut()}
        className="w-full items-center rounded-lg border border-neutral-300 py-3"
      >
        <Text className="font-semibold text-neutral-900">Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}
