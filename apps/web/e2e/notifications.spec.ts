import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * The notifications inbox: unread badge, mark read, mark all, email preferences (US-NT-03..05,
 * US-NT-07), usable with the keyboard and with unread never shown by colour alone (NFR-USAB-01).
 * The API is stubbed at the network layer and keeps the read flags in memory.
 */

const note = (id: string, title: string, read: boolean) => ({
  id,
  type: 'BookingConfirmed',
  title,
  body: `${title}.`,
  link: '/bookings/S28N6D',
  read,
  readAt: read ? '2026-11-15T11:00:00.000Z' : null,
  createdAt: '2026-11-15T10:40:35.317Z',
});

async function stub(page: Page) {
  const state = {
    items: [
      note('n-1', 'Booking S28N6D confirmed', false),
      note('n-2', 'Tickets for S28N6D are ready', false),
      note('n-3', 'Booking OLD123 confirmed', true),
    ],
    preferences: [
      { type: 'BookingConfirmed', email: false },
      { type: 'FlightDelayed', email: true },
    ],
    writes: [] as string[],
  };
  await page.route('**/api/users/me', (route) =>
    route.fulfill({
      json: { id: 'u-1', email: 'sara@example.com', name: 'Sara Hassan', role: 'TRAVELER' },
    }),
  );
  await page.route('**/api/notifications?**', (route) =>
    route.fulfill({
      json: {
        items: state.items,
        unread: state.items.filter((item) => !item.read).length,
        total: state.items.length,
        page: 1,
        pageSize: 20,
      },
    }),
  );
  await page.route('**/api/notifications/*/read', (route) => {
    const id = route.request().url().split('/').at(-2);
    state.writes.push(`read ${id}`);
    state.items = state.items.map((item) => (item.id === id ? { ...item, read: true } : item));
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/notifications/read-all', (route) => {
    state.writes.push('read-all');
    state.items = state.items.map((item) => ({ ...item, read: true }));
    return route.fulfill({ json: { updated: 2 } });
  });
  await page.route('**/api/notifications/preferences', (route) =>
    route.fulfill({ json: { preferences: state.preferences } }),
  );
  await page.route('**/api/notifications/preferences/*', (route) => {
    const type = route.request().url().split('/').pop();
    const { email } = route.request().postDataJSON() as { email: boolean };
    state.writes.push(`${type} ${email}`);
    state.preferences = state.preferences.map((one) =>
      one.type === type ? { ...one, email } : one,
    );
    return route.fulfill({ status: 204 });
  });
  return state;
}

const inbox = (page: Page) => page.getByRole('list', { name: 'Notifications' });
const badge = (page: Page) => page.getByRole('banner').getByTestId('unread-badge');

test('US-NT-04-T20 the inbox lists notifications, newest first as sent, each marked unread or read in words', async ({
  page,
}) => {
  await stub(page);
  await page.goto('/account/notifications');

  const items = inbox(page).getByRole('listitem');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('Booking S28N6D confirmed');
  await expect(items.nth(0)).toContainText('Unread');
  await expect(items.nth(2)).toContainText('Read');
  await expect(items.nth(2).getByRole('button', { name: /Mark as read/ })).toHaveCount(0);
  await expect(page.getByTestId('unread-count')).toHaveText('2 unread');
});

test('US-NT-04-T21 the header shows how many notifications are unread', async ({ page }) => {
  await stub(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await expect(badge(page)).toHaveText('2');
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Inbox, 2 unread' }),
  ).toBeVisible();
});

test('US-NT-03-T20 marking one notification read updates it, the count and the badge', async ({
  page,
}) => {
  const state = await stub(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/account/notifications');
  await inbox(page).getByRole('button', { name: 'Mark as read: Booking S28N6D confirmed' }).click();

  await expect(page.getByTestId('unread-count')).toHaveText('1 unread');
  await expect(inbox(page).getByRole('listitem').nth(0)).toContainText('Read');
  await expect(badge(page)).toHaveText('1');
  expect(state.writes).toEqual(['read n-1']);
});

test('US-NT-05-T20 mark all as read clears every unread notification at once', async ({ page }) => {
  const state = await stub(page);
  await page.goto('/account/notifications');
  await page.getByRole('button', { name: 'Mark all as read' }).click();

  await expect(page.getByTestId('unread-count')).toHaveText('0 unread');
  await expect(page.getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
  expect(state.writes).toEqual(['read-all']);
});

test('US-NT-07-T20 email preferences show the saved choice and save a change per type', async ({
  page,
}) => {
  const state = await stub(page);
  await page.goto('/account/notifications');
  const prefs = page.getByRole('group', { name: 'Also send by email' });
  await expect(prefs.getByLabel('Booking confirmed')).not.toBeChecked();
  await expect(prefs.getByLabel('Flight delayed')).toBeChecked();

  await prefs.getByLabel('Booking confirmed').check();
  await expect(page.getByRole('status').filter({ hasText: 'saved' })).toHaveText(
    'Email preference saved.',
  );
  expect(state.writes).toEqual(['BookingConfirmed true']);
});

test('NFR-USAB-01-T10 the inbox works with the keyboard alone', async ({ page }) => {
  const state = await stub(page);
  await page.goto('/account/notifications');
  await page.getByRole('button', { name: 'Mark all as read' }).focus();
  await page.keyboard.press('Tab');
  await expect(inbox(page).getByRole('link', { name: 'Booking S28N6D confirmed' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    inbox(page).getByRole('button', { name: 'Mark as read: Booking S28N6D confirmed' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('unread-count')).toHaveText('1 unread');
  expect(state.writes).toEqual(['read n-1']);
});

test('NFR-USAB-01-T11 the inbox has no detectable accessibility violations', async ({ page }) => {
  await stub(page);
  await page.goto('/account/notifications');
  await expect(inbox(page)).toBeVisible();
  await expect(page.getByRole('group', { name: 'Also send by email' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
