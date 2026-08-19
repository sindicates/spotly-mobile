import { cn } from '@/lib/utils';
import { View } from 'react-native';

/**
 * `bg-muted`, not `bg-accent`: a placeholder tinted with the brand blue makes
 * loading look like a state the app is proud of. It should recede.
 */
function Skeleton({
  className,
  ...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  return <View className={cn('bg-muted animate-pulse rounded-md', className)} {...props} />;
}

export { Skeleton };
