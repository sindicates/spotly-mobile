import { Text, TouchableOpacity, View } from 'react-native';

import { supabase } from '@/lib/supabase';

/** Placeholder for home. Replaced when the catalog lands (SPOT-*, SEARCH-*). */
export default function Home() {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-white px-8">
      <Text className="text-3xl font-semibold text-neutral-900">Spotly</Text>
      <Text className="text-center text-sm text-neutral-500">
        You&apos;re signed in. Home goes here.
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
