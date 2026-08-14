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
