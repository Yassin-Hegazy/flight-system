import type { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';
import type { Tx } from '../../shared/db';
import { AppError } from '../../shared/errors';
import type { DomainEvent } from '../../shared/events';
import { err, ok, type Result } from '../../shared/result';
import type { AdminCommand, CommandOutcome } from './admin-command';
import { CommandBus } from './command-bus';
import { asAdmin, asAnonymous, asTraveler, TX } from './test-support';

const DELAYED: DomainEvent = {
  type: 'FlightDelayed',
  eventId: 'e-1',
  flightId: 'f-1',
  flightNumber: 'MS777',
  departureTimeZone: 'Africa/Cairo',
  affectedUserIds: [],
  oldDepartureUtc: '2027-03-01T06:00:00.000Z',
  newDepartureUtc: '2027-03-01T07:00:00.000Z',
};

/** A command that records what happened to it, in order, in the shared log. */
class Recorded implements AdminCommand<string, 'REFUSED'> {
  readonly name = 'Recorded';
  constructor(
    private readonly log: string[],
    private readonly result: Result<CommandOutcome<string>, 'REFUSED'> | Error,
  ) {}

  execute(tx: Tx): Promise<Result<CommandOutcome<string>, 'REFUSED'>> {
    this.log.push(tx === TX ? 'execute in transaction' : 'execute without transaction');
    if (this.result instanceof Error) return Promise.reject(this.result);
    return Promise.resolve(this.result);
  }
}

function fixture(failFirstObserver = false) {
  const log: string[] = [];
  let observerFailed = false;
  const dataSource = {
    transaction: async (_isolation: string, work: (tx: Tx) => Promise<unknown>) => {
      log.push('begin');
      try {
        const value = await work(TX);
        log.push('commit');
        return value;
      } catch (error) {
        log.push('rollback');
        throw error;
      }
    },
  };
  const events = {
    emitAsync: (type: string) => {
      log.push(`publish ${type}`);
      if (failFirstObserver && !observerFailed) {
        observerFailed = true;
        return Promise.reject(new Error('observer down'));
      }
      return Promise.resolve([]);
    },
  } as unknown as EventEmitter2;
  const bus = new CommandBus(dataSource as never, events, { append: async () => {} } as never);
  return { bus, log };
}

async function failure(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Expected the dispatch to be rejected');
}

describe('US-AD-01 Create a scheduled flight (command bus)', () => {
  it('US-AD-01-T01 a traveler is forbidden and the command never runs', async () => {
    const { bus, log } = fixture();
    const command = new Recorded(log, ok({ value: 'done', audit: [] }));

    expect((await failure(bus.dispatch(command, asTraveler()))).status).toBe(403);
    expect((await failure(bus.dispatch(command, asAnonymous()))).status).toBe(401);
    expect(log).toEqual([]);
  });

  it('US-AD-01-T17 an administrator runs the command inside one transaction', async () => {
    const { bus, log } = fixture();

    const result = await bus.dispatch(
      new Recorded(log, ok({ value: 'done', audit: [] })),
      asAdmin(),
    );

    expect(result).toEqual(ok('done'));
    expect(log).toEqual(['begin', 'execute in transaction', 'commit']);
  });

  it('US-AD-01-T18 an expected failure rolls the transaction back and is returned, not thrown', async () => {
    const { bus, log } = fixture();

    const result = await bus.dispatch(new Recorded(log, err('REFUSED')), asAdmin());

    expect(result).toEqual({ ok: false, error: 'REFUSED' });
    expect(log).toEqual(['begin', 'execute in transaction', 'rollback']);
  });

  it('US-AD-01-T19 an unexpected error rolls back and propagates', async () => {
    const { bus, log } = fixture();

    await expect(
      bus.dispatch(new Recorded(log, new Error('database down')), asAdmin()),
    ).rejects.toThrow('database down');
    expect(log).toEqual(['begin', 'execute in transaction', 'rollback']);
  });
});

describe('US-AD-02 Update a flight status (command bus)', () => {
  it('US-AD-02-T04 events are published only after the transaction has committed', async () => {
    const { bus, log } = fixture();

    await bus.dispatch(
      new Recorded(log, ok({ value: 'done', audit: [], events: [DELAYED] })),
      asAdmin(),
    );

    expect(log).toEqual(['begin', 'execute in transaction', 'commit', 'publish FlightDelayed']);
  });

  it('US-AD-02-T05 a command that fails publishes nothing', async () => {
    const { bus, log } = fixture();

    await bus.dispatch(new Recorded(log, err('REFUSED')), asAdmin());

    expect(log).not.toContain('publish FlightDelayed');
  });

  it('US-AD-02-T12 a failed observer leaves the committed result intact and later events are published', async () => {
    const { bus, log } = fixture(true);
    const events = [DELAYED, { ...DELAYED, eventId: 'e-2' }];

    await expect(
      bus.dispatch(new Recorded(log, ok({ value: 'done', audit: [], events })), asAdmin()),
    ).resolves.toEqual(ok('done'));
    expect(log).toEqual([
      'begin',
      'execute in transaction',
      'commit',
      'publish FlightDelayed',
      'publish FlightDelayed',
    ]);
  });
});
