/**
 * Deletes sessions that ended more than RETENTION_DAYS ago (FR-S-07, AUTH_DATABASE §6).
 * Run with `npm run db:purge-sessions`, e.g. from a daily cron job.
 */
import dataSource from '../data-source.js';

const RETENTION_DAYS = 30;

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    const [, deleted] = (await dataSource.query(
      `DELETE FROM auth_sessions
       WHERE (revoked_at IS NOT NULL AND revoked_at < now() - make_interval(days => $1))
          OR (expires_at < now() - make_interval(days => $1))`,
      [RETENTION_DAYS],
    )) as [unknown, number];
    console.log(
      `Purged ${deleted} ended session(s) older than ${RETENTION_DAYS} days.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
