import { ScrollView, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Text } from '@/components/ui/text';

/**
 * MOD-3. The written content policy, linked from the review forms and the report
 * sheet. Static prose — the copy is the feature.
 *
 * It exists because anonymity plus the ability to reference specific people is
 * the product's largest risk surface (reporting.md). This is the mitigation, and
 * it ships with v1 rather than after. Do not cut it.
 */
export default function ContentPolicy() {
  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerClassName="gap-6 px-5 py-6">
        <View className="gap-2">
          <Text variant="h3">Reviews are about places, not people</Text>
          <Text variant="muted">
            Spotly is anonymous, and that only works if it stays about the spots.
          </Text>
        </View>

        <View className="gap-2">
          <Text variant="large">The one rule</Text>
          <Text className="leading-6">
            Don&apos;t name or describe identifiable individuals — staff, TAs, or other students.
            Write about the room, the noise, the outlets, the wifi. Not the person at the next
            table or the librarian on the third floor.
          </Text>
        </View>

        <View className="gap-2">
          <Text variant="large">Reviews have no author</Text>
          <Text className="leading-6">
            No name, no handle, no profile is ever attached to a review — not shown to other
            students, and not shown to you on someone else&apos;s. Anonymity is what makes honest
            reviews possible on a campus small enough that everyone is one degree apart. It also
            means a review naming someone can&apos;t be answered or corrected by them, which is
            exactly why the rule above exists.
          </Text>
        </View>

        <View className="gap-2">
          <Text variant="large">Reporting a review</Text>
          <Text className="leading-6">
            Every review has a flag. Tap it, add a reason if you want, and send it. Reports are
            private — no one can see who reported what, and the review stays visible in the
            meantime. Nothing changes on your screen; the report goes to the team.
          </Text>
        </View>

        <View className="gap-2">
          <Text variant="large">What happens next</Text>
          <Text className="leading-6">
            The team reads every report and removes anything that breaks the rule. Removed reviews
            disappear for everyone. There&apos;s no public outcome and no back-and-forth — a
            report is a flag for review, not a vote.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
