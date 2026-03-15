/**
 * Auth setup for EHG App browser tests.
 * Logs in and saves storage state for reuse by other tests.
 *
 * SD-LEO-TESTING-STRATEGY-REDESIGN-ORCH-001-C
 */
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth', 'user.json');

setup('authenticate', async ({ page }) => {
  // Check if app is running
  try {
    const response = await page.goto('/login', { timeout: 10000 });
    if (!response || response.status() >= 500) {
      setup.skip(true, 'EHG app not running at ' + (process.env.BASE_URL || 'http://localhost:8080'));
      return;
    }
  } catch {
    setup.skip(true, 'EHG app not reachable — skipping browser tests');
    return;
  }

  // Fill login form
  const email = process.env.TEST_USER_EMAIL || 'admin@ehg.com';
  const password = process.env.TEST_USER_PASSWORD || 'test-password';

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for redirect to chairman dashboard
  await page.waitForURL(/\/(chairman|admin|ventures)/, { timeout: 15000 });

  // Save storage state
  await page.context().storageState({ path: authFile });
});
