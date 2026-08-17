import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { CHECK_IN_OPTIONS, OCCUPANCY_LABELS, type OccupancyStatus } from '@/domain/occupancy';
import { cn } from '@/lib/utils';

/**
 * The three check-in buttons. Lives on the spot page only — search cards and
 * favourites show the pill without this control.
 *
 * Two-tap check-in (OCC-1): one tap to open the spot, one to report. No
 * confirmation step, no "are you sure", no geolocation gate (OCC-5). The friction
 * budget for this interaction is essentially zero, because it is the feature the
 * whole product hangs on and people report from a table, one-handed.
 *
 * Rate limiting (OCC-6) is enforced by a database trigger, not here. The trigger
 * raises `rate_limited` with a hint, and this component renders whatever message
 * the caller passes back in `error` — client-side blocking would drift from the
 * server rule and produce two different truths.
 */

type CheckInControlProps = {
  onCheckIn: (status: OccupancyStatus) => void;
  /** Disables all three while a report is in flight. */
  pending?: boolean;
  /** Which button is mid-flight, for the pressed-state affordance. */
  pendingStatus?: OccupancyStatus | null;
  /** Server-supplied message, e.g. the rate-limit hint. */
  error?: string | null;
  className?: string;
};

export function CheckInControl({
  onCheckIn,
  pending = false,
  pendingStatus = null,
  error = null,
  className,
}: CheckInControlProps) {
  return (
    <View className={cn('gap-2', className)}>
      <Text variant="small" className="text-muted-foreground">
        How full is it right now?
      </Text>
      <View className="flex-row gap-2">
        {CHECK_IN_OPTIONS.map((status) => (
          <Button
            key={status}
            variant={pendingStatus === status ? 'secondary' : 'outline'}
            size="sm"
            className="flex-1"
            disabled={pending}
            onPress={() => onCheckIn(status)}>
            <Text>{OCCUPANCY_LABELS[status]}</Text>
          </Button>
        ))}
      </View>
      {error ? (
        <Text variant="small" className="text-muted-foreground">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
