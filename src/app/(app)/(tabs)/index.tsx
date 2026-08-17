import { router } from 'expo-router';
import { PlusIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { ReportSheet } from '@/components/report-sheet';
import { ReviewDeck } from '@/components/review-deck';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useReviewInteractions } from '@/hooks/use-review-interactions';
import { useTrendingFeed } from '@/hooks/use-trending-feed';
import { addFavorite, SAVED_TO_FAVOURITES } from '@/domain/favorites';
import { error as hapticError, success } from '@/lib/haptics';
import type { SpotReviewCard } from '@/domain/reviews';
import { showErrorToast, showToast } from '@/lib/toast';
import { errorMessage } from '@/lib/utils';

/**
 * SPOT-1. Home is a swipeable deck of about ten reviews for the day. Search
 * lives on its own tab — putting a search bar here taught people the same
 * destination twice.
 *
 * The day's set skips already-saved spots so the deck stays for discovery.
 * There is no category browse and no map on this screen; v1 is study spots only.
 * The Home tab names the screen, so there is no in-page title. Add a spot sits
 * under the deck — it is an action, not a fifth tab. Native tabs draw the bar
 * over the scene, so that button pads for the bar instead of sitting under it.
 */

/** Home indicator plus the overlaying tab bar. Lists can scroll under; this cannot. */
const TAB_BAR_OVERLAY = 56;

export default function Home() {
  const feed = useTrendingFeed();
  const interactions = useReviewInteractions();
  const insets = useSafeAreaInsets();
  const cards = feed.data ?? [];

  function onFavorite(card: SpotReviewCard) {
    // Favourites are spots, not reviews (FAV-1). The card is how you found it.
    void addFavorite(card.spotId).then(
      () => {
        success();
        showToast(SAVED_TO_FAVOURITES, `${card.areaName} · ${card.building}`);
      },
      (cause) => {
        hapticError();
        showErrorToast(errorMessage(cause, "Couldn't save that spot."));
      }
    );
  }

  return (
    // The tab bar owns the bottom inset — see `Screen`.
    <Screen edges={['top']}>
      <View className="flex-1">
        {feed.loading && cards.length === 0 ? (
          <View className="flex-1 px-5 pt-3">
            <View className="min-h-0 flex-1">
              <View
                className="absolute inset-x-0 overflow-hidden rounded-lg"
                style={{ transform: [{ scale: 0.96 }, { translateY: 14 }] }}>
                <Skeleton className="h-full w-full" />
              </View>
              <Skeleton className="h-full w-full rounded-lg" />
            </View>
          </View>
        ) : feed.error && cards.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-3 px-5">
            <Text variant="muted" className="text-center">
              {errorMessage(feed.error, "We couldn't load the feed.")}
            </Text>
            <Button variant="outline" size="sm" onPress={feed.refetch}>
              <Text>Try again</Text>
            </Button>
          </View>
        ) : cards.length === 0 ? (
          <EmptyState
            className="flex-1 justify-center"
            title="Nothing here yet"
            description="Be the first — add a spot and write its first review."
            action={{ label: 'Add a spot', onPress: () => router.push('/spot/new') }}
          />
        ) : (
          <ReviewDeck
            cards={cards}
            isExpanded={interactions.isExpanded}
            onToggleExpand={interactions.toggleExpand}
            onOpenSpot={(spotId) => router.push(`/spot/${spotId}`)}
            onReport={interactions.openReport}
            onFavorite={onFavorite}
          />
        )}

        {/*
          Adding a spot is an action, not a place, so it has no tab. It sits
          under the deck rather than in a title row — the Home tab already
          names the screen, and the cards need the height the header stole.
        */}
        {cards.length > 0 || feed.loading ? (
          <View className="px-5" style={{ paddingBottom: insets.bottom + TAB_BAR_OVERLAY }}>
            <Button variant="outline" onPress={() => router.push('/spot/new')}>
              <Icon as={PlusIcon} className="text-foreground" size={16} />
              <Text>Add a spot</Text>
            </Button>
          </View>
        ) : null}
      </View>

      <ReportSheet reviewId={interactions.reportReviewId} onClose={interactions.closeReport} />
    </Screen>
  );
}
