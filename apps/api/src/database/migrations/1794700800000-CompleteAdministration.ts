import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteAdministration1794700800000 implements MigrationInterface {
  async up(db: QueryRunner): Promise<void> {
    await db.query(`CREATE TABLE audit_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "actorId" uuid NOT NULL,
      action varchar(60) NOT NULL,
      target text NOT NULL,
      "flightId" uuid,
      "before" jsonb,
      "after" jsonb,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await db.query(
      'CREATE INDEX audit_log_flight_time ON audit_log ("flightId", "createdAt" DESC, id DESC)',
    );
    await db.query(`CREATE FUNCTION reject_audit_changes() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'audit_log is append-only'; END
    $$`);
    await db.query(`CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
      ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_changes()`);
    await db.query('ALTER TABLE bookings ADD COLUMN "passengerName" varchar(120)');
    await db.query(
      `UPDATE bookings b SET "passengerName" = u.name FROM users u WHERE u.id = b."ownerId"`,
    );
    await db.query('ALTER TABLE bookings ALTER COLUMN "passengerName" SET NOT NULL');
    await db.query(`CREATE TABLE tickets (
      number uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "bookingId" uuid NOT NULL UNIQUE REFERENCES bookings(id),
      "flightId" uuid NOT NULL,
      status varchar(6) NOT NULL CHECK (status IN ('ISSUED', 'VOID'))
    )`);
    await db.query('CREATE INDEX tickets_by_flight ON tickets ("flightId")');
    await db.query(`INSERT INTO tickets ("bookingId", "flightId", status)
      SELECT id, "flightId", 'ISSUED' FROM bookings WHERE status = 'CONFIRMED'`);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query('DROP TABLE tickets, audit_log');
    await db.query('DROP FUNCTION reject_audit_changes()');
    await db.query('ALTER TABLE bookings DROP COLUMN "passengerName"');
  }
}
