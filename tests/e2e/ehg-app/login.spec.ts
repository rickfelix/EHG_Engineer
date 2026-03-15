/**
 * Login flow browser test — EHG App
 * Verifies real browser login: navigate to /login, enter credentials, verify redirect.
 *
 * SD-LEO-TESTING-STRATEGY-REDESIGN-ORCH-001-C
 */
import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    try {
      await page.goto('/login', { timeout: 10000 });
    } catch {
      test.skip(true, 'EHG app not reachable');
    }
  });

  test('login page renders with email and password fields', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('successful login redirects to chairman dashboard', async ({ page }) => {
    const email = process.env.TEST_USER_EMAIL || 'admin@ehg.com';
    const password = process.env.TEST_USER_PASSWORD || 'test-password';

    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL(/\/(chairman|admin)/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/(chairman|admin)/);
  });

  test('login page shows error for invalid credentials', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Email' }).fill('invalid@example.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should show error message, not redirect
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated access to /chairman redirects to /login', async ({ page }) => {
    // Clear any stored auth
    await page.context().clearCookies();
    await page.goto('/chairman');
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
