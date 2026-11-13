import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isUniqueViolation, type Tx } from '../../shared/db';
import { AppError } from '../../shared/errors';
import { money } from '../../shared/money';
import { err, ok } from '../../shared/result';
import { CATALOG_API, type Cabin, type CatalogApi } from '../flight-catalog/index';
import { INVENTORY_API, type InventoryApi } from '../inventory/index';
import type { BookingOwners } from './booking-owners';
import type { BookingPayments } from './booking-payments';
import { BookingEntity } from './booking.entity';

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function reference(): string {
  return Array.from(randomBytes(6), (byte) => REFERENCE_ALPHABET[byte & 31]).join('');
}

function view(booking: BookingEntity) {
  return {
    reference: booking.reference,
    flightId: booking.flightId,
    cabin: booking.cabin,
    status: booking.status,
    amount: money(booking.amountMinor, booking.currency),
  };
}

@Injectable()
export class BookingService implements BookingPayments, BookingOwners {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(CATALOG_API) private readonly catalog: CatalogApi,
    @Inject(INVENTORY_API) private readonly inventory: InventoryApi,
  ) {}

  /** The M2 path reserves one adult seat and snapshots its fare. */
  async reserve(ownerId: string, flightId: string, cabin: Cabin) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.db.transaction('READ COMMITTED', async (tx) => {
          const flight = await this.catalog.getFlightForUpdate(tx, flightId);
          const fare = flight?.fares[cabin];
          if (!flight || !fare || !this.catalog.isBookable(flight, new Date())) {
            throw AppError.conflict(
              'FLIGHT_UNAVAILABLE',
              'The requested flight and cabin are unavailable.',
            );
          }
          const id = randomUUID();
          const hold = await this.inventory.hold(tx, { bookingId: id, flightId, cabin, seats: 1 });
          if (!hold.ok) throw AppError.conflict(hold.error, 'The requested seat is unavailable.');
          const booking = await tx.save(BookingEntity, {
            id,
            reference: reference(),
            ownerId,
            flightId,
            cabin,
            holdId: hold.value,
            amountMinor: fare.amountMinor,
            currency: fare.currency,
            status: 'PENDING_PAYMENT',
          });
          return view(booking);
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new Error('Could not allocate a unique booking reference');
  }

  private findOwned(reference: string, ownerId: string) {
    return this.db.manager.findOneBy(BookingEntity, { reference, ownerId });
  }

  async ownedId(reference: string, ownerId: string) {
    return (await this.findOwned(reference, ownerId))?.id ?? null;
  }

  async getOwned(reference: string, ownerId: string) {
    const booking = await this.findOwned(reference, ownerId);
    return booking ? view(booking) : null;
  }

  async activeOwnersOf(tx: Tx, flightId: string): Promise<string[]> {
    const bookings = await tx.findBy(BookingEntity, { flightId });
    const owners = new Set<string>();
    for (const booking of bookings) {
      if (owners.has(booking.ownerId)) continue;
      if (
        booking.status === 'CONFIRMED' ||
        (await this.inventory.validateForPayment(booking.holdId, booking.id, tx)).ok
      ) {
        owners.add(booking.ownerId);
      }
    }
    return [...owners];
  }

  async getPayable(reference: string, payerId: string) {
    const booking = await this.findOwned(reference, payerId);
    if (!booking) return err('NOT_FOUND' as const);
    if (booking.status === 'CONFIRMED') return err('ALREADY_PAID' as const);
    if (booking.status === 'CANCELLED') return err('NOT_FOUND' as const);
    const hold = await this.inventory.validateForPayment(booking.holdId, booking.id);
    if (!hold.ok) return err('HOLD_EXPIRED' as const);
    return ok({ bookingId: booking.id, amount: money(booking.amountMinor, booking.currency) });
  }

  async confirmPaid(tx: Tx, bookingId: string, paymentId: string) {
    const booking = await tx.findOne(BookingEntity, {
      where: { id: bookingId },
      lock: { mode: 'pessimistic_write' },
    });
    if (booking?.status === 'CANCELLED') return err('BOOKING_CANCELLED' as const);
    if (!booking || booking.status !== 'PENDING_PAYMENT') {
      throw new Error('Cannot settle a booking outside PENDING_PAYMENT');
    }
    const seats = await this.inventory.commit(tx, booking.holdId);
    if (!seats.ok) return err('HOLD_EXPIRED' as const);
    await tx.update(BookingEntity, booking.id, { status: 'CONFIRMED', paymentId });
    return ok({
      type: 'BookingConfirmed' as const,
      eventId: paymentId,
      bookingId: booking.id,
      ownerId: booking.ownerId,
      ref: booking.reference,
    });
  }
}
