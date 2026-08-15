import type { Edge } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cn } from '@/lib/utils';

/**
 * The outer container every route renders into.
 *
 * Exists so background colour and safe-area handling are decided once. Screens
 * that set their own `bg-white` are the reason dark mode breaks in patches, and
 * screens that hand-roll insets are the reason a header sits under the notch on
 * one device and not another.
 *
 * `edges` defaults to top and bottom. Drop `bottom` on screens with a pinned
 * action bar that should run to the edge, and drop `top` under a navigation
 * header that already handles the inset.
 *
 * The three tab screens drop `bottom` for a third reason: the native tab bar
 * already sits in that inset and insets its own content — iOS adjusts the first
 * nested scroll view, Android wraps the screen. Adding the inset here as well
 * pads the list twice and leaves a dead band above the bar.
 */

type ScreenProps = {
  children: React.ReactNode;
  edges?: readonly Edge[];
  className?: string;
};

export function Screen({ children, edges = ['top', 'bottom'], className }: ScreenProps) {
  return (
    <SafeAreaView edges={edges} className={cn('bg-background flex-1', className)}>
      {children}
    </SafeAreaView>
  );
}
