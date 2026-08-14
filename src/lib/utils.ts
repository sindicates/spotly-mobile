import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names, last-one-wins on conflicts.
 *
 * `clsx` flattens conditionals and arrays; `twMerge` resolves collisions so a
 * caller's `className` can override a component's default without specificity
 * games (`cn('px-4', 'px-6')` → `px-6`). Every component in src/components
 * takes a `className` prop and runs it through this.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * The message to show a user for a thrown value.
 *
 * Screens render the server's wording rather than a local paraphrase — the
 * `.edu` gate, the word floor, and the check-in rate limit are all enforced in
 * the database, so when the client and the server disagree the server is right
 * and its message is the one that explains why (DESIGN.md → Forms).
 *
 * The fallback covers the genuinely unknown: a network drop, or a rejection that
 * is not an `Error` at all.
 */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}
