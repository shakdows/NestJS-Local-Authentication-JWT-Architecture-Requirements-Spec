const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/** Accepted duration format: a positive integer followed by s, m, h or d (e.g. `15m`, `7d`). */
export const DURATION_PATTERN = /^(\d+)([smhd])$/;

/**
 * Converts a duration string such as `15m` or `7d` into seconds.
 * Throws when the value does not match {@link DURATION_PATTERN} or is zero.
 */
export function parseDurationToSeconds(value: string): number {
  const match = DURATION_PATTERN.exec(value);
  if (!match) {
    throw new Error(
      `Invalid duration "${value}". Expected e.g. 900s, 15m, 1h, 7d`,
    );
  }
  const amount = Number(match[1]);
  if (amount <= 0) {
    throw new Error(`Duration "${value}" must be greater than zero`);
  }
  return amount * UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS];
}
