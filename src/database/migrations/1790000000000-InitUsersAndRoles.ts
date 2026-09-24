import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 2: `users`, `user_roles` and their enum types (AUTH_DATABASE §2, §3.1–3.2). */
export class InitUsersAndRoles1790000000000 implements MigrationInterface {
  name = 'InitUsersAndRoles1790000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION')`,
    );
    await queryRunner.query(
      `CREATE TYPE "user_role" AS ENUM ('USER', 'ADMIN')`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar(254) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
        "last_login_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_email" UNIQUE ("email"),
        CONSTRAINT "ck_users_email_lowercase" CHECK ("email" = lower("email"))
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_users_status" ON "users" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "user_id" uuid NOT NULL,
        "role" "user_role" NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_user_roles" PRIMARY KEY ("user_id", "role"),
        CONSTRAINT "fk_user_roles_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_user_roles_role" ON "user_roles" ("role")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_user_roles_role"`);
    await queryRunner.query(`DROP TABLE "user_roles"`);
    await queryRunner.query(`DROP INDEX "idx_users_status"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "user_role"`);
    await queryRunner.query(`DROP TYPE "user_status"`);
  }
}
