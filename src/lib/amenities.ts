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

/** Mirrors the `amenity_tag` enum. Keep in sync with the migration. */
export type AmenityTag =
  | 'outlets'
  | 'quiet'
  | 'lively'
  | 'group_tables'
  | 'natural_light'
  | 'food_nearby'
  | 'whiteboards'
  | 'open_late';

export const AMENITY_TAGS: readonly { value: AmenityTag; label: string }[] = [
  { value: 'outlets', label: 'Outlets' },
  { value: 'quiet', label: 'Quiet' },
  { value: 'lively', label: 'Lively' },
  { value: 'group_tables', label: 'Group tables' },
  { value: 'natural_light', label: 'Natural light' },
  { value: 'food_nearby', label: 'Food nearby' },
  { value: 'whiteboards', label: 'Whiteboards' },
  { value: 'open_late', label: 'Open late' },
];

const LABELS = Object.fromEntries(AMENITY_TAGS.map((t) => [t.value, t.label])) as Record<
  AmenityTag,
  string
>;

export function amenityLabel(tag: AmenityTag): string {
  return LABELS[tag];
}
