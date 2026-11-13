import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CompletePayments1794614400000 implements MigrationInterface {
  async up(db: QueryRunner): Promise<void> {
    await db.query(
      'ALTER TABLE bookings DROP CONSTRAINT bookings_status_check, DROP CONSTRAINT bookings_payment_state',
    );
    await db.query(`ALTER TABLE bookings
      ADD CONSTRAINT bookings_status_check CHECK ("status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED')),
      ADD CONSTRAINT bookings_payment_state CHECK ("status" = 'CANCELLED' OR ("status" = 'CONFIRMED') = ("paymentId" IS NOT NULL))`);
    await db.query(`ALTER TABLE payments
      ADD COLUMN "createdAt" timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN "resolvedAt" timestamptz,
      ADD COLUMN "declineReason" varchar(32),
      ADD COLUMN "recoveryAt" timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')`);
    await db.query(
      `CREATE INDEX payments_recovery ON payments ("recoveryAt") WHERE status = 'PENDING'`,
    );
    await db.query(`CREATE TABLE refunds (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "paymentId" uuid NOT NULL UNIQUE REFERENCES payments(id),
      "amountMinor" integer NOT NULL CHECK ("amountMinor" > 0),
      currency varchar(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
      reason varchar(16) NOT NULL CHECK (reason IN ('CANCELLATION', 'NOT_CONFIRMED')),
      status varchar(9) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCEEDED')),
      attempts integer NOT NULL DEFAULT 0,
      "retryAt" timestamptz NOT NULL DEFAULT now(),
      "resolvedAt" timestamptz,
      "gatewayRef" varchar(100)
    )`);
    // Beta persisted the provider reference before attempting the immediate refund.
    await db.query(`INSERT INTO refunds (id, "paymentId", "amountMinor", currency, reason)
      SELECT id, id, "amountMinor", currency, 'NOT_CONFIRMED' FROM payments
      WHERE status = 'PENDING' AND "gatewayRef" IS NOT NULL`);
    await db.query(`UPDATE payments SET status = 'SUCCEEDED', "failureCode" = 'HOLD_EXPIRED', "resolvedAt" = now()
      WHERE status = 'PENDING' AND "gatewayRef" IS NOT NULL`);
    await db.query(`CREATE INDEX refunds_recovery ON refunds ("retryAt") WHERE status = 'PENDING'`);
    await db.query(`CREATE TABLE mock_gateway_charges (
      "paymentId" uuid PRIMARY KEY,
      outcome varchar(12) NOT NULL CHECK (outcome IN ('SUCCEEDED', 'DECLINED', 'UNKNOWN', 'NOT_CHARGED'))
    )`);
    await db.query(`CREATE TABLE mock_gateway_refunds (
      "refundId" uuid PRIMARY KEY,
      "chargeRef" varchar(100) NOT NULL,
      CONSTRAINT mock_gateway_refunds_charge_unique UNIQUE ("chargeRef")
    )`);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM bookings WHERE status = 'CANCELLED') OR EXISTS (SELECT 1 FROM refunds) THEN
        RAISE EXCEPTION 'Cannot revert Payments while cancellation or refund records exist';
      END IF;
    END $$`);
    await db.query('DROP TABLE mock_gateway_refunds, mock_gateway_charges, refunds');
    await db.query('DROP INDEX payments_recovery');
    await db.query(
      'ALTER TABLE payments DROP COLUMN "createdAt", DROP COLUMN "resolvedAt", DROP COLUMN "declineReason", DROP COLUMN "recoveryAt"',
    );
    await db.query(
      'ALTER TABLE bookings DROP CONSTRAINT bookings_status_check, DROP CONSTRAINT bookings_payment_state',
    );
    await db.query(`ALTER TABLE bookings
      ADD CONSTRAINT bookings_status_check CHECK ("status" IN ('PENDING_PAYMENT', 'CONFIRMED')),
      ADD CONSTRAINT bookings_payment_state CHECK (("status" = 'CONFIRMED') = ("paymentId" IS NOT NULL))`);
  }
}
