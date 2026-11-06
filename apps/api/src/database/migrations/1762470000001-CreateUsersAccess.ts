import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersAccess1762470000001 implements MigrationInterface {
  name = 'CreateUsersAccess1762470000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "user_role_enum" AS ENUM ('TRAVELER','ADMIN')`);
    await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" character varying(320) NOT NULL, "passwordHash" character varying(255) NOT NULL, "name" character varying(120) NOT NULL, "phone" character varying(30), "role" "public"."user_role_enum" NOT NULL DEFAULT 'TRAVELER', CONSTRAINT "UQ_users_email" UNIQUE ("email"), CONSTRAINT "PK_users_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tokenHash" character varying(64) NOT NULL, "userId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "UQ_sessions_token" UNIQUE ("tokenHash"), CONSTRAINT "PK_sessions_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "login_attempts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" character varying(320) NOT NULL, "attemptedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_login_attempts_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "saved_travelers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "ownerId" uuid NOT NULL, "name" character varying(120) NOT NULL, "dateOfBirth" date NOT NULL, CONSTRAINT "PK_saved_travelers_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_users_email" ON "users" ("email")`);
    await queryRunner.query(`CREATE INDEX "IDX_sessions_tokenHash" ON "sessions" ("tokenHash")`);
    await queryRunner.query(`CREATE INDEX "IDX_sessions_userId" ON "sessions" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_login_attempts_email" ON "login_attempts" ("email")`);
    await queryRunner.query(`CREATE INDEX "IDX_saved_travelers_ownerId" ON "saved_travelers" ("ownerId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_saved_travelers_ownerId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_login_attempts_email"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_sessions_userId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_sessions_tokenHash"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_users_email"`);
    await queryRunner.query(`DROP TABLE "saved_travelers"`);
    await queryRunner.query(`DROP TABLE "login_attempts"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "user_role_enum"`);
  }
}
