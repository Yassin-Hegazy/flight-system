import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Round trips (US-FS-06 AC-3): each segment keeps its own fare snapshot per passenger type, so a
 * ticket on the return leg carries the return fare. One-leg bookings take their passengers' fares.
 */
export class RoundTripSegments1794960000000 implements MigrationInterface {
  async up(db: QueryRunner): Promise<void> {
    await db.query('ALTER TABLE booking_segments ADD COLUMN "unitFares" jsonb');
    await db.query(`UPDATE booking_segments s SET "unitFares" = fares.by_type
      FROM (
        SELECT "bookingId", jsonb_object_agg(type, "fareMinor") AS by_type
        FROM (SELECT DISTINCT "bookingId", type, "fareMinor" FROM booking_passengers) p
        GROUP BY "bookingId"
      ) fares
      WHERE fares."bookingId" = s."bookingId"`);
    await db.query(`UPDATE booking_segments SET "unitFares" = '{}' WHERE "unitFares" IS NULL`);
    await db.query('ALTER TABLE booking_segments ALTER COLUMN "unitFares" SET NOT NULL');
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM booking_segments WHERE position > 0) THEN
        RAISE EXCEPTION 'Cannot revert while round-trip bookings exist';
      END IF;
    END $$`);
    await db.query('ALTER TABLE booking_segments DROP COLUMN "unitFares"');
  }
}
