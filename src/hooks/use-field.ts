/**
 * A single text field's state: its value, and — the part worth centralising —
 * *when* its error is allowed to show. See docs/infra/input-validation.md.
 *
 * The timing is the rule (DESIGN.md → Forms): a message appears after a blur or a
 * submit attempt, never on the keystroke that is still being typed. Telling
 * someone their half-typed address is wrong is noise; leaving a stale error under
 * a field they just corrected is worse. So editing hides the error and the next
 * blur (or a `revealErrors()` from the submit handler) brings it back.
 *
 * Errors are computed every render from the validators — there is no second copy
 * of the error to keep in sync. Only *visibility* is state.
 *
 * Multi-field forms compose one `useField` per field; the submit handler checks
 * each `isValid` and calls `revealErrors()` on the ones that fail. There is no
 * `useForm` aggregate, for the same reason there is no cache in `useAsync`: it
 * would be more machinery than the screens need.
 */

import { useCallback, useState } from 'react';

import { firstError, type Validator } from '@/lib/validation';

export type Field = {
  value: string;
  /** Spread onto the Input alongside `onBlur`. Hides the error while typing. */
  onChangeText: (next: string) => void;
  onBlur: () => void;
  /** The current message, regardless of whether it is being shown. */
  error: string | null;
  /** Whether to render the error now — blur/submit-timed. Drives `FieldError`. */
  showError: boolean;
  /** No validator is failing. What the submit button's `disabled` reads. */
  isValid: boolean;
  /** Force the error visible — call from the submit handler on an invalid field. */
  revealErrors: () => void;
  /** Back to pristine, e.g. after a successful submit. */
  reset: (value?: string) => void;
};

type UseFieldOptions = {
  initialValue?: string;
  validators?: readonly Validator[];
};

export function useField({ initialValue = '', validators = [] }: UseFieldOptions = {}): Field {
  const [value, setValue] = useState(initialValue);
  // Blurred-or-submitted. The only reason error visibility is state at all.
  const [touched, setTouched] = useState(false);

  // Cheap and pure, so recompute rather than memoise — a memo keyed on an inline
  // `validators` array would recompute every render anyway.
  const error = firstError(value, validators);

  const onChangeText = useCallback((next: string) => {
    setValue(next);
    setTouched(false);
  }, []);

  return {
    value,
    onChangeText,
    onBlur: useCallback(() => setTouched(true), []),
    error,
    showError: touched && error !== null,
    isValid: error === null,
    revealErrors: useCallback(() => setTouched(true), []),
    reset: useCallback((next = '') => {
      setValue(next);
      setTouched(false);
    }, []),
  };
}
