import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmenityChips, AmenityFilterChips } from '@/components/amenity-chip';
import { ReviewBodyField } from '@/components/review-body-field';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type Option,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useBuildings } from '@/hooks/use-buildings';
import { useSpotsInBuilding } from '@/hooks/use-spots-in-building';
import type { AmenityTag } from '@/domain/amenities';
import { error as hapticError, selection, success, warning } from '@/lib/haptics';
import { createReview, isDuplicateReviewError, meetsWordFloor } from '@/domain/reviews';
import {
  createSpotWithReview,
  isDuplicateSpotError,
  matchSpotsByName,
  type PublicSpot,
} from '@/domain/spots';
import { errorMessage } from '@/lib/utils';

/**
 * SPOT-3, SPOT-5. Add a spot that isn't listed yet — a structured form, never
 * free text, because constraining entry is where duplicates actually get
 * prevented.
 *
 * Same shape as the onboarding first review (they are the two callers of this
 * flow, kept separate on purpose): building, specific spot with an inline
 * duplicate guard, write-once amenity tags, and a first review with the fixed
 * prompt and 15-word floor. If the typed spot already exists, the guard turns
 * this into "review that one instead" — a new review on the existing spot rather
 * than a duplicate entry, since occupancy signal fragmenting across duplicates
 * is the failure the guard exists to prevent.
 */
export default function AddSpot() {
  const insets = useSafeAreaInsets();

  const buildingsState = useBuildings();
  const buildings = buildingsState.data;
  const buildingsError = buildingsState.error
    ? errorMessage(buildingsState.error, "We couldn't load the building list.")
    : '';

  const [building, setBuilding] = useState<Option>(undefined);

  const [areaName, setAreaName] = useState('');
  const [dupeChecked, setDupeChecked] = useState(false);
  const [existing, setExisting] = useState<PublicSpot | null>(null);

  const [tags, setTags] = useState<AmenityTag[]>([]);
  const [body, setBody] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const buildingId = building?.value;

  // Soft-fail by design: the duplicate check is a guard, not a gate. If it can't
  // run, the worst case is a duplicate spot, and blocking the contribution over
  // it costs more than it saves — so a failed fetch reads as an empty list.
  const { data: buildingSpots, refetch: refetchSpots } = useSpotsInBuilding(buildingId ?? null);
  const spots = buildingSpots ?? [];

  const matches = dupeChecked && !existing ? matchSpotsByName(spots, areaName) : [];
  const isNewSpot = existing === null;
  const canSubmit =
    !!buildingId && areaName.trim().length > 0 && meetsWordFloor(body) && !submitting;

  function pickExisting(spot: PublicSpot) {
    // Choosing an existing spot out of the duplicate list is a selection.
    selection();
    setExisting(spot);
    setAreaName(spot.area_name);
    // Tags belong to the spot and were locked by its first reviewer (AMEN-2).
    setTags([]);
    setError('');
  }

  function clearExisting() {
    setExisting(null);
    setDupeChecked(false);
    setError('');
  }

  async function submit() {
    if (!buildingId) return;
    setSubmitting(true);
    setError('');

    try {
      const spotId = existing
        ? (await createReview(existing.id, body), existing.id)
        : await createSpotWithReview({ buildingId, areaName, amenityTags: tags, body });
      success();
      // Replace, not push: the form should not sit behind the spot page in the
      // back stack once its job is done.
      router.replace(`/spot/${spotId}`);
    } catch (cause) {
      if (isDuplicateReviewError(cause)) {
        // They picked an existing spot they had already reviewed. Send them to it.
        warning();
        setError('You have already reviewed this spot.');
        return;
      }
      if (isDuplicateSpotError(cause)) {
        warning();
        setError('That spot is already listed. Pick it above and add your review there.');
        refetchSpots();
        setDupeChecked(true);
        return;
      }
      hapticError();
      setError(errorMessage(cause, "We couldn't add that spot."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-6 px-5 pb-10 pt-4"
          keyboardShouldPersistTaps="handled">
          <Text variant="muted">
            A spot and its first review are added together — yours might be the first anyone reads.
          </Text>

          {/* Building — loading, error, and success all render. */}
          <View className="gap-2">
            <Label nativeID="building">Building</Label>
            {buildings === null && !buildingsError ? (
              <Skeleton className="h-10 w-full" />
            ) : buildingsError ? (
              <View className="gap-2">
                <Text variant="small" className="text-destructive">
                  {buildingsError}
                </Text>
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onPress={buildingsState.refetch}>
                  <Text>Try again</Text>
                </Button>
              </View>
            ) : (
              <Select
                value={building}
                onValueChange={(option) => {
                  setBuilding(option);
                  clearExisting();
                }}>
                <SelectTrigger aria-labelledby="building" className="w-full">
                  <SelectValue placeholder="Pick a building" />
                </SelectTrigger>
                <SelectContent
                  insets={{ top: insets.top, bottom: insets.bottom, left: 12, right: 12 }}
                  className="w-full">
                  <SelectGroup>
                    {(buildings ?? []).map((item) => (
                      <SelectItem key={item.id} value={item.id} label={item.name}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </View>

          {/* Specific spot, plus the duplicate guard that decides which write runs. */}
          <View className="gap-2">
            <Label nativeID="area">Specific spot</Label>
            <Input
              aria-labelledby="area"
              value={areaName}
              onChangeText={(next) => {
                setAreaName(next);
                setDupeChecked(false);
                if (existing) setExisting(null);
              }}
              onBlur={() => setDupeChecked(true)}
              editable={!!buildingId && !existing}
              placeholder="3rd floor, north windows"
              autoCapitalize="sentences"
              returnKeyType="done"
            />
            <Text variant="muted">
              Where exactly — the floor, the corner, the room. Not just the building.
            </Text>

            {matches.length > 0 ? (
              <Card elevation="flat" className="mt-1 gap-1 p-3">
                <Text variant="small" className="text-muted-foreground">
                  Already listed — did you mean one of these?
                </Text>
                {matches.map((spot) => (
                  <Pressable
                    key={spot.id}
                    onPress={() => pickExisting(spot)}
                    className="active:bg-accent -mx-1 min-h-11 justify-center rounded-md px-1 py-2">
                    <Text>{spot.area_name}</Text>
                    <Text variant="muted">
                      {spot.review_count} {spot.review_count === 1 ? 'review' : 'reviews'}
                    </Text>
                  </Pressable>
                ))}
              </Card>
            ) : null}

            {existing ? (
              <Card elevation="flat" className="mt-1 gap-2 p-3">
                <Text variant="small">
                  Reviewing {existing.area_name} in {existing.building}
                </Text>
                {existing.amenity_tags.length > 0 ? (
                  <AmenityChips tags={existing.amenity_tags} />
                ) : null}
                <Button variant="ghost" size="sm" className="self-start" onPress={clearExisting}>
                  <Text>That&apos;s not it</Text>
                </Button>
              </Card>
            ) : null}
          </View>

          {/* Tags appear only for a new spot — the one write that sets them (AMEN-2). */}
          {isNewSpot ? (
            <View className="gap-2">
              <Label nativeID="tags">What&apos;s it got?</Label>
              <AmenityFilterChips
                selected={tags}
                onToggle={(tag) =>
                  setTags((current) =>
                    current.includes(tag)
                      ? current.filter((t) => t !== tag)
                      : [...current, tag]
                  )
                }
              />
              <Text variant="muted">
                Optional, and set once — whoever adds a spot fixes its tags.
              </Text>
            </View>
          ) : null}

          <ReviewBodyField value={body} onChangeText={setBody} />

          {/* MOD-3: the content policy is one tap from the review form. */}
          <Button
            variant="link"
            size="sm"
            className="self-start px-0"
            onPress={() => router.push('/content-policy')}>
            <Text>Read the content policy</Text>
          </Button>

          {error ? (
            <Text variant="small" className="text-destructive">
              {error}
            </Text>
          ) : null}

          <Button onPress={submit} disabled={!canSubmit}>
            <Text>{submitting ? 'Adding…' : 'Add spot and post review'}</Text>
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
