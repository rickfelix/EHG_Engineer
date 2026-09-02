// QF-20260901-385 -- measure the live AltifyAI landing page + /register DOM directly (headless
// Playwright, same instrument the existing e2e spec/executor use) so the preflight fix is sourced
// from a fresh measurement, not assumption.
import { chromium } from '@playwright/test';

const BASE_URL = 'https://altifyai.rickfelix2000.workers.dev';

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto(BASE_URL, { waitUntil: 'networkidle' });
const title = await page.title();
const startFreeCount = await page.locator('text=Start free').count();
const signInLinkCount = await page.locator('text=Sign in').count();
const bodyTextLanding = (await page.locator('body').innerText()).slice(0, 500);

await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle' });
const emailFieldCount = await page.locator('input[name="emailAddress"], input[type="email"]').count();
const identifierFieldCount = await page.locator('input[name="identifier"]').count();
const signInToggleCount = await page.locator('text=Already have an account? Sign in').count();

const uploadResp = await page.goto(`${BASE_URL}/upload`, { waitUntil: 'networkidle' }).catch((e) => ({ status: () => `ERROR:${e.message}` }));
const uploadStatus = uploadResp?.status?.() ?? null;

await browser.close();

console.log(JSON.stringify({
  landing: { title, startFreeCount, signInLinkCount, bodyTextLanding },
  register: { emailFieldCount, identifierFieldCount, signInToggleCount },
  upload: { status: uploadStatus },
}, null, 2));
