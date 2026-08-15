import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { ReviewBodyField } from '@/components/review-body-field';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { error as hapticError, success, warning } from '@/lib/haptics';
import { createReview, isDuplicateReviewError, meetsWordFloor } from '@/lib/reviews';
import { errorMessage } from '@/lib/utils';

/**
 * REV-1. Adds a review to a spot that already exists — body only.
 *
 * Building, spot, and amenity tags are already fixed by the spot, so this form is
 * just the prompt and the word floor (`ReviewBodyField`, REV-10/REV-11). It is
 * only reachable when `is_mine` is false on the target spot; if the guard is
 * somehow raced, the duplicate is caught and read as "you already reviewed this"
 * rather than an error, because that is what it means.
 */
export default function AddReview() {
  const { spotId, spotName } = useLocalSearchParams<{ spotId: string; spotName?: string }>();

  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = meetsWordFloor(body) && !submitting;

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      await createReview(spotId, body);
      success();
      // Back to the spot page, which refetches on focus and shows the new card.
      router.back();
    } catch (cause) {
      if (isDuplicateReviewError(cause)) {
        warning();
        setError('You have already reviewed this spot.');
        return;
      }
      hapticError();
      setError(errorMessage(cause, "We couldn't post that review."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-6 px-5 pb-10 pt-4"
          keyboardShouldPersistTaps="handled">
          {spotName ? (
            <View className="gap-1">
              <Text variant="muted">Reviewing</Text>
              <Text variant="h3">{spotName}</Text>
            </View>
          ) : null}

          <ReviewBodyField value={body} onChangeText={setBody} />

          {/* MOD-3: the content policy is one tap from the review form. */}
          <Button
            variant="link"
            size="sm"
            className="self-start px-0"
            onPress={() => router.push('/content-policy')}>
            <Text>Read the content policy</Text>
          </Button>

          {error ? (
            <Text variant="small" className="text-destructive">
              {error}
            </Text>
          ) : null}

          <Button onPress={submit} disabled={!canSubmit}>
            <Text>{submitting ? 'Posting…' : 'Post review'}</Text>
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
