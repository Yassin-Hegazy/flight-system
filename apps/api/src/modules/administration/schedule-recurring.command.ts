import type { Tx } from '../../shared/db';
import { money } from '../../shared/money';
import { err, ok } from '../../shared/result';
import { isLocalDate, localDepartureInstant } from '../../shared/time';
import type { CatalogApi } from '../flight-catalog/index';
import type { InventoryApi } from '../inventory/index';
import type { AdminCommand, AuditChange } from './admin-command';
import { CreateFlight } from './create-flight.command';
import type { RecurringFlightBody } from './operations.dto';

const DAY_MS = 86_400_000;
export type RecurringFailure = { code: string; dates?: Record<string, string> };

export class ScheduleRecurring implements AdminCommand<
  { flights: { date: string; id: string }[] },
  RecurringFailure
> {
  readonly name = 'ScheduleRecurring';

  constructor(
    private readonly catalog: CatalogApi,
    private readonly inventory: InventoryApi,
    private readonly input: RecurringFlightBody,
  ) {}

  async execute(tx: Tx) {
    const selected = this.dates();
    if (!selected.ok) return selected;
    const origin = await this.catalog.airport(this.input.template.originCode, tx);
    if (!origin) return err<RecurringFailure>({ code: 'UNKNOWN_AIRPORT' });

    const dates: Record<string, string> = {};
    const created: { date: string; id: string }[] = [];
    const audit: AuditChange[] = [];
    for (const date of selected.value) {
      const result = await this.create(tx, date, origin.timezone);
      if (!result.ok) {
        dates[date] = result.error;
        continue;
      }
      created.push({ date, id: result.value.value.id });
      audit.push(...result.value.audit);
    }
    if (Object.keys(dates).length) return err<RecurringFailure>({ code: 'SERIES_REJECTED', dates });
    return ok({ value: { flights: created }, audit });
  }

  private dates() {
    const { from, to, weekdays } = this.input;
    if (!isLocalDate(from) || !isLocalDate(to))
      return err<RecurringFailure>({ code: 'INVALID_DATE_RANGE' });
    const start = Date.parse(from);
    const end = Date.parse(to);
    if (end < start || end - start > 90 * DAY_MS)
      return err<RecurringFailure>({ code: 'INVALID_DATE_RANGE' });

    const selected: string[] = [];
    for (let day = start; day <= end; day += DAY_MS) {
      const instant = new Date(day);
      if (weekdays.includes(instant.getUTCDay() || 7))
        selected.push(instant.toISOString().slice(0, 10));
    }
    return selected.length ? ok(selected) : err<RecurringFailure>({ code: 'NO_MATCHING_DATES' });
  }

  private async create(tx: Tx, date: string, timezone: string) {
    const departure = localDepartureInstant(date, this.input.localDeparture, timezone);
    if (!departure) return err('NONEXISTENT_LOCAL_TIME');
    const { template, durationMinutes } = this.input;
    const command = new CreateFlight(this.catalog, this.inventory, {
      flight: {
        flightNumber: template.flightNumber,
        airlineCode: template.airlineCode,
        originCode: template.originCode,
        destinationCode: template.destinationCode,
        scheduledDepartureUtc: departure,
        scheduledArrivalUtc: new Date(departure.getTime() + durationMinutes * 60_000),
        fares: {
          ECONOMY: money(template.fares.ECONOMY, template.currency),
          BUSINESS: money(template.fares.BUSINESS, template.currency),
        },
      },
      capacity: template.capacity,
    });
    // A failed insert can abort PostgreSQL's current transaction. Roll back to a savepoint
    // before checking the next date, then let the bus roll back the entire rejected series.
    const runner = tx.queryRunner;
    if (!runner) throw new Error('Recurring flights require a transaction');
    await runner.startTransaction();
    let result;
    try {
      result = await command.execute(tx);
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    }
    if (result.ok) await runner.commitTransaction();
    else await runner.rollbackTransaction();
    return result;
  }
}
