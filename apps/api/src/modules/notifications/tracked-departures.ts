import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, DataSource } from 'typeorm';
import type { DepartureSource, UpcomingDeparture } from './departure-source';
import { TrackedDepartureEntity } from './tracked-departure.entity';

/**
 * The reminder job's DepartureSource, read from this module's own table: only ticketed legs of
 * flights that still fly are kept there (DepartureTracker), so every row is a candidate.
 */
@Injectable()
export class TrackedDepartures implements DepartureSource {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async ticketedDeparturesBetween(from: Date, to: Date): Promise<UpcomingDeparture[]> {
    const rows = await this.db.manager.findBy(TrackedDepartureEntity, {
      departureUtc: Between(from, to),
    });
    return rows.map((row) => ({
      bookingId: row.bookingId,
      ownerId: row.ownerId,
      ref: row.ref,
      flightNumber: row.flightNumber,
      departureUtc: row.departureUtc.toISOString(),
      departureTimeZone: row.departureTimeZone,
      bookingStatus: 'TICKETED',
      flightStatus: row.flightStatus,
    }));
  }
}
