import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/**
 * A read that failed, and the way back.
 *
 * The sibling of `EmptyState`, and the distinction matters: empty means the
 * query worked and there was nothing there, error means we do not know. They
 * had drifted into six hand-written variants across five screens, in two
 * different paddings, which is how "we could not load this" ends up meaning
 * something slightly different on every screen.
 *
 * Errors stay inline next to the thing that failed rather than becoming a
 * banner at the top of the app, and they always carry the retry — a dead end
 * with no way out is not a state, it is a bug.
 */

type ErrorStateProps = {
  /** What the user sees. Falls back to a neutral line when a cause has no message. */
  message: string;
  onRetry: () => void;
  /** "Try again" unless the retry does something more specific. */
  retryLabel?: string;
  /**
   * Set when the error owns the whole screen rather than one section of it, so
   * it centres in the space instead of sitting where the content would start.
   */
  fill?: boolean;
  className?: string;
};

export function ErrorState({
  message,
  onRetry,
  retryLabel = 'Try again',
  fill = false,
  className,
}: ErrorStateProps) {
  return (
    <View
      className={cn(
        'items-center gap-3 px-6',
        fill ? 'flex-1 justify-center' : 'py-12',
        className,
      )}>
      <Text variant="muted" className="text-center">
        {message}
      </Text>
      <Button variant="outline" size="sm" onPress={onRetry}>
        <Text>{retryLabel}</Text>
      </Button>
    </View>
  );
}
