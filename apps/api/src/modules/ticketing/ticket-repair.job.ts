import { Injectable } from '@nestjs/common';

/** NFR-REL-02: issues tickets for bookings left CONFIRMED after a failed issuance. */
@Injectable()
export class TicketRepairJob {
  run(): Promise<void> {
    return Promise.reject(new Error('Not implemented'));
  }
}
