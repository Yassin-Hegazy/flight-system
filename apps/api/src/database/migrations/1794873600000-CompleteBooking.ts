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
    // Paid bookings went through CONFIRMED; ticketed ones then through TICKETED.
    await db.query(`INSERT INTO booking_history ("bookingId", "fromStatus", "toStatus", cause)
      SELECT id, 'PENDING_PAYMENT', 'CONFIRMED', 'PAYMENT'
      FROM bookings WHERE status IN ('CONFIRMED', 'TICKETED') OR "paymentId" IS NOT NULL`);
    await db.query(`INSERT INTO booking_history ("bookingId", "fromStatus", "toStatus", cause)
      SELECT b.id, 'CONFIRMED', 'TICKETED', 'TICKETING' FROM bookings b
      WHERE b.status = 'TICKETED'
        OR (b.status = 'CANCELLED' AND EXISTS (SELECT 1 FROM tickets t WHERE t."bookingId" = b.id))`);
    await db.query(`INSERT INTO booking_history ("bookingId", "fromStatus", "toStatus", cause)
      SELECT b.id,
        CASE
          WHEN EXISTS (SELECT 1 FROM tickets t WHERE t."bookingId" = b.id) THEN 'TICKETED'
          WHEN b."paymentId" IS NOT NULL THEN 'CONFIRMED'
          ELSE 'PENDING_PAYMENT'
        END,
        'CANCELLED', 'TRAVELER'
      FROM bookings b WHERE b.status = 'CANCELLED'`);
    // Tickets issued before this migration named the booking as their passenger and the flight
    // as their segment; point them at the passenger and segment rows backfilled above.
    await db.query(`UPDATE tickets t SET "passengerId" = p.id::text, "segmentId" = s.id::text
      FROM booking_passengers p, booking_segments s
      WHERE p."bookingId" = t."bookingId" AND s."bookingId" = t."bookingId"
        AND t."passengerId" = t."bookingId"::text`);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM bookings WHERE status = 'EXPIRED') THEN
        RAISE EXCEPTION 'Cannot revert Booking while expired bookings exist';
      END IF;
      -- The earlier schema holds one passenger on one flight per booking.
      IF EXISTS (SELECT 1 FROM booking_passengers WHERE position > 0)
        OR EXISTS (SELECT 1 FROM booking_segments WHERE position > 0) THEN
        RAISE EXCEPTION 'Cannot revert Booking while bookings have several passengers or flights';
      END IF;
    END $$`);
    await db.query(
      `UPDATE tickets t SET "passengerId" = t."bookingId"::text, "segmentId" = t."flightId"::text`,
    );
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
      ADD CONSTRAINT bookings_status_check CHECK ("status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'TICKETED', 'CANCELLED')),
      ADD CONSTRAINT bookings_payment_state CHECK ("status" = 'CANCELLED' OR ("status" IN ('CONFIRMED', 'TICKETED')) = ("paymentId" IS NOT NULL))`);
  }
}
