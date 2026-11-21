import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * The landing page from the traveler's side: the hero, the search rail and the hand-off to
 * /search. The API is stubbed at the network layer, as in search.spec.ts; the page is only checked
 * for what it asks and where it goes.
 */

async function stubApi(page: Page) {
  await page.route('**/api/flights/airports/suggestions?**', (route) =>
    route.fulfill({
      json: [
        { code: 'CAI', name: 'Cairo International', city: 'Cairo', country: 'Egypt' },
        { code: 'LHR', name: 'Heathrow', city: 'London', country: 'United Kingdom' },
      ],
    }),
  );
  const empty = { items: [], page: 1, pageSize: 20, total: 0, hasNext: false, sort: 'PRICE' };
  await page.route('**/api/search/flights?**', (route) =>
    route.fulfill({ json: { ...empty, filters: {} } }),
  );
  await page.route('**/api/search/round-trip?**', (route) =>
    route.fulfill({
      json: { outbound: { ...empty, filters: {} }, inbound: { ...empty, filters: {} } },
    }),
  );
}

const rail = (page: Page) => page.getByRole('form', { name: 'Find a flight' });

test.beforeEach(async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
});

test('US-FS-01-T19 a one-way search from the landing page opens the results for that trip', async ({
  page,
}) => {
  await page.getByRole('radio', { name: 'One way' }).click();
  await rail(page).getByLabel('From').fill('CAI');
  await rail(page).getByLabel('To', { exact: true }).fill('LHR');
  await rail(page).getByLabel('Depart').fill('2026-12-10');
  await rail(page)
    .getByRole('button', { name: /search flights/i })
    .click();

  await expect(page).toHaveURL(/\/search\?/);
  const query = new URL(page.url()).searchParams;
  expect(Object.fromEntries(query)).toEqual({
    origin: 'CAI',
    destination: 'LHR',
    date: '2026-12-10',
    adults: '1',
    children: '0',
    infants: '0',
    cabin: 'ECONOMY',
  });
  await expect(page.getByRole('form', { name: 'Search flights' })).toBeVisible();
});

test('US-FS-02-T16 a round trip from the landing page carries the return date', async ({
  page,
}) => {
  await expect(page.getByRole('radio', { name: 'Round trip' })).toBeChecked();
  await rail(page).getByLabel('From').fill('CAI');
  await rail(page).getByLabel('To', { exact: true }).fill('LHR');
  await rail(page).getByLabel('Depart').fill('2026-12-10');
  await rail(page).getByLabel('Return').fill('2026-12-17');
  await rail(page)
    .getByRole('button', { name: /search flights/i })
    .click();

  await expect(page).toHaveURL(/returnDate=2026-12-17/);
  await expect(page.getByRole('heading', { name: 'Outbound' })).toBeVisible();
});

test('US-FS-01-T20 the party and cabin chosen on the landing page are sent with the search', async ({
  page,
}) => {
  await page.getByRole('radio', { name: 'One way' }).click();
  await rail(page).getByLabel('From').fill('CAI');
  await rail(page).getByLabel('To', { exact: true }).fill('LHR');
  await rail(page).getByLabel('Depart').fill('2026-12-10');
  await rail(page)
    .getByRole('button', { name: /Travelers/ })
    .click();
  await page.getByRole('button', { name: 'More adults' }).click();
  await page.getByRole('button', { name: 'More children' }).click();
  await page.getByLabel('Cabin', { exact: true }).selectOption('BUSINESS');
  await page.keyboard.press('Escape');
  await rail(page)
    .getByRole('button', { name: /search flights/i })
    .click();

  await expect(page).toHaveURL(/adults=2&children=1&infants=0&cabin=BUSINESS/);
});

test('US-FS-01-T21 a search with nothing filled in stays on the page and says what is missing', async ({
  page,
}) => {
  await rail(page)
    .getByRole('button', { name: /search flights/i })
    .click();

  await expect(page).toHaveURL(/\/$/);
  const from = rail(page).getByLabel('From');
  await expect(from).toHaveAttribute('aria-invalid', 'true');
  await expect(from).toHaveAccessibleDescription('Choose where you are flying from.');
  await expect(from).toBeFocused();
});

test('US-FS-01-T22 the swap button exchanges origin and destination', async ({ page }) => {
  await rail(page).getByLabel('From').fill('CAI');
  await rail(page).getByLabel('To', { exact: true }).fill('LHR');
  await page.getByRole('button', { name: 'Swap origin and destination' }).click();

  await expect(rail(page).getByLabel('From')).toHaveValue('LHR');
  await expect(rail(page).getByLabel('To', { exact: true })).toHaveValue('CAI');
});

test('US-FS-06-T16 typing in From on the landing page offers matching airports', async ({
  page,
}) => {
  await rail(page).getByLabel('From').fill('ca');

  await expect(page.locator('#rail-origin-options option[value="CAI"]')).toBeAttached();
});

test('NFR-COMP-01-T04 the Destinations link leads to the picture book', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const link = page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Destinations' });
  await expect(link).toHaveAttribute('href', '/#destinations');
  await expect(
    page.locator('#destinations').getByRole('region', { name: 'Where aeron flies' }),
  ).toBeVisible();
});

const book = (page: Page) => page.getByRole('region', { name: 'Where aeron flies' });
/** The cards only respond once the page has hydrated. */
const bookReady = (page: Page) => expect(book(page)).toHaveAttribute('data-ready', 'true');
const DESTINATIONS = [
  'Tokyo, Japan',
  'Paris, France',
  'Cairo, Egypt',
  'Rome, Italy',
  'Beijing, China',
  'Los Angeles, USA',
];

test('US-FS-01-T23 the hero is a picture book of six destinations with one at the front', async ({
  page,
}) => {
  await bookReady(page);
  const cards = book(page).getByRole('button', { name: /, / });
  await expect(cards).toHaveCount(6);
  for (const name of DESTINATIONS) {
    await expect(book(page).getByRole('button', { name, exact: true })).toBeAttached();
  }
  await expect(book(page).locator('[aria-current="true"]')).toHaveCount(1);
  await expect(book(page).getByRole('button', { name: 'Tokyo, Japan' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(book(page).getByRole('status')).toHaveText('Now showing Tokyo, Japan');
});

test('US-FS-01-T24 choosing a card swings it to the front and opens its flights from there', async ({
  page,
}) => {
  await bookReady(page);
  await book(page).getByRole('button', { name: 'Paris, France' }).click();

  await expect(book(page).getByRole('button', { name: 'Paris, France' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(book(page).getByRole('status')).toHaveText('Now showing Paris, France');
  const link = book(page).getByRole('link', { name: 'See flights to Paris' });
  await expect(link).toHaveAttribute('href', '/search?origin=CAI&destination=CDG');
  await link.click();
  await expect(page).toHaveURL(/\/search\?origin=CAI&destination=CDG$/);
});

test('US-FS-01-T25 a small plane flies across while the cards swing, then lands out of sight', async ({
  page,
}) => {
  await bookReady(page);
  const plane = book(page).getByTestId('book-plane');
  await expect(plane).toHaveAttribute('data-flying', 'false');
  await book(page).getByRole('button', { name: 'Next destination' }).click();

  await expect(plane).toHaveAttribute('data-flying', 'true');
  await expect(plane).toHaveAttribute('data-flying', 'false', { timeout: 4000 });
  await expect(book(page).getByRole('button', { name: 'Paris, France' })).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('US-FS-01-T26 with reduced motion the front card changes at once and no plane flies', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await bookReady(page);
  const plane = book(page).getByTestId('book-plane');
  await book(page).getByRole('button', { name: 'Los Angeles, USA' }).click();

  await expect(book(page).getByRole('button', { name: 'Los Angeles, USA' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(plane).toHaveAttribute('data-flying', 'false');
});

test('US-FS-01-T27 the picture book works from the keyboard', async ({ page }) => {
  await bookReady(page);
  await book(page).getByRole('button', { name: 'Tokyo, Japan' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(book(page).getByRole('button', { name: 'Paris, France' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(book(page).getByRole('button', { name: 'Paris, France' })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(book(page).getByRole('button', { name: 'Los Angeles, USA' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await book(page).getByRole('button', { name: 'Previous destination' }).click();
  await expect(book(page).getByRole('button', { name: 'Beijing, China' })).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('US-FS-01-T28 a destination with no direct flight from Cairo fills in only where to', async ({
  page,
}) => {
  await expect(book(page).getByRole('link', { name: 'See flights to Tokyo' })).toHaveAttribute(
    'href',
    '/search?destination=HND',
  );
});

test('NFR-USAB-01-T04 the landing page has no detectable accessibility violations', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('NFR-COMP-01-T05 the landing page never scrolls sideways, at any tested width', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
