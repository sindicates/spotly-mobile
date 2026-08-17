import { Image } from 'expo-image';
import { FlagIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

cssInterop(Image, { className: 'style' });

import { AmenityChips } from '@/components/amenity-chip';
import { OccupancyPill } from '@/components/occupancy-pill';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { AmenityTag } from '@/domain/amenities';
import { selection } from '@/lib/haptics';
import type { OccupancyReading } from '@/domain/occupancy';
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
}: ReviewCardProps) {
  return (
    <View
      style={style}
      className={cn(
        'border-border bg-card overflow-hidden rounded-lg border',
        fill && 'flex-1',
        className
      )}>
      {showSpotContext ? (
        imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            className={cn('bg-muted w-full', fill ? 'min-h-0 flex-1' : 'aspect-video')}
            contentFit="cover"
            accessibilityLabel={`${building} exterior`}
          />
        ) : (
          <View
            className={cn('bg-muted w-full', fill ? 'min-h-0 flex-1' : 'aspect-video')}
            accessibilityLabel={`${building}, no photo`}
          />
        )
      ) : null}

      <View className="gap-3 p-4">
        <Pressable
          onPress={() => {
            if (!onToggleExpand) return;
            selection();
            onToggleExpand();
          }}
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
          <View className="flex-row items-center justify-between">
            {onOpenSpot ? (
              <Button variant="link" size="sm" className="px-0" onPress={onOpenSpot}>
                <Text>Open spot</Text>
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
    </View>
  );
}
