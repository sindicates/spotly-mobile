/**
 * Onboarding domain rules. See docs/features/onboarding.md.
 *
 * The completion flag is NOT here — it is device-local, in `storage.ts`, read
 * through `useSession`. What lives here is the part that belongs to the server:
 * the four survey questions (ONB-2) and the seeded first-review prompt (ONB-3).
 */

import { supabase } from '@/lib/supabase';

/**
 * ONB-3. The prompt that opens the guided first review.
 *
 * This is the *screen's* question, not the review field's. The review body keeps
 * REV-11's fixed prompt ("What's it good for, and what's the catch?") through
 * `ReviewBodyField` — one review corpus, one question, or the embeddings are
 * answering two different things.
 */
export const FIRST_REVIEW_PROMPT = "What's your go-to study spot?";

export type SurveyQuestionId = 'noise' | 'company' | 'outlet' | 'time_of_day';

/**
 * Booleans are allowed because one question genuinely is one: `outlet` stores
 * true/false, not "yes"/"no". The values below mirror `supabase/seed.sql`
 * exactly — the seed exists so there is one readable example of this JSON, and
 * two shapes in one column is how a future recommender ends up with a bug it
 * cannot see.
 */
export type SurveyAnswerValue = string | boolean;

export type SurveyQuestion = {
  id: SurveyQuestionId;
  prompt: string;
  options: readonly { value: SurveyAnswerValue; label: string }[];
};

/**
 * ONB-2. Four questions, one tap each, in this order.
 *
 * Every question is a closed choice with no free text and no skip. Taste signals
 * are only useful to a recommender if they are comparable across accounts, and
 * an optional question answered by a third of users is noise rather than signal.
 * They are stored and deliberately unused in v1 (ONB-6) — nothing reads this
 * table yet, and nothing should be built on it until recommendations are real.
 */
export const SURVEY_QUESTIONS: readonly SurveyQuestion[] = [
  {
    id: 'noise',
    prompt: 'Silence or background noise?',
    options: [
      { value: 'silence', label: 'Silence' },
      { value: 'background', label: 'Background noise' },
    ],
  },
  {
    id: 'company',
    prompt: 'Alone or people around?',
    options: [
      { value: 'alone', label: 'Alone' },
      { value: 'people', label: 'People around' },
    ],
  },
  {
    id: 'outlet',
    prompt: 'Do you need an outlet?',
    options: [
      { value: true, label: 'Yes' },
      { value: false, label: 'No' },
    ],
  },
  {
    id: 'time_of_day',
    prompt: 'Morning, afternoon, or late night?',
    options: [
      { value: 'morning', label: 'Morning' },
      { value: 'afternoon', label: 'Afternoon' },
      { value: 'late_night', label: 'Late night' },
    ],
  },
];

export type SurveyAnswers = Record<SurveyQuestionId, SurveyAnswerValue>;

/**
 * Stores the survey as one JSONB blob keyed to the account.
 *
 * `user_id` is not sent: the column defaults to `auth.uid()`, so the account id
 * never has to travel through the client to get back to the row it owns.
 *
 * A unique violation means this install is re-running onboarding for an account
 * that already answered — the per-install flag makes that reachable by design
 * (onboarding.md). The first answers are the ones kept, and it is not an error
 * worth showing anyone.
 */
export async function saveSurveyResponse(answers: SurveyAnswers): Promise<void> {
  const { error } = await supabase.from('survey_responses').insert({ answers });
  if (error && error.code !== '23505') throw error;
}
