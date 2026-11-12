import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationPrefs1794062540319 implements MigrationInterface {
  name = 'CreateNotificationPrefs1794062540319';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notification_prefs" ("userId" uuid NOT NULL, "type" character varying(40) NOT NULL, "email" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_notification_prefs" PRIMARY KEY ("userId", "type"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notification_prefs"`);
  }
}
