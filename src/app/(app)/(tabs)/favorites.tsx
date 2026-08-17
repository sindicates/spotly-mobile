import { router } from 'expo-router';
import { HeartIcon } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { AmenityChips } from '@/components/amenity-chip';
import { EmptyState } from '@/components/empty-state';
import { OccupancyPill } from '@/components/occupancy-pill';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useFavorites } from '@/hooks/use-favorites';
import { removeFavorite, type FavoriteSpot } from '@/domain/favorites';
import { press, success, warning } from '@/lib/haptics';

/**
 * FAV-2. The private list of saved spots, each with its current occupancy.
 *
 * Private by construction (FAV-3): there is no share control, no saved count, no
 * hint that anyone else exists — the list is only ever the caller's own. Each row
 * carries the same live occupancy rule as everywhere else, so a spot nobody has
 * reported in an hour reads "No recent reports", never a stale badge (OCC-4).
 */
export default function Favorites() {
  const favorites = useFavorites();
  // Which rows are mid-unsave, so the heart disables without blanking the list.
  const [removing, setRemoving] = useState<ReadonlySet<string>>(() => new Set());

  async function unsave(spotId: string) {
    setRemoving((prev) => new Set(prev).add(spotId));
    try {
      await removeFavorite(spotId);
      success();
      favorites.refetch();
    } catch {
      // A failed unsave is not worth an error screen — the row is still saved,
      // which is a safe state. Buzz softly and leave it in place.
      warning();
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(spotId);
        return next;
      });
    }
  }

  return (
    // A tab, so the screen owns its top inset and the tab bar owns the bottom.
    <Screen edges={['top']}>
      <FlatList
        data={favorites.data ?? []}
        keyExtractor={(item) => item.spotId}
        contentContainerClassName="gap-3 px-5 pb-10"
        // The screen title used to come from the navigation header this tab
        // replaced. It is in the list now, so it scrolls with the content.
        ListHeaderComponent={
          <Text variant="h2" className="border-b-0 pb-3 pt-2">
            Favourites
          </Text>
        }
        renderItem={({ item }) => (
          <FavoriteRow
            spot={item}
            removing={removing.has(item.spotId)}
            onOpen={() => router.push(`/spot/${item.spotId}`)}
            onUnsave={() => unsave(item.spotId)}
          />
        )}
        ListEmptyComponent={
          favorites.loading ? (
            <View className="gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </View>
          ) : favorites.error ? (
            <View className="items-center gap-3 py-12">
              <Text variant="muted" className="text-center">
                We couldn&apos;t load your saved spots.
              </Text>
              <Button variant="outline" size="sm" onPress={favorites.refetch}>
                <Text>Try again</Text>
              </Button>
            </View>
          ) : (
            <EmptyState
              title="No saved spots yet"
              description="Save a spot from its page and it turns up here, with how full it is right now."
              // A sibling tab, so this is a tab switch rather than a push.
              action={{ label: 'Find a spot', onPress: () => router.navigate('/search') }}
            />
          )
        }
      />
    </Screen>
  );
}

type FavoriteRowProps = {
  spot: FavoriteSpot;
  removing: boolean;
  onOpen: () => void;
  onUnsave: () => void;
};

function FavoriteRow({ spot, removing, onOpen, onUnsave }: FavoriteRowProps) {
  return (
    <Pressable
      onPress={() => {
        // A raw navigation Pressable is not a primitive, so it buzzes itself.
        press();
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Open ${spot.areaName}`}
      className="border-border bg-card active:bg-accent gap-3 rounded-lg border p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="shrink gap-0.5">
          <Text className="font-semibold">{spot.areaName}</Text>
          <Text variant="muted">
            {spot.building}
            {spot.reviewCount > 0
              ? ` · ${spot.reviewCount} ${spot.reviewCount === 1 ? 'review' : 'reviews'}`
              : ''}
          </Text>
        </View>
        <Button
          variant="ghost"
          size="icon"
          disabled={removing}
          onPress={onUnsave}
          accessibilityLabel={`Remove ${spot.areaName} from favourites`}>
          <Icon as={HeartIcon} className="text-primary" size={20} />
        </Button>
      </View>

      <View className="flex-row items-center justify-between gap-3">
        <OccupancyPill reading={spot.occupancy} size="sm" />
        {spot.tags.length > 0 ? <AmenityChips tags={spot.tags} className="shrink" /> : null}
      </View>
    </Pressable>
  );
}
