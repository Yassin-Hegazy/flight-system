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

test('NFR-COMP-01-T04 a destination card opens the search with that route filled in', async ({
  page,
}) => {
  await page.getByRole('link', { name: /London/ }).click();

  await expect(page).toHaveURL(/\/search\?origin=CAI&destination=LHR/);
  // The landing page stays mounted but hidden after the navigation, so the form is named.
  const form = page.getByRole('form', { name: 'Search flights' });
  await expect(form.getByLabel('To', { exact: true })).toHaveValue('LHR');
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
