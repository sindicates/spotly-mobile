import { FlagIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { AmenityChips } from '@/components/amenity-chip';
import { OccupancyPill } from '@/components/occupancy-pill';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { AmenityTag } from '@/lib/amenities';
import type { OccupancyReading } from '@/lib/occupancy';
import { cn } from '@/lib/utils';

/**
 * A review with its spot attached. The single most reused surface in the app:
 * the trending feed, search results, and the spot-page carousel are all this
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
 * and there is no prop that could add one (REV-2). Anonymity is what makes blunt
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
  expanded?: boolean;
  /** Tap-to-expand. Debounce `increment_expand` to once per review per session. */
  onToggleExpand?: () => void;
  /** The separate control that navigates. Omit inside the spot page carousel. */
  onOpenSpot?: () => void;
  /** Opens the report sheet. Present on every review card (MOD-1). */
  onReport?: () => void;
  className?: string;
};

export function ReviewCard({
  body,
  areaName,
  building,
  occupancy,
  tags = [],
  reviewCount,
  expanded = false,
  onToggleExpand,
  onOpenSpot,
  onReport,
  className,
}: ReviewCardProps) {
  return (
    <View className={cn('border-border bg-card gap-3 rounded-lg border p-4', className)}>
      <Pressable
        onPress={onToggleExpand}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse review' : 'Expand review'}>
        <Text
          className="text-card-foreground leading-6"
          numberOfLines={expanded ? undefined : 4}>
          {body}
        </Text>
      </Pressable>

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
  );
}
