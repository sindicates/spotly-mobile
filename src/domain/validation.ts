/**
 * Text-field validation. See docs/infra/input-validation.md.
 *
 * A validator is a pure `(value) => error | null` function. That is the whole
 * contract: no classes, no schema object, no async. Validators compose with
 * `firstError`, and a field wires them up through `useField`. This stays small on
 * purpose, the same way `useAsync` does — it covers the one thing hand-rolled
 * field checks get wrong (when to show the message) without pretending to be a
 * form library.
 *
 * **Client validation is an affordance, not a gate** (DESIGN.md → Forms). The
 * `.edu` rule, the 15-word floor, and the check-in rate limit are all enforced in
 * the database; these functions only produce the message a person reads before
 * the round trip, and the server's message wins when the two disagree. Nothing
 * here is a security boundary — it is copy that happens to be computed.
 *
 * Convention: **format validators skip an empty value** (return null). Emptiness
 * is `required`'s job alone, so a field that is optional-but-constrained — an
 * empty box is fine, a filled one must be an email — is just `[caseEmail()]` with
 * no special-casing at the call site.
 */

import { countWords } from '@/lib/reviews';

/** Returns an error message to show, or null when the value passes. */
export type Validator = (value: string) => string | null;

/** Runs validators in order, returning the first message — so order is priority. */
export function firstError(value: string, validators: readonly Validator[]): string | null {
  for (const validate of validators) {
    const message = validate(value);
    if (message) return message;
  }
  return null;
}

const isBlank = (value: string): boolean => value.trim().length === 0;

/** The only validator that fires on an empty value. */
export function required(message = 'This can’t be empty.'): Validator {
  return (value) => (isBlank(value) ? message : null);
}

export function minLength(min: number, message?: string): Validator {
  return (value) =>
    isBlank(value) || value.trim().length >= min
      ? null
      : (message ?? `Use at least ${min} characters.`);
}

export function maxLength(max: number, message?: string): Validator {
  // Counts the raw value, not trimmed: a limit is about what was typed.
  return (value) => (value.length <= max ? null : (message ?? `Keep it under ${max} characters.`));
}

/**
 * REV-10's word floor as a validator. Counts with `countWords` so it agrees with
 * the live counter, the review write path, and the database check constraint
 * rather than becoming a fourth, drifting definition of "a word".
 *
 * The default message counts *up* to the floor and never scolds — it says how
 * many words are still needed, matching `ReviewBodyField`.
 */
export function minWords(min: number, message?: string): Validator {
  return (value) => {
    if (isBlank(value)) return null;
    const words = countWords(value);
    if (words >= min) return null;
    const remaining = min - words;
    return message ?? `${remaining} more ${remaining === 1 ? 'word' : 'words'} to go.`;
  };
}

/** A regex constraint. Skips empty; tests the trimmed value. */
export function pattern(re: RegExp, message: string): Validator {
  return (value) => (isBlank(value) || re.test(value.trim()) ? null : message);
}

/**
 * AUTH-1. The one canonical `case.edu` test.
 *
 * `case.edu`, not any `.edu`: the wireframe says `.edu` but authentication.md
 * resolved it to `case.edu` to match the "CWRU only" claim, and the feature doc
 * wins. This is the affordance — the real gate is `before_user_created_hook` on
 * `auth.users`, because anyone can post to the auth endpoint without touching the
 * form. Loosening this regex does not loosen the rule; it only produces a worse
 * error later.
 */
export const CASE_EMAIL_RE = /^[^@\s]+@case\.edu$/i;

export function caseEmail(
  message = 'That needs to be a case.edu address. Spotly is CWRU students only.'
): Validator {
  return pattern(CASE_EMAIL_RE, message);
}
