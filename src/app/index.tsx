import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { Text } from '@/components/ui/text';

/**
 * Placeholder root screen. Intentionally the only screen in the project.
 *
 * The real route tree is specified in docs/ARCHITECTURE.md and is not built yet:
 *   (auth)/sign-in, (auth)/callback
 *   (onboarding)/survey, (onboarding)/first-review
 *   (app)/index, (app)/search, (app)/spot/[id], (app)/spot/new,
 *   (app)/review/new, (app)/favorites
 *
 * It renders through the design system rather than raw React Native views, so
 * booting the app is also a smoke test that tokens resolve. See docs/DESIGN.md.
 */
export default function Index() {
  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-2 px-8">
        <Text variant="h3">Spotly</Text>
        <Text variant="muted" className="text-center">
          Baseplate only. No features implemented — see docs/ARCHITECTURE.md for the route tree
          and docs/DESIGN.md for the design system.
        </Text>
      </View>
    </Screen>
  );
}
