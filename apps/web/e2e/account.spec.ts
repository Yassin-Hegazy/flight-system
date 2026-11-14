import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * Register (US-USR-04) and sign in / out (US-USR-05) from the traveler's side. The API is stubbed:
 * the session is a flag the stub flips, standing in for the HttpOnly cookie the browser never reads.
 */

const NOUR = { id: 'u-1', email: 'nour@example.com', name: 'Nour Hassan', role: 'TRAVELER' };
const error = (status: number, body: object) => ({ status, json: { requestId: 'e2e', ...body } });

async function stubAccount(page: Page, signedIn = false) {
  const state = { signedIn, writesWithoutCsrf: 0 };
  page.on('request', (request) => {
    if (request.method() !== 'GET' && !request.headers()['x-requested-with']) {
      state.writesWithoutCsrf += 1;
    }
  });
  await page.route('**/api/users/me', (route) =>
    state.signedIn
      ? route.fulfill({ json: NOUR })
      : route.fulfill(error(401, { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' })),
  );
  await page.route('**/api/users/sign-in', (route) => {
    const body = route.request().postDataJSON() as { email: string; password: string };
    if (body.password !== 'Correct-Horse-2026') {
      return route.fulfill(
        error(401, { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' }),
      );
    }
    state.signedIn = true;
    return route.fulfill({ json: NOUR });
  });
  await page.route('**/api/users/sign-out', (route) => {
    state.signedIn = false;
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/users/register', (route) => {
    const body = route.request().postDataJSON() as { email: string; password: string };
    if (body.password.length < 10) {
      const message = 'password must be at least 10 characters';
      return route.fulfill(
        error(400, {
          code: 'VALIDATION_ERROR',
          message: 'Some fields are invalid.',
          fieldErrors: { password: message },
        }),
      );
    }
    if (body.email === 'taken@example.com') {
      return route.fulfill(
        error(409, { code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' }),
      );
    }
    return route.fulfill({ status: 201, json: { id: 'u-1' } });
  });
  return state;
}

const header = (page: Page) => page.getByRole('banner');

test('US-USR-05-T20 signing in shows who is signed in, and signing out ends it', async ({
  page,
}) => {
  const state = await stubAccount(page);
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill('nour@example.com');
  await page.getByLabel('Password').fill('Correct-Horse-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/$/);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(header(page).getByText('Nour Hassan')).toBeVisible();

  await header(page).getByRole('button', { name: 'Sign out' }).click();
  await expect(header(page).getByRole('link', { name: 'Sign in' })).toBeVisible();
  expect(state.writesWithoutCsrf).toBe(0);
});

test('US-USR-05-T21 a wrong password says so and keeps the traveler on the form', async ({
  page,
}) => {
  await stubAccount(page);
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill('nour@example.com');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  await expect(page).toHaveURL(/\/sign-in/);
});

test('US-USR-05-T22 after signing in the traveler returns to the page that sent them', async ({
  page,
}) => {
  await stubAccount(page);
  await page.goto('/sign-in?next=%2Fsearch');
  await page.getByLabel('Email').fill('nour@example.com');
  await page.getByLabel('Password').fill('Correct-Horse-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/search$/);
});

test('US-USR-04-T20 registering creates the account and signs the traveler in', async ({
  page,
}) => {
  await stubAccount(page);
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Nour Hassan');
  await page.getByLabel('Email').fill('nour@example.com');
  await page.getByLabel('Password').fill('Correct-Horse-2026');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/$/);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(header(page).getByText('Nour Hassan')).toBeVisible();
});

test('US-USR-04-T21 a field the API rejects shows its message next to that field', async ({
  page,
}) => {
  await stubAccount(page);
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Nour Hassan');
  await page.getByLabel('Email').fill('nour@example.com');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();

  const password = page.getByLabel('Password');
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  await expect(password).toHaveAccessibleDescription(/password must be at least 10 characters/);
});

test('US-USR-04-T22 an email that is already registered is reported above the form', async ({
  page,
}) => {
  await stubAccount(page);
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Nour Hassan');
  await page.getByLabel('Email').fill('taken@example.com');
  await page.getByLabel('Password').fill('Correct-Horse-2026');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('alert')).toHaveText('An account with this email already exists.');
});

test('NFR-USAB-01-T06 the sign-in and register pages have no detectable accessibility violations', async ({
  page,
}) => {
  await stubAccount(page);
  for (const path of ['/sign-in', '/register']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, path).toEqual([]);
  }
});
