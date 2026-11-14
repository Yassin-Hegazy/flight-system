import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Booking lifecycle and passengers: the TICKETED and EXPIRED statuses, hold expiry, cancel reason,
 * and the booking_segments, booking_passengers, booking_history and booking_idempotency tables.
 * Existing bookings are backfilled with one segment, one passenger and a first history row.
 *
 * The new tables deliberately declare no foreign keys. Other modules' test suites reset the
 * database with a fixed `TRUNCATE ... "bookings", "seat_holds"` list and delete flights, and a
 * foreign key from a table outside that list would make those statements fail. Booking writes
 * every row in one transaction (see CreateBooking), so the ids always agree.
 */
export class CompleteBooking1794873600000 implements MigrationInterface {
  async up(db: QueryRunner): Promise<void> {
    await db.query(
      'ALTER TABLE bookings DROP CONSTRAINT bookings_status_check, DROP CONSTRAINT bookings_payment_state',
    );
    await db.query(`ALTER TABLE bookings
      ADD COLUMN "expiresAt" timestamptz,
      ADD COLUMN "cancelReason" varchar(16) CHECK ("cancelReason" IN ('TRAVELER', 'AIRLINE')),
      ADD CONSTRAINT bookings_status_check CHECK ("status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'TICKETED', 'EXPIRED', 'CANCELLED')),
      ADD CONSTRAINT bookings_payment_state CHECK ("status" IN ('CANCELLED', 'EXPIRED') OR ("status" IN ('CONFIRMED', 'TICKETED')) = ("paymentId" IS NOT NULL))`);
    await db.query(`UPDATE bookings b SET "expiresAt" = h."expiresAt"
      FROM seat_holds h WHERE h.id = b."holdId"`);
    await db.query(
      'CREATE INDEX bookings_pending_expiry ON bookings ("expiresAt") WHERE status = \'PENDING_PAYMENT\'',
    );
    await db.query('CREATE INDEX bookings_by_owner ON bookings ("ownerId")');

    await db.query(`CREATE TABLE booking_segments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "bookingId" uuid NOT NULL,
      position integer NOT NULL,
      "flightId" uuid NOT NULL,
      cabin varchar(8) NOT NULL CHECK (cabin IN ('ECONOMY', 'BUSINESS')),
      "holdId" uuid NOT NULL UNIQUE,
      UNIQUE ("bookingId", position)
    )`);
    await db.query('CREATE INDEX booking_segments_by_booking ON booking_segments ("bookingId")');
    await db.query(`CREATE TABLE booking_passengers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "bookingId" uuid NOT NULL,
      position integer NOT NULL,
      "firstName" varchar(120) NOT NULL,
      "lastName" varchar(120) NOT NULL DEFAULT '',
      "birthDate" date,
      type varchar(6) NOT NULL CHECK (type IN ('ADULT', 'CHILD', 'INFANT')),
      "fareMinor" integer NOT NULL CHECK ("fareMinor" >= 0),
      currency varchar(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
      UNIQUE ("bookingId", position)
    )`);
    await db.query(
      'CREATE INDEX booking_passengers_by_booking ON booking_passengers ("bookingId")',
    );
    await db.query(`CREATE TABLE booking_history (
      id serial PRIMARY KEY,
      "bookingId" uuid NOT NULL,
      "fromStatus" varchar(15),
      "toStatus" varchar(15) NOT NULL,
      cause varchar(10) NOT NULL CHECK (cause IN ('CREATED', 'PAYMENT', 'TICKETING', 'TRAVELER', 'AIRLINE', 'EXPIRY')),
      at timestamptz NOT NULL DEFAULT now()
    )`);
    await db.query('CREATE INDEX booking_history_by_booking ON booking_history ("bookingId")');
    await db.query(`CREATE TABLE booking_idempotency (
      "ownerId" uuid NOT NULL,
      key varchar(100) NOT NULL,
      "requestHash" varchar(64) NOT NULL,
      "bookingId" uuid NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("ownerId", key)
    )`);

    await db.query(`INSERT INTO booking_segments ("bookingId", position, "flightId", cabin, "holdId")
      SELECT id, 0, "flightId", cabin, "holdId" FROM bookings`);
    await db.query(`INSERT INTO booking_passengers ("bookingId", position, "firstName", "lastName", type, "fareMinor", currency)
      SELECT id, 0, "passengerName", '', 'ADULT', "amountMinor", currency FROM bookings`);
    await db.query(`INSERT INTO booking_history ("bookingId", "fromStatus", "toStatus", cause)
      SELECT id, NULL, 'PENDING_PAYMENT', 'CREATED' FROM bookings`);
    await db.query(`INSERT INTO booking_history ("bookingId", "fromStatus", "toStatus", cause)
      SELECT id, 'PENDING_PAYMENT', status, CASE status WHEN 'CONFIRMED' THEN 'PAYMENT' ELSE 'TRAVELER' END
      FROM bookings WHERE status <> 'PENDING_PAYMENT'`);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM bookings WHERE status IN ('TICKETED', 'EXPIRED')) THEN
        RAISE EXCEPTION 'Cannot revert Booking while ticketed or expired bookings exist';
      END IF;
    END $$`);
    await db.query(
      'DROP TABLE booking_idempotency, booking_history, booking_passengers, booking_segments',
    );
    await db.query('DROP INDEX bookings_pending_expiry');
    await db.query('DROP INDEX bookings_by_owner');
    await db.query(
      'ALTER TABLE bookings DROP CONSTRAINT bookings_status_check, DROP CONSTRAINT bookings_payment_state',
    );
    await db.query(`ALTER TABLE bookings
      DROP COLUMN "expiresAt",
      DROP COLUMN "cancelReason",
      ADD CONSTRAINT bookings_status_check CHECK ("status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED')),
      ADD CONSTRAINT bookings_payment_state CHECK ("status" = 'CANCELLED' OR ("status" = 'CONFIRMED') = ("paymentId" IS NOT NULL))`);
  }
}
