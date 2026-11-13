import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the Administration shim's one-UUID-ticket-per-booking table with the Ticketing pack's:
 * 13-digit numbers from a sequence, one ticket per (booking, passenger, segment), VALID or VOID.
 * Bookings gain TICKETED. Existing shim tickets keep their status under new numbers.
 */
export class CompleteTicketing1794787200000 implements MigrationInterface {
  async up(db: QueryRunner): Promise<void> {
    await db.query(`ALTER TABLE bookings
      DROP CONSTRAINT bookings_status_check, DROP CONSTRAINT bookings_payment_state`);
    await db.query(`ALTER TABLE bookings
      ADD CONSTRAINT bookings_status_check
        CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'TICKETED', 'CANCELLED')),
      ADD CONSTRAINT bookings_payment_state
        CHECK (status = 'CANCELLED' OR (status IN ('CONFIRMED', 'TICKETED')) = ("paymentId" IS NOT NULL))`);

    await db.query('CREATE TEMPORARY TABLE shim_tickets ON COMMIT DROP AS SELECT * FROM tickets');
    await db.query('DROP TABLE tickets');
    // A sequence never hands out a number twice, even after a rollback (US-TK-03 AC-2).
    await db.query('CREATE SEQUENCE ticket_number_seq');
    await db.query(`CREATE TABLE tickets (
      number char(13) PRIMARY KEY CHECK (number ~ '^[0-9]{13}$'),
      "bookingId" uuid NOT NULL REFERENCES bookings(id),
      "passengerId" varchar(64) NOT NULL,
      "passengerName" varchar(120) NOT NULL,
      "segmentId" varchar(64) NOT NULL,
      "flightId" uuid NOT NULL,
      cabin varchar(8) NOT NULL,
      "fareMinor" integer NOT NULL CHECK ("fareMinor" >= 0),
      currency char(3) NOT NULL,
      status varchar(5) NOT NULL CHECK (status IN ('VALID', 'VOID')),
      "issuedAt" timestamptz NOT NULL,
      "voidedAt" timestamptz,
      CONSTRAINT tickets_one_per_passenger_segment UNIQUE ("bookingId", "passengerId", "segmentId"),
      CONSTRAINT tickets_void_time CHECK ((status = 'VOID') = ("voidedAt" IS NOT NULL))
    )`);
    await db.query('CREATE INDEX tickets_by_flight ON tickets ("flightId")');

    // A single-passenger booking is its own passenger, and its flight is its one segment.
    await db.query(`INSERT INTO tickets (number, "bookingId", "passengerId", "passengerName",
        "segmentId", "flightId", cabin, "fareMinor", currency, status, "issuedAt", "voidedAt")
      SELECT '999' || lpad(nextval('ticket_number_seq')::text, 10, '0'), b.id, b.id::text,
        b."passengerName", b."flightId"::text, b."flightId", b.cabin, b."amountMinor", b.currency,
        CASE s.status WHEN 'ISSUED' THEN 'VALID' ELSE 'VOID' END, now(),
        CASE s.status WHEN 'ISSUED' THEN NULL ELSE now() END
      FROM shim_tickets s JOIN bookings b ON b.id = s."bookingId"
      ORDER BY b.id`);
    await db.query(`UPDATE bookings SET status = 'TICKETED'
      WHERE status = 'CONFIRMED' AND id IN (SELECT "bookingId" FROM tickets WHERE status = 'VALID')`);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`UPDATE bookings SET status = 'CONFIRMED' WHERE status = 'TICKETED'`);
    await db.query(`CREATE TEMPORARY TABLE pack_tickets ON COMMIT DROP AS
      SELECT DISTINCT ON ("bookingId") "bookingId", "flightId",
        CASE status WHEN 'VALID' THEN 'ISSUED' ELSE 'VOID' END AS status
      FROM tickets ORDER BY "bookingId", status DESC`);
    await db.query('DROP TABLE tickets');
    await db.query('DROP SEQUENCE ticket_number_seq');
    await db.query(`CREATE TABLE tickets (
      number uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "bookingId" uuid NOT NULL UNIQUE REFERENCES bookings(id),
      "flightId" uuid NOT NULL,
      status varchar(6) NOT NULL CHECK (status IN ('ISSUED', 'VOID'))
    )`);
    await db.query('CREATE INDEX tickets_by_flight ON tickets ("flightId")');
    await db.query(`INSERT INTO tickets ("bookingId", "flightId", status)
      SELECT "bookingId", "flightId", status FROM pack_tickets`);
    await db.query(`ALTER TABLE bookings
      DROP CONSTRAINT bookings_status_check, DROP CONSTRAINT bookings_payment_state`);
    await db.query(`ALTER TABLE bookings
      ADD CONSTRAINT bookings_status_check
        CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED')),
      ADD CONSTRAINT bookings_payment_state
        CHECK (status = 'CANCELLED' OR (status = 'CONFIRMED') = ("paymentId" IS NOT NULL))`);
  }
}
