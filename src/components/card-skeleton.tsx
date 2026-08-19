import { View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * A card that hasn't arrived yet.
 *
 * It is built on the real `Card` so it inherits the same surface, radius and
 * elevation as the thing it stands in for. The four hand-written versions this
 * replaces were bare grey rectangles with no border and no card background,
 * which meant loading looked like a different app than loaded — the layout
 * jumped the moment data landed.
 *
 * A skeleton should be the shape of the content, not a spinner and not a guess.
 */

type CardSkeletonProps = {
  /** Reserves room for the building photo. Off for rows that have none. */
  photo?: boolean;
  /** Fills the parent instead of sizing to its content — the home deck. */
  fill?: boolean;
  className?: string;
};

export function CardSkeleton({ photo = false, fill = false, className }: CardSkeletonProps) {
  return (
    <Card className={cn(fill && 'flex-1', className)} elevation="resting">
      {photo ? (
        // Clipped here rather than on the Card, which would clip its shadow.
        <View className={cn('rounded-t-card overflow-hidden', fill && 'min-h-0 flex-1')}>
          <View className={cn('bg-muted', fill ? 'min-h-0 flex-1' : 'aspect-video')} />
        </View>
      ) : null}
      <View className="gap-3 p-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
      </View>
    </Card>
  );
}
