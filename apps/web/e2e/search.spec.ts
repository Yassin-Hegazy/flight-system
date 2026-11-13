import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * The search page from the traveler's side: form → results → sort → reorder, errors beside their
 * field, empty states, accessibility and layout. Runs in Chromium, Firefox and at 375 px
 * (NFR-COMP-01).
 *
 * The API is stubbed at the browser's network layer: the E2E database in CI has no schema, and
 * the API's own search behaviour is covered against PostgreSQL by apps/api/test/search.int-spec.ts.
 * The stub returns results already in the order the API would send for each sort key, so these
 * tests prove the page asks again and renders what it gets, never that it sorts.
 */

const money = (amountMinor: number) => ({ amountMinor, currency: 'EGP' });
const CAIRO = { code: 'CAI', name: 'Cairo International', city: 'Cairo', timezone: 'Africa/Cairo' };
const HEATHROW = { code: 'LHR', name: 'Heathrow', city: 'London', timezone: 'Europe/London' };

function flight(number: string, airline: string, departs: string, arrives: string, fare: number) {
  return {
    flightId: `id-${number}`,
    flightNumber: number,
    airline: { code: number.slice(0, 2), name: airline },
    origin: CAIRO,
    destination: HEATHROW,
    departureLocal: `2026-12-10T${departs}+02:00`,
    arrivalLocal: `2026-12-10T${arrives}+00:00`,
    departureUtc: '2026-12-10T07:00:00.000Z',
    arrivalUtc: '2026-12-10T12:00:00.000Z',
    status: 'SCHEDULED',
    durationMinutes: 300,
    stops: 0,
    cabin: 'ECONOMY',
    adultFare: money(fare),
    total: money(fare * 2),
    breakdown: [
      { passengerType: 'ADULT', count: 2, unitPrice: money(fare), amount: money(fare * 2) },
    ],
  };
}

const MS777 = flight('MS777', 'EgyptAir', '09:00', '12:00', 1_500_000);
const BA155 = flight('BA155', 'British Airways', '13:00', '16:30', 1_200_000);
const MS779 = flight('MS779', 'EgyptAir', '06:00', '09:40', 1_800_000);

/** What the API answers for each sort key: the order is the API's, not the page's. */
const ORDER: Record<string, ReturnType<typeof flight>[]> = {
  PRICE: [BA155, MS777, MS779],
  DEPARTURE_TIME: [MS779, MS777, BA155],
  DURATION: [MS777, BA155, MS779],
  ARRIVAL_TIME: [MS779, MS777, BA155],
};

const FILTER_KEYS = ['maxTotal', 'departFrom', 'departTo', 'airlines'];

function answerSearch(route: Route) {
  const query = new URL(route.request().url()).searchParams;
  if (query.get('origin') === query.get('destination')) {
    const message = 'Origin and destination must be different airports.';
    return route.fulfill({
      status: 400,
      json: {
        code: 'SAME_AIRPORT',
        message,
        fieldErrors: { destination: message },
        requestId: 'e2e',
      },
    });
  }
  const sort = query.get('sort') ?? 'PRICE';
  const filters = FILTER_KEYS.some((key) => query.has(key)) ? { maxTotal: 1 } : {};
  const items = Object.keys(filters).length ? [] : ORDER[sort];
  return route.fulfill({
    json: { items, page: 1, pageSize: 20, total: items.length, hasNext: false, sort, filters },
  });
}

async function stubApi(page: Page) {
  await page.route('**/api/search/flights?**', answerSearch);
  await page.route('**/api/flights/airports/suggestions?**', (route) =>
    route.fulfill({
      json: [
        { code: 'CAI', name: 'Cairo International', city: 'Cairo', country: 'Egypt' },
        { code: 'LHR', name: 'Heathrow', city: 'London', country: 'United Kingdom' },
      ],
    }),
  );
}

async function fillAndSearch(page: Page, from: string, to: string) {
  await page.getByLabel('From', { exact: true }).fill(from);
  await page.getByLabel('To', { exact: true }).fill(to);
  await page.getByLabel('Departure date').fill('2026-12-10');
  await page.getByLabel('Adults').fill('2');
  await page.getByRole('button', { name: 'Search flights' }).click();
}

/** The flight numbers in the order the page shows them. */
const resultOrder = (page: Page) =>
  page
    .getByTestId('search-result')
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')?.split(',')[0]));

test.beforeEach(async ({ page }) => {
  await stubApi(page);
});

test('NFR-COMP-01-T01 the traveler searches, gets results, changes the sort and the results reorder', async ({
  page,
}) => {
  await page.goto('/search');
  await fillAndSearch(page, 'CAI', 'LHR');

  await expect(page.getByRole('status').filter({ hasText: 'flights' })).toHaveText('3 flights');
  await expect.poll(() => resultOrder(page)).toEqual(['BA155', 'MS777', 'MS779']);
  await expect(page.getByTestId('result-total').first()).toHaveText('EGP 24,000.00');

  await page.getByLabel('Sort by').selectOption('DEPARTURE_TIME');

  await expect.poll(() => resultOrder(page)).toEqual(['MS779', 'MS777', 'BA155']);
  await expect(page).toHaveURL(/sort=DEPARTURE_TIME/);
});

test('NFR-USAB-01-T01 a validation error is shown next to its field and announced with it', async ({
  page,
}) => {
  await page.goto('/search');
  await fillAndSearch(page, 'CAI', 'CAI');

  const destination = page.getByLabel('To', { exact: true });
  await expect(destination).toHaveAttribute('aria-invalid', 'true');
  await expect(destination).toHaveAccessibleDescription(
    'Origin and destination must be different airports.',
  );
  await expect(page.locator('#destination-error')).toBeVisible();
});

test('NFR-USAB-01-T02 the search page, with results, has no detectable accessibility violations', async ({
  page,
}) => {
  await page.goto('/search');
  await fillAndSearch(page, 'CAI', 'LHR');
  await expect(page.getByTestId('search-result')).toHaveCount(3);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('NFR-USAB-01-T03 the form can be filled and submitted with the keyboard alone', async ({
  page,
}) => {
  await page.goto('/search');
  await page.getByLabel('From', { exact: true }).focus();
  await page.keyboard.type('CAI');
  await page.keyboard.press('Tab');
  await page.keyboard.type('LHR');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Departure date')).toBeFocused();
  await page.getByLabel('Departure date').fill('2026-12-10');
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('search-result')).toHaveCount(3);
});

test('NFR-COMP-01-T02 the page never scrolls sideways, at any tested width', async ({ page }) => {
  await page.goto('/search');
  await fillAndSearch(page, 'CAI', 'LHR');
  await expect(page.getByTestId('search-result')).toHaveCount(3);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('US-FS-03-T11 filters that match nothing say so and offer to clear them', async ({ page }) => {
  await page.goto('/search');
  await page.getByLabel('Maximum total price (EGP)').fill('10');
  await fillAndSearch(page, 'CAI', 'LHR');

  await expect(page.getByText('No flights match these filters')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();

  await expect(page.getByTestId('search-result')).toHaveCount(3);
  await expect(page).not.toHaveURL(/maxTotal=/);
});

test('NFR-COMP-01-T03 the home page links to the search page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Search flights' }).click();
  await expect(page.getByRole('heading', { name: 'Search flights' })).toBeVisible();
});
