import { ChevronRightIcon, FlagIcon } from 'lucide-react-native';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AmenityChips } from '@/components/amenity-chip';
import { AppImage } from '@/components/app-image';
import { OccupancyPill } from '@/components/occupancy-pill';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { AmenityTag } from '@/domain/amenities';
import { selection } from '@/lib/haptics';
import type { OccupancyReading } from '@/domain/occupancy';
import { DUR, EASE } from '@/lib/motion';
import type { ElevationLevel } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * A review with its spot attached. The single most reused surface in the app:
 * the trending feed deck, search results, and the spot-page carousel are all this
 * component with a different container around it.
 *
 * Search results are review cards, not spot summaries (SEARCH-2). That is the
 * product's whole claim — the index is built from what students actually wrote,
 * so the result has to show the writing, with the spot as context rather than
 * the headline.
 *
 * Two distinct gestures, deliberately not merged (SEARCH-2, REV-5): tapping the
 * card expands it to full text in place, and a separate control opens the spot
 * page. Skimming and committing are different intents, and collapsing them into
 * one tap means every glance costs a navigation.
 *
 * There is no author, no avatar, and no reviewer name anywhere in this component,
 * and there is no prop that could add one (REV-2). The image slot is the
 * building's photo (REV-12), not a person. Anonymity is what makes blunt
 * reviews possible on a campus small enough that everyone is one degree apart.
 */

type ReviewCardProps = {
  body: string;
  areaName: string;
  building: string;
  occupancy: OccupancyReading;
  tags?: readonly AmenityTag[];
  /** Shown as "4 reviews" when this card represents a spot in a list. */
  reviewCount?: number;
  /**
   * REV-12. The building's primary photo. Drawn only when `showSpotContext` is
   * on — the spot-page carousel already has a hero two rows up. Null is a
   * muted placeholder, never a photo of a different building.
   */
  imageUrl?: string | null;
  /**
   * Set false inside the spot page carousel, where the header two lines above
   * already names the spot and shows its pill. Repeating it on every card is
   * noise, and the alternative — a second review surface built just for that
   * screen — is how a card without REV-2's guarantees gets written.
   */
  showSpotContext?: boolean;
  expanded?: boolean;
  /** Tap-to-expand. Debounce `increment_expand` to once per review per session. */
  onToggleExpand?: () => void;
  /** The separate control that navigates. Omit inside the spot page carousel. */
  onOpenSpot?: () => void;
  /** Opens the report sheet. Present on every review card (MOD-1). */
  onReport?: () => void;
  className?: string;
  /**
   * Home deck only. The card fills its parent and the building photo takes the
   * leftover height, so the stack can be as tall as the screen instead of
   * hugging `aspect-video`. Search and the spot-page carousel stay intrinsic.
   */
  fill?: boolean;
  /**
   * Escape hatch for a measured width, which the carousel computes from the
   * window rather than a class. Layout only — colour and spacing stay in
   * `className` so they keep resolving from tokens.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * How far off the page this card sits. The deck's front card floats above
   * two peek layers; a search result sits in a list. Defaults to `resting`.
   */
  elevation?: ElevationLevel;
};

export function ReviewCard({
  body,
  areaName,
  building,
  occupancy,
  tags = [],
  reviewCount,
  imageUrl = null,
  showSpotContext = true,
  expanded = false,
  onToggleExpand,
  onOpenSpot,
  onReport,
  className,
  fill = false,
  style,
  elevation = 'resting',
}: ReviewCardProps) {
  /**
   * One press signal for the whole card, not four small ones.
   *
   * The card had no tactile response at all before — a tap either reflowed the
   * text or pushed a screen, with nothing in between to say the touch landed.
   * A 1.5% recede is enough; anything larger starts to look like the card is
   * being squashed.
   */
  const pressed = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.015 }],
  }));
  const setPressed = (down: boolean) => {
    pressed.value = withTiming(down ? 1 : 0, {
      duration: DUR.micro,
      easing: EASE.out,
    });
  };

  /**
   * The card recedes a beat before the push begins, so the spot page reads as
   * something this card opened rather than a screen that happened to appear.
   * The delay is one frame's worth — long enough to see, short enough that the
   * tap still feels instant.
   */
  const openSpot = () => {
    if (!onOpenSpot) return;
    setPressed(true);
    setTimeout(() => {
      setPressed(false);
      onOpenSpot();
    }, DUR.micro);
  };

  const photoClass = cn('w-full', fill ? 'min-h-0 flex-1' : 'aspect-video');

  return (
    // The scale lives on a wrapper so the whole card moves together. Putting it
    // on the Card itself would mean animating the view that casts the shadow,
    // and the shadow would scale with it.
    <Animated.View style={[style, pressStyle]} className={cn(fill && 'flex-1')}>
      <Card elevation={elevation} className={cn(fill && 'flex-1', className)}>
        {showSpotContext ? (
          // The photo is clipped by its own wrapper rather than by the card:
          // `overflow-hidden` on the card would clip the card's shadow away too.
          <View className={cn('rounded-t-card overflow-hidden', fill && 'min-h-0 flex-1')}>
            <AppImage
              uri={imageUrl}
              className={photoClass}
              accessibilityLabel={imageUrl ? `${building} exterior` : `${building}, no photo`}
            />
          </View>
        ) : null}

        {/* Tighter under the footer rule than above it, so the card has an
          internal rhythm rather than one evenly-padded stack. */}
        <View className="gap-3 p-4 pb-3">
          <Pressable
            onPress={() => {
              if (!onToggleExpand) return;
              selection();
              onToggleExpand();
            }}
            onPressIn={() => onToggleExpand && setPressed(true)}
            onPressOut={() => setPressed(false)}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Collapse review' : 'Expand review'}>
            <Text
              className="text-card-foreground leading-6"
              numberOfLines={expanded ? undefined : 4}>
              {body}
            </Text>
          </Pressable>

          {showSpotContext ? (
            <View className="gap-2">
              <View className="flex-row items-center justify-between gap-3">
                <View className="shrink gap-0.5">
                  <Text className="font-semibold">{areaName}</Text>
                  <Text variant="muted">
                    {building}
                    {typeof reviewCount === 'number'
                      ? ` · ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}`
                      : ''}
                  </Text>
                </View>
                <OccupancyPill reading={occupancy} size="sm" />
              </View>

              {tags.length > 0 ? <AmenityChips tags={tags} /> : null}
            </View>
          ) : null}

          {onOpenSpot || onReport ? (
            // A rule under the content, so the two controls read as the card's
            // footer rather than as one more item in the stack above them.
            <View className="border-border border-t-hairline -mx-4 flex-row items-center justify-between px-1 pt-1">
              {onOpenSpot ? (
                // Was a bare text link, which made the card's whole reason for
                // existing the quietest thing on it.
                <Button variant="ghost" size="sm" onPress={openSpot}>
                  <Text className="text-primary font-medium">Open spot</Text>
                  <Icon as={ChevronRightIcon} className="text-primary" size={16} />
                </Button>
              ) : (
                <View />
              )}
              {onReport ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onPress={onReport}
                  accessibilityLabel="Report this review">
                  <Icon as={FlagIcon} className="text-muted-foreground" size={16} />
                </Button>
              ) : null}
            </View>
          ) : null}
        </View>
      </Card>
    </Animated.View>
  );
}
