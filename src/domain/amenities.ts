/**
 * The eight amenity tags. See docs/features/amenity-tags.md.
 *
 * All eight are one type, so filtering is a single operation and the multi-select
 * stays uniform. Quiet and lively are opposing tags rather than a scale — a spot
 * can carry neither, and nothing in the UI should imply a slider between them.
 *
 * Tags are set once by the first reviewer and then locked (AMEN-2). There is no
 * edit surface, which is why `AmenityChip` has no editing state: the only screen
 * that ever writes tags is the add-spot form.
 */

import type { Database } from '@/lib/database.types';

/** The `amenity_tag` enum, derived from the schema rather than copied from it. */
export type AmenityTag = Database['public']['Enums']['amenity_tag'];

/**
 * Display labels for all eight tags.
 *
 * `Record<AmenityTag, string>` rather than an array of pairs, so adding a ninth
 * tag to the enum and regenerating breaks this line until someone writes its
 * label. An array would silently render the new tag nowhere.
 */
const AMENITY_LABELS: Record<AmenityTag, string> = {
  outlets: 'Outlets',
  quiet: 'Quiet',
  lively: 'Lively',
  group_tables: 'Group tables',
  natural_light: 'Natural light',
  food_nearby: 'Food nearby',
  whiteboards: 'Whiteboards',
  open_late: 'Open late',
};

/**
 * Display order for the multi-select and the home filter chips.
 *
 * Quiet and lively sit adjacent deliberately — seeing them side by side is what
 * communicates that they are opposing choices rather than points on a scale.
 */
const AMENITY_ORDER: readonly AmenityTag[] = [
  'outlets',
  'quiet',
  'lively',
  'group_tables',
  'natural_light',
  'food_nearby',
  'whiteboards',
  'open_late',
];

/** The eight tags in display order, each with its label. */
export const AMENITY_TAGS: readonly { value: AmenityTag; label: string }[] = AMENITY_ORDER.map(
  (value) => ({ value, label: AMENITY_LABELS[value] })
);

export function amenityLabel(tag: AmenityTag): string {
  return AMENITY_LABELS[tag];
}
