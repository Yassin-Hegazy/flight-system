import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../shared/errors';
import { err, ok } from '../../shared/result';
import type { ResultPage, SearchApi } from './search-api';
import { SearchController } from './search.controller';
import type { OneWaySearchQuery, RoundTripSearchQuery } from './search.dto';

const KEYS = ['PRICE', 'DURATION', 'DEPARTURE_TIME', 'ARRIVAL_TIME'];

const emptyPage: ResultPage = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
  hasNext: false,
  sort: 'PRICE',
  filters: {},
};

function controllerWith(overrides: Partial<SearchApi> = {}) {
  const searchOneWay = vi.fn<SearchApi['searchOneWay']>(() => Promise.resolve(ok(emptyPage)));
  const searchRoundTrip = vi.fn<SearchApi['searchRoundTrip']>(() =>
    Promise.resolve(ok({ outbound: emptyPage, inbound: emptyPage })),
  );
  const api: SearchApi = { searchOneWay, searchRoundTrip, sortKeys: () => KEYS, ...overrides };
  return { searchOneWay, searchRoundTrip, controller: new SearchController(api) };
}

function query(fields: Partial<OneWaySearchQuery> = {}): OneWaySearchQuery {
  const base: OneWaySearchQuery = { origin: 'cai', destination: 'lhr', date: '2026-12-10' };
  return { ...base, ...fields };
}

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Expected the call to fail');
}

describe('US-FS-02 the HTTP edge reports an unsupported sort', () => {
  it('US-FS-02-T13 sort=CHEAPEST is a 400 whose message lists the four supported keys', async () => {
    const { controller } = controllerWith({
      searchOneWay: () => Promise.resolve(err('UNSUPPORTED_SORT')),
    });

    const error = await rejection(controller.searchOneWay(query({ sort: 'CHEAPEST' })));

    expect([error.status, error.code]).toEqual([400, 'UNSUPPORTED_SORT']);
    expect(error.message).toContain('PRICE, DURATION, DEPARTURE_TIME, ARRIVAL_TIME');
    expect(error.fieldErrors).toEqual({ sort: error.message });
  });
});

describe('NFR-SEC-03 the controller only builds typed criteria and maps results', () => {
  it('NFR-SEC-03-T07 query fields become typed criteria with defaults applied', async () => {
    const { searchOneWay, controller } = controllerWith();

    await controller.searchOneWay(
      query({ airlines: ['ms', 'BA'], departFrom: '06:00', maxTotal: 800000, sort: 'DURATION' }),
    );

    const [criteria] = searchOneWay.mock.calls[0];
    expect(criteria).toMatchObject({
      date: '2026-12-10',
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: 'ECONOMY',
      sort: 'DURATION',
      filters: {
        maxTotal: 800000,
        departureWindow: { from: '06:00', to: '23:59' },
        airlines: ['MS', 'BA'],
      },
    });
    expect([criteria.origin.value, criteria.destination.value]).toEqual(['CAI', 'LHR']);
  });

  it.each([
    ['SAME_AIRPORT', 'destination'],
    ['DATE_IN_PAST', 'date'],
    ['INVALID_PASSENGERS', 'adults'],
    ['INVALID_PAGE', 'page'],
    ['INVALID_PAGE_SIZE', 'pageSize'],
    ['INVALID_FILTER', 'departTo'],
  ] as const)(
    'NFR-SEC-03-T08 %s is a 400 in the shared shape, placed on the %s field',
    async (code, field) => {
      const { controller } = controllerWith({ searchOneWay: () => Promise.resolve(err(code)) });

      const error = await rejection(controller.searchOneWay(query()));

      expect([error.status, error.code]).toEqual([400, code]);
      expect(Object.keys(error.fieldErrors ?? {})).toEqual([field]);
    },
  );

  it('NFR-SEC-03-T09 an unknown airport is a 400 without guessing which field', async () => {
    const { controller } = controllerWith({
      searchOneWay: () => Promise.resolve(err('UNKNOWN_AIRPORT')),
    });

    const error = await rejection(controller.searchOneWay(query()));

    expect([error.status, error.code, error.fieldErrors]).toEqual([
      400,
      'UNKNOWN_AIRPORT',
      undefined,
    ]);
  });
});

describe('US-FS-06 the round-trip route', () => {
  it('US-FS-06-T07 builds both legs’ criteria, and a return before the outbound is a 400 on returnDate', async () => {
    const { searchRoundTrip, controller } = controllerWith();
    const roundTrip = {
      ...query(),
      returnDate: '2026-12-17',
      inboundSort: 'ARRIVAL_TIME',
      outboundPage: 2,
    } as RoundTripSearchQuery;

    await controller.searchRoundTrip(roundTrip);
    expect(searchRoundTrip.mock.calls[0][0]).toMatchObject({
      returnDate: '2026-12-17',
      inboundSort: 'ARRIVAL_TIME',
      outboundPage: 2,
    });

    const failing = controllerWith({
      searchRoundTrip: () => Promise.resolve(err('RETURN_BEFORE_OUTBOUND')),
    });
    const error = await rejection(failing.controller.searchRoundTrip(roundTrip));
    expect([error.code, Object.keys(error.fieldErrors ?? {})]).toEqual([
      'RETURN_BEFORE_OUTBOUND',
      ['returnDate'],
    ]);
  });
});
