/** Helpers for config factories. Values are already validated by `validateEnv`. */

export function envString(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined ? fallback : value;
}

export function envRequired(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function envInt(name: string, fallback: number): number {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : Number.parseInt(value, 10);
}

export function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}
