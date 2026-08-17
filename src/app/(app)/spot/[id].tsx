import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { HeartIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

cssInterop(Image, { className: 'style' });

import { AmenityChips } from '@/components/amenity-chip';
import { CheckInControl } from '@/components/check-in-control';
import { OccupancyPill } from '@/components/occupancy-pill';
import { ReportSheet } from '@/components/report-sheet';
import { ReviewCarousel } from '@/components/review-carousel';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useReviewInteractions } from '@/hooks/use-review-interactions';
import { useSpotDetail } from '@/hooks/use-spot-detail';
import { addFavorite, removeFavorite } from '@/domain/favorites';
import { error as hapticError, success, warning } from '@/lib/haptics';
import { checkIn, isRateLimitError, type OccupancyReading, type OccupancyStatus } from '@/domain/occupancy';
import { errorMessage } from '@/lib/utils';

/**
 * SPOT-2. A spot page: name and building, the building photo once as a hero,
 * live occupancy with the check-in control, amenity tags, and the review carousel.
 *
 * Writes here update local state from their own result rather than refetching
 * the whole page — a check-in returns the reading it produced (OCC), a favourite
 * toggle is optimistic. The base data comes from `useSpotDetail`; these
 * overrides sit on top so an in-flight write never fights the loaded snapshot,
 * and a return from the add-review screen refetches on focus.
 */
export default function SpotDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useSpotDetail(id);
  const interactions = useReviewInteractions();

  // Overrides layered on the loaded snapshot. Null means "no local change yet".
  const [checkedIn, setCheckedIn] = useState<OccupancyReading>(null);
  const [favOverride, setFavOverride] = useState<boolean | null>(null);
  const [pendingStatus, setPendingStatus] = useState<OccupancyStatus | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [favBusy, setFavBusy] = useState(false);

  // Refetch when returning to the page (e.g. after posting a review), but not on
  // the first focus — the hook already fetched on mount.
  const mounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (mounted.current) detail.refetch();
      else mounted.current = true;
    }, [detail])
  );

  const data = detail.data;
  const occupancy = checkedIn ?? data?.occupancy ?? null;
  const isFavorite = favOverride ?? data?.isFavorite ?? false;

  async function onCheckIn(status: OccupancyStatus) {
    setPendingStatus(status);
    setCheckInError(null);
    try {
      const reading = await checkIn(id, status);
      success();
      setCheckedIn(reading);
    } catch (cause) {
      if (isRateLimitError(cause)) {
        warning();
        // The trigger's hint is the message on the RequestError.
        setCheckInError(errorMessage(cause));
      } else {
        hapticError();
        setCheckInError(errorMessage(cause, "That check-in didn't go through."));
      }
    } finally {
      setPendingStatus(null);
    }
  }

  async function onToggleFavorite() {
    if (favBusy) return;
    const next = !isFavorite;
    setFavBusy(true);
    setFavOverride(next); // optimistic
    try {
      if (next) await addFavorite(id);
      else await removeFavorite(id);
      success();
    } catch {
      warning();
      setFavOverride(!next); // revert
    } finally {
      setFavBusy(false);
    }
  }

  // ---- Loading / error / not-found before the success layout ----------------

  if (detail.loading) {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: '' }} />
        <View className="gap-6 px-5 py-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="aspect-video w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-56 w-full rounded-lg" />
        </View>
      </Screen>
    );
  }

  if (detail.error) {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: '' }} />
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text variant="muted" className="text-center">
            {errorMessage(detail.error, "We couldn't load this spot.")}
          </Text>
          <Button variant="outline" size="sm" onPress={detail.refetch}>
            <Text>Try again</Text>
          </Button>
        </View>
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: '' }} />
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text variant="large" className="text-center">
            This spot isn&apos;t here anymore
          </Text>
          <Text variant="muted" className="text-center">
            It may have been removed. Try searching for another.
          </Text>
          <Button variant="outline" size="sm" onPress={() => router.replace('/')}>
            <Text>Back to home</Text>
          </Button>
        </View>
      </Screen>
    );
  }

  const { spot, reviews, isMine } = data;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen
        options={{
          title: spot.area_name,
          headerRight: () => (
            <Button
              variant="ghost"
              size="icon"
              disabled={favBusy}
              onPress={onToggleFavorite}
              haptic={false}
              accessibilityLabel={isFavorite ? 'Remove from favourites' : 'Save to favourites'}>
              <Icon
                as={HeartIcon}
                className={isFavorite ? 'text-primary' : 'text-muted-foreground'}
                size={22}
              />
            </Button>
          ),
        }}
      />

      <ScrollView contentContainerClassName="gap-6 px-5 py-4">
        <View className="gap-1">
          <Text variant="h3">{spot.area_name}</Text>
          <Text variant="muted">
            {spot.building}
            {` · ${spot.review_count} ${spot.review_count === 1 ? 'review' : 'reviews'}`}
          </Text>
        </View>

        {spot.imageUrl ? (
          <Image
            source={{ uri: spot.imageUrl }}
            className="bg-muted aspect-video w-full rounded-lg"
            contentFit="cover"
            accessibilityLabel={`${spot.building} exterior`}
          />
        ) : (
          <View
            className="bg-muted aspect-video w-full rounded-lg"
            accessibilityLabel={`${spot.building}, no photo`}
          />
        )}

        {/* Occupancy: the live pill and the two-tap check-in (OCC-1). */}
        <View className="gap-3">
          <OccupancyPill reading={occupancy} />
          <CheckInControl
            onCheckIn={onCheckIn}
            pending={pendingStatus !== null}
            pendingStatus={pendingStatus}
            error={checkInError}
          />
        </View>

        {/* Amenity tags, read-only — locked by the first reviewer (AMEN-2). */}
        {spot.amenity_tags.length > 0 ? (
          <View className="gap-2">
            <Text variant="small" className="text-muted-foreground">
              What it&apos;s got
            </Text>
            <AmenityChips tags={spot.amenity_tags} />
          </View>
        ) : null}

        {/* Reviews (REV-4): a horizontal carousel, tap a card to expand in place. */}
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text variant="large">Reviews</Text>
            {/* REV-1: one review per person — hidden once the caller has one here. */}
            {!isMine ? (
              <Button
                variant="outline"
                size="sm"
                onPress={() =>
                  router.push({
                    pathname: '/review/new',
                    params: { spotId: spot.id, spotName: spot.area_name },
                  })
                }>
                <Text>Add your review</Text>
              </Button>
            ) : null}
          </View>

          <ReviewCarousel
            reviews={reviews}
            areaName={spot.area_name}
            building={spot.building}
            occupancy={occupancy}
            isExpanded={interactions.isExpanded}
            onToggleExpand={interactions.toggleExpand}
            onReport={interactions.openReport}
          />
        </View>
      </ScrollView>

      <ReportSheet reviewId={interactions.reportReviewId} onClose={interactions.closeReport} />
    </Screen>
  );
}
