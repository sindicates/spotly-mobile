import { CircleSlashIcon, CircleIcon, UsersIcon, UserIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  isFresh,
  NO_RECENT_REPORTS,
  OCCUPANCY_LABELS,
  type OccupancyReading,
  type OccupancyStatus,
} from '@/domain/occupancy';
import { cn } from '@/lib/utils';

/**
 * Read-only occupancy status. Appears on spot detail, search cards, the trending
 * feed, and favourites — always with identical copy and colour.
 *
 * The whole component is built around one rule (OCC-4): with no live reading it
 * renders "No recent reports" in muted grey. Not a last-known status, not a
 * "last seen 3h ago" badge, not a dimmed version of the previous colour. Grey is
 * the point — it reads as absence of data rather than as a fourth status.
 *
 * The only input is a reading or `null`. There is no `lastKnown` prop and no
 * `showStale` escape hatch, because the moment one exists someone will use it.
 */

const STATUS_STYLES: Record<OccupancyStatus, { pill: string; text: string }> = {
  empty: { pill: 'bg-occupancy-empty-surface', text: 'text-occupancy-empty' },
  some_seats: { pill: 'bg-occupancy-some-surface', text: 'text-occupancy-some' },
  packed: { pill: 'bg-occupancy-packed-surface', text: 'text-occupancy-packed' },
};

const STATUS_ICONS = {
  empty: CircleIcon,
  some_seats: UserIcon,
  packed: UsersIcon,
} as const;

type OccupancyPillProps = {
  reading: OccupancyReading;
  /** `sm` for list rows and cards, `default` for the spot page. */
  size?: 'sm' | 'default';
  className?: string;
};

export function OccupancyPill({ reading, size = 'default', className }: OccupancyPillProps) {
  const live = isFresh(reading) ? reading : null;
  const styles = live ? STATUS_STYLES[live.status] : null;

  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5 self-start rounded-full',
        size === 'sm' ? 'px-2 py-1' : 'px-3 py-1.5',
        styles?.pill ?? 'bg-muted',
        className
      )}
      accessibilityRole="text"
      accessibilityLabel={live ? `Occupancy: ${OCCUPANCY_LABELS[live.status]}` : NO_RECENT_REPORTS}>
      <Icon
        as={live ? STATUS_ICONS[live.status] : CircleSlashIcon}
        size={size === 'sm' ? 12 : 14}
        className={styles?.text ?? 'text-muted-foreground'}
      />
      <Text
        className={cn(
          'font-medium',
          size === 'sm' ? 'text-xs' : 'text-sm',
          styles?.text ?? 'text-muted-foreground'
        )}>
        {live ? OCCUPANCY_LABELS[live.status] : NO_RECENT_REPORTS}
      </Text>
    </View>
  );
}
