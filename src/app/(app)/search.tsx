import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeftIcon, SearchIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AmenityFilterChips } from '@/components/amenity-chip';
import { EmptyState } from '@/components/empty-state';
import { ReviewCard } from '@/components/review-card';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useSearch } from '@/hooks/use-search';
import { AMENITY_TAGS, type AmenityTag } from '@/lib/amenities';
import { errorMessage } from '@/lib/utils';

/**
 * SEARCH-1..4. Free-text search over what students actually wrote.
 *
 * Results are review cards, not spot summaries (SEARCH-2) — the writing is the
 * product's claim, so the review body leads and the spot is context. A plain
 * vertical list, never a deck (SPOT-4).
 *
 * **Submit-driven, not keystroke-driven.** `input` is what the field holds;
 * `submitted` is what has been searched for, and only `submitted` reaches
 * `useSearch`. Every character reaching the hook would mean a blanked list and a
 * skeleton flash per keystroke, plus an OpenAI embedding call to pay for each one
 * — see the note on `use-search.ts`. There is no debounce here because a debounce
 * is the same mistake with a timer in front of it.
 *
 * Zero results is the SEARCH-4 empty state, said plainly. The list is never
 * padded with the closest weak matches to avoid an empty screen — that is the
 * specific bug the similarity floor exists to prevent, and the floor lives in the
 * migration so this screen cannot soften it.
 */
export default function Search() {
  const params = useLocalSearchParams<{ tags?: string | string[] }>();

  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [tags, setTags] = useState<AmenityTag[]>(() => parseTagsParam(params.tags));
  // Expansion is parent state so only one card is open at a time; `ReviewCard`
  // stays a controlled presentational component (REV-5).
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, loading, error, refetch } = useSearch(submitted, tags);
  const results = data ?? [];
  const hasSearched = submitted.trim().length > 0;

  function submit() {
    setExpandedId(null);
    setSubmitted(input);
  }

  function toggleTag(tag: AmenityTag) {
    setExpandedId(null);
    setTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    );
  }

  return (
    <Screen className="px-5">
      <View className="flex-row items-center gap-2 pt-2">
        <Button
          variant="ghost"
          size="icon"
          onPress={() => router.back()}
          accessibilityLabel="Go back">
          <Icon as={ArrowLeftIcon} size={20} className="text-foreground" />
        </Button>
        <Input
          className="flex-1"
          value={input}
          onChangeText={setInput}
          placeholder="somewhere quiet to lock in"
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          // The submit path. Tapping the field's return key is how most people
          // will search; the button beside it is for everyone else.
          onSubmitEditing={submit}
          accessibilityLabel="Search spots"
        />
        <Button variant="secondary" size="icon" onPress={submit} accessibilityLabel="Search">
          <Icon as={SearchIcon} size={18} className="text-secondary-foreground" />
        </Button>
      </View>

      {/*
        Filters are a hard constraint on the query, not a ranking weight
        (SEARCH-3, AMEN-3). Toggling one re-runs the search immediately — it is
        already a deliberate act, and a filter needing a confirming tap reads as
        broken.
      */}
      <AmenityFilterChips selected={tags} onToggle={toggleTag} className="py-3" />

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 pb-6"
        // Without this the first tap on a result is eaten dismissing the
        // keyboard, so expanding a card takes two taps and feels broken.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        {/*
          Order matters. "Not yet searched" is checked before `loading`, because
          on mount the key is already live and `loading` is true until the
          empty-query fetcher settles — checking loading first would flash
          skeletons at someone who has not typed anything. It is also a different
          statement from the empty state: "you haven't searched" is not "nothing
          matched".
        */}
        {!hasSearched ? (
          <View className="items-center gap-2 px-6 py-12">
            <Text variant="large" className="text-center">
              What are you looking for?
            </Text>
            <Text variant="muted" className="text-center">
              Describe the place you want in your own words — how it should feel, not what
              it is called.
            </Text>
          </View>
        ) : loading ? (
          <SearchSkeleton />
        ) : error ? (
          // Inline beside the control that failed, with a retry. Not a banner.
          <View className="gap-2 py-4">
            <Text variant="small" className="text-destructive">
              {errorMessage(error, "That search couldn't be completed.")}
            </Text>
            <Button variant="outline" onPress={refetch}>
              <Text>Try again</Text>
            </Button>
          </View>
        ) : results.length === 0 ? (
          /*
            SEARCH-4. Nothing cleared the similarity floor, so this says so. No
            primary action yet — the add-spot route does not exist, and a button
            that goes nowhere is worse than no button.
          */
          <EmptyState
            title="Nothing matches that yet."
            description={
              tags.length > 0
                ? `No spots match “${submitted.trim()}” with those filters.`
                : `No spots match “${submitted.trim()}”.`
            }
            secondaryAction={
              tags.length > 0 ? { label: 'Clear filters', onPress: () => setTags([]) } : undefined
            }
          />
        ) : (
          <>
            <Text variant="muted">
              {results.length} {results.length === 1 ? 'spot' : 'spots'}
            </Text>
            {results.map((result) => (
              <ReviewCard
                key={result.reviewId}
                body={result.body}
                areaName={result.areaName}
                building={result.building}
                occupancy={result.occupancy}
                tags={result.amenityTags}
                reviewCount={result.reviewCount}
                expanded={expandedId === result.reviewId}
                onToggleExpand={() =>
                  setExpandedId((current) =>
                    current === result.reviewId ? null : result.reviewId
                  )
                }
                // `onOpenSpot` and `onReport` are deliberately omitted: neither
                // the spot page nor the report sheet exists yet, and `ReviewCard`
                // renders its footer only when one is passed. A control that
                // navigates nowhere is worse than no control.
              />
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * Skeletons in the shape of the cards they stand in for, not a centred spinner —
 * a spinner hides the layout and makes the wait feel longer (DESIGN.md).
 *
 * Three, because results 1–3 are what anyone actually sees.
 */
function SearchSkeleton() {
  return (
    <View className="gap-3" accessibilityLabel="Searching">
      {[0, 1, 2].map((i) => (
        <View key={i} className="border-border bg-card gap-3 rounded-lg border p-4">
          <View className="gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
          </View>
          <View className="flex-row items-center justify-between">
            <View className="gap-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </View>
            <Skeleton className="h-6 w-24 rounded-full" />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * The `tags` param home hands over, back into real enum values.
 *
 * Validated rather than cast: `useLocalSearchParams` returns whatever is in the
 * URL — a repeated key arrives as an array, and a hand-typed link can carry
 * anything at all. An unrecognised tag is rejected by Postgres' enum, which the
 * Edge Function turns into a 400, so filtering here is the difference between
 * ignoring a bad link and failing every search made after following one.
 */
function parseTagsParam(param: string | string[] | undefined): AmenityTag[] {
  if (!param) return [];
  const raw = (Array.isArray(param) ? param.join(',') : param).split(',');
  const valid = new Set<string>(AMENITY_TAGS.map((t) => t.value));
  return raw.map((t) => t.trim()).filter((t): t is AmenityTag => valid.has(t));
}
