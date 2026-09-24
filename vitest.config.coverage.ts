import { defineConfig } from 'vitest/config';

/**
 * Unit + e2e together, with the coverage thresholds from AUTH_IMPLEMENTATION_PLAN Phase 12
 * (NFR-06). Declarative files (entities, DTOs, enums, types) are excluded because v8 counts
 * decorator metadata as branches.
 */
export default defineConfig({
  test: {
    projects: ['./vitest.config.ts', './vitest.config.e2e.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/database/**',
        'src/**/entities/**',
        'src/**/dto/**',
        'src/**/enums/**',
        'src/**/types/**',
        'src/**/interfaces/**',
      ],
      thresholds: {
        'src/modules/auth/**/*.ts': { lines: 90, branches: 85 },
        'src/modules/users/**/*.ts': { lines: 90, branches: 85 },
      },
    },
  },
});
