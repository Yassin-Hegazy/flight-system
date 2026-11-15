import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * The booking flow from the traveler's side: passengers (US-BK-01, US-BK-09), the fare the traveler
 * saw (US-BK-03), the hold and its countdown (US-BK-02), paying and retrying a declined card
 * (US-PAY-01, US-PAY-02). The API is stubbed at the network layer; each test states what it answers.
 */

const money = (amountMinor: number) => ({ amountMinor, currency: 'EGP' });
const CAIRO = { code: 'CAI', name: 'Cairo International', city: 'Cairo', timezone: 'Africa/Cairo' };
const LONDON = { code: 'LHR', name: 'Heathrow', city: 'London', timezone: 'Europe/London' };

const FLIGHT = {
  id: 'f-1',
  flightNumber: 'MS777',
  airline: { code: 'MS', name: 'EgyptAir' },
  origin: CAIRO,
  destination: LONDON,
  scheduledDepartureLocal: '2026-12-10T09:00+02:00',
  scheduledArrivalLocal: '2026-12-10T12:00+00:00',
  durationMinutes: 300,
  status: 'SCHEDULED',
  fares: { ECONOMY: money(1_500_000) },
};

/** What the search answers for this flight and a party of one adult and one child. */
const QUOTE = {
  flightId: 'f-1',
  flightNumber: 'MS777',
  airline: FLIGHT.airline,
  origin: CAIRO,
  destination: LONDON,
  departureLocal: FLIGHT.scheduledDepartureLocal,
  arrivalLocal: FLIGHT.scheduledArrivalLocal,
  status: 'SCHEDULED',
  durationMinutes: 300,
  stops: 0,
  cabin: 'ECONOMY',
  adultFare: money(1_500_000),
  total: money(2_625_000),
  breakdown: [
    { passengerType: 'ADULT', count: 1, unitPrice: money(1_500_000), amount: money(1_500_000) },
    { passengerType: 'CHILD', count: 1, unitPrice: money(1_125_000), amount: money(1_125_000) },
  ],
};

const booking = (status: string, expiresAt: string | null) => ({
  reference: 'S28N6D',
  flightId: 'f-1',
  cabin: 'ECONOMY',
  status,
  amount: money(2_625_000),
  expiresAt,
  cancelReason: null,
  passengers: [
    {
      firstName: 'Sara',
      lastName: 'Hassan',
      birthDate: '1990-05-01',
      type: 'ADULT',
      fare: money(1_500_000),
    },
    {
      firstName: 'Omar',
      lastName: 'Hassan',
      birthDate: '2018-06-01',
      type: 'CHILD',
      fare: money(1_125_000),
    },
  ],
  segments: [{ flightId: 'f-1', cabin: 'ECONOMY' }],
  history: [],
});

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const error = (status: number, body: object) => ({ status, json: { requestId: 'e2e', ...body } });

interface Stub {
  signedIn?: boolean;
  /** Answers to POST /bookings, in order; the last one repeats. */
  create?: { status: number; json: object }[];
  /** The booking GET /bookings/S28N6D answers; replaced once a payment succeeds. */
  booking?: object;
  /** Answers to POST /bookings/S28N6D/payments, in order. */
  payments?: { status: number; json: object }[];
}

async function stub(page: Page, options: Stub = {}) {
  const seen = {
    creates: [] as { headers: Record<string, string>; body: Record<string, unknown> }[],
    payments: [] as { headers: Record<string, string>; body: Record<string, unknown> }[],
  };
  let current = options.booking ?? booking('PENDING_PAYMENT', inMinutes(15));
  await page.route('**/api/users/me', (route) =>
    options.signedIn === false
      ? route.fulfill(error(401, { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' }))
      : route.fulfill({
          json: { id: 'u-1', email: 'sara@example.com', name: 'Sara Hassan', role: 'TRAVELER' },
        }),
  );
  await page.route('**/api/users/me/saved-travelers', (route) =>
    route.fulfill({
      json: [{ id: 't-1', ownerId: 'u-1', name: 'Omar Hassan', dateOfBirth: '2018-06-01' }],
    }),
  );
  await page.route('**/api/flights/f-1', (route) => route.fulfill({ json: FLIGHT }));
  await page.route('**/api/search/flights?**', (route) =>
    route.fulfill({
      json: {
        items: [QUOTE],
        page: 1,
        pageSize: 20,
        total: 1,
        hasNext: false,
        sort: 'PRICE',
        filters: {},
      },
    }),
  );
  await page.route('**/api/bookings', (route) => {
    const request = route.request();
    seen.creates.push({
      headers: request.headers(),
      body: request.postDataJSON() as Record<string, unknown>,
    });
    const answers = options.create ?? [{ status: 201, json: current }];
    return route.fulfill(answers[Math.min(seen.creates.length, answers.length) - 1]);
  });
  await page.route('**/api/bookings/S28N6D', (route) => route.fulfill({ json: current }));
  await page.route('**/api/bookings/S28N6D/payments', (route) => {
    const request = route.request();
    seen.payments.push({
      headers: request.headers(),
      body: request.postDataJSON() as Record<string, unknown>,
    });
    const answers = options.payments ?? [];
    const answer = answers[Math.min(seen.payments.length, answers.length) - 1];
    if (answer?.status === 201) current = booking('TICKETED', null);
    return route.fulfill(answer);
  });
  return seen;
}

const BOOK = '/book?flightId=f-1&adults=1&children=1&infants=0&cabin=ECONOMY';
const PAY = '/bookings/S28N6D/pay';
const PAID = {
  status: 201,
  json: {
    id: 'p-1',
    status: 'SUCCEEDED',
    amount: money(2_625_000),
    card: { brand: 'VISA', last4: '4242' },
  },
};
const DECLINED = error(400, {
  code: 'DECLINED',
  message: 'The gateway declined this payment.',
  fieldErrors: { reason: 'insufficient_funds' },
});

async function fillPassengers(page: Page) {
  const adult = page.getByRole('group', { name: 'Passenger 1, adult' });
  await adult.getByLabel('First name').fill('Sara');
  await adult.getByLabel('Last name').fill('Hassan');
  await adult.getByLabel('Date of birth').fill('1990-05-01');
  const child = page.getByRole('group', { name: 'Passenger 2, child' });
  await child.getByLabel('First name').fill('Omar');
  await child.getByLabel('Last name').fill('Hassan');
  await child.getByLabel('Date of birth').fill('2018-06-01');
}

test('US-BK-01-T20 booking sends the passengers, the total the traveler saw and one idempotency key, then opens payment', async ({
  page,
}) => {
  const seen = await stub(page);
  await page.goto(BOOK);
  await expect(page.getByTestId('booking-total')).toHaveText('EGP 26,250.00');
  await fillPassengers(page);
  await page.getByRole('button', { name: 'Hold seats and continue' }).click();

  await expect(page).toHaveURL(/\/bookings\/S28N6D\/pay$/);
  const { headers, body } = seen.creates[0];
  expect(headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  expect(headers['x-requested-with']).toBeTruthy();
  expect(body).toEqual({
    flightId: 'f-1',
    cabin: 'ECONOMY',
    displayedTotal: 2_625_000,
    passengers: [
      { firstName: 'Sara', lastName: 'Hassan', birthDate: '1990-05-01', type: 'ADULT' },
      { firstName: 'Omar', lastName: 'Hassan', birthDate: '2018-06-01', type: 'CHILD' },
    ],
  });
});

test('US-BK-01-T21 a passenger field the API rejects shows its message next to that field', async ({
  page,
}) => {
  const message = 'The passenger type does not match their age on the departure date.';
  await stub(page, {
    create: [
      error(400, {
        code: 'VALIDATION_ERROR',
        message: 'Some fields are invalid.',
        fieldErrors: { 'passengers.1.type': message },
      }),
    ],
  });
  await page.goto(BOOK);
  await fillPassengers(page);
  await page.getByRole('button', { name: 'Hold seats and continue' }).click();

  const birth = page.getByRole('group', { name: 'Passenger 2, child' }).getByLabel('Date of birth');
  await expect(birth).toHaveAttribute('aria-invalid', 'true');
  await expect(birth).toHaveAccessibleDescription(message);
  await expect(page).toHaveURL(/\/book\?/);
});

test('US-BK-01-T22 booking asks a signed-out traveler to sign in and remembers where they were', async ({
  page,
}) => {
  await stub(page, { signedIn: false });
  await page.goto(BOOK);

  await expect(page).toHaveURL(/\/sign-in\?next=%2Fbook%3FflightId%3Df-1/);
});

test('US-BK-03-T20 a changed fare is shown to the traveler and only booked once they accept it', async ({
  page,
}) => {
  const seen = await stub(page, {
    create: [
      error(409, {
        code: 'PRICE_CHANGED',
        message: 'The fare changed since it was displayed.',
        fieldErrors: { currentTotal: '2800000', currency: 'EGP' },
      }),
      { status: 201, json: booking('PENDING_PAYMENT', inMinutes(15)) },
    ],
  });
  await page.goto(BOOK);
  await fillPassengers(page);
  await page.getByRole('button', { name: 'Hold seats and continue' }).click();

  const notice = page.getByRole('main').getByRole('alert');
  await expect(notice).toContainText('The fare changed since it was displayed.');
  await expect(notice).toContainText('EGP 28,000.00');
  await expect(notice).toContainText('EGP 26,250.00');
  expect(seen.creates).toHaveLength(1);

  await notice.getByRole('button', { name: 'Accept EGP 28,000.00 and continue' }).click();
  await expect(page).toHaveURL(/\/bookings\/S28N6D\/pay$/);
  expect(seen.creates[1].body.displayedTotal).toBe(2_800_000);
  expect(seen.creates[1].headers['idempotency-key']).not.toBe(
    seen.creates[0].headers['idempotency-key'],
  );
});

test('US-BK-09-T20 choosing a saved traveler fills in that passenger', async ({ page }) => {
  await stub(page);
  await page.goto(BOOK);
  const child = page.getByRole('group', { name: 'Passenger 2, child' });
  await child.getByLabel('Fill from a saved traveler').selectOption({ label: 'Omar Hassan' });

  await expect(child.getByLabel('First name')).toHaveValue('Omar');
  await expect(child.getByLabel('Last name')).toHaveValue('Hassan');
  await expect(child.getByLabel('Date of birth')).toHaveValue('2018-06-01');
});

test('US-BK-02-T20 the payment page counts down the 15-minute hold', async ({ page }) => {
  await stub(page, { booking: booking('PENDING_PAYMENT', inMinutes(15)) });
  await page.goto(PAY);

  await expect(page.getByRole('timer')).toHaveText(/^1[45]:[0-5]\d$/);
  await expect(page.getByText('Booking S28N6D')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pay EGP 26,250.00' })).toBeEnabled();
});

test('US-BK-02-T21 a hold that ran out says so and cannot be paid', async ({ page }) => {
  await stub(page, { booking: booking('PENDING_PAYMENT', inMinutes(-1)) });
  await page.goto(PAY);

  await expect(page.getByText('The hold on these seats has expired.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pay / })).toHaveCount(0);
});

test('US-PAY-01-T20 paying with an accepted card confirms the booking', async ({ page }) => {
  const seen = await stub(page, { payments: [PAID] });
  await page.goto(PAY);
  await page.getByRole('button', { name: 'Pay EGP 26,250.00' }).click();

  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
  await expect(page.getByText('VISA ending 4242')).toBeVisible();
  expect(seen.payments[0].body).toEqual({ token: 'tok_success' });
  expect(seen.payments[0].headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
});

test('US-PAY-02-T20 a declined card is reported and the traveler can pay again with another', async ({
  page,
}) => {
  const seen = await stub(page, { payments: [DECLINED, PAID] });
  await page.goto(PAY);
  await page.getByLabel('Test card that is declined').check();
  await page.getByRole('button', { name: 'Pay EGP 26,250.00' }).click();

  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'The gateway declined this payment.',
  );
  await page.getByLabel('Test card that is accepted').check();
  await page.getByRole('button', { name: 'Pay EGP 26,250.00' }).click();

  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
  expect(seen.payments.map((payment) => payment.body.token)).toEqual([
    'tok_declined',
    'tok_success',
  ]);
  expect(seen.payments[1].headers['idempotency-key']).not.toBe(
    seen.payments[0].headers['idempotency-key'],
  );
});

test('US-BK-01-T23 a one-way result books that flight for the party that was searched', async ({
  page,
}) => {
  await stub(page);
  await page.goto('/search?origin=CAI&destination=LHR&date=2026-12-10&adults=1&children=1');
  await page.getByRole('link', { name: 'Book MS777' }).click();

  await expect(page).toHaveURL(/\/book\?flightId=f-1&adults=1&children=1&infants=0&cabin=ECONOMY$/);
  await expect(page.getByRole('group', { name: 'Passenger 2, child' })).toBeVisible();
});

test('US-BK-01-T24 a round trip is booked as the chosen outbound and return together', async ({
  page,
}) => {
  await stub(page);
  const list = (items: object[]) => ({
    items,
    page: 1,
    pageSize: 20,
    total: items.length,
    hasNext: false,
    sort: 'PRICE',
    filters: {},
  });
  await page.route('**/api/search/round-trip?**', (route) =>
    route.fulfill({
      json: {
        outbound: list([QUOTE]),
        inbound: list([{ ...QUOTE, flightId: 'f-2', flightNumber: 'MS778' }]),
      },
    }),
  );
  await page.goto('/search?origin=CAI&destination=LHR&date=2026-12-10&returnDate=2026-12-17');
  await expect(page.getByText('Select an outbound and a return flight')).toBeVisible();
  await page.getByRole('button', { name: 'Select MS777' }).click();
  await page.getByRole('button', { name: 'Select MS778' }).click();

  await expect(page.getByRole('link', { name: 'Continue to booking' })).toHaveAttribute(
    'href',
    '/book?flightId=f-1&returnFlightId=f-2&adults=1&children=0&infants=0&cabin=ECONOMY',
  );
});

test('NFR-USAB-01-T07 the passengers and payment pages have no detectable accessibility violations', async ({
  page,
}) => {
  await stub(page);
  for (const [path, ready] of [
    [BOOK, page.getByTestId('booking-total')],
    [PAY, page.getByRole('timer')],
  ] as const) {
    await page.goto(path);
    await expect(ready).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, path).toEqual([]);
  }
});

test('NFR-COMP-01-T07 the passengers and payment pages never scroll sideways', async ({ page }) => {
  await stub(page);
  for (const [path, ready] of [
    [BOOK, page.getByTestId('booking-total')],
    [PAY, page.getByRole('timer')],
  ] as const) {
    await page.goto(path);
    await expect(ready).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
