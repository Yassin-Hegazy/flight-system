import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * The administration area. Creating another administrator is US-USR-04 AC-3; the API is stubbed,
 * and who is signed in is whatever GET /users/me answers.
 */

const ADMIN = { id: 'a-1', email: 'ops@aeron.test', name: 'Mona Adel', role: 'ADMIN' };
const TRAVELER = { id: 'u-1', email: 'nour@example.com', name: 'Nour Hassan', role: 'TRAVELER' };
const error = (status: number, body: object) => ({ status, json: { requestId: 'e2e', ...body } });

interface Created {
  body?: Record<string, unknown>;
  csrf?: string;
}

async function stubAdmin(page: Page, me: object | null) {
  const created: Created = {};
  await page.route('**/api/notifications**', (route) =>
    route.fulfill({ json: { items: [], unread: 0, total: 0, page: 1, pageSize: 20 } }),
  );
  await page.route('**/api/users/me', (route) =>
    me
      ? route.fulfill({ json: me })
      : route.fulfill(error(401, { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' })),
  );
  await page.route('**/api/users/admins', (route) => {
    const body = route.request().postDataJSON() as Record<string, string>;
    created.body = body;
    created.csrf = route.request().headers()['x-requested-with'];
    if (body.password.length < 10) {
      return route.fulfill(
        error(400, {
          code: 'VALIDATION_ERROR',
          message: 'Some fields are invalid.',
          fieldErrors: { password: 'password must be at least 10 characters' },
        }),
      );
    }
    if (body.email === 'taken@aeron.test') {
      return route.fulfill(
        error(409, { code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' }),
      );
    }
    return route.fulfill({ status: 201, json: { id: 'a-2' } });
  });
  return created;
}

async function fillAdmin(page: Page, email: string, password: string) {
  await page.getByLabel('Full name').fill('Karim Farouk');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Initial password').fill(password);
  await page.getByLabel('Phone number (optional)').fill('+20 100 555 0101');
}

test('US-USR-04-T30 an administrator creates another administrator', async ({ page }) => {
  const created = await stubAdmin(page, ADMIN);
  await page.goto('/admin/admins');
  await expect(page.getByRole('heading', { name: 'Create an administrator' })).toBeVisible();

  await fillAdmin(page, 'karim@aeron.test', 'Correct-Horse-2026');
  await page.getByRole('button', { name: /Create administrator/ }).click();

  await expect(page.getByRole('status')).toHaveText(
    'karim@aeron.test is now an administrator and can sign in.',
  );
  expect(created.body).toEqual({
    name: 'Karim Farouk',
    email: 'karim@aeron.test',
    password: 'Correct-Horse-2026',
    phone: '+20 100 555 0101',
  });
  expect(created.csrf).toBeTruthy();
  // The form is emptied, so the password is not left on screen.
  await expect(page.getByLabel('Initial password')).toHaveValue('');
});

test('US-USR-04-T31 a field the API rejects shows its message next to that field', async ({
  page,
}) => {
  await stubAdmin(page, ADMIN);
  await page.goto('/admin/admins');
  await fillAdmin(page, 'karim@aeron.test', 'short');
  await page.getByRole('button', { name: /Create administrator/ }).click();

  const password = page.getByLabel('Initial password');
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  await expect(password).toHaveAccessibleDescription(/password must be at least 10 characters/);
});

test('US-USR-04-T32 an email that already has an account is reported above the form', async ({
  page,
}) => {
  await stubAdmin(page, ADMIN);
  await page.goto('/admin/admins');
  await fillAdmin(page, 'taken@aeron.test', 'Correct-Horse-2026');
  await page.getByRole('button', { name: /Create administrator/ }).click();

  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'An account with this email already exists.',
  );
});

test('US-USR-04-T33 a traveler is told the area is for administrators and sees no form', async ({
  page,
}) => {
  await stubAdmin(page, TRAVELER);
  await page.goto('/admin/admins');

  await expect(page.getByRole('heading', { name: 'For administrators only' })).toBeVisible();
  await expect(page.getByLabel('Initial password')).toHaveCount(0);
});

test('US-USR-04-T34 signed out, the admin area sends you to sign in and back', async ({ page }) => {
  await stubAdmin(page, null);
  await page.goto('/admin/admins');

  await expect(page).toHaveURL(/\/sign-in\?next=%2Fadmin%2Fadmins$/);
});

test('US-USR-04-T35 only an administrator gets the Admin link in the header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stubAdmin(page, ADMIN);
  await page.goto('/');
  await expect(page.getByRole('banner').getByRole('link', { name: 'Admin' })).toBeVisible();

  await page.unrouteAll();
  await stubAdmin(page, TRAVELER);
  await page.reload();
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Account, Nour Hassan' }),
  ).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Admin' })).toHaveCount(0);
});

test('US-USR-04-T36 the admin page has no accessibility violations', async ({ page }) => {
  await stubAdmin(page, ADMIN);
  await page.goto('/admin/admins');
  await expect(page.getByRole('heading', { name: 'Create an administrator' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
