import { router, useLocalSearchParams } from 'expo-router';
import { SearchIcon } from 'lucide-react-native';
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
import { useSearch } from '@/hooks/use-search';
import { AMENITY_TAGS, type AmenityTag } from '@/lib/amenities';
import { errorMessage } from '@/lib/utils';

/** Parses the comma-joined `tags` param back into valid amenity values. */
function parseTags(param: string | undefined): AmenityTag[] {
  if (!param) return [];
  const valid = new Set(AMENITY_TAGS.map((t) => t.value));
  return param.split(',').filter((t): t is AmenityTag => valid.has(t as AmenityTag));
}

/**
 * SEARCH-1..4. Free-text query matched against review text, results as review
 * cards — one per spot, that spot's best-matching review (SEARCH-2). A plain
 * vertical list, never a card deck (SPOT-4).
 *
 * The two states that matter most are the ones easy to skip. A weak query
 * returns zero rows above the similarity threshold, and that is an explicit
 * empty state that echoes the query and offers to add the spot (SEARCH-4) — never
 * a list padded with the closest bad matches. And before the first search, the
 * screen is an idle prompt, not an empty-results screen.
 *
 * Filters are hard constraints (SEARCH-3), applied by the RPC. Toggling one here
 * re-runs the search because the request key includes the tags.
 */
export default function Search() {
  const params = useLocalSearchParams<{ q?: string; tags?: string; k?: string }>();

  const [query, setQuery] = useState(params.q ?? '');
  // The query actually searched. Seeded from the param so arriving from home with
  // a typed query runs immediately; edited only on submit so keystrokes don't
  // fire a request each.
  const [submitted, setSubmitted] = useState(params.q ?? '');
  const [tags, setTags] = useState<AmenityTag[]>(() => parseTags(params.tags));

  // Seeding at mount is only correct for a screen that remounts. This one is a
  // tab: it mounts once and survives every visit, so a hand-off from home has to
  // land here too, or a second search from home would silently show the first
  // one's results. `k` is home's per-hand-off marker, which is what makes
  // repeating the same query a change rather than a no-op.
  //
  // Adjusted during render rather than in an effect. React re-runs this
  // component immediately, before anything paints, so the screen never shows the
  // previous query for a frame — and an effect that calls setState is a
  // cascading render the compiler rejects outright.
  // https://react.dev/learn/you-might-not-need-an-effect
  const handoff = `${params.k ?? ''}|${params.q ?? ''}|${params.tags ?? ''}`;
  const [lastHandoff, setLastHandoff] = useState(handoff);
  if (handoff !== lastHandoff) {
    const handedOver = params.q?.trim() ?? '';
    setLastHandoff(handoff);
    setQuery(handedOver);
    setSubmitted(handedOver);
    setTags(parseTags(params.tags));
  }

  const interactions = useReviewInteractions();
  const results = useSearch(submitted, tags);

  const hasSearched = submitted.trim().length > 0;

  return (
    // No navigation header any more: this is a tab, so it owns its top inset
    // and the tab bar owns the bottom one.
    <Screen edges={['top']}>
      <FlatList
        data={results.data ?? []}
        keyExtractor={(item) => item.reviewId}
        contentContainerClassName="gap-3 px-5 pb-10"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View className="gap-3 pb-1 pt-3">
            <View className="flex-row items-center gap-2">
              <Input
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => setSubmitted(query.trim())}
                placeholder="Somewhere to lock in…"
                returnKeyType="search"
                autoCapitalize="none"
                autoFocus={!hasSearched}
                className="flex-1"
              />
              <Button
                size="icon"
                onPress={() => setSubmitted(query.trim())}
                accessibilityLabel="Search">
                <Icon as={SearchIcon} className="text-primary-foreground" size={18} />
              </Button>
            </View>
            <AmenityFilterChips selected={tags} onToggle={(tag) =>
              setTags((current) =>
                current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
              )
            } />
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
          !hasSearched ? (
            <EmptyState
              title="Search by how a place feels"
              description="Try “quiet with outlets” or “good wifi, no small talk.” Results are real reviews, not building listings."
            />
          ) : results.loading ? (
            <View className="gap-3">
              {[0, 1, 2].map((i) => (
                <View key={i} className="overflow-hidden rounded-lg">
                  <Skeleton className="aspect-video w-full" />
                  <Skeleton className="h-32 w-full" />
                </View>
              ))}
            </View>
          ) : results.error ? (
            <View className="items-center gap-3 py-12">
              <Text variant="muted" className="text-center">
                {errorMessage(results.error, 'Search is unavailable right now.')}
              </Text>
              <Button variant="outline" size="sm" onPress={results.refetch}>
                <Text>Try again</Text>
              </Button>
            </View>
          ) : (
            // SEARCH-4: zero strong matches is a plain answer, not weak results.
            <EmptyState
              title="Nothing matches that yet"
              description={`No reviews come close to “${submitted.trim()}”${
                tags.length > 0 ? ' with those filters' : ''
              }.`}
              action={{
                label: 'Add the spot you’re after',
                onPress: () => router.push('/spot/new'),
              }}
              secondaryAction={
                tags.length > 0
                  ? { label: 'Clear filters', onPress: () => setTags([]) }
                  : undefined
              }
            />
          )
        }
      />

      <ReportSheet reviewId={interactions.reportReviewId} onClose={interactions.closeReport} />
    </Screen>
  );
}
