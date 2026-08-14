import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import {
  saveSurveyResponse,
  SURVEY_QUESTIONS,
  type SurveyAnswers,
  type SurveyAnswerValue,
  type SurveyQuestionId,
} from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/utils';

/**
 * ONB-2. Four one-tap questions, one per screen.
 *
 * One at a time rather than a single scrolling form: each answer is a single
 * tap, so a stacked form would be four taps and a submit where four taps will
 * do. It also keeps the progress bar honest — the user can see the whole flow is
 * four questions deep, which is the thing that stops a required survey from
 * feeling open-ended.
 *
 * Answering the last question saves and moves on to the first review (ONB-3),
 * which is the actual gate. The survey unlocks nothing by itself.
 */
export default function Survey() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<SurveyAnswers>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const question = SURVEY_QUESTIONS[step];
  const isLast = step === SURVEY_QUESTIONS.length - 1;
  const selected = answers[question.id];

  function choose(id: SurveyQuestionId, value: SurveyAnswerValue) {
    const next = { ...answers, [id]: value };
    setAnswers(next);

    if (!isLast) {
      setStep(step + 1);
      return;
    }
    void save(next as SurveyAnswers);
  }

  async function save(all: SurveyAnswers) {
    setSaving(true);
    setError('');
    try {
      await saveSurveyResponse(all);
      router.replace('/first-review');
    } catch (cause) {
      setError(errorMessage(cause, "We couldn't save those answers."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen className="px-5">
      <View className="gap-2 pt-4">
        <Progress value={((step + 1) / SURVEY_QUESTIONS.length) * 100} />
        <Text variant="muted">
          Question {step + 1} of {SURVEY_QUESTIONS.length}
        </Text>
      </View>

      <View className="flex-1 justify-center gap-6">
        <View className="gap-2">
          <Text variant="h3">{question.prompt}</Text>
          <Text variant="muted">
            Four quick questions so we know what to show you. No wrong answers.
          </Text>
        </View>

        <View className="gap-3">
          {question.options.map((option) => (
            <Button
              key={String(option.value)}
              // Selected reads back the answer when the user steps backward.
              // `outline` vs `default` is a shape difference, not only a colour
              // one, so it survives greyscale and colour blindness.
              variant={selected === option.value ? 'default' : 'outline'}
              size="lg"
              disabled={saving}
              onPress={() => choose(question.id, option.value)}>
              <Text>{option.label}</Text>
            </Button>
          ))}
        </View>

        {saving ? <Text variant="muted">Saving…</Text> : null}

        {/*
          Inline beside the control that failed, with a retry — not a banner.
          The escape hatch is deliberate: these answers are stored and unused in
          v1 (ONB-6), so a survey that cannot be written must not be able to trap
          someone outside the app. The first review is the gate, not this.
        */}
        {error ? (
          <View className="gap-2">
            <Text variant="small" className="text-destructive">
              {error}
            </Text>
            <Button variant="outline" onPress={() => save(answers as SurveyAnswers)}>
              <Text>Try again</Text>
            </Button>
            <Button variant="ghost" onPress={() => router.replace('/first-review')}>
              <Text>Continue without saving</Text>
            </Button>
          </View>
        ) : null}
      </View>

      <View className="flex-row items-center justify-between pb-2">
        {step > 0 ? (
          <Button variant="ghost" disabled={saving} onPress={() => setStep(step - 1)}>
            <Text>Back</Text>
          </Button>
        ) : (
          // Onboarding is required, but it must not be a room with no door — a
          // wrong address is fixed by signing out and requesting a new link.
          <Button variant="ghost" onPress={() => supabase.auth.signOut()}>
            <Text>Sign out</Text>
          </Button>
        )}
      </View>
    </Screen>
  );
}
