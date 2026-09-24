import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 8: `auth_sessions` and `session_revoked_reason` (AUTH_DATABASE §2, §3.3). */
export class CreateAuthSessions1790000000001 implements MigrationInterface {
  name = 'CreateAuthSessions1790000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "session_revoked_reason" AS ENUM ('LOGOUT', 'LOGOUT_ALL', 'LOGOUT_OTHERS', 'REUSE_DETECTED', 'USER_NOT_ACTIVE', 'ADMIN_REVOKED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "refresh_token_hash" char(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz NULL,
        "revoked_reason" "session_revoked_reason" NULL,
        "last_used_at" timestamptz NULL,
        "ip_address" varchar(45) NULL,
        "user_agent" varchar(512) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_auth_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_auth_sessions_refresh_token_hash" UNIQUE ("refresh_token_hash"),
        CONSTRAINT "ck_auth_sessions_revocation" CHECK (("revoked_at" IS NULL) = ("revoked_reason" IS NULL)),
        CONSTRAINT "fk_auth_sessions_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_auth_sessions_user_active" ON "auth_sessions" ("user_id") WHERE "revoked_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_auth_sessions_expires_at" ON "auth_sessions" ("expires_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_auth_sessions_expires_at"`);
    await queryRunner.query(`DROP INDEX "idx_auth_sessions_user_active"`);
    await queryRunner.query(`DROP TABLE "auth_sessions"`);
    await queryRunner.query(`DROP TYPE "session_revoked_reason"`);
  }
}
