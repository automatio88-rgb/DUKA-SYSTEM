import { test, expect, type Page } from '@playwright/test';

async function demoLogin(page: Page, role: 'owner' | 'staff' = 'owner') {
  await page.goto('/');
  await page.getByTestId('demo-mode').click();
  await page.getByTestId(`user-${role}`).click();
  for (const d of (role === 'owner' ? '1234' : '0000')) await page.getByRole('button', { name: d, exact: true }).click();
}

test('smoke: demo → cash sale → credit sale → M-Pesa paste → transfer → close cash → daily report', async ({ page }) => {
  await demoLogin(page);
  await expect(page.getByTestId('today-card')).toBeVisible();

  // 2-item cash sale in 3 taps: tile, tile, quick cash
  await page.getByTestId('nav-sell').click();
  const tiles = page.getByTestId('pos-grid').locator('button');
  await tiles.nth(0).click(); await tiles.nth(1).click();
  await page.getByTestId('quick-cash').click();
  await expect(page.getByTestId('sale-done')).toBeVisible();

  // Credit sale
  await tiles.nth(2).click();
  await page.getByTestId('cart-open').click();
  await page.getByRole('tab', { name: /Deni|Credit/ }).click();
  await page.getByTestId('pick-customer').click();
  await page.getByRole('button', { name: /Baba Kevin/ }).first().click();
  await page.getByTestId('charge').click();
  await expect(page.getByTestId('sale-done')).toBeVisible();

  // M-Pesa paste from a known debtor (Mama Njeri 0711223344)
  await page.getByTestId('nav-more').click();
  await page.getByTestId('more-payments').click();
  const now = new Date();
  await page.getByTestId('mpesa-text').fill(`TFU2LI3ZA9 Confirmed. You have received Ksh200.00 from MAMA NJERI 0711223344 on ${now.getDate()}/${now.getMonth() + 1}/${String(now.getFullYear()).slice(2)} at 9:00 AM New M-PESA balance is Ksh430.00.`);
  await page.getByTestId('mpesa-read').click();
  await expect(page.getByRole('status')).toContainText(/Mama Njeri/);
  await page.goBack();

  // Transfer from store
  await page.getByTestId('nav-stock').click();
  await page.getByRole('button', { name: /Jogoo/ }).first().click();
  await page.getByTestId('transfer').click();
  await page.getByTestId('confirm-transfer').click();
  await page.goBack();

  // Close cash session
  await page.getByTestId('nav-more').click();
  await page.getByTestId('more-cash').click();
  await page.getByTestId('close-day').click();
  for (const d of '5000') await page.getByRole('button', { name: d, exact: true }).last().click();
  await page.getByTestId('cash-confirm').click();
  await page.goBack();

  // Daily report
  await page.getByTestId('more-reports').click();
  await expect(page.getByTestId('daily-report')).toBeVisible();
});

test('offline: a sale made in airplane mode is kept and queued for sync', async ({ page, context }) => {
  await demoLogin(page);
  await context.setOffline(true);
  await page.getByTestId('nav-sell').click();
  await page.getByTestId('pos-grid').locator('button').first().click();
  await page.getByTestId('quick-cash').click();
  await expect(page.getByTestId('sale-done')).toBeVisible();
  await expect(page.getByTestId('sync-pill')).toContainText(/Offline|Nje ya mtandao/);
  await page.reload();
  // survives reload from IndexedDB
  await page.getByTestId('user-owner').click();
  for (const d of '1234') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByTestId('today-card')).toBeVisible();
  await context.setOffline(false);
});

test('staff mode hides owner-only areas', async ({ page }) => {
  await demoLogin(page, 'staff');
  await page.getByTestId('nav-more').click();
  await expect(page.getByTestId('more-reports')).toHaveCount(0);
  await expect(page.getByTestId('more-settings')).toHaveCount(0);
  await expect(page.getByTestId('more-purchases')).toHaveCount(0);
});
