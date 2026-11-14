import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The hub carriers of the world demo network (src/database/world/network.ts), beside the airlines
 * the reference-data migration already provides. The Catalog has no airline upsert, so airlines
 * arrive as reference data, like the first fifteen.
 */
export const WORLD_AIRLINES: [code: string, name: string][] = [
  ['IB', 'Iberia'],
  ['AZ', 'ITA Airways'],
  ['DL', 'Delta Air Lines'],
  ['AA', 'American Airlines'],
  ['UA', 'United Airlines'],
  ['B6', 'JetBlue'],
  ['AS', 'Alaska Airlines'],
  ['AC', 'Air Canada'],
  ['AM', 'Aeroméxico'],
  ['AV', 'Avianca'],
  ['LA', 'LATAM Airlines'],
  ['AR', 'Aerolíneas Argentinas'],
  ['ET', 'Ethiopian Airlines'],
  ['KQ', 'Kenya Airways'],
  ['SA', 'South African Airways'],
  ['AT', 'Royal Air Maroc'],
  ['P4', 'Air Peace'],
  ['AI', 'Air India'],
  ['SQ', 'Singapore Airlines'],
  ['CX', 'Cathay Pacific'],
  ['MU', 'China Eastern Airlines'],
  ['CA', 'Air China'],
  ['JL', 'Japan Airlines'],
  ['KE', 'Korean Air'],
  ['TG', 'Thai Airways'],
  ['MH', 'Malaysia Airlines'],
  ['GA', 'Garuda Indonesia'],
  ['PR', 'Philippine Airlines'],
  ['QF', 'Qantas'],
  ['NZ', 'Air New Zealand'],
];

export class SeedWorldAirlines1795046400000 implements MigrationInterface {
  name = 'SeedWorldAirlines1795046400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [code, name] of WORLD_AIRLINES) {
      await queryRunner.query(
        `INSERT INTO "airlines" ("code", "name") VALUES ($1, $2) ON CONFLICT ("code") DO NOTHING`,
        [code, name],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "airlines" WHERE "code" = ANY($1)`, [
      WORLD_AIRLINES.map(([code]) => code),
    ]);
  }
}
