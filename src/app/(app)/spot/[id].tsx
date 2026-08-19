import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { HeartIcon } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AmenityChips } from '@/components/amenity-chip';
import { AppImage } from '@/components/app-image';
import { CheckInControl } from '@/components/check-in-control';
import { ErrorState } from '@/components/error-state';
import { OccupancyPill } from '@/components/occupancy-pill';
import { ReportSheet } from '@/components/report-sheet';
import { ReviewCarousel } from '@/components/review-carousel';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { DUR, exitOf, REDUCE_MOTION } from '@/lib/motion';
import { useReviewInteractions } from '@/hooks/use-review-interactions';
import { useSpotDetail } from '@/hooks/use-spot-detail';
import { addFavorite, removeFavorite } from '@/domain/favorites';
import { error as hapticError, success, warning } from '@/lib/haptics';
import {
  checkIn,
  isRateLimitError,
  type OccupancyReading,
  type OccupancyStatus,
} from '@/domain/occupancy';
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

  /**
   * The spot's name is drawn once. It used to render in the native header *and*
   * as a heading two lines below it, which read as a stutter.
   *
   * The page keeps the heading, because a 24px title with the building under it
   * is a better first line than a 17px one squeezed between two buttons — and
   * the header picks it up only once that heading has scrolled out of sight, so
   * you always know where you are and never read it twice at once.
   *
   * `headerTitle` always returns a wrapper and fades its contents in and out
   * inside it. Returning null from `headerTitle` outright is not something the
   * native stack handles reliably.
   */
  const [titleInHeader, setTitleInHeader] = useState(false);

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
    }, [detail]),
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
          <Skeleton className="rounded-card aspect-video w-full" />
          <Skeleton className="rounded-card h-16 w-full" />
          <Skeleton className="rounded-card h-56 w-full" />
        </View>
      </Screen>
    );
  }

  if (detail.error) {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: '' }} />
        <ErrorState
          fill
          message={errorMessage(detail.error, "We couldn't load this spot.")}
          onRetry={detail.refetch}
        />
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
          title: '',
          headerTitle: () => (
            <View>
              {titleInHeader ? (
                <Animated.View
                  entering={FadeIn.duration(DUR.micro).reduceMotion(REDUCE_MOTION)}
                  exiting={FadeOut.duration(exitOf(DUR.micro)).reduceMotion(REDUCE_MOTION)}>
                  <Text variant="large" numberOfLines={1}>
                    {spot.area_name}
                  </Text>
                </Animated.View>
              ) : null}
            </View>
          ),
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

      {/*
        One orchestrated arrival, and only one. Each section fades up a beat
        after the one above it, so the page assembles top-down in under 400ms
        and then stays still — the alternative, animating on every scroll, is a
        page that never settles. `REDUCE_MOTION` collapses all of it to a
        crossfade when the system asks.
      */}
      <ScrollView
        contentContainerClassName="gap-6 px-5 py-4"
        scrollEventThrottle={16}
        onScroll={(event) => {
          const y = event.nativeEvent.contentOffset.y;
          // Two thresholds, so a scroll resting on the boundary cannot make the
          // header title flicker on and off.
          setTitleInHeader((showing) => (showing ? y > 28 : y > 44));
        }}>
        <Arrive index={0}>
          <View className="gap-1">
            <Text variant="h3">{spot.area_name}</Text>
            <Text variant="muted">
              {spot.building}
              {` · ${spot.review_count} ${spot.review_count === 1 ? 'review' : 'reviews'}`}
            </Text>
          </View>
        </Arrive>

        <Arrive index={1}>
          <AppImage
            uri={spot.imageUrl}
            className="rounded-card aspect-video w-full"
            accessibilityLabel={
              spot.imageUrl ? `${spot.building} exterior` : `${spot.building}, no photo`
            }
          />
        </Arrive>

        {/* Occupancy: the live pill and the two-tap check-in (OCC-1). */}
        <Arrive index={2}>
          <View className="gap-3">
            <OccupancyPill reading={occupancy} />
            <CheckInControl
              onCheckIn={onCheckIn}
              pending={pendingStatus !== null}
              pendingStatus={pendingStatus}
              error={checkInError}
            />
          </View>
        </Arrive>

        {/* Amenity tags, read-only — locked by the first reviewer (AMEN-2). */}
        {spot.amenity_tags.length > 0 ? (
          <Arrive index={3}>
            <View className="gap-2">
              <Text variant="small" className="text-muted-foreground">
                What it&apos;s got
              </Text>
              <AmenityChips tags={spot.amenity_tags} />
            </View>
          </Arrive>
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

/** One step of the page's arrival. `index` is its place in the sequence. */
function Arrive({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <Animated.View
      entering={FadeIn.delay(index * 60)
        .duration(DUR.short)
        .reduceMotion(REDUCE_MOTION)}>
      {children}
    </Animated.View>
  );
}
