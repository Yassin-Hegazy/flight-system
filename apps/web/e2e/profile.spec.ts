import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * Profile, password and saved travelers (US-USR-02, US-USR-07, US-USR-06). The API is stubbed at
 * the network layer and keeps the saved travelers in memory, so add, edit and remove are visible.
 */

const error = (status: number, body: object) => ({ status, json: { requestId: 'e2e', ...body } });
const invalid = (fieldErrors: Record<string, string>) =>
  error(400, { code: 'VALIDATION_ERROR', message: 'Some fields are invalid.', fieldErrors });

async function stub(page: Page, signedIn = true) {
  const state = {
    me: {
      id: 'u-1',
      email: 'sara@example.com',
      name: 'Sara Hassan',
      role: 'TRAVELER',
      phone: '+20 111 222 3333' as string | null,
    },
    travelers: [{ id: 't-1', ownerId: 'u-1', name: 'Omar Hassan', dateOfBirth: '2015-06-01' }],
    profilePatches: [] as Record<string, string>[],
    passwordPatches: [] as Record<string, string>[],
  };
  await page.route('**/api/notifications**', (route) =>
    route.fulfill({ json: { items: [], unread: 0, total: 0, page: 1, pageSize: 20 } }),
  );
  await page.route('**/api/users/me', (route) => {
    if (!signedIn) {
      return route.fulfill(
        error(401, { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' }),
      );
    }
    if (route.request().method() === 'GET') return route.fulfill({ json: state.me });
    const body = route.request().postDataJSON() as Record<string, string>;
    state.profilePatches.push(body);
    if (body.email && body.currentPassword !== 'Correct-Horse-2026') {
      return route.fulfill(invalid({ currentPassword: 'Current password is incorrect' }));
    }
    if (body.phone === 'abc') {
      return route.fulfill(
        invalid({ phone: 'phone must be 7 to 30 digits, spaces, +, - or brackets' }),
      );
    }
    state.me = {
      ...state.me,
      name: body.name ?? state.me.name,
      email: body.email ?? state.me.email,
      phone: body.phone ?? state.me.phone,
    };
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/users/me/password', (route) => {
    const body = route.request().postDataJSON() as Record<string, string>;
    state.passwordPatches.push(body);
    return body.current === 'Correct-Horse-2026'
      ? route.fulfill({ status: 204 })
      : route.fulfill(invalid({ current: 'Current password is incorrect' }));
  });
  await page.route('**/api/users/me/saved-travelers', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: state.travelers });
    const body = route.request().postDataJSON() as { name: string; dateOfBirth: string };
    if (!body.name.includes(' ')) {
      return route.fulfill(
        invalid({ name: "name must be a first and a last name, in letters, spaces, - or '" }),
      );
    }
    const made = { id: `t-${state.travelers.length + 1}`, ownerId: 'u-1', ...body };
    state.travelers.push(made);
    return route.fulfill({ status: 201, json: made });
  });
  await page.route('**/api/users/me/saved-travelers/*', (route) => {
    const id = route.request().url().split('/').pop();
    if (route.request().method() === 'DELETE') {
      state.travelers = state.travelers.filter((traveler) => traveler.id !== id);
      return route.fulfill({ status: 204 });
    }
    const body = route.request().postDataJSON() as { name: string; dateOfBirth: string };
    state.travelers = state.travelers.map((traveler) =>
      traveler.id === id ? { ...traveler, ...body } : traveler,
    );
    return route.fulfill({ json: state.travelers.find((traveler) => traveler.id === id) });
  });
  return state;
}

const profile = (page: Page) => page.getByRole('form', { name: 'Personal information' });
const password = (page: Page) => page.getByRole('form', { name: 'Change password' });
const saved = (page: Page) =>
  page.getByRole('status').filter({ hasText: /saved|updated|removed/i });

test('US-USR-02-T20 the profile shows who is signed in and saves a new name and phone', async ({
  page,
}) => {
  const state = await stub(page);
  await page.goto('/account');
  await expect(profile(page).getByLabel('Full name')).toHaveValue('Sara Hassan');
  await expect(profile(page).getByLabel('Email')).toHaveValue('sara@example.com');

  await profile(page).getByLabel('Full name').fill('Sara M. Hassan');
  await profile(page).getByLabel('Phone').fill('+20 100 000 0000');
  await profile(page).getByRole('button', { name: 'Save profile' }).click();

  await expect(saved(page)).toHaveText('Profile saved.');
  // Only what changed is sent; the unchanged email is left out, so no password is asked for.
  expect(state.profilePatches).toEqual([{ name: 'Sara M. Hassan', phone: '+20 100 000 0000' }]);
});

test('US-USR-02-T23 the profile shows the phone on file and sends it only when it changes', async ({
  page,
}) => {
  const state = await stub(page);
  await page.goto('/account');
  await expect(profile(page).getByLabel('Phone')).toHaveValue('+20 111 222 3333');

  await profile(page).getByLabel('Full name').fill('Sara M. Hassan');
  await profile(page).getByRole('button', { name: 'Save profile' }).click();
  await expect(saved(page)).toHaveText('Profile saved.');

  expect(state.profilePatches).toEqual([{ name: 'Sara M. Hassan' }]);
});

test('US-USR-02-T21 changing the email needs the current password, reported next to that field', async ({
  page,
}) => {
  await stub(page);
  await page.goto('/account');
  await profile(page).getByLabel('Email').fill('sara.new@example.com');
  await profile(page).getByLabel('Current password').fill('wrong');
  await profile(page).getByRole('button', { name: 'Save profile' }).click();

  const field = profile(page).getByLabel('Current password');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription(/Current password is incorrect/);
});

test('US-USR-02-T22 the account pages ask a signed-out traveler to sign in', async ({ page }) => {
  await stub(page, false);
  await page.goto('/account');

  await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount$/);
});

test('US-USR-07-T20 changing the password sends the current and the new one', async ({ page }) => {
  const state = await stub(page);
  await page.goto('/account');
  await password(page).getByLabel('Current password').fill('Correct-Horse-2026');
  await password(page).getByLabel('New password').fill('Correct-Horse-2027');
  await password(page).getByRole('button', { name: 'Update password' }).click();

  await expect(saved(page)).toHaveText('Password updated.');
  expect(state.passwordPatches).toEqual([
    { current: 'Correct-Horse-2026', next: 'Correct-Horse-2027' },
  ]);
  await expect(password(page).getByLabel('New password')).toHaveValue('');
});

test('US-USR-07-T21 a wrong current password is reported next to that field', async ({ page }) => {
  await stub(page);
  await page.goto('/account');
  await password(page).getByLabel('Current password').fill('wrong');
  await password(page).getByLabel('New password').fill('Correct-Horse-2027');
  await password(page).getByRole('button', { name: 'Update password' }).click();

  await expect(password(page).getByLabel('Current password')).toHaveAccessibleDescription(
    'Current password is incorrect',
  );
});

test('US-USR-06-T20 saved travelers are listed, and a new one is added from first name, last name and birth date', async ({
  page,
}) => {
  await stub(page);
  await page.goto('/account/travelers');
  const list = page.getByRole('list', { name: 'Saved travelers' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Omar Hassan');
  await expect(list).toContainText('2015-06-01');

  const form = page.getByRole('form', { name: 'Add a traveler' });
  await form.getByLabel('First name').fill('Laila');
  await form.getByLabel('Last name').fill('Hassan');
  await form.getByLabel('Date of birth').fill('2012-03-04');
  await form.getByRole('button', { name: 'Save traveler' }).click();

  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list).toContainText('Laila Hassan');
  await expect(form.getByLabel('First name')).toHaveValue('');
});

test('US-USR-06-T21 a saved traveler can be edited and removed', async ({ page }) => {
  await stub(page);
  await page.goto('/account/travelers');
  const list = page.getByRole('list', { name: 'Saved travelers' });
  await list.getByRole('button', { name: 'Edit Omar Hassan' }).click();

  const form = page.getByRole('form', { name: 'Edit traveler' });
  await expect(form.getByLabel('First name')).toHaveValue('Omar');
  await form.getByLabel('Last name').fill('Ali');
  await form.getByRole('button', { name: 'Save traveler' }).click();
  await expect(list).toContainText('Omar Ali');

  await list.getByRole('button', { name: 'Remove Omar Ali' }).click();
  await list.getByRole('button', { name: 'Yes, remove Omar Ali' }).click();
  await expect(page.getByText('No saved travelers yet.')).toBeVisible();
});

test('US-USR-06-T22 a traveler the API rejects shows its message next to the name', async ({
  page,
}) => {
  await stub(page);
  await page.goto('/account/travelers');
  const form = page.getByRole('form', { name: 'Add a traveler' });
  await form.getByLabel('First name').fill('Laila');
  await form.getByLabel('Date of birth').fill('2012-03-04');
  await form.getByRole('button', { name: 'Save traveler' }).click();

  await expect(form.getByLabel('Last name')).toHaveAccessibleDescription(
    /name must be a first and a last name/,
  );
});

test('NFR-USAB-01-T09 the account pages have no detectable accessibility violations', async ({
  page,
}) => {
  await stub(page);
  for (const [path, ready] of [
    ['/account', profile(page).getByLabel('Full name')],
    ['/account/travelers', page.getByRole('list', { name: 'Saved travelers' })],
  ] as const) {
    await page.goto(path);
    await expect(ready).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, path).toEqual([]);
  }
});
