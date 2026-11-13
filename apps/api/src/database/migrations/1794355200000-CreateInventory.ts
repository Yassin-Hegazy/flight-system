import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInventory1794355200000 implements MigrationInterface {
  name = 'CreateInventory1794355200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."inventory_cabin_enum" AS ENUM('ECONOMY', 'BUSINESS')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."seat_hold_status_enum" AS ENUM('HELD', 'COMMITTED', 'RELEASED', 'EXPIRED')`,
    );
    await queryRunner.query(`CREATE TABLE "cabin_inventory" (
      "flightId" uuid NOT NULL,
      "cabin" "public"."inventory_cabin_enum" NOT NULL,
      "capacity" integer NOT NULL,
      "committedSeats" integer NOT NULL DEFAULT 0,
      CONSTRAINT "cabin_inventory_pkey" PRIMARY KEY ("flightId", "cabin"),
      CONSTRAINT "cabin_inventory_capacity_nonnegative" CHECK ("capacity" >= 0),
      CONSTRAINT "cabin_inventory_committed_valid" CHECK ("committedSeats" >= 0 AND "committedSeats" <= "capacity")
    )`);
    await queryRunner.query(`CREATE TABLE "seat_holds" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "bookingId" uuid NOT NULL,
      "flightId" uuid NOT NULL,
      "cabin" "public"."inventory_cabin_enum" NOT NULL,
      "seats" integer NOT NULL,
      "status" "public"."seat_hold_status_enum" NOT NULL DEFAULT 'HELD',
      "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
      CONSTRAINT "seat_holds_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "seat_holds_seats_positive" CHECK ("seats" > 0),
      CONSTRAINT "seat_holds_inventory_fk" FOREIGN KEY ("flightId", "cabin")
        REFERENCES "cabin_inventory" ("flightId", "cabin") ON DELETE RESTRICT ON UPDATE NO ACTION
    )`);
    await queryRunner.query(`CREATE INDEX "seat_holds_booking" ON "seat_holds" ("bookingId")`);
    await queryRunner.query(
      `CREATE INDEX "seat_holds_active_cabin_expiry" ON "seat_holds" ("flightId", "cabin", "expiresAt") WHERE "status" = 'HELD'`,
    );
    await queryRunner.query(
      `CREATE INDEX "seat_holds_active_expiry" ON "seat_holds" ("expiresAt") WHERE "status" = 'HELD'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "seat_holds"`);
    await queryRunner.query(`DROP TABLE "cabin_inventory"`);
    await queryRunner.query(`DROP TYPE "public"."seat_hold_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."inventory_cabin_enum"`);
  }
}
