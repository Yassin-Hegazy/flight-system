import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFlightCatalog1794029663383 implements MigrationInterface {
  name = 'CreateFlightCatalog1794029663383';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "airlines" ("code" character varying(2) NOT NULL, "name" character varying(120) NOT NULL, CONSTRAINT "PK_1fdd8f4def510635e124aed4326" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "airports" ("code" character varying(3) NOT NULL, "name" character varying(120) NOT NULL, "city" character varying(120) NOT NULL, "country" character varying(120) NOT NULL, "timezone" character varying(64) NOT NULL, CONSTRAINT "PK_06be6c7681ff18455fd7fd7c45d" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."flights_status_enum" AS ENUM('SCHEDULED', 'DELAYED', 'BOARDING', 'DEPARTED', 'ARRIVED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "flights" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "flightNumber" character varying(6) NOT NULL, "airlineCode" character varying(2) NOT NULL, "originCode" character varying(3) NOT NULL, "destinationCode" character varying(3) NOT NULL, "scheduledDepartureUtc" TIMESTAMP WITH TIME ZONE NOT NULL, "scheduledArrivalUtc" TIMESTAMP WITH TIME ZONE NOT NULL, "departureLocalDate" date NOT NULL, "estimatedDepartureUtc" TIMESTAMP WITH TIME ZONE, "status" "public"."flights_status_enum" NOT NULL DEFAULT 'SCHEDULED', "cancelReason" character varying(255), CONSTRAINT "flights_number_per_day" UNIQUE ("flightNumber", "departureLocalDate"), CONSTRAINT "flights_arrival_after_departure" CHECK ("scheduledArrivalUtc" > "scheduledDepartureUtc"), CONSTRAINT "flights_different_airports" CHECK ("originCode" <> "destinationCode"), CONSTRAINT "PK_c614ef3382fdd70b6d6c2c8d8dd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "flights_route_departure" ON "flights"  ("originCode", "destinationCode", "scheduledDepartureUtc") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."flight_fares_cabin_enum" AS ENUM('ECONOMY', 'BUSINESS')`,
    );
    await queryRunner.query(
      `CREATE TABLE "flight_fares" ("flightId" uuid NOT NULL, "cabin" "public"."flight_fares_cabin_enum" NOT NULL, "amountMinor" integer NOT NULL, "currency" character varying(3) NOT NULL, CONSTRAINT "flight_fares_amount_positive" CHECK ("amountMinor" > 0), CONSTRAINT "PK_1af9062cbe5827e5d324318a1f9" PRIMARY KEY ("flightId", "cabin"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "flights" ADD CONSTRAINT "FK_3825cbe9d8aed8204a4ac6e5db5" FOREIGN KEY ("airlineCode") REFERENCES "airlines"("code") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "flights" ADD CONSTRAINT "FK_b4690097102000933790363f0bc" FOREIGN KEY ("originCode") REFERENCES "airports"("code") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "flights" ADD CONSTRAINT "FK_b5862bdec0a41f803580414a7a8" FOREIGN KEY ("destinationCode") REFERENCES "airports"("code") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_fares" ADD CONSTRAINT "FK_a4f77ad324ee0263c0abff0034a" FOREIGN KEY ("flightId") REFERENCES "flights"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "flight_fares" DROP CONSTRAINT "FK_a4f77ad324ee0263c0abff0034a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flights" DROP CONSTRAINT "FK_b5862bdec0a41f803580414a7a8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flights" DROP CONSTRAINT "FK_b4690097102000933790363f0bc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flights" DROP CONSTRAINT "FK_3825cbe9d8aed8204a4ac6e5db5"`,
    );
    await queryRunner.query(`DROP TABLE "flight_fares"`);
    await queryRunner.query(`DROP TYPE "public"."flight_fares_cabin_enum"`);
    await queryRunner.query(`DROP INDEX "public"."flights_route_departure"`);
    await queryRunner.query(`DROP TABLE "flights"`);
    await queryRunner.query(`DROP TYPE "public"."flights_status_enum"`);
    await queryRunner.query(`DROP TABLE "airports"`);
    await queryRunner.query(`DROP TABLE "airlines"`);
  }
}
