import { Text, View } from 'react-native';

/**
 * Placeholder root screen. Intentionally the only screen in the project.
 *
 * The real route tree is specified in the PRD (§13.7) and is not built yet:
 *   (auth)/sign-in, (auth)/callback
 *   (onboarding)/survey, (onboarding)/first-review
 *   (app)/index, (app)/search, (app)/spot/[id], (app)/spot/new,
 *   (app)/review/new, (app)/favorites
 */
export default function Index() {
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-white px-8">
      <Text className="text-3xl font-semibold text-neutral-900">Spotly</Text>
      <Text className="text-center text-sm text-neutral-500">
        Baseplate only. No features implemented — see docs/SPEC.md §13.13 for build order.
      </Text>
    </View>
  );
}
