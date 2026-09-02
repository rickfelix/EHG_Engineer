// QF-20260901-385 -- reproduce the EXACT production preflight code path (default page.goto
// waitUntil, immediate locator.count(), no wait) to see whether the "Start free" / email-field
// failures are a genuine retired-content premise or a hydration race the fresh networkidle probe
// (inspect-altifyai-landing-dom.mjs) didn't hit.
import { chromium } from '@playwright/test';

const BASE_URL = 'https://altifyai.rickfelix2000.workers.dev';

async function runOnce(n) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE_URL); // exact production call: no waitUntil override, no wait after
  const startFreeCount = await page.locator('text=Start free').count();
  await page.goto(`${BASE_URL}/register`); // exact production call for signupFormRenders
  const emailFieldCount = await page.locator('input[name="emailAddress"], input[type="email"]').count();
  await browser.close();
  console.log(`run ${n}: startFreeCount=${startFreeCount} emailFieldCount=${emailFieldCount}`);
}

for (let i = 1; i <= 5; i++) {
  await runOnce(i);
}
