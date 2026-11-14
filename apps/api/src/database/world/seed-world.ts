import type { INestApplicationContext } from '@nestjs/common';
import type { FlightSeedResult } from '../seed-demo';
import type { WorldAirport } from './airports';

export interface WorldSeedOptions {
  now?: Date;
  days?: number;
  airports?: readonly WorldAirport[];
  onProgress?: (done: number, total: number) => void;
}

export interface WorldSeedResult {
  airports: { created: number; existing: number };
  flights: FlightSeedResult;
}

export function seedWorld(
  app: INestApplicationContext,
  options: WorldSeedOptions = {},
): Promise<WorldSeedResult> {
  void app;
  void options;
  return Promise.resolve({
    airports: { created: 0, existing: 0 },
    flights: { created: 0, existing: 0, rejected: [] },
  });
}
