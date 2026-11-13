import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBookingAndPaymentsBeta1794528000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id" uuid PRIMARY KEY,
        "reference" varchar(6) NOT NULL UNIQUE CHECK ("reference" ~ '^[A-HJ-NP-Z2-9]{6}$'),
        "ownerId" uuid NOT NULL REFERENCES "users" ("id"),
        "flightId" uuid NOT NULL REFERENCES "flights" ("id"),
        "cabin" varchar(8) NOT NULL CHECK ("cabin" IN ('ECONOMY', 'BUSINESS')),
        "holdId" uuid NOT NULL UNIQUE REFERENCES "seat_holds" ("id"),
        "amountMinor" integer NOT NULL CHECK ("amountMinor" > 0),
        "currency" varchar(3) NOT NULL CHECK ("currency" ~ '^[A-Z]{3}$'),
        "status" varchar(15) NOT NULL CHECK ("status" IN ('PENDING_PAYMENT', 'CONFIRMED')),
        "paymentId" uuid,
        CONSTRAINT "bookings_payment_state" CHECK (("status" = 'CONFIRMED') = ("paymentId" IS NOT NULL))
      )
    `);
    await queryRunner.query('CREATE INDEX "bookings_by_flight" ON "bookings" ("flightId")');
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "bookingId" uuid NOT NULL REFERENCES "bookings" ("id"),
        "payerId" uuid NOT NULL REFERENCES "users" ("id"),
        "idempotencyKey" varchar(100) NOT NULL,
        "requestHash" varchar(64) NOT NULL,
        "amountMinor" integer NOT NULL CHECK ("amountMinor" > 0),
        "currency" varchar(3) NOT NULL CHECK ("currency" ~ '^[A-Z]{3}$'),
        "status" varchar(9) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'SUCCEEDED', 'FAILED')),
        "gatewayRef" varchar(100),
        "cardBrand" varchar(20),
        "cardLast4" varchar(4) CHECK ("cardLast4" ~ '^[0-9]{4}$'),
        "failureCode" varchar(12) CHECK ("failureCode" IN ('DECLINED', 'HOLD_EXPIRED')),
        CONSTRAINT "payments_payer_key_unique" UNIQUE ("payerId", "idempotencyKey")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "one_live_payment_per_booking" ON "payments" ("bookingId")
      WHERE "status" IN ('PENDING', 'SUCCEEDED')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "payments"');
    await queryRunner.query('DROP TABLE "bookings"');
  }
}
