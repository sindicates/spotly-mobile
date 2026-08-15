import { router } from 'expo-router';
import { SearchIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AmenityFilterChips } from '@/components/amenity-chip';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { AmenityTag } from '@/lib/amenities';
import { supabase } from '@/lib/supabase';

/**
 * SPOT-1. Home is search-first: there is no category browse, because every spot
 * in v1 is a study spot and a one-item taxonomy is furniture, not navigation.
 *
 * The search bar is a `Pressable` dressed as a field rather than a real `Input`.
 * Tapping a live input raises the keyboard, then the push to `/search` lands and
 * that screen's own field takes focus — two keyboards' worth of animation for one
 * intent. This routes on the first tap and the search screen autofocuses.
 *
 * Filter chips carry their selection across as the `tags` param, so choosing
 * "quiet" here and typing there is one continuous act rather than two.
 *
 * **The trending feed specified at spot-catalog.md:54 is deliberately not here.**
 * It has no read path: `public_reviews` exposes `spot_id` but none of the display
 * fields a review card needs, and assembling them client-side would mean joining
 * three views per render. The spec is unchanged and the feature is simply unbuilt
 * — see TODO.md for the `trending_reviews` RPC it is waiting on.
 */
export default function Home() {
  const [tags, setTags] = useState<AmenityTag[]>([]);

  function toggleTag(tag: AmenityTag) {
    setTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    );
  }

  function openSearch() {
    router.push({
      pathname: '/(app)/search',
      params: tags.length > 0 ? { tags: tags.join(',') } : {},
    });
  }

  return (
    <Screen className="px-5">
      <View className="flex-1 gap-5 pt-4">
        <View className="gap-1">
          <Text variant="h2">Spotly</Text>
          <Text variant="muted">Find a spot by how it feels, not what it&apos;s called.</Text>
        </View>

        <Pressable
          onPress={openSearch}
          accessibilityRole="button"
          accessibilityLabel="Search spots"
          className="border-input bg-background flex-row items-center gap-2 rounded-md border px-3 py-3 active:opacity-70">
          <Icon as={SearchIcon} size={18} className="text-muted-foreground" />
          <Text className="text-muted-foreground">somewhere quiet to lock in</Text>
        </Pressable>

        <AmenityFilterChips selected={tags} onToggle={toggleTag} />

        {/*
          Where the trending feed goes. The copy has to be honest about which of
          three different things is true — there are 56 reviews, so it must not
          read as "loading" or as "no reviews yet", either of which would be a
          lie about the catalog (DESIGN.md → Copy).
        */}
        <View className="border-border mt-2 gap-2 rounded-lg border border-dashed p-4">
          <Text className="font-semibold">The feed isn&apos;t built yet.</Text>
          <Text variant="muted">
            Trending reviews will land here. Until then, search is the way in — it reads
            every review in the catalog.
          </Text>
        </View>

        <View className="flex-1 justify-end pb-2">
          <Button variant="ghost" onPress={() => supabase.auth.signOut()}>
            <Text>Sign out</Text>
          </Button>
        </View>
      </View>
    </Screen>
  );
}
