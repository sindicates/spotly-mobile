import type { LucideIcon } from 'lucide-react-native';
import { HeartIcon, XIcon } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
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

import { ReviewCard } from '@/components/review-card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { selection } from '@/lib/haptics';
import type { SpotReviewCard } from '@/domain/reviews';
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
};

export function ReviewDeck({
  cards,
  isExpanded,
  onToggleExpand,
  onOpenSpot,
  onReport,
  onFavorite,
}: ReviewDeckProps) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const translateX = useSharedValue(0);
  const indexSV = useSharedValue(0);
  const countSV = useSharedValue(cards.length);

  useEffect(() => {
    indexSV.value = index;
  }, [index, indexSV]);

  useEffect(() => {
    countSV.value = cards.length;
    if (index >= cards.length) setIndex(Math.max(0, cards.length - 1));
  }, [cards.length, countSV, index]);

  const commit = useCallback(
    (direction: 1 | -1) => {
      const next = index + direction;
      // The card has already flown off screen by the time this runs, so the
      // reset has to happen whether or not there is another card to move to.
      translateX.value = 0;
      if (next < 0 || next >= cards.length) return;
      selection();
      setIndex(next);
    },
    [cards.length, index, translateX]
  );

  const favoriteCurrent = useCallback(() => {
    const card = cards[index];
    if (card) onFavorite(card);
  }, [cards, index, onFavorite]);

  const saveAndAdvance = useCallback(() => {
    favoriteCurrent();
    commit(1);
  }, [commit, favoriteCurrent]);

  const pan = Gesture.Pan()
    // Let taps reach expand / Open spot / report. The deck only takes over once
    // the finger has clearly started a horizontal swipe.
    .activeOffsetX([-20, 20])
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      const farEnough =
        Math.abs(event.translationX) > SWIPE_DISTANCE || Math.abs(event.velocityX) > SWIPE_VELOCITY;
      const hasNext = indexSV.value < countSV.value - 1;
      const swipedRight = event.translationX > 0;
      const swipedLeft = event.translationX < 0;

      if (farEnough && swipedRight) {
        if (hasNext) {
          translateX.value = withTiming(width * 1.2, { duration: 180 }, (finished) => {
            if (finished) runOnJS(saveAndAdvance)();
          });
        } else {
          // Last card: save in place rather than flying off onto an empty stack.
          runOnJS(favoriteCurrent)();
          translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
        }
        return;
      }

      if (farEnough && swipedLeft && hasNext) {
        translateX.value = withTiming(-width * 1.2, { duration: 180 }, (finished) => {
          if (finished) runOnJS(commit)(1);
        });
        return;
      }

      translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
    });

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      {
        rotate: `${interpolate(
          translateX.value,
          [-width, 0, width],
          [-10, 0, 10],
          Extrapolation.CLAMP
        )}deg`,
      },
    ],
  }));

  const nextStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_DISTANCE],
      [0, 1],
      Extrapolation.CLAMP
    );
    return {
      transform: [
        { scale: STACK_SCALE + (1 - STACK_SCALE) * progress },
        { translateY: STACK_OFFSET * (1 - progress) },
      ],
    };
  });

  /**
   * The two intent badges. Each one only reacts to its own direction, so the
   * card says which of the two outcomes the current drag would produce before
   * the finger lifts — the deck is otherwise a gesture with no stated contract.
   */
  const saveBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, BADGE_DISTANCE], [0, 1], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(translateX.value, [0, BADGE_DISTANCE], [0.8, 1], Extrapolation.CLAMP) },
    ],
  }));

  const skipBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-BADGE_DISTANCE, 0], [1, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(translateX.value, [-BADGE_DISTANCE, 0], [1, 0.8], Extrapolation.CLAMP) },
    ],
  }));

  const front = cards[index];
  const next = cards[index + 1];
  const afterNext = cards[index + 2];

  if (!front) return null;

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
            {afterNext ? (
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                className="absolute inset-0"
                style={{
                  transform: [
                    { scale: STACK_SCALE - 0.03 },
                    { translateY: STACK_OFFSET * 2 },
                  ],
                }}>
                <DeckCard card={afterNext} onOpenSpot={onOpenSpot} onReport={onReport} />
              </View>
            ) : null}

            {next ? (
              <Animated.View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                className="absolute inset-0"
                style={nextStyle}>
                <DeckCard card={next} onOpenSpot={onOpenSpot} onReport={onReport} />
              </Animated.View>
            ) : null}

            <View className="flex-1">
              <GestureDetector gesture={pan}>
                <Animated.View
                  key={front.reviewId}
                  collapsable={false}
                  className="flex-1"
                  style={frontStyle}
                accessibilityHint="Swipe right to save this spot, left for the next review"
                accessibilityActions={[
                  { name: 'skip', label: 'Next review' },
                  { name: 'favorite', label: 'Save to favourites' },
                ]}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === 'skip') commit(1);
                  if (event.nativeEvent.actionName === 'favorite') saveAndAdvance();
                }}>
                <DeckCard
                  card={front}
                  expanded={isExpanded(front.reviewId)}
                  onToggleExpand={onToggleExpand}
                  onOpenSpot={onOpenSpot}
                  onReport={onReport}
                />

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
        'bg-card/95 flex-row items-center gap-1.5 rounded-full border px-3 py-1.5',
        tone === 'save' ? 'border-primary' : 'border-border'
      )}>
      <Icon as={icon} className={accent} size={16} />
      <Text className={cn('font-semibold', accent)}>{label}</Text>
    </View>
  );
}

function DeckCard({
  card,
  expanded = false,
  onToggleExpand,
  onOpenSpot,
  onReport,
}: {
  card: SpotReviewCard;
  /** Only the front card expands; the peek layers are always collapsed. */
  expanded?: boolean;
  onToggleExpand?: (reviewId: string) => void;
  onOpenSpot: (spotId: string) => void;
  onReport: (reviewId: string) => void;
}) {
  return (
    <ReviewCard
      fill
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
