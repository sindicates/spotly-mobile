import { FlatList, useWindowDimensions, View } from 'react-native';

import { ReviewCard } from '@/components/review-card';
import { Text } from '@/components/ui/text';
import type { OccupancyReading } from '@/lib/occupancy';
import type { SpotReview } from '@/lib/reviews';

/**
 * REV-4. One spot's reviews as a horizontally swipeable deck.
 *
 * This is the single deliberate exception to SPOT-4 — everywhere else a list of
 * reviews is a plain vertical list. The carousel exists to solve the wall-of-text
 * failure on a spot that has collected a year of reviews: swiping keeps the
 * default view scannable, and tap-to-expand (REV-5) puts the full text one tap
 * away without a navigation.
 *
 * Order is trending, not chronological (REV-6), and it arrives that way from
 * `listSpotReviews` — there is no sort here to drift from the view's weights.
 *
 * Cards render through `ReviewCard` with `showSpotContext` off. Reusing the one
 * review surface is what keeps REV-2 true by construction: a bespoke card for
 * this screen is a card that could grow an author line.
 */

/**
 * Screen padding (`px-5`) as a number. The parent supplies the actual inset —
 * this is here because the card width has to be measured, not classed, and the
 * maths needs to know how much of the window the padding has already taken.
 */
const EDGE = 20;
const GAP = 12;
/** How much of the next card shows, which is what signals "swipe me". */
const PEEK = 28;

type ReviewCarouselProps = {
  reviews: readonly SpotReview[];
  /**
   * The spot these reviews belong to. Forwarded to `ReviewCard`, which holds the
   * context but does not draw it here — the page header two rows up already
   * does, and `showSpotContext` is what suppresses the repeat.
   */
  areaName: string;
  building: string;
  occupancy: OccupancyReading;
  /** Expand state lives in the screen's `useReviewInteractions`, not here. */
  isExpanded: (reviewId: string) => boolean;
  onToggleExpand: (reviewId: string) => void;
  /** MOD-1. Every review card carries a report control. */
  onReport: (reviewId: string) => void;
  className?: string;
};

export function ReviewCarousel({
  reviews,
  areaName,
  building,
  occupancy,
  isExpanded,
  onToggleExpand,
  onReport,
  className,
}: ReviewCarouselProps) {
  const { width } = useWindowDimensions();
  const cardWidth = width - EDGE * 2 - PEEK;

  // Reachable even though SPOT-3 guarantees a first review: moderation can hide
  // every review on a spot (MOD-4), and the spot row itself survives that.
  if (reviews.length === 0) {
    return (
      <View className={className}>
        <Text variant="muted">No reviews to show for this spot yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      className={className}
      data={reviews}
      keyExtractor={(review) => review.id}
      horizontal
      showsHorizontalScrollIndicator={false}
      // Snapping rather than `pagingEnabled`: a page is the full screen width,
      // and the peek is what tells someone there is more to swipe to.
      snapToInterval={cardWidth + GAP}
      snapToAlignment="start"
      decelerationRate="fast"
      contentContainerStyle={{ gap: GAP }}
      renderItem={({ item }) => (
        <ReviewCard
          style={{ width: cardWidth }}
          body={item.body}
          areaName={areaName}
          building={building}
          occupancy={occupancy}
          showSpotContext={false}
          expanded={isExpanded(item.id)}
          // The screen's `useReviewInteractions` owns expand state and the
          // `increment_expand` bump (REV-6). Firing it here as well would be the
          // second implementation of a debounce that only works if there is one.
          onToggleExpand={() => onToggleExpand(item.id)}
          onReport={() => onReport(item.id)}
        />
      )}
    />
  );
}
