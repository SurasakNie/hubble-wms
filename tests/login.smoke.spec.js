// Backend-independent smoke test: the login page (index.html) is static and
// does not require Supabase, so it can run in CI without secrets. Verifies the
// page loads, renders its login form, and produces no uncaught JS errors.
import { test, expect } from '@playwright/test';

test('login page loads without JS errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('/index.html');

  // The login form should be present and visible.
  await expect(page.locator('form, #login-form, input[type="password"]').first()).toBeVisible();

  // No uncaught script errors during initial load.
  expect(errors, errors.join('\n')).toHaveLength(0);
});
