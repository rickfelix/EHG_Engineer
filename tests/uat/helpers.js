import { EHG_CONFIG } from './config';

export async function login(page, userType = 'user') {
  const user = EHG_CONFIG.testUsers[userType];

  await page.goto(EHG_CONFIG.routes.login);

  // Use actual EHG login form selectors
  await page.fill('#signin-email', user.email);
  await page.fill('#signin-password', user.password);
  await page.click('button:has-text("Sign In")');

  // Wait for redirect to chairman dashboard (EHG's default landing)
  await page.waitForURL(/chairman|dashboard|ventures/, { timeout: 10000 });
}

export async function logout(page) {
  await page.click('[data-testid="user-menu"]');
  await page.click('text="Logout"');
  await page.waitForURL(/login/);
}

export async function takeScreenshot(page, name) {
  await page.screenshot({
    path: `test-results/screenshots/${name}-${Date.now()}.png`,
    fullPage: true
  });
}

export async function storeTestResult(testId, status, page) {
  // Store in Supabase
  console.log(`Test ${testId}: ${status}`);

  if (status === 'failed') {
    await takeScreenshot(page, testId);
  }
}
