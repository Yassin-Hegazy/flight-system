import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * The admin operations screens: dashboard, flights (list, create, operate), airports and the audit
 * trail (US-AD-01 to US-AD-07). The API is stubbed by a small in-memory fake of /admin/*.
 */

const ADMIN = { id: 'a-1', email: 'ops@aeron.test', name: 'Mona Adel', role: 'ADMIN' };
const error = (status: number, body: object) => ({ status, json: { requestId: 'e2e', ...body } });
const egp = (amountMinor: number) => ({ amountMinor, currency: 'EGP' });

const CAI = {
  code: 'CAI',
  name: 'Cairo International Airport',
  city: 'Cairo',
  timezone: 'Africa/Cairo',
};
const LHR = { code: 'LHR', name: 'Heathrow Airport', city: 'London', timezone: 'Europe/London' };
const DXB = { code: 'DXB', name: 'Dubai International', city: 'Dubai', timezone: 'Asia/Dubai' };

function flight(
  id: string,
  number: string,
  destination: typeof LHR,
  departure: string,
  status = 'SCHEDULED',
) {
  return {
    id,
    flightNumber: number,
    airline: { code: 'MS', name: 'EgyptAir' },
    origin: CAI,
    destination,
    scheduledDepartureUtc: departure,
    scheduledArrivalUtc: departure,
    scheduledDepartureLocal: `${departure.slice(0, 16)}+02:00`,
    scheduledArrivalLocal: `${departure.slice(0, 16)}+00:00`,
    durationMinutes: 300,
    status,
    fares: { ECONOMY: egp(1_500_000), BUSINESS: egp(6_000_000) },
  };
}

interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Record<string, unknown> | null;
  csrf?: string;
}

async function stubOps(page: Page) {
  const calls: Call[] = [];
  const flights = [
    flight('f-1', 'MS777', LHR, '2026-11-19T06:00:00.000Z'),
    flight('f-2', 'MS910', DXB, '2026-11-19T09:00:00.000Z', 'DELAYED'),
    flight('f-3', 'MS779', LHR, '2026-11-20T06:00:00.000Z', 'CANCELLED'),
  ];
  const airports = [
    { code: 'CAI', name: CAI.name, city: 'Cairo', country: 'Egypt', timezone: 'Africa/Cairo' },
    {
      code: 'DXB',
      name: DXB.name,
      city: 'Dubai',
      country: 'United Arab Emirates',
      timezone: 'Asia/Dubai',
    },
    {
      code: 'LHR',
      name: LHR.name,
      city: 'London',
      country: 'United Kingdom',
      timezone: 'Europe/London',
    },
  ];
  const load = [
    {
      flightId: 'f-1',
      cabin: 'ECONOMY',
      capacity: 180,
      committedSeats: 2,
      activeHeldSeats: 1,
      availableSeats: 177,
    },
    {
      flightId: 'f-1',
      cabin: 'BUSINESS',
      capacity: 20,
      committedSeats: 0,
      activeHeldSeats: 0,
      availableSeats: 20,
    },
  ];
  const audit = Array.from({ length: 21 }, (_, index) => ({
    id: `au-${index}`,
    actorId: 'a125bf99-b622-45e3-b0a7-cdc30268be85',
    action: index === 0 ? 'UpdateFlightStatus' : 'ConfigureCapacity',
    target: index === 0 ? 'f-1' : `f-1/ECONOMY`,
    flightId: 'f-1',
    before: index === 0 ? { status: 'SCHEDULED' } : { capacity: 180 + index },
    after: index === 0 ? { status: 'DELAYED' } : { capacity: 181 + index },
    createdAt: '2026-11-18T19:00:00.000Z',
  }));

  const page20 = <T>(items: T[], query: URLSearchParams) => {
    const number = Number(query.get('page') ?? '1');
    return {
      items: items.slice((number - 1) * 20, number * 20),
      total: items.length,
      page: number,
      pageSize: 20,
    };
  };

  await page.route('**/api/notifications**', (route) =>
    route.fulfill({ json: { items: [], unread: 0, total: 0, page: 1, pageSize: 20 } }),
  );
  await page.route('**/api/users/me', (route) => route.fulfill({ json: ADMIN }));
  await page.route('**/api/flights/*', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1);
    const found = flights.find((item) => item.id === id);
    return found
      ? route.fulfill({ json: found })
      : route.fulfill(error(404, { code: 'FLIGHT_NOT_FOUND', message: 'Flight not found.' }));
  });
  type Handler = (route: Route, call: Call, match: RegExpExecArray) => Promise<void>;
  const listFlights: Handler = (route, { query: q }) => {
    const wanted = (value: string, key: string) => !q.get(key) || value === q.get(key);
    const after = (value: string) => !q.get('departingFrom') || value >= q.get('departingFrom')!;
    const before = (value: string) =>
      !q.get('departingBefore') || value < q.get('departingBefore')!;
    const matches = flights.filter(
      (item) =>
        wanted(item.destination.code, 'destination') &&
        wanted(item.status, 'status') &&
        wanted(item.flightNumber, 'flightNumber') &&
        after(item.scheduledDepartureUtc) &&
        before(item.scheduledDepartureUtc),
    );
    return route.fulfill({ json: page20(matches, q) });
  };
  const createFlight: Handler = (route, { body }) => {
    if (body?.flightNumber === 'MS777') {
      return route.fulfill(
        error(409, {
          code: 'DUPLICATE_FLIGHT',
          message: 'This flight already exists on that date.',
        }),
      );
    }
    flights.push(
      flight('f-new', String(body?.flightNumber), LHR, String(body?.scheduledDepartureUtc)),
    );
    return route.fulfill({ status: 201, json: { id: 'f-new' } });
  };
  const changeStatus: Handler = (route, { body }, [, id]) => {
    const target = flights.find((item) => item.id === id)!;
    const previousStatus = target.status;
    target.status = String(body?.status);
    return route.fulfill({ json: { status: target.status, previousStatus } });
  };
  const cancel: Handler = (route, _call, [, id]) => {
    flights.find((item) => item.id === id)!.status = 'CANCELLED';
    return route.fulfill({ json: { status: 'CANCELLED' } });
  };
  const capacity: Handler = (route, { body }, [, , cabin]) => {
    if (Number(body?.capacity) < 3) {
      return route.fulfill(
        error(409, {
          code: 'BELOW_SOLD',
          message: 'Capacity cannot be below 2 committed plus 1 held seats.',
          fieldErrors: { committedSeats: '2', activeHeldSeats: '1' },
        }),
      );
    }
    load.find((item) => item.cabin === cabin)!.capacity = Number(body?.capacity);
    return route.fulfill({ json: { capacity: body?.capacity } });
  };
  const fare: Handler = (route, { body }, [, id, cabin]) => {
    const target = flights.find((item) => item.id === id)!;
    (target.fares as Record<string, unknown>)[cabin] = egp(Number(body?.amountMinor));
    return route.fulfill({ json: egp(Number(body?.amountMinor)) });
  };
  const listAirports: Handler = (route, { query }) => {
    const q = query.get('q')?.toLowerCase();
    const matches = airports.filter(
      (item) => !q || item.code.toLowerCase().startsWith(q) || item.city.toLowerCase().includes(q),
    );
    return route.fulfill({ json: page20(matches, query) });
  };
  const saveAirport: Handler = (route, { body }, [, code]) => {
    const saved = { code, ...(body as object) } as (typeof airports)[number];
    const index = airports.findIndex((item) => item.code === code);
    if (index >= 0) airports[index] = saved;
    else airports.push(saved);
    airports.sort((a, b) => a.code.localeCompare(b.code));
    return route.fulfill({ json: { code } });
  };
  const deleteAirport: Handler = (route, _call, [, code]) => {
    if (code === 'CAI') {
      return route.fulfill(
        error(409, { code: 'AIRPORT_IN_USE', message: 'Flights use this airport.' }),
      );
    }
    airports.splice(
      airports.findIndex((item) => item.code === code),
      1,
    );
    return route.fulfill({ json: { code } });
  };
  const auditPage: Handler = (route, { query }) => {
    const pageNumber = Number(query.get('page') ?? '1');
    return route.fulfill({ json: audit.slice((pageNumber - 1) * 20, pageNumber * 20) });
  };
  const manifest = [
    {
      passengerName: 'Nour Hassan',
      bookingReference: 'AB12CD',
      ticketNumber: '0771234567890',
      status: 'ISSUED',
    },
  ];
  const ROUTES: [string, RegExp, Handler][] = [
    ['GET', /^\/admin\/flights$/, listFlights],
    ['POST', /^\/admin\/flights$/, createFlight],
    ['GET', /^\/admin\/flights\/([^/]+)\/load$/, (route) => route.fulfill({ json: load })],
    ['GET', /^\/admin\/flights\/([^/]+)\/manifest$/, (route) => route.fulfill({ json: manifest })],
    ['PATCH', /^\/admin\/flights\/([^/]+)\/status$/, changeStatus],
    ['POST', /^\/admin\/flights\/([^/]+)\/cancel$/, cancel],
    ['PUT', /^\/admin\/flights\/([^/]+)\/capacity\/(\w+)$/, capacity],
    ['PUT', /^\/admin\/flights\/([^/]+)\/fares\/(\w+)$/, fare],
    ['GET', /^\/admin\/airports$/, listAirports],
    ['PUT', /^\/admin\/airports\/([A-Z]{3})$/, saveAirport],
    ['DELETE', /^\/admin\/airports\/([A-Z]{3})$/, deleteAirport],
    ['GET', /^\/admin\/audit$/, auditPage],
  ];

  await page.route('**/api/admin/**', (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const call: Call = {
      method: request.method(),
      path: url.pathname.replace(/^\/api/, ''),
      query: url.searchParams,
      body: request.postData() ? (request.postDataJSON() as Record<string, unknown>) : null,
      csrf: request.headers()['x-requested-with'],
    };
    calls.push(call);
    for (const [method, pattern, handle] of ROUTES) {
      const match = method === call.method ? pattern.exec(call.path) : null;
      if (match) return handle(route, call, match);
    }
    return route.fulfill(error(404, { code: 'NOT_FOUND', message: 'Not found.' }));
  });
  return { calls, flights, airports };
}

const writes = (calls: Call[]) => calls.filter(({ method }) => method !== 'GET');

test('US-AD-05-T20 the flights list shows every flight with its status and filters through the API', async ({
  page,
}) => {
  const { calls } = await stubOps(page);
  await page.goto('/admin/flights');

  const rows = page.getByRole('table', { name: 'Flights' }).getByRole('row');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toContainText('MS777');
  await expect(rows.nth(2)).toContainText('Delayed');
  await expect(page.getByText('3 flights')).toBeVisible();

  await page.getByLabel('To', { exact: true }).fill('dxb');
  await page.getByLabel('Status').selectOption('DELAYED');
  await page.getByRole('button', { name: 'Apply filters' }).click();

  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText('MS910');
  await expect(page).toHaveURL(/destination=DXB/);
  const last = calls.filter(({ path }) => path === '/admin/flights').at(-1)!;
  expect(last.query.get('destination')).toBe('DXB');
  expect(last.query.get('status')).toBe('DELAYED');
});

test('US-AD-05-T21 a departure date filters one UTC day', async ({ page }) => {
  const { calls } = await stubOps(page);
  await page.goto('/admin/flights');
  await page.getByLabel('Departure date (UTC)').fill('2026-11-20');
  await page.getByRole('button', { name: 'Apply filters' }).click();

  await expect(page.getByRole('table', { name: 'Flights' }).getByRole('row')).toHaveCount(2);
  const last = calls.filter(({ path }) => path === '/admin/flights').at(-1)!;
  expect(last.query.get('departingFrom')).toBe('2026-11-20T00:00:00.000Z');
  expect(last.query.get('departingBefore')).toBe('2026-11-21T00:00:00.000Z');
});

test('US-AD-01-T30 creating a flight sends UTC instants and minor units, then opens it', async ({
  page,
}) => {
  const { calls } = await stubOps(page);
  await page.goto('/admin/flights/new');
  await page.getByLabel('Flight number').fill('ms801');
  await page.getByLabel('Airline code').fill('ms');
  await page.getByLabel('From', { exact: true }).fill('cai');
  await page.getByLabel('To', { exact: true }).fill('lhr');
  await page.getByLabel('Departure (UTC)').fill('2027-01-10T06:00');
  await page.getByLabel('Arrival (UTC)').fill('2027-01-10T11:00');
  await page.getByLabel('Economy fare (EGP)').fill('15000');
  await page.getByLabel('Business fare (EGP)').fill('60000.50');
  await page.getByLabel('Economy seats').fill('180');
  await page.getByLabel('Business seats').fill('20');
  await page.getByRole('button', { name: 'Create flight' }).click();

  await expect(page).toHaveURL(/\/admin\/flights\/f-new$/);
  const created = writes(calls).find(({ path }) => path === '/admin/flights')!;
  expect(created.body).toEqual({
    flightNumber: 'MS801',
    airlineCode: 'MS',
    originCode: 'CAI',
    destinationCode: 'LHR',
    scheduledDepartureUtc: '2027-01-10T06:00:00Z',
    scheduledArrivalUtc: '2027-01-10T11:00:00Z',
    currency: 'EGP',
    fares: { ECONOMY: 1_500_000, BUSINESS: 6_000_050 },
    capacity: { ECONOMY: 180, BUSINESS: 20 },
  });
  expect(created.csrf).toBeTruthy();
});

test('US-AD-01-T31 a duplicate flight is reported and nothing navigates away', async ({ page }) => {
  await stubOps(page);
  await page.goto('/admin/flights/new');
  await page.getByLabel('Flight number').fill('MS777');
  await page.getByLabel('Airline code').fill('MS');
  await page.getByLabel('From', { exact: true }).fill('CAI');
  await page.getByLabel('To', { exact: true }).fill('LHR');
  await page.getByLabel('Departure (UTC)').fill('2027-01-10T06:00');
  await page.getByLabel('Arrival (UTC)').fill('2027-01-10T11:00');
  await page.getByLabel('Economy fare (EGP)').fill('15000');
  await page.getByLabel('Business fare (EGP)').fill('60000');
  await page.getByLabel('Economy seats').fill('180');
  await page.getByLabel('Business seats').fill('20');
  await page.getByRole('button', { name: 'Create flight' }).click();

  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'This flight already exists on that date.',
  );
  await expect(page).toHaveURL(/\/admin\/flights\/new$/);
});

test('US-AD-05-T22 a flight page shows the load of each cabin and the passenger manifest', async ({
  page,
}) => {
  await stubOps(page);
  await page.goto('/admin/flights/f-1');

  await expect(page.getByRole('heading', { name: 'MS777 · CAI → LHR' })).toBeVisible();
  const load = page.getByRole('table', { name: 'Seats by cabin' });
  await expect(load.getByRole('row', { name: /Economy/ })).toContainText('180');
  await expect(load.getByRole('row', { name: /Economy/ })).toContainText('177');
  await expect(page.getByRole('table', { name: 'Passenger manifest' })).toContainText(
    'Nour Hassan',
  );
});

test('US-AD-02-T20 delaying a flight sends the new departure, and only allowed moves are offered', async ({
  page,
}) => {
  const { calls } = await stubOps(page);
  await page.goto('/admin/flights/f-1');

  const status = page.getByLabel('New status');
  await expect(status.locator('option')).toHaveText(['Delayed', 'Boarding']);
  await status.selectOption('DELAYED');
  await page.getByLabel('New departure (UTC)').fill('2026-11-19T08:30');
  await page.getByRole('button', { name: 'Update status' }).click();

  await expect(page.getByTestId('flight-status')).toHaveText('Delayed');
  const sent = writes(calls).find(({ path }) => path === '/admin/flights/f-1/status')!;
  expect(sent.body).toEqual({ status: 'DELAYED', estimatedDepartureUtc: '2026-11-19T08:30:00Z' });
});

test('US-AD-04-T20 cancelling needs a reason and a confirmation', async ({ page }) => {
  const { calls } = await stubOps(page);
  await page.goto('/admin/flights/f-1');

  await page.getByLabel('Reason for cancelling').fill('Runway closed by the authority');
  await page.getByRole('button', { name: 'Cancel this flight' }).click();
  expect(writes(calls).filter(({ path }) => path.endsWith('/cancel'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Yes, cancel MS777' }).click();

  await expect(page.getByTestId('flight-status')).toHaveText('Cancelled');
  const sent = writes(calls).find(({ path }) => path === '/admin/flights/f-1/cancel')!;
  expect(sent.body).toEqual({ reason: 'Runway closed by the authority' });
  await expect(page.getByRole('button', { name: 'Update status' })).toHaveCount(0);
});

test('US-AD-03-T20 capacity and fares are set per cabin, and a shrink below sold seats is explained', async ({
  page,
}) => {
  const { calls } = await stubOps(page);
  await page.goto('/admin/flights/f-1');

  const economy = page.getByRole('region', { name: 'Economy cabin' });
  await economy.getByLabel('Seats').fill('2');
  await economy.getByRole('button', { name: 'Save seats' }).click();
  await expect(economy.getByRole('alert')).toHaveText(
    'Capacity cannot be below 2 committed plus 1 held seats.',
  );

  await economy.getByLabel('Seats').fill('200');
  await economy.getByRole('button', { name: 'Save seats' }).click();
  await expect(
    page.getByRole('table', { name: 'Seats by cabin' }).getByRole('row', { name: /Economy/ }),
  ).toContainText('200');

  await economy.getByLabel('Adult fare (EGP)').fill('16000');
  await economy.getByRole('button', { name: 'Save fare' }).click();
  await expect(economy.getByRole('status')).toHaveText('Fare saved: EGP 16,000.00');
  const fare = writes(calls).find(({ path }) => path === '/admin/flights/f-1/fares/ECONOMY')!;
  expect(fare.body).toEqual({ amountMinor: 1_600_000, currency: 'EGP' });
});

test('US-AD-06-T20 airports are listed, searched, added, edited, and a used one is not deleted', async ({
  page,
}) => {
  const { calls } = await stubOps(page);
  await page.goto('/admin/airports');
  const rows = page.getByRole('table', { name: 'Airports' }).getByRole('row');
  await expect(rows).toHaveCount(4);

  await page.getByLabel('Search airports').fill('lon');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(rows).toHaveCount(2);
  await page.getByLabel('Search airports').fill('');
  await page.getByRole('button', { name: 'Search' }).click();

  await page.getByLabel('IATA code').fill('alx');
  await page.getByLabel('Airport name').fill('Borg El Arab');
  await page.getByLabel('City').fill('Alexandria');
  await page.getByLabel('Country').fill('Egypt');
  await page.getByLabel('Time zone').fill('Africa/Cairo');
  await page.getByRole('button', { name: 'Save airport' }).click();
  await expect(rows).toHaveCount(5);
  const put = writes(calls).find(({ path }) => path === '/admin/airports/ALX')!;
  expect(put.body).toEqual({
    name: 'Borg El Arab',
    city: 'Alexandria',
    country: 'Egypt',
    timezone: 'Africa/Cairo',
  });

  await page.getByRole('button', { name: 'Edit DXB' }).click();
  await expect(page.getByLabel('IATA code')).toHaveValue('DXB');
  await expect(page.getByLabel('IATA code')).toBeDisabled();

  await page.getByRole('button', { name: 'Delete CAI' }).click();
  await page.getByRole('button', { name: 'Yes, delete CAI' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Flights use this airport.');
  await expect(rows).toHaveCount(5);
});

test('US-AD-07-T20 the audit trail shows who changed what, page by page, and filters by flight', async ({
  page,
}) => {
  const { calls } = await stubOps(page);
  await page.goto('/admin/audit');

  const rows = page.getByRole('table', { name: 'Audit trail' }).getByRole('row');
  await expect(rows).toHaveCount(21);
  await expect(rows.nth(1)).toContainText('Update flight status');
  await expect(rows.nth(1)).toContainText('status: SCHEDULED → DELAYED');
  await page.getByRole('link', { name: 'Next page' }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Next page' })).toHaveCount(0);

  await page.goto('/admin/flights/f-1');
  await page.getByRole('link', { name: 'Audit trail for this flight' }).click();
  await expect(page).toHaveURL(/\/admin\/audit\?flightId=f-1/);
  await expect(rows.first()).toBeVisible();
  expect(
    calls
      .filter(({ path }) => path === '/admin/audit')
      .at(-1)!
      .query.get('flightId'),
  ).toBe('f-1');
});

test('US-AD-05-T23 the dashboard counts today’s departures and shows what is next', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-19T05:00:00Z'));
  await stubOps(page);
  await page.goto('/admin');

  await expect(page.getByTestId('stat-today')).toHaveText('2');
  await expect(page.getByTestId('stat-delayed')).toHaveText('1');
  await expect(page.getByTestId('stat-cancelled')).toHaveText('0');
  await expect(page.getByRole('table', { name: 'Next departures' })).toContainText('MS777');
  await expect(page.getByRole('list', { name: 'Recent changes' })).toContainText(
    'Update flight status',
  );
});

test('US-AD-05-T24 the admin sidebar links every admin screen', async ({ page }) => {
  await stubOps(page);
  await page.goto('/admin');
  const nav = page.getByRole('navigation', { name: 'Administration' });
  await expect(nav.getByRole('link')).toHaveText([
    'Dashboard',
    'Flights',
    'Airports',
    'Audit trail',
    'Admin users',
  ]);
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('NFR-USAB-01-T20 the admin screens have no accessibility violations and never scroll sideways', async ({
  page,
}) => {
  await stubOps(page);
  for (const [path, ready] of [
    ['/admin', 'Next departures'],
    ['/admin/flights', 'Flights'],
    ['/admin/flights/new', 'Create flight'],
    ['/admin/flights/f-1', 'Seats by cabin'],
    ['/admin/airports', 'Airports'],
    ['/admin/audit', 'Audit trail'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('main').getByText(ready).first()).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, path).toEqual([]);
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(sideways, path).toBe(false);
  }
});
