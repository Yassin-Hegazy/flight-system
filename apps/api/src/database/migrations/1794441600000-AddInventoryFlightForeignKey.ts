import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Database-only reference: neither module imports the other's private entity metadata. */
export class AddInventoryFlightForeignKey1794441600000 implements MigrationInterface {
  name = 'AddInventoryFlightForeignKey1794441600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // One statement keeps the lock, preflight and validated ALTER atomic even when the caller
    // runs migrations without an outer transaction. No records are repaired or removed here.
    await queryRunner.query(`DO $$
      DECLARE orphan_flight_id uuid;
      BEGIN
        LOCK TABLE "flights", "cabin_inventory" IN SHARE ROW EXCLUSIVE MODE;

        SELECT inventory."flightId" INTO orphan_flight_id
        FROM "cabin_inventory" inventory
        LEFT JOIN "flights" flight ON flight."id" = inventory."flightId"
        WHERE flight."id" IS NULL
        LIMIT 1;

        IF orphan_flight_id IS NOT NULL THEN
          RAISE EXCEPTION USING
            ERRCODE = '23503',
            CONSTRAINT = 'cabin_inventory_flight_fk',
            MESSAGE = format(
              'Cannot add cabin_inventory_flight_fk: cabin_inventory references missing flight %s.',
              orphan_flight_id
            ),
            HINT = 'Review and explicitly resolve orphaned Inventory records before retrying. This migration does not change any records.';
        END IF;

        ALTER TABLE "cabin_inventory"
          ADD CONSTRAINT "cabin_inventory_flight_fk"
          FOREIGN KEY ("flightId") REFERENCES "flights"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION;
      END;
    $$`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cabin_inventory" DROP CONSTRAINT "cabin_inventory_flight_fk"`,
    );
  }
}
