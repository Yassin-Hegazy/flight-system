import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersAccess1794031162817 implements MigrationInterface {
  name = 'CreateUsersAccess1794031162817';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "login_attempts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" character varying(320) NOT NULL, "attemptedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_070e613c8f768b1a70742705c5b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c6fb4205b52d7ee369b8225fa9" ON "login_attempts"  ("email", "attemptedAt") `,
    );
    await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('TRAVELER', 'ADMIN')`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" character varying(320) NOT NULL, "passwordHash" character varying(255) NOT NULL, "name" character varying(120) NOT NULL, "phone" character varying(30), "role" "public"."users_role_enum" NOT NULL DEFAULT 'TRAVELER', CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "saved_travelers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "ownerId" uuid NOT NULL, "name" character varying(120) NOT NULL, "dateOfBirth" date NOT NULL, CONSTRAINT "PK_b222dae78add8918179ea3e6943" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_30bc63ac144d8f8e008a08d914" ON "saved_travelers"  ("ownerId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "sessions" ("tokenHash" character varying(64) NOT NULL, "userId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_bace6c68efc156fddac9b14bda2" PRIMARY KEY ("tokenHash"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_57de40bc620f456c7311aa3a1e" ON "sessions"  ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_travelers" ADD CONSTRAINT "FK_30bc63ac144d8f8e008a08d9143" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_travelers" DROP CONSTRAINT "FK_30bc63ac144d8f8e008a08d9143"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_57de40bc620f456c7311aa3a1e"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_30bc63ac144d8f8e008a08d914"`);
    await queryRunner.query(`DROP TABLE "saved_travelers"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c6fb4205b52d7ee369b8225fa9"`);
    await queryRunner.query(`DROP TABLE "login_attempts"`);
  }
}
