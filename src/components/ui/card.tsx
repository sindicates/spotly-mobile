import { useColorScheme } from 'nativewind';
import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';

import { ELEVATION, type ElevationLevel } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * Every raised surface in the app.
 *
 * Before this existed the recipe `border-border bg-card rounded-lg border p-4`
 * was written out in eight places, which meant elevation could not be added
 * anywhere without being added eight times. It is one component now so that the
 * app's sense of depth is a single decision.
 *
 * Elevation is a prop rather than a class because it is two different things on
 * two platforms — an iOS shadow and an Android `elevation` number — and neither
 * of them exists at all in dark mode, where depth comes from `--card` sitting
 * lighter than `--background` instead. See ELEVATION in src/lib/theme.ts.
 *
 * The border is `hairline`, a true one-device-pixel line. A plain `border` is
 * heavier than the design intends on a 3× screen.
 *
 * Do not put `overflow-hidden` on a Card. iOS draws the shadow outside the
 * view's bounds, so clipping the view clips the shadow off with it. Clip the
 * child that actually needs it — see the photo wrapper in review-card.tsx.
 */

type CardProps = Omit<ViewProps, 'onLayout'> &
  Pick<PressableProps, 'onLayout' | 'accessibilityRole' | 'accessibilityLabel'> & {
    /**
     * Makes the whole card the control. Rows that open something are cards you
     * press, and wrapping a Pressable in a View instead means the press target
     * and the surface disagree about where their edges are.
     */
    onPress?: () => void;
    /**
     * How far off the page this surface sits.
     *
     * - `flat` — inside something that is already raised. A row in a list, a
     *   panel inside a form. Two shadows nested is how a card starts looking
     *   like a sticker.
     * - `resting` — the default. A card in a scrolling list.
     * - `lifted` — floating over other content: the front card of the deck, the
     *   toast, the legend over the map.
     * - `dragged` — under the user's finger. Only the deck uses this, and it
     *   animates rather than sets it.
     */
    elevation?: ElevationLevel;
    className?: string;
  };

export function Card({ elevation = 'resting', onPress, className, style, ...props }: CardProps) {
  const { colorScheme } = useColorScheme();
  // Read the scheme here rather than at module scope: a style object built once
  // does not re-read itself when the system flips to dark.
  const shadow = ELEVATION[colorScheme ?? 'light'][elevation];
  const Component = onPress ? Pressable : View;

  return (
    <Component
      onPress={onPress}
      style={[shadow, style]}
      className={cn(
        'border-border bg-card rounded-card border-hairline',
        onPress && 'active:bg-accent',
        className,
      )}
      {...props}
    />
  );
}
