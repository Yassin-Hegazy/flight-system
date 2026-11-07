import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFlightCatalog1762470000000 implements MigrationInterface {
  name = 'CreateFlightCatalog1762470000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "flight_status_enum" AS ENUM ('SCHEDULED','DELAYED','BOARDING','DEPARTED','ARRIVED','CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "airlines" ("code" character varying(2) NOT NULL, "name" character varying(120) NOT NULL, CONSTRAINT "PK_airlines_code" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "airports" ("code" character varying(3) NOT NULL, "name" character varying(120) NOT NULL, "city" character varying(120) NOT NULL, "country" character varying(120) NOT NULL, "timezone" character varying(64) NOT NULL, CONSTRAINT "PK_airports_code" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "flights" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "flightNumber" character varying(6) NOT NULL, "airlineCode" character varying(2) NOT NULL, "originCode" character varying(3) NOT NULL, "destinationCode" character varying(3) NOT NULL, "scheduledDepartureUtc" TIMESTAMP WITH TIME ZONE NOT NULL, "scheduledArrivalUtc" TIMESTAMP WITH TIME ZONE NOT NULL, "departureLocalDate" date NOT NULL, "estimatedDepartureUtc" TIMESTAMP WITH TIME ZONE, "status" "public"."flight_status_enum" NOT NULL DEFAULT 'SCHEDULED', "cancelReason" character varying(255), CONSTRAINT "flights_number_per_day" UNIQUE ("flightNumber", "departureLocalDate"), CONSTRAINT "PK_flights_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "flight_fares_cabin_enum" AS ENUM ('ECONOMY','BUSINESS')`);
    await queryRunner.query(
      `CREATE TABLE "flight_fares" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "flightId" uuid NOT NULL, "cabin" "public"."flight_fares_cabin_enum" NOT NULL, "amountMinor" integer NOT NULL, "currency" character varying(3) NOT NULL, CONSTRAINT "UQ_flight_fares_flight_cabin" UNIQUE ("flightId","cabin"), CONSTRAINT "PK_flight_fares_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_airports_name" ON "airports" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_airports_city" ON "airports" ("city")`);
    await queryRunner.query(
      `CREATE INDEX "flights_route_departure" ON "flights" ("originCode","destinationCode","scheduledDepartureUtc")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."flights_route_departure"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_airports_city"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_airports_name"`);
    await queryRunner.query(`DROP TABLE "flight_fares"`);
    await queryRunner.query(`DROP TYPE "flight_fares_cabin_enum"`);
    await queryRunner.query(`DROP TABLE "flights"`);
    await queryRunner.query(`DROP TABLE "airports"`);
    await queryRunner.query(`DROP TABLE "airlines"`);
    await queryRunner.query(`DROP TYPE "flight_status_enum"`);
  }
}
