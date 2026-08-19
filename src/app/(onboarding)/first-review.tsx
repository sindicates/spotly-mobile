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
import { error as hapticError, success, warning } from '@/lib/haptics';
import { FIRST_REVIEW_PROMPT } from '@/domain/onboarding';
import { createReview, isDuplicateReviewError, meetsWordFloor } from '@/domain/reviews';
import { useSession } from '@/lib/session';
import {
  createSpotWithReview,
  isDuplicateSpotError,
  matchSpotsByName,
  type PublicSpot,
} from '@/domain/spots';
import { errorMessage } from '@/lib/utils';

/**
 * ONB-3..5. The gate: one real review, and the app unlocks.
 *
 * The screen is the add-review and add-spot forms folded together, which is
 * ONB-4 — if the spot the user names isn't listed, the structured form (SPOT-5)
 * appears in place rather than sending them somewhere else and losing the
 * sentence they were halfway through writing.
 *
 * Which of the two writes runs is decided by whether they picked an existing
 * spot out of the duplicate check, not by a mode switch they have to understand.
 */
export default function FirstReview() {
  const insets = useSafeAreaInsets();
  const { completeOnboarding } = useSession();

  const buildingsState = useBuildings();
  const buildings = buildingsState.data;
  const buildingsError = buildingsState.error
    ? errorMessage(buildingsState.error, "We couldn't load the building list.")
    : '';

  const [building, setBuilding] = useState<Option>(undefined);

  const [areaName, setAreaName] = useState('');
  /** Matches are shown after a blur, not per keystroke — see SPOT-5. */
  const [dupeChecked, setDupeChecked] = useState(false);
  const [existing, setExisting] = useState<PublicSpot | null>(null);

  const [tags, setTags] = useState<AmenityTag[]>([]);
  const [body, setBody] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const buildingId = building?.value;

  // Soft-fail on purpose. The duplicate check is a guard, not a gate — if it
  // cannot run, the worst case is a duplicate spot, and blocking the review
  // over it would cost the contribution this whole screen exists to collect.
  const { data: buildingSpots, refetch: refetchSpots } = useSpotsInBuilding(buildingId ?? null);
  const spots = buildingSpots ?? [];

  const matches = dupeChecked && !existing ? matchSpotsByName(spots, areaName) : [];
  const isNewSpot = existing === null;
  const canSubmit =
    !!buildingId && areaName.trim().length > 0 && meetsWordFloor(body) && !submitting;

  function pickExisting(spot: PublicSpot) {
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
      if (existing) {
        await createReview(existing.id, body);
      } else {
        await createSpotWithReview({ buildingId, areaName, amenityTags: tags, body });
      }
      // Flips the device-local flag, which flips the route guard — the app
      // unlocks straight into home with no navigation call of its own (ONB-5).
      success();
      completeOnboarding();
    } catch (cause) {
      // ONB-5's accepted trade. The completion flag is per-install, so a
      // reinstall walks this person back through onboarding — and they have
      // landed on a spot they already reviewed. They have contributed. This is
      // an unlock, not an error.
      if (isDuplicateReviewError(cause)) {
        success();
        completeOnboarding();
        return;
      }
      // The other collision: the spot name is already taken in this building,
      // because they typed past the inline check or someone beat them to it.
      // Reload so it appears in the list they can pick from.
      if (isDuplicateSpotError(cause)) {
        warning();
        setError('That spot is already listed. Pick it above and add your review there.');
        refetchSpots();
        setDupeChecked(true);
        return;
      }
      hapticError();
      setError(errorMessage(cause, "We couldn't post that review."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen edges={['top']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-6 px-5 pb-10 pt-4"
          keyboardShouldPersistTaps="handled">
          <View className="gap-2">
            <Text variant="h3">{FIRST_REVIEW_PROMPT}</Text>
            <Text variant="muted">
              One review unlocks Spotly. Yours might be the first anyone reads for this place.
            </Text>
          </View>

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

          {/*
            Tags appear only when a new spot is being created. This is the one
            write that ever sets them — they lock to the first reviewer (AMEN-2),
            so there is nothing to show here for a spot that already exists.
          */}
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

          {/*
            REV-10, REV-11. The prompt and the word floor are the same here as on
            every other review form; the screen's own question is the heading
            above, not a second wording of this one.
          */}
          <ReviewBodyField value={body} onChangeText={setBody} />

          {error ? (
            <Text variant="small" className="text-destructive">
              {error}
            </Text>
          ) : null}

          <Button onPress={submit} disabled={!canSubmit}>
            <Text>{submitting ? 'Posting…' : 'Post review and unlock Spotly'}</Text>
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
