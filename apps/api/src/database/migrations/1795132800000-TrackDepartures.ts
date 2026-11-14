import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Notifications' own record of ticketed legs (TrackedDepartureEntity), fed by events, so the
 * departure-reminder job reads only this module's data. Starts empty: bookings ticketed before this
 * migration are not reminded, which is acceptable for a reminder.
 */
export class TrackDepartures1795132800000 implements MigrationInterface {
  name = 'TrackDepartures1795132800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tracked_departures" (
        "bookingId" uuid NOT NULL,
        "flightId" uuid NOT NULL,
        "ownerId" uuid NOT NULL,
        "ref" character varying(6) NOT NULL,
        "flightNumber" character varying(6) NOT NULL,
        "departureUtc" TIMESTAMP WITH TIME ZONE NOT NULL,
        "departureTimeZone" character varying(64) NOT NULL,
        "flightStatus" character varying(16) NOT NULL DEFAULT 'SCHEDULED',
        CONSTRAINT "PK_tracked_departures" PRIMARY KEY ("bookingId", "flightId")
      )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_tracked_departures_departure" ON "tracked_departures" ("departureUtc")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tracked_departures"`);
  }
}
