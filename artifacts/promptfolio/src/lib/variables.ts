import type { PromptVariable } from '@workspace/api-client-react';

/** Variables without an explicit flag are required (legacy behaviour). */
export function isRequired(v: Pick<PromptVariable, 'required'>) {
  return v.required !== false;
}

export type FieldError = 'required' | 'option' | null;

export function fieldError(v: PromptVariable, value: string | undefined): FieldError {
  const val = (value ?? '').trim();
  if (!val) return isRequired(v) ? 'required' : null;
  if (v.options?.length && !v.options.includes(val)) return 'option';
  return null;
}

export function hasDocs(v: PromptVariable) {
  return !!(v.helpText || v.examples?.length || v.options?.length);
}

/** One value per line ⇄ string[] (for the examples/options editors). */
export const linesToList = (text: string) => text.split('\n').map((s) => s.trim()).filter(Boolean);
export const listToLines = (list?: string[] | null) => (list ?? []).join('\n');
