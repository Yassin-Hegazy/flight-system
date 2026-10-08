import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('home page loads and shows the API health', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Flight Booking System' })).toBeVisible();
  await expect(page.getByTestId('api-health')).toHaveText('Database connected');
});

test('home page has no detectable accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('api-health')).toHaveText('Database connected');

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
