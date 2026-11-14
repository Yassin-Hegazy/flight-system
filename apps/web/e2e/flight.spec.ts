import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * The flight page: details (US-FL-01) and status (US-FL-02). The API is stubbed at the network
 * layer; the page is checked for showing what it is given, with times exactly as the API sent them.
 */

const money = (amountMinor: number) => ({ amountMinor, currency: 'EGP' });

const FLIGHT = {
  id: 'f-1',
  flightNumber: 'EK924',
  airline: { code: 'EK', name: 'Emirates' },
  origin: {
    code: 'CAI',
    name: 'Cairo International Airport',
    city: 'Cairo',
    timezone: 'Africa/Cairo',
  },
  destination: {
    code: 'DXB',
    name: 'Dubai International Airport',
    city: 'Dubai',
    timezone: 'Asia/Dubai',
  },
  scheduledDepartureUtc: '2026-11-22T03:15:00.000Z',
  scheduledArrivalUtc: '2026-11-22T07:15:00.000Z',
  scheduledDepartureLocal: '2026-11-22T05:15+02:00',
  scheduledArrivalLocal: '2026-11-22T11:15+04:00',
  durationMinutes: 240,
  status: 'SCHEDULED',
  fares: { ECONOMY: money(1_900_000), BUSINESS: money(7_400_000) },
};

async function stubFlight(page: Page, flight: object | null) {
  await page.route('**/api/users/me', (route) =>
    route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED', message: 'Sign in.' } }),
  );
  await page.route('**/api/flights/f-1', (route) =>
    flight
      ? route.fulfill({ json: flight })
      : route.fulfill({
          status: 404,
          json: { code: 'NOT_FOUND', message: 'Flight not found.', requestId: 'e2e' },
        }),
  );
}

test('US-FL-01-T20 the flight page shows the route, the airline, local times as sent and both fares', async ({
  page,
}) => {
  await stubFlight(page, FLIGHT);
  await page.goto('/flights/f-1');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cairo to Dubai');
  const ticket = page.getByRole('region', { name: 'Flight EK924' });
  await expect(ticket).toContainText('Emirates');
  await expect(ticket.getByTestId('departs')).toHaveText('05:15');
  await expect(ticket.getByTestId('arrives')).toHaveText('11:15');
  await expect(ticket).toContainText('Sun 22 Nov');
  await expect(ticket).toContainText('4 h');
  await expect(page.getByTestId('fare-ECONOMY')).toHaveText('EGP 19,000.00');
  await expect(page.getByTestId('fare-BUSINESS')).toHaveText('EGP 74,000.00');
});

test('US-FL-01-T21 an unknown flight says so and offers the way back to search', async ({
  page,
}) => {
  await stubFlight(page, null);
  await page.goto('/flights/f-1');

  await expect(page.getByRole('alert')).toContainText('Flight not found.');
  await expect(page.getByRole('link', { name: 'Back to search' })).toBeVisible();
});

test('US-FL-02-T20 an on-time flight shows its status in words', async ({ page }) => {
  await stubFlight(page, FLIGHT);
  await page.goto('/flights/f-1');

  await expect(page.getByTestId('flight-status')).toHaveText('Scheduled');
});

test('US-FL-02-T21 a delayed flight shows the new departure time and the scheduled one', async ({
  page,
}) => {
  await stubFlight(page, {
    ...FLIGHT,
    status: 'DELAYED',
    estimatedDepartureUtc: '2026-11-22T04:45:00.000Z',
    estimatedDepartureLocal: '2026-11-22T06:45+02:00',
  });
  await page.goto('/flights/f-1');

  await expect(page.getByTestId('flight-status')).toHaveText('Delayed');
  await expect(page.getByTestId('departs')).toHaveText('06:45');
  await expect(page.getByTestId('departs-scheduled')).toHaveText('Scheduled 05:15');
});

test('US-FL-02-T22 a cancelled flight says so and cannot be booked', async ({ page }) => {
  await stubFlight(page, { ...FLIGHT, status: 'CANCELLED' });
  await page.goto('/flights/f-1');

  await expect(page.getByTestId('flight-status')).toHaveText('Cancelled');
  await expect(page.getByText('This flight was cancelled and cannot be booked.')).toBeVisible();
});

test('NFR-USAB-01-T05 the flight page, delayed, has no detectable accessibility violations', async ({
  page,
}) => {
  await stubFlight(page, {
    ...FLIGHT,
    status: 'DELAYED',
    estimatedDepartureLocal: '2026-11-22T06:45+02:00',
  });
  await page.goto('/flights/f-1');
  await expect(page.getByTestId('flight-status')).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('NFR-COMP-01-T06 the flight page never scrolls sideways, at any tested width', async ({
  page,
}) => {
  await stubFlight(page, FLIGHT);
  await page.goto('/flights/f-1');
  await expect(page.getByTestId('flight-status')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
