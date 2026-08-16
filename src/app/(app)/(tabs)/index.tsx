import { router } from 'expo-router';
import { PlusIcon, SearchIcon } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { AmenityFilterChips } from '@/components/amenity-chip';
import { EmptyState } from '@/components/empty-state';
import { ReportSheet } from '@/components/report-sheet';
import { ReviewCard } from '@/components/review-card';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useReviewInteractions } from '@/hooks/use-review-interactions';
import { useTrendingFeed } from '@/hooks/use-trending-feed';
import type { AmenityTag } from '@/lib/amenities';
import { errorMessage } from '@/lib/utils';

/**
 * SPOT-1. The search-first home: a query field and amenity filters up top, then a
 * trending review feed. There is no category browse and no map — v1 is study
 * spots only, and the feed doubles as the thin-catalog answer, reading as a
 * fresh stream rather than an empty grid.
 *
 * The chips do two jobs with one selection (AMEN-3). They narrow the feed here —
 * server-side, against the whole catalog rather than the twenty loaded rows, so
 * an empty result means "nothing carries these tags" and not "nothing on this
 * page does". And they travel with a submitted query to the results screen,
 * where the same tags become the RPC's hard constraint. A tag means the same
 * thing on both screens, which is the point.
 */
export default function Home() {
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<AmenityTag[]>([]);

  // The chips do double duty: as a hard filter on the trending feed here (AMEN-3),
  // and as the filter carried into a full search when the user submits a query.
  const feed = useTrendingFeed(tags);
  const interactions = useReviewInteractions();

  function runSearch() {
    // The query is what gets embedded, so an empty one is not a search — but a
    // chip-only tap should still take the user to the results screen, where the
    // field is focused and the filter is already applied.
    //
    // `navigate`, not `push`: search is a sibling tab, so this is a tab switch
    // that hands over params, not a new screen on the stack. And because that
    // tab stays mounted between visits, `k` marks each hand-off as a distinct
    // change — without it, searching the same words twice would leave the
    // results screen showing whatever was typed there in between.
    router.navigate({
      pathname: '/search',
      params: { q: query.trim(), tags: tags.join(','), k: String(Date.now()) },
    });
  }

  function toggleTag(tag: AmenityTag) {
    setTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    );
  }

  return (
    // The tab bar owns the bottom inset — see `Screen`.
    <Screen edges={['top']}>
      <FlatList
        data={feed.data ?? []}
        keyExtractor={(item) => item.reviewId}
        contentContainerClassName="gap-3 px-5 pb-10"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="gap-4 pb-1 pt-2">
            <View className="flex-row items-center justify-between">
              <Text variant="h2" className="border-b-0 pb-0">
                Spotly
              </Text>
              {/*
                Favourites used to sit here beside it. It is a tab now, and a
                destination with two entry points is a destination people learn
                twice — the tab bar is the one that is always visible. Adding a
                spot stays: it is an action, not a place, and there is no tab
                for it.
              */}
              <Button
                variant="ghost"
                size="icon"
                onPress={() => router.push('/spot/new')}
                accessibilityLabel="Add a spot">
                <Icon as={PlusIcon} className="text-foreground" size={22} />
              </Button>
            </View>

            <View className="gap-3">
              <View className="flex-row items-center gap-2">
                <View className="flex-1 flex-row items-center gap-2">
                  <Input
                    value={query}
                    onChangeText={setQuery}
                    onSubmitEditing={runSearch}
                    placeholder="Somewhere to lock in…"
                    returnKeyType="search"
                    autoCapitalize="none"
                    className="flex-1"
                  />
                </View>
                <Button size="icon" onPress={runSearch} accessibilityLabel="Search">
                  <Icon as={SearchIcon} className="text-primary-foreground" size={18} />
                </Button>
              </View>
              <AmenityFilterChips selected={tags} onToggle={toggleTag} />
            </View>

            <Text variant="muted" className="pt-1">
              Trending now
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ReviewCard
            body={item.body}
            areaName={item.areaName}
            building={item.building}
            occupancy={item.occupancy}
            tags={item.tags}
            reviewCount={item.reviewCount}
            imageUrl={item.imageUrl}
            expanded={interactions.isExpanded(item.reviewId)}
            onToggleExpand={() => interactions.toggleExpand(item.reviewId)}
            onOpenSpot={() => router.push(`/spot/${item.spotId}`)}
            onReport={() => interactions.openReport(item.reviewId)}
          />
        )}
        ListEmptyComponent={
          feed.loading ? (
            <View className="gap-3">
              {[0, 1, 2].map((i) => (
                <View key={i} className="overflow-hidden rounded-lg">
                  <Skeleton className="aspect-video w-full" />
                  <Skeleton className="h-32 w-full" />
                </View>
              ))}
            </View>
          ) : feed.error ? (
            <View className="items-center gap-3 py-12">
              <Text variant="muted" className="text-center">
                {errorMessage(feed.error, "We couldn't load the feed.")}
              </Text>
              <Button variant="outline" size="sm" onPress={feed.refetch}>
                <Text>Try again</Text>
              </Button>
            </View>
          ) : tags.length > 0 ? (
            <EmptyState
              title="No spots match those filters"
              description="Nothing trending has every tag you picked. Loosen the filters, or add a spot that does."
              action={{ label: 'Add a spot', onPress: () => router.push('/spot/new') }}
              secondaryAction={{ label: 'Clear filters', onPress: () => setTags([]) }}
            />
          ) : (
            <EmptyState
              title="Nothing here yet"
              description="Be the first — add a spot and write its first review."
              action={{ label: 'Add a spot', onPress: () => router.push('/spot/new') }}
            />
          )
        }
      />

      <ReportSheet reviewId={interactions.reportReviewId} onClose={interactions.closeReport} />
    </Screen>
  );
}
