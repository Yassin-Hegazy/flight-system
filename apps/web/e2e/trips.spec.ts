import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * My bookings, one booking, cancelling it, its receipt and its tickets (US-BK-04..06, US-PAY-05,
 * US-TK-02, US-TK-04). The API is stubbed at the network layer; cancelling flips the stub's state.
 */

const money = (amountMinor: number) => ({ amountMinor, currency: 'EGP' });
const CAIRO = { code: 'CAI', name: 'Cairo International Airport', city: 'Cairo' };
const LONDON = { code: 'LHR', name: 'Heathrow Airport', city: 'London' };

const flight = {
  id: 'f-1',
  flightNumber: 'MS777',
  airline: { code: 'MS', name: 'EgyptAir' },
  origin: { ...CAIRO, timezone: 'Africa/Cairo' },
  destination: { ...LONDON, timezone: 'Europe/London' },
  scheduledDepartureLocal: '2026-12-10T08:00+02:00',
  scheduledArrivalLocal: '2026-12-10T11:00+00:00',
  durationMinutes: 300,
  status: 'SCHEDULED',
  fares: { ECONOMY: money(1_500_000) },
};

const booking = (status: string) => ({
  reference: 'S28N6D',
  flightId: 'f-1',
  cabin: 'ECONOMY',
  status,
  amount: money(1_500_000),
  expiresAt: null,
  cancelReason: status === 'CANCELLED' ? 'TRAVELER' : null,
  passengers: [
    {
      firstName: 'Sara',
      lastName: 'Hassan',
      birthDate: '1990-05-01',
      type: 'ADULT',
      fare: money(1_500_000),
    },
  ],
  segments: [{ flightId: 'f-1', cabin: 'ECONOMY' }],
  history: [
    { from: null, to: 'PENDING_PAYMENT', cause: 'CREATED', at: '2026-11-15T10:40:35.203Z' },
    { from: 'PENDING_PAYMENT', to: 'CONFIRMED', cause: 'PAYMENT', at: '2026-11-15T10:41:02.000Z' },
  ],
});

const ticket = (status: string) => ({
  ticketNumber: '9990000000001',
  status,
  bookingReference: 'S28N6D',
  passengerName: 'Sara Hassan',
  cabin: 'ECONOMY',
  flight: {
    flightNumber: 'MS777',
    airline: flight.airline,
    origin: CAIRO,
    destination: LONDON,
    scheduledDepartureLocal: flight.scheduledDepartureLocal,
    scheduledArrivalLocal: flight.scheduledArrivalLocal,
    status: 'SCHEDULED',
  },
  issuedAt: '2026-11-15T10:41:03.000Z',
  voidedAt: status === 'VOID' ? '2026-11-16T09:00:00.000Z' : null,
});

const eTicket = (status: string) => ({
  ticketNumber: '9990000000001',
  status,
  voidMarking: status === 'VOID' ? 'VOID' : null,
  passengerName: 'Sara Hassan',
  bookingReference: 'S28N6D',
  airline: 'EgyptAir',
  flightNumber: 'MS777',
  from: 'CAI',
  to: 'LHR',
  departureLocal: flight.scheduledDepartureLocal,
  arrivalLocal: flight.scheduledArrivalLocal,
  cabin: 'ECONOMY',
});

const receipt = (refunded: boolean) => ({
  id: 'p-1',
  status: 'SUCCEEDED',
  amount: money(1_500_000),
  card: { brand: 'VISA', last4: '4242' },
  bookingReference: 'S28N6D',
  createdAt: '2026-11-15T10:41:00.000Z',
  resolvedAt: '2026-11-15T10:41:02.000Z',
  declineReason: null,
  refund: refunded
    ? { status: 'SUCCEEDED', amount: money(1_500_000), resolvedAt: '2026-11-16T09:00:01.000Z' }
    : null,
});

interface Stub {
  signedIn?: boolean;
  status?: string;
  /** What POST cancel answers when it must fail. */
  cancelError?: { status: number; json: object };
}

async function stub(page: Page, options: Stub = {}) {
  const state = { status: options.status ?? 'TICKETED', cancels: 0 };
  const cancelled = () => state.status === 'CANCELLED';
  const guard = (json: () => unknown) => (route: import('@playwright/test').Route) =>
    options.signedIn === false
      ? route.fulfill({
          status: 401,
          json: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.', requestId: 'e2e' },
        })
      : route.fulfill({ json: json() });

  await page.route(
    '**/api/users/me',
    guard(() => ({ id: 'u-1', email: 'sara@example.com', name: 'Sara Hassan', role: 'TRAVELER' })),
  );
  await page.route('**/api/flights/f-1', (route) => route.fulfill({ json: flight }));
  await page.route(
    '**/api/bookings',
    guard(() => ({
      upcoming: [
        {
          reference: 'S28N6D',
          route: { origin: 'CAI', destination: 'LHR' },
          departureLocal: flight.scheduledDepartureLocal,
          status: state.status,
          total: money(1_500_000),
        },
      ],
      past: [
        {
          reference: 'OLD123',
          route: { origin: 'CAI', destination: 'DXB' },
          departureLocal: '2026-10-01T05:15+02:00',
          status: 'TICKETED',
          total: money(1_900_000),
        },
      ],
    })),
  );
  await page.route(
    '**/api/bookings/S28N6D',
    guard(() => booking(state.status)),
  );
  await page.route('**/api/bookings/NOPE00', (route) =>
    route.fulfill({
      status: 404,
      json: { code: 'NOT_FOUND', message: 'Booking not found.', requestId: 'e2e' },
    }),
  );
  await page.route('**/api/bookings/S28N6D/cancel', (route) => {
    state.cancels += 1;
    if (options.cancelError) return route.fulfill(options.cancelError);
    state.status = 'CANCELLED';
    return route.fulfill({ json: booking('CANCELLED') });
  });
  await page.route('**/api/bookings/S28N6D/receipt', (route) =>
    state.status === 'PENDING_PAYMENT'
      ? route.fulfill({
          status: 404,
          json: { code: 'NOT_FOUND', message: 'No payment yet.', requestId: 'e2e' },
        })
      : route.fulfill({ json: receipt(cancelled()) }),
  );
  await page.route('**/api/bookings/S28N6D/tickets', (route) =>
    route.fulfill({
      json: state.status === 'PENDING_PAYMENT' ? [] : [ticket(cancelled() ? 'VOID' : 'VALID')],
    }),
  );
  await page.route('**/api/tickets/9990000000001', (route) =>
    route.fulfill({ json: ticket(cancelled() ? 'VOID' : 'VALID') }),
  );
  await page.route('**/api/tickets/9990000000001/print', (route) =>
    route.fulfill({ json: eTicket(cancelled() ? 'VOID' : 'VALID') }),
  );
  return state;
}

const main = (page: Page) => page.getByRole('main');

test('US-BK-06-T20 my bookings lists upcoming and past trips with their status and total', async ({
  page,
}) => {
  await stub(page);
  await page.goto('/bookings');

  const upcoming = page.getByRole('region', { name: 'Upcoming' });
  await expect(upcoming.getByRole('listitem')).toHaveCount(1);
  await expect(upcoming).toContainText('S28N6D');
  await expect(upcoming).toContainText('Thu 10 Dec');
  await expect(upcoming).toContainText('08:00');
  await expect(upcoming).toContainText('Ticketed');
  await expect(upcoming).toContainText('EGP 15,000.00');
  await expect(page.getByRole('region', { name: 'Past' })).toContainText('OLD123');

  await upcoming.getByRole('link', { name: 'View booking S28N6D' }).click();
  await expect(page).toHaveURL(/\/bookings\/S28N6D$/);
});

test('US-BK-06-T22 expired bookings are hidden until the traveler asks to see them', async ({
  page,
}) => {
  await stub(page);
  await page.route('**/api/bookings?includeExpired=true', (route) =>
    route.fulfill({
      json: {
        upcoming: [],
        past: [
          {
            reference: 'EXP001',
            route: { origin: 'CAI', destination: 'JED' },
            departureLocal: '2026-12-01T07:00+02:00',
            status: 'EXPIRED',
            total: money(900_000),
          },
        ],
      },
    }),
  );
  await page.goto('/bookings');
  await expect(page.getByRole('region', { name: 'Past' })).toContainText('OLD123');
  await expect(page.getByText('EXP001')).toHaveCount(0);

  await page.getByLabel('Show expired bookings').check();

  const past = page.getByRole('region', { name: 'Past' });
  await expect(past).toContainText('EXP001');
  await expect(past).toContainText('Expired');
});

test('US-BK-06-T21 my bookings asks a signed-out traveler to sign in', async ({ page }) => {
  await stub(page, { signedIn: false });
  await page.goto('/bookings');

  await expect(page).toHaveURL(/\/sign-in\?next=%2Fbookings$/);
});

test('US-BK-04-T20 a booking shows its flight, passengers, fare and every status change', async ({
  page,
}) => {
  await stub(page);
  await page.goto('/bookings/S28N6D');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Booking S28N6D');
  await expect(page.getByTestId('booking-status')).toHaveText('Ticketed');
  const flights = page.getByRole('region', { name: 'Flights' });
  await expect(flights).toContainText('MS777');
  await expect(flights).toContainText('08:00');
  await expect(page.getByRole('region', { name: 'Passengers' })).toContainText('Sara Hassan');
  await expect(page.getByTestId('booking-total')).toHaveText('EGP 15,000.00');
  await expect(page.getByRole('region', { name: 'History' }).getByRole('listitem')).toHaveCount(2);
});

test('US-BK-04-T21 a booking that is not found, or not yours, says so', async ({ page }) => {
  await stub(page);
  await page.goto('/bookings/NOPE00');

  await expect(main(page).getByRole('alert')).toHaveText('Booking not found.');
});

test('US-BK-05-T20 cancelling asks first, then shows the booking cancelled and its refund', async ({
  page,
}) => {
  const state = await stub(page);
  await page.goto('/bookings/S28N6D');
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  expect(state.cancels).toBe(0);
  await page.getByRole('button', { name: 'Yes, cancel this booking' }).click();

  await expect(page.getByTestId('booking-status')).toHaveText('Cancelled');
  const receiptPanel = page.getByRole('region', { name: 'Receipt' });
  await expect(receiptPanel).toContainText('Refunded');
  await expect(receiptPanel.getByTestId('refund-amount')).toHaveText('EGP 15,000.00');
  await expect(page.getByRole('button', { name: 'Cancel booking' })).toHaveCount(0);
  expect(state.cancels).toBe(1);
});

test('US-BK-05-T21 a cancellation the API refuses is reported and the booking stays', async ({
  page,
}) => {
  await stub(page, {
    cancelError: {
      status: 409,
      json: {
        code: 'TOO_LATE_TO_CANCEL',
        message: 'Paid bookings can be cancelled until 24 hours before departure.',
        requestId: 'e2e',
      },
    },
  });
  await page.goto('/bookings/S28N6D');
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await page.getByRole('button', { name: 'Yes, cancel this booking' }).click();

  await expect(main(page).getByRole('alert')).toHaveText(
    'Paid bookings can be cancelled until 24 hours before departure.',
  );
  await expect(page.getByTestId('booking-status')).toHaveText('Ticketed');
});

test('US-PAY-05-T20 the receipt shows what was paid and with which card', async ({ page }) => {
  await stub(page);
  await page.goto('/bookings/S28N6D');

  const receiptPanel = page.getByRole('region', { name: 'Receipt' });
  await expect(receiptPanel.getByTestId('paid-amount')).toHaveText('EGP 15,000.00');
  await expect(receiptPanel).toContainText('VISA ending 4242');
  await expect(receiptPanel).not.toContainText('Refunded');
});

test('US-BK-04-T22 an unpaid booking offers payment and has no receipt or tickets yet', async ({
  page,
}) => {
  await stub(page, { status: 'PENDING_PAYMENT' });
  await page.goto('/bookings/S28N6D');

  await expect(page.getByTestId('booking-status')).toHaveText('Awaiting payment');
  await expect(page.getByRole('link', { name: 'Pay now' })).toHaveAttribute(
    'href',
    '/bookings/S28N6D/pay',
  );
  await expect(page.getByRole('region', { name: 'Receipt' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Tickets' })).toHaveCount(0);
});

test('US-TK-02-T20 a booking lists its tickets, and each opens its own page', async ({ page }) => {
  await stub(page);
  await page.goto('/bookings/S28N6D');

  const tickets = page.getByRole('region', { name: 'Tickets' });
  await expect(tickets).toContainText('9990000000001');
  await expect(tickets).toContainText('Valid');
  await tickets.getByRole('link', { name: 'Open ticket 9990000000001' }).click();

  await expect(page).toHaveURL(/\/tickets\/9990000000001$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ticket 9990000000001');
});

test('US-TK-04-T20 the e-ticket shows the passenger, flight and local times, and can be printed', async ({
  page,
}) => {
  await stub(page);
  await page.goto('/tickets/9990000000001');

  const pass = page.getByRole('region', { name: 'E-ticket' });
  await expect(pass).toContainText('Sara Hassan');
  await expect(pass).toContainText('EgyptAir');
  await expect(pass).toContainText('MS777');
  await expect(pass.getByTestId('departs')).toHaveText('08:00');
  await expect(pass.getByTestId('arrives')).toHaveText('11:00');
  await expect(pass).toContainText('S28N6D');
  await expect(page.getByRole('button', { name: 'Print e-ticket' })).toBeVisible();

  // On paper only the e-ticket is left: the site header, footer and buttons are not printed.
  await page.emulateMedia({ media: 'print' });
  await expect(pass).toBeVisible();
  await expect(page.getByRole('banner')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print e-ticket' })).toBeHidden();
});

test('US-TK-04-T22 the e-ticket page lays out the journey, the fare summary and the document', async ({
  page,
}) => {
  await stub(page);
  await page.goto('/tickets/9990000000001');

  await expect(page.getByRole('list', { name: 'Progress' }).getByText('E-ticket')).toHaveAttribute(
    'aria-current',
    'step',
  );
  const pass = page.getByRole('region', { name: 'E-ticket' });
  await expect(pass.getByRole('heading', { level: 2 })).toHaveText('Cairo → London');
  await expect(pass).toContainText('One way · Economy · 1 passenger');
  const leg = pass.getByRole('group', { name: /Outbound/ });
  await expect(leg).toContainText('OUTBOUND · THU 10 DEC');
  await expect(leg).toContainText('5 h · Direct');
  await expect(leg).toContainText('CAI · Cairo');
  await expect(leg).toContainText('LHR · London');
  await expect(leg).toContainText('Same day');

  const fares = page.getByRole('region', { name: 'Fare summary' });
  await expect(fares).toContainText('Sara Hassan');
  await expect(fares).toContainText('EGP 15,000.00');
  await expect(fares.getByTestId('fare-total')).toHaveText('EGP 15,000.00');

  const document = page.getByRole('region', { name: 'Your document' });
  await expect(document).toContainText('S28N6D');
  await expect(document.getByRole('button', { name: 'Print e-ticket' })).toBeVisible();

  const essentials = page.getByRole('region', { name: 'Passenger and travel essentials' });
  await expect(essentials).toContainText('Sara Hassan');
  await expect(essentials).toContainText('Economy');
  await expect(essentials).toContainText('9990000000001');
});

test('US-TK-04-T21 a void ticket is marked VOID in words on the e-ticket', async ({ page }) => {
  await stub(page, { status: 'CANCELLED' });
  await page.goto('/tickets/9990000000001');

  await expect(page.getByTestId('void-marking')).toHaveText('VOID');
  await expect(page.getByTestId('ticket-status')).toHaveText('Void');
});

test('NFR-USAB-01-T08 my bookings, a booking and a ticket have no detectable accessibility violations', async ({
  page,
}) => {
  await stub(page);
  for (const [path, ready] of [
    ['/bookings', page.getByRole('region', { name: 'Upcoming' })],
    ['/bookings/S28N6D', page.getByRole('region', { name: 'Receipt' })],
    ['/tickets/9990000000001', page.getByRole('region', { name: 'E-ticket' })],
  ] as const) {
    await page.goto(path);
    await expect(ready).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, path).toEqual([]);
  }
});

test('NFR-COMP-01-T08 my bookings, a booking and a ticket never scroll sideways', async ({
  page,
}) => {
  await stub(page);
  for (const [path, ready] of [
    ['/bookings', page.getByRole('region', { name: 'Upcoming' })],
    ['/bookings/S28N6D', page.getByRole('region', { name: 'Receipt' })],
    ['/tickets/9990000000001', page.getByRole('region', { name: 'E-ticket' })],
  ] as const) {
    await page.goto(path);
    await expect(ready).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
