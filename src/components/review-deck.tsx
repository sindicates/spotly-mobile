import type { LucideIcon } from 'lucide-react-native';
import { HeartIcon, XIcon } from 'lucide-react-native';
import { useCallback, useLayoutEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useColorScheme } from 'nativewind';

import { EmptyState } from '@/components/empty-state';
import { ReviewCard } from '@/components/review-card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { selection } from '@/lib/haptics';
import type { SpotReviewCard } from '@/domain/reviews';
import { DUR, EASE, exitOf, SPRING } from '@/lib/motion';
import { ELEVATION, type ElevationLevel } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * SPOT-1. The home feed as a stacked, swipeable deck.
 *
 * Search results stay a plain vertical list (SPOT-4) and a spot's own reviews
 * stay the peek carousel (REV-4). Home is the third surface on purpose: it is
 * a place to browse, not to scan matches, so one card at a time with the next
 * two peeking behind is the right density.
 *
 * Swipe left skips. Swipe right saves the *spot* (FAV-1) — favourites are spots,
 * not reviews — then advances. The write lives in the screen; this only fires
 * `onFavorite` for the card that left.
 *
 * Cards are still `ReviewCard` — tap expands (REV-5), a separate control opens
 * the spot, every card can be reported (MOD-1), and there is no author slot
 * (REV-2). This component is only the container.
 */

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 900;
const STACK_OFFSET = 14;
const STACK_SCALE = 0.96;
/** The third layer, one step further back again. */
const THIRD_SCALE = 0.93;
/** How far the finger travels before the intent badges are fully opaque. */
const BADGE_DISTANCE = 80;

type ReviewDeckProps = {
  cards: readonly SpotReviewCard[];
  isExpanded: (reviewId: string) => boolean;
  onToggleExpand: (reviewId: string) => void;
  onOpenSpot: (spotId: string) => void;
  onReport: (reviewId: string) => void;
  /** FAV-1. Swipe-right on a card saves that card's spot. */
  onFavorite: (card: SpotReviewCard) => void;
  /**
   * Offered once the day's set runs out. Navigation belongs to the screen, so
   * the deck asks rather than routing.
   */
  onAddSpot?: () => void;
};

export function ReviewDeck({
  cards,
  isExpanded,
  onToggleExpand,
  onOpenSpot,
  onReport,
  onFavorite,
  onAddSpot,
}: ReviewDeckProps) {
  const { width } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const { lifted, dragged } = ELEVATION[colorScheme ?? 'light'];
  // `index === cards.length` is the deck's ending, not an error — see the
  // exhausted branch below.
  const [index, setIndex] = useState(0);
  const translateX = useSharedValue(0);

  // A refetch hands us a different day's set, and an index left over from the
  // old one would open the new deck halfway through — or, worse, on its
  // "that's everything" ending. Adjusting state during render on a changed
  // input is the pattern `ReportSheet` uses for the same job; an effect here
  // would render the wrong card once before correcting itself.
  const deckKey = cards[0]?.reviewId ?? '';
  const [prevDeckKey, setPrevDeckKey] = useState(deckKey);
  if (deckKey !== prevDeckKey) {
    setPrevDeckKey(deckKey);
    setIndex(0);
  }

  /**
   * The handoff between one card and the next, which has two hard frames in it.
   *
   * A shared value reaches the UI thread the instant it is assigned, but
   * `setIndex` only *schedules* a render. So the reset and the swap cannot
   * happen together, and whichever order you pick leaves one wrong frame:
   *
   * - Reset `translateX` first, then swap: the outgoing card snaps back to dead
   *   centre still showing the review you just dismissed.
   * - Swap first, then reset: the incoming card renders off screen, and because
   *   the peek layer's `progress` is still 1 it is sitting centred at full size
   *   — so you see the card *after* the next one, then the real one arrives over
   *   it. Swipe again and it repeats one further along, which reads as the deck
   *   jumping forward and back.
   *
   * The way out is to make the outgoing card invisible in the same UI-thread
   * tick as the reset, so the front slot is simply empty while the swap happens
   * and neither a stale card nor the wrong peek layer can occupy it.
   *
   * That needs two shared values rather than one, because the front card and
   * the stack behind it have to reset at *different* moments. `translateX` has
   * to be back at zero before React advances, or the incoming card mounts off
   * screen. The stack must NOT reset then: the peek card has risen to full size
   * during the swipe, and dropping it back to 0.96 in that same tick is visible
   * as the next card deflating and re-inflating. So `peekProgress` holds its
   * raised position through the handoff and resets afterwards, once the card
   * that rose has become the front card and a new one has taken the peek slot.
   */
  const frontOpacity = useSharedValue(1);
  const peekProgress = useSharedValue(0);

  const commit = useCallback(
    (direction: 1 | -1) => {
      const next = index + direction;
      // Clamped to `cards.length`, one past the last card: that position is the
      // exhausted state, so the final swipe has somewhere to land.
      if (next < 0 || next > cards.length) return;
      setIndex(next);
    },
    [cards.length, index],
  );

  /**
   * The other half of the handoff, after React has advanced.
   *
   * Both writes are instant, not animated, and they belong together: the card
   * that was the peek is now the front, so it becomes visible in its new slot at
   * exactly the size it already had, and the card that just moved up into the
   * peek slot drops to the resting stack position behind it. Fading either one
   * would show the other through it.
   */
  useLayoutEffect(() => {
    frontOpacity.value = 1;
    peekProgress.value = 0;
  }, [index, frontOpacity, peekProgress]);

  const favoriteCurrent = useCallback(() => {
    const card = cards[index];
    if (card) onFavorite(card);
  }, [cards, index, onFavorite]);

  /**
   * Fires the moment the swipe is decided rather than when the animation lands.
   * The intent is already committed by then, and running a network write plus a
   * haptic in the gap between the exit and the re-render was widening exactly
   * the window the fix above closes. A haptic on release also simply feels
   * right, where one 180 ms later feels like lag.
   */
  const commitSwipe = useCallback(
    (save: boolean) => {
      if (save) favoriteCurrent();
      selection();
    },
    [favoriteCurrent],
  );

  // `react-hooks/immutability` flags the shared-value writes in these worklets.
  // It is a known false positive — writing to a shared value from the UI thread
  // is the entire mechanism Reanimated provides — and it fires whether the
  // gesture is memoised or built here. Left as-is rather than adding this
  // codebase's first eslint-disable for it.
  const pan = Gesture.Pan()
    // Let taps reach expand / Open spot / report. The deck only takes over once
    // the finger has clearly started a horizontal swipe.
    .activeOffsetX([-20, 20])
    .onUpdate((event) => {
      translateX.value = event.translationX;
      peekProgress.value = interpolate(
        Math.abs(event.translationX),
        [0, SWIPE_DISTANCE],
        [0, 1],
        Extrapolation.CLAMP
      );
    })
    .onEnd((event) => {
      const farEnough =
        Math.abs(event.translationX) > SWIPE_DISTANCE || Math.abs(event.velocityX) > SWIPE_VELOCITY;

      if (!farEnough) {
        // Abandoned. The stack settles back down with the card.
        translateX.value = withSpring(0, SPRING);
        peekProgress.value = withSpring(0, SPRING);
        return;
      }

      // The last card leaves like every other one. It used to spring back
      // instead, which meant the final card could never be dismissed and the
      // deck had no ending.
      const swipedRight = event.translationX > 0;
      const exit = { duration: exitOf(DUR.short), easing: EASE.in };
      runOnJS(commitSwipe)(swipedRight);

      // A fast flick can commit from a short drag, so finish raising the stack
      // rather than leaving the next card mid-rise when it becomes the front.
      peekProgress.value = withTiming(1, exit);

      translateX.value = withTiming(
        width * (swipedRight ? 1.2 : -1.2),
        exit,
        (finished) => {
          if (!finished) return;
          // One UI-thread tick, and the order matters: the outgoing card is
          // hidden and re-centred *before* React is told to advance, so nothing
          // stale can be sitting in the front slot when the new card mounts.
          // `peekProgress` is deliberately untouched — it stays raised until the
          // layout effect, so the next card never visibly shrinks.
          frontOpacity.value = 0;
          translateX.value = 0;
          runOnJS(commit)(1);
        }
      );
    });

  /**
   * The front card lifts off the stack as it is dragged — the shadow deepens
   * with the finger and settles back when the swipe is abandoned. This is the
   * one place in the app where a shadow animates, and it earns it: the gesture
   * is a physical one, and depth is what says the card has been picked up.
   *
   * Dark mode has no shadow to grow, so this quietly resolves to nothing there.
   */
  const frontStyle = useAnimatedStyle(() => {
    const lift = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_DISTANCE],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: frontOpacity.value,
      transform: [
        { translateX: translateX.value },
        {
          rotate: `${interpolate(
            translateX.value,
            [-width, 0, width],
            [-10, 0, 10],
            Extrapolation.CLAMP,
          )}deg`,
        },
      ],
      // Multiplied by opacity so the shadow disappears with the card during the
      // handoff — a shadow with nothing casting it is very visible.
      shadowOpacity:
        (lifted.shadowOpacity + (dragged.shadowOpacity - lifted.shadowOpacity) * lift) *
        frontOpacity.value,
      shadowRadius: lifted.shadowRadius + (dragged.shadowRadius - lifted.shadowRadius) * lift,
    };
  });

  /**
   * The stack shifts up as one. Each layer animates toward the resting position
   * of the layer in front of it, so by the time the swipe completes every card
   * is already where it needs to be and the advance is only a change of which
   * card is in which slot — nothing has to jump into place afterwards.
   *
   * Driven by `peekProgress`, not `translateX`: the two reset at different
   * points in the handoff. See the note on `frontOpacity`.
   */
  const nextStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: STACK_SCALE + (1 - STACK_SCALE) * peekProgress.value },
      { translateY: STACK_OFFSET * (1 - peekProgress.value) },
    ],
  }));

  const afterNextStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: THIRD_SCALE + (STACK_SCALE - THIRD_SCALE) * peekProgress.value },
      { translateY: STACK_OFFSET * (2 - peekProgress.value) },
    ],
  }));

  /**
   * The two intent badges. Each one only reacts to its own direction, so the
   * card says which of the two outcomes the current drag would produce before
   * the finger lifts — the deck is otherwise a gesture with no stated contract.
   */
  const saveBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, BADGE_DISTANCE], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(translateX.value, [0, BADGE_DISTANCE], [0.8, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const skipBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-BADGE_DISTANCE, 0], [1, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(translateX.value, [-BADGE_DISTANCE, 0], [1, 0.8], Extrapolation.CLAMP),
      },
    ],
  }));

  const front = cards[index];
  const next = cards[index + 1];
  const afterNext = cards[index + 2];

  // Swiped through the whole set. Ending on a blank screen would read as a bug,
  // and the day's set is finite by design (SPOT-1) — so say so, and offer the
  // two things left to do.
  if (!front) {
    return (
      <EmptyState
        className="flex-1 justify-center"
        title="That’s everything for today"
        description="The set is seeded per day, so a fresh one lands tomorrow. Until then, you could add a spot nobody’s written up yet."
        action={onAddSpot ? { label: 'Add a spot', onPress: onAddSpot } : undefined}
        secondaryAction={{
          label: 'Go through them again',
          onPress: () => setIndex(0),
        }}
      />
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="min-h-0 flex-1 px-5 pt-2">
        <Text variant="muted" className="pb-1 text-center">
          Swipe left to skip, right to save the spot
        </Text>

        {/*
          The stack fills the column between the hint and Add spot. Peek cards
          hang into a small bottom inset so they don't sit on the button.
        */}
        <View className="min-h-0 flex-1" style={{ paddingBottom: STACK_OFFSET * 2 }}>
          {/*
            The front card is the only layer in normal flow, so it sizes this
            box and the two behind it fill it with `inset-0`. Pinning them to
            the top instead detaches the peek from a vertically centred front
            card, and the stack reads as three loose cards rather than one.
          */}
          <View className="flex-1">
            {/*
              Each layer is keyed so it remounts when the deck advances. Without
              a key React reuses the instance and swaps the card's props, and
              you watch the review text re-wrap in place on a fully visible
              card — the "malformed text" frame. A keyed layer arrives with its
              text already laid out.

              Elevation descends with the stack, so the three layers read as
              three objects at three depths rather than one card with odd edges.
            */}
            {afterNext ? (
              <Animated.View
                key={afterNext.reviewId}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                className="absolute inset-0 opacity-70"
                style={afterNextStyle}>
                <DeckCard
                  card={afterNext}
                  elevation="flat"
                  onOpenSpot={onOpenSpot}
                  onReport={onReport}
                />
              </Animated.View>
            ) : null}

            {next ? (
              <Animated.View
                key={next.reviewId}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                className="absolute inset-0"
                style={nextStyle}>
                <DeckCard
                  card={next}
                  elevation="resting"
                  onOpenSpot={onOpenSpot}
                  onReport={onReport}
                />
              </Animated.View>
            ) : null}

            <View className="flex-1">
              <GestureDetector gesture={pan}>
                {/*
                  The wrapper carries the shadow, not the card inside it: iOS
                  draws a shadow from the view's own background, and only a
                  plain view can have its shadow animated by a worklet. The
                  card is `flat` and sits exactly on top of it.
                */}
                {/*
                  Deliberately NOT keyed. This view is the gesture's target, and
                  remounting it on every advance tears the handler down and
                  re-attaches it mid-swipe. The card *content* is keyed instead,
                  one level in.
                */}
                <Animated.View
                  collapsable={false}
                  className="bg-card rounded-card flex-1"
                  style={[
                    {
                      shadowColor: lifted.shadowColor,
                      shadowOffset: lifted.shadowOffset,
                      elevation: lifted.elevation,
                    },
                    frontStyle,
                  ]}
                  accessibilityHint="Swipe right to save this spot, left for the next review"
                  accessibilityActions={[
                    { name: 'skip', label: 'Next review' },
                    { name: 'favorite', label: 'Save to favourites' },
                  ]}
                  onAccessibilityAction={(event) => {
                    const { actionName } = event.nativeEvent;
                    if (actionName !== 'skip' && actionName !== 'favorite') return;
                    commitSwipe(actionName === 'favorite');
                    commit(1);
                  }}>
                  {/*
                    Keyed here rather than on the gesture target above, so the
                    review mounts fresh — text laid out before it is visible —
                    without disturbing the gesture.
                  */}
                  <View key={front.reviewId} className="flex-1">
                    <DeckCard
                      card={front}
                      elevation="flat"
                      expanded={isExpanded(front.reviewId)}
                      onToggleExpand={onToggleExpand}
                      onOpenSpot={onOpenSpot}
                      onReport={onReport}
                    />
                  </View>

                  <Animated.View
                    pointerEvents="none"
                    className="absolute left-4 top-4"
                    style={saveBadgeStyle}>
                    <SwipeBadge icon={HeartIcon} label="Save" tone="save" />
                  </Animated.View>

                  <Animated.View
                    pointerEvents="none"
                    className="absolute right-4 top-4"
                    style={skipBadgeStyle}>
                    <SwipeBadge icon={XIcon} label="Skip" tone="skip" />
                  </Animated.View>
                </Animated.View>
              </GestureDetector>
            </View>
          </View>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

/**
 * The drag-intent stamp. Icon *and* word, never colour alone — the two
 * outcomes have to stay distinguishable in greyscale.
 */
function SwipeBadge({
  icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: 'save' | 'skip';
}) {
  const accent = tone === 'save' ? 'text-primary' : 'text-muted-foreground';
  return (
    <View
      className={cn(
        'bg-card/95 border-hairline flex-row items-center gap-1.5 rounded-full px-3 py-1.5',
        tone === 'save' ? 'border-primary' : 'border-border',
      )}>
      <Icon as={icon} className={accent} size={16} />
      <Text className={cn('font-semibold', accent)}>{label}</Text>
    </View>
  );
}

function DeckCard({
  card,
  elevation,
  expanded = false,
  onToggleExpand,
  onOpenSpot,
  onReport,
}: {
  card: SpotReviewCard;
  /** The stack's depth cue. The front card's shadow lives on its wrapper. */
  elevation: ElevationLevel;
  /** Only the front card expands; the peek layers are always collapsed. */
  expanded?: boolean;
  onToggleExpand?: (reviewId: string) => void;
  onOpenSpot: (spotId: string) => void;
  onReport: (reviewId: string) => void;
}) {
  return (
    <ReviewCard
      fill
      elevation={elevation}
      body={card.body}
      areaName={card.areaName}
      building={card.building}
      occupancy={card.occupancy}
      tags={card.tags}
      reviewCount={card.reviewCount}
      imageUrl={card.imageUrl}
      expanded={expanded}
      onToggleExpand={onToggleExpand ? () => onToggleExpand(card.reviewId) : undefined}
      onOpenSpot={() => onOpenSpot(card.spotId)}
      onReport={() => onReport(card.reviewId)}
    />
  );
}
