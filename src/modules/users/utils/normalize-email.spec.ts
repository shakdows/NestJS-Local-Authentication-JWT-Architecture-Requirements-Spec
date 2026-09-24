import { normalizeEmail } from './normalize-email.js';

describe('normalizeEmail (FR-EMAIL-01/03)', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });

  it('does not apply provider-specific rewriting', () => {
    expect(normalizeEmail('First.Last+tag@Gmail.com')).toBe('first.last+tag@gmail.com');
  });
});
