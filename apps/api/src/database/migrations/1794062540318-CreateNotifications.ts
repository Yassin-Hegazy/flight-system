import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotifications1794062540318 implements MigrationInterface {
  name = 'CreateNotifications1794062540318';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "userId" uuid NOT NULL, "eventId" character varying(100) NOT NULL, "type" character varying(40) NOT NULL, "title" character varying(200) NOT NULL, "body" text NOT NULL, "link" character varying(300), "readAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "UQ_notifications_event_user" UNIQUE ("eventId", "userId"), CONSTRAINT "PK_notifications" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_created" ON "notifications"  ("userId", "createdAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_user_created"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
