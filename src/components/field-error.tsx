import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/**
 * The message under a form field. One component so the treatment — `small`,
 * `text-destructive`, rendered only when there is something to say — is decided
 * once and cannot be reworded per screen (DESIGN.md → Forms).
 *
 * Renders nothing for a null/empty message, so a caller can pass a possibly-empty
 * value straight through without guarding it:
 *
 *   <FieldError error={serverError || (email.showError ? email.error : null)} />
 */
type FieldErrorProps = {
  error?: string | null;
  className?: string;
};

export function FieldError({ error, className }: FieldErrorProps) {
  if (!error) return null;
  return (
    <Text variant="small" className={cn('text-destructive', className)}>
      {error}
    </Text>
  );
}
