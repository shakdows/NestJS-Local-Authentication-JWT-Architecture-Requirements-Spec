import { Transform } from 'class-transformer';
import { normalizeEmail } from '../../users/utils/normalize-email.js';

/** Trims + lowercases string emails in the DTO (FR-EMAIL-01). Non-strings are left for validators. */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  );
