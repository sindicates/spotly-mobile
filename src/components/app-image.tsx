import { Image } from 'expo-image';
import { cssInterop } from 'nativewind';
import { View } from 'react-native';

import { DUR } from '@/lib/motion';
import { cn } from '@/lib/utils';

// expo-image does not accept `className` on its own. This teaches NativeWind to
// forward it as `style`, and it has to run once at module scope — which is the
// reason this wrapper exists rather than the call sites importing Image
// directly and each registering the interop again.
cssInterop(Image, { className: 'style' });

/**
 * Every photo in the app.
 *
 * Two jobs beyond rendering the image. First, it fades in rather than popping —
 * a photo that appears instantly at full opacity the moment it decodes reads as
 * a page redrawing itself, and the app has a lot of photos arriving over a
 * network. Second, a null source is a muted block of exactly the same shape, so
 * a building with no seeded photo leaves a considered gap rather than a
 * collapsed layout.
 *
 * The empty case is never a stand-in photo of somewhere else (REV-12).
 */

type AppImageProps = {
  /** Null renders the placeholder block. */
  uri: string | null;
  /** Describes the photo, and the placeholder, to a screen reader. */
  accessibilityLabel: string;
  /** Shape and position. Applied to both the photo and the placeholder. */
  className?: string;
};

export function AppImage({ uri, accessibilityLabel, className }: AppImageProps) {
  if (!uri) {
    return <View className={cn('bg-muted', className)} accessibilityLabel={accessibilityLabel} />;
  }

  return (
    <Image
      source={{ uri }}
      className={cn('bg-muted', className)}
      contentFit="cover"
      transition={DUR.short}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
