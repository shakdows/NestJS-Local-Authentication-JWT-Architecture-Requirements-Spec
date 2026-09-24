/** FR-EMAIL-01: trim + lowercase. No provider-specific rewriting (FR-EMAIL-03). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
