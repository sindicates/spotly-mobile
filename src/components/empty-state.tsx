import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/**
 * The shape every empty state in Spotly takes.
 *
 * Honest empty states are on the never-cut list alongside occupancy and
 * moderation, for a specific reason: the failure they prevent is a search that
 * returns nothing strong and pads the list with weak matches to look useful
 * (SEARCH-4). An empty state that says so plainly is a working feature; a list of
 * bad results presented as matches is a bug.
 *
 * So `title` states what happened, `description` says why in the user's terms,
 * and `action` offers the next move — usually "add the spot you were after",
 * which turns a dead end into a catalog contribution.
 */

type EmptyStateProps = {
  /** Plain statement of what happened. "Nothing matches that yet." */
  title: string;
  /** Optional detail — the query, active filters, or why the result is empty. */
  description?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  /** Secondary escape hatch, e.g. "Clear filters". */
  secondaryAction?: {
    label: string;
    onPress: () => void;
  };
  className?: string;
};

export function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <View className={cn('items-center gap-3 px-6 py-12', className)}>
      <Text variant="large" className="text-center">
        {title}
      </Text>
      {description ? (
        <Text variant="muted" className="text-center">
          {description}
        </Text>
      ) : null}
      {action || secondaryAction ? (
        <View className="mt-2 w-full gap-2">
          {action ? (
            <Button onPress={action.onPress}>
              <Text>{action.label}</Text>
            </Button>
          ) : null}
          {secondaryAction ? (
            <Button variant="ghost" onPress={secondaryAction.onPress}>
              <Text>{secondaryAction.label}</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
