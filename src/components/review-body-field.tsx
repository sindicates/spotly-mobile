import { View } from 'react-native';

import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { countWords, REVIEW_PROMPT, REVIEW_WORD_FLOOR } from '@/domain/reviews';
import { cn } from '@/lib/utils';

/**
 * The review body field, with its prompt and live word counter.
 *
 * Used on three screens — add review, add spot, and the onboarding first review —
 * which is exactly why it is one component. The prompt (REV-11) and the 15-word
 * floor (REV-10) have to be identical everywhere, and three hand-written copies
 * drift within a week.
 *
 * The counter counts up to the floor and then goes quiet. It never scolds: below
 * the floor it says how many words are still needed, above it says nothing at
 * all. The submit button is the thing that stays disabled.
 */

type ReviewBodyFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  /** Overrides the standard prompt. Only onboarding has a reason to. */
  label?: string;
  placeholder?: string;
  className?: string;
};

export function ReviewBodyField({
  value,
  onChangeText,
  label = REVIEW_PROMPT,
  placeholder = 'Be specific — the detail is what makes it searchable.',
  className,
}: ReviewBodyFieldProps) {
  const words = countWords(value);
  const remaining = REVIEW_WORD_FLOOR - words;

  return (
    <View className={cn('gap-2', className)}>
      <Label nativeID="review-body">{label}</Label>
      <Textarea
        aria-labelledby="review-body"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        textAlignVertical="top"
      />
      <Text variant="small" className="text-muted-foreground">
        {remaining > 0
          ? `${remaining} more ${remaining === 1 ? 'word' : 'words'}`
          : `${words} words`}
      </Text>
    </View>
  );
}
