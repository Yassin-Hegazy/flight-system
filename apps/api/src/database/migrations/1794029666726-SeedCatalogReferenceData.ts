import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reference data the Flight Catalog needs before any flight exists: airlines (seeded, per the
 * Catalog pack section 1.1) and the airports they fly between, each with its IANA time zone.
 * Administrators maintain airports afterwards through the Catalog's upsertAirport.
 */
const AIRLINES: [code: string, name: string][] = [
  ['MS', 'EgyptAir'],
  ['SM', 'Air Cairo'],
  ['NP', 'Nile Air'],
  ['SV', 'Saudia'],
  ['EK', 'Emirates'],
  ['EY', 'Etihad Airways'],
  ['QR', 'Qatar Airways'],
  ['TK', 'Turkish Airlines'],
  ['LH', 'Lufthansa'],
  ['BA', 'British Airways'],
  ['AF', 'Air France'],
  ['KL', 'KLM'],
  ['U2', 'easyJet'],
  ['FR', 'Ryanair'],
  ['W6', 'Wizz Air'],
];

const AIRPORTS: [code: string, name: string, city: string, country: string, timezone: string][] = [
  ['CAI', 'Cairo International Airport', 'Cairo', 'Egypt', 'Africa/Cairo'],
  ['SPX', 'Sphinx International Airport', 'Giza', 'Egypt', 'Africa/Cairo'],
  ['HBE', 'Borg El Arab International Airport', 'Alexandria', 'Egypt', 'Africa/Cairo'],
  ['HRG', 'Hurghada International Airport', 'Hurghada', 'Egypt', 'Africa/Cairo'],
  ['SSH', 'Sharm El Sheikh International Airport', 'Sharm El Sheikh', 'Egypt', 'Africa/Cairo'],
  ['LXR', 'Luxor International Airport', 'Luxor', 'Egypt', 'Africa/Cairo'],
  ['ASW', 'Aswan International Airport', 'Aswan', 'Egypt', 'Africa/Cairo'],
  ['RMF', 'Marsa Alam International Airport', 'Marsa Alam', 'Egypt', 'Africa/Cairo'],
  ['JED', 'King Abdulaziz International Airport', 'Jeddah', 'Saudi Arabia', 'Asia/Riyadh'],
  ['RUH', 'King Khalid International Airport', 'Riyadh', 'Saudi Arabia', 'Asia/Riyadh'],
  ['DXB', 'Dubai International Airport', 'Dubai', 'United Arab Emirates', 'Asia/Dubai'],
  ['AUH', 'Zayed International Airport', 'Abu Dhabi', 'United Arab Emirates', 'Asia/Dubai'],
  ['DOH', 'Hamad International Airport', 'Doha', 'Qatar', 'Asia/Qatar'],
  ['IST', 'Istanbul Airport', 'Istanbul', 'Türkiye', 'Europe/Istanbul'],
  ['LHR', 'Heathrow Airport', 'London', 'United Kingdom', 'Europe/London'],
  ['LGW', 'Gatwick Airport', 'London', 'United Kingdom', 'Europe/London'],
  ['CDG', 'Charles de Gaulle Airport', 'Paris', 'France', 'Europe/Paris'],
  ['FRA', 'Frankfurt Airport', 'Frankfurt', 'Germany', 'Europe/Berlin'],
  ['MUC', 'Munich Airport', 'Munich', 'Germany', 'Europe/Berlin'],
  ['BER', 'Berlin Brandenburg Airport', 'Berlin', 'Germany', 'Europe/Berlin'],
  ['AMS', 'Amsterdam Airport Schiphol', 'Amsterdam', 'Netherlands', 'Europe/Amsterdam'],
  ['FCO', 'Leonardo da Vinci–Fiumicino Airport', 'Rome', 'Italy', 'Europe/Rome'],
  ['MAD', 'Adolfo Suárez Madrid–Barajas Airport', 'Madrid', 'Spain', 'Europe/Madrid'],
  ['JFK', 'John F. Kennedy International Airport', 'New York', 'United States', 'America/New_York'],
];

export class SeedCatalogReferenceData1794029666726 implements MigrationInterface {
  name = 'SeedCatalogReferenceData1794029666726';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [code, name] of AIRLINES) {
      await queryRunner.query(
        `INSERT INTO "airlines" ("code", "name") VALUES ($1, $2) ON CONFLICT ("code") DO NOTHING`,
        [code, name],
      );
    }
    for (const [code, name, city, country, timezone] of AIRPORTS) {
      await queryRunner.query(
        `INSERT INTO "airports" ("code", "name", "city", "country", "timezone")
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("code") DO NOTHING`,
        [code, name, city, country, timezone],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "airports" WHERE "code" = ANY($1)`, [
      AIRPORTS.map(([code]) => code),
    ]);
    await queryRunner.query(`DELETE FROM "airlines" WHERE "code" = ANY($1)`, [
      AIRLINES.map(([code]) => code),
    ]);
  }
}
