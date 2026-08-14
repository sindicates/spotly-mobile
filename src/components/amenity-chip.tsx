import { View } from 'react-native';

import { Toggle } from '@/components/ui/toggle';
import { Text } from '@/components/ui/text';
import { AMENITY_TAGS, amenityLabel, type AmenityTag } from '@/lib/amenities';
import { cn } from '@/lib/utils';

/**
 * Amenity tags, in the two forms they take across the app.
 *
 * `AmenityChips` — read-only. Spot detail, review cards, search results. Tags are
 * a property of the place, set once by the first reviewer and locked (AMEN-2), so
 * a display chip is never pressable. If a chip looks tappable, someone will try
 * to edit it and find nothing happens.
 *
 * `AmenityFilterChips` — selectable. The home screen filter row and the add-spot
 * form. Selection is a hard constraint on search, never a ranking hint (AMEN-3):
 * a spot either has the tag or it does not appear. Do not soften this into a
 * "prefer" weighting — "I need an outlet" is a yes/no requirement.
 */

type AmenityChipsProps = {
  tags: readonly AmenityTag[];
  className?: string;
};

export function AmenityChips({ tags, className }: AmenityChipsProps) {
  if (tags.length === 0) return null;

  return (
    <View className={cn('flex-row flex-wrap gap-1.5', className)}>
      {tags.map((tag) => (
        <View key={tag} className="bg-secondary rounded-full px-2.5 py-1">
          <Text className="text-secondary-foreground text-xs font-medium">
            {amenityLabel(tag)}
          </Text>
        </View>
      ))}
    </View>
  );
}

type AmenityFilterChipsProps = {
  selected: readonly AmenityTag[];
  onToggle: (tag: AmenityTag) => void;
  /** Restrict the row to a subset; defaults to all eight. */
  options?: readonly AmenityTag[];
  className?: string;
};

export function AmenityFilterChips({
  selected,
  onToggle,
  options,
  className,
}: AmenityFilterChipsProps) {
  const tags = options ?? AMENITY_TAGS.map((t) => t.value);

  return (
    <View className={cn('flex-row flex-wrap gap-2', className)}>
      {tags.map((tag) => {
        const isSelected = selected.includes(tag);
        return (
          <Toggle
            key={tag}
            pressed={isSelected}
            onPressedChange={() => onToggle(tag)}
            variant="outline"
            size="sm"
            className={cn('rounded-full px-3', isSelected && 'border-primary bg-accent')}>
            <Text className={cn('text-xs font-medium', isSelected && 'text-accent-foreground')}>
              {amenityLabel(tag)}
            </Text>
          </Toggle>
        );
      })}
    </View>
  );
}
