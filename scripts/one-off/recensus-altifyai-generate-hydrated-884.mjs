#!/usr/bin/env node
// QF-20260902-884 follow-up (coordinator directive f67e4e9d): the prior census
// (census-altifyai-upload-step-884.mjs) probed /generate with only
// waitUntil:'networkidle', which proves the SPA shell loaded, not that React
// hydrated and client-side-routed to the real workspace. Solomon measured the
// venture SOURCE (rickfelix/altifyai origin/main 3df167b): /generate ->
// AltTextWorkspacePage, composing ImageUploadComponent -- a real upload UI.
// This script re-censuses /generate ALONE in a signed-in session, actively
// polling for hydration (input[type=file] or a workspace root selector) up to
// ~15s before concluding, instead of trusting a single post-navigation read.
// Read-only census: never uploads a real file, never submits.
import 'dotenv/config';
import { chromium } from 'playwright';
import ventureStepExecutors from '../../lib/apa/venture-step-executors.js';
import { pathToFileURL } from 'node:url';

const { buildStepExecutor, getTestCredential } = ventureStepExecutors;

async function pollForHydration(page, { timeoutMs = 15000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastText = null;
  while (Date.now() < deadline) {
    const fileCount = await page.locator('input[type="file"]').count().catch(() => 0);
    if (fileCount > 0) return { hydrated: true, via: 'input[type=file]', waitedMs: timeoutMs - (deadline - Date.now()) };
    // Redirect to /dashboard is the bounce signature this census is checking for.
    if (page.url().includes('/dashboard')) return { hydrated: false, via: 'redirected-to-dashboard', waitedMs: timeoutMs - (deadline - Date.now()) };
    const text = await page.locator('body').innerText().catch(() => null);
    if (text && text !== lastText) lastText = text;
    await page.waitForTimeout(intervalMs);
  }
  return { hydrated: false, via: 'timeout', waitedMs: timeoutMs };
}

async function main() {
  const baseUrl = 'https://altifyai.rickfelix2000.workers.dev';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const ctx = { authenticated: false, baseUrl };
  const step = { step_id: 'stp-4de9-upload-a-single-imag', goal: 'upload a single image from my computer' };
  const credential = getTestCredential('ALTIFYAI', 'existing');
  console.log('credential resolved:', Boolean(credential));

  const executor = buildStepExecutor(step, 'ALTIFYAI');
  try {
    await page.goto(baseUrl);
    await executor(page, { type: 'existing' }, ctx);
    console.log('UNEXPECTED: executor did not throw (no override yet expected)');
  } catch (e) {
    console.log('executor threw as expected:', e.message);
    console.log('ctx.authenticated after throw:', ctx.authenticated);
  }

  if (!ctx.authenticated) {
    console.log('NOT AUTHENTICATED -- cannot census the real post-auth /generate UI. Aborting.');
    await browser.close();
    process.exit(1);
  }

  console.log('--- navigating to /generate in the SAME authenticated session ---');
  await page.goto(`${baseUrl}/generate`, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => console.log('goto /generate error (continuing):', e.message));
  console.log('landed URL immediately after navigation:', page.url());

  const hydration = await pollForHydration(page);
  console.log('hydration poll result:', JSON.stringify(hydration));
  console.log('landed URL after hydration poll:', page.url());

  const fileInputs = await page.locator('input[type="file"]').count().catch(() => 0);
  console.log('input[type=file] count:', fileInputs);
  for (let i = 0; i < fileInputs; i++) {
    const el = page.locator('input[type="file"]').nth(i);
    console.log(`  [${i}] visible=${await el.isVisible().catch(() => null)} accept=${await el.getAttribute('accept').catch(() => null)} name=${await el.getAttribute('name').catch(() => null)} id=${await el.getAttribute('id').catch(() => null)}`);
  }

  const bodyText = await page.locator('body').innerText().catch(() => null);
  console.log('page text (first 800 chars):', (bodyText || '').slice(0, 800));

  console.log('--- full raw HTML (grep-friendly, first 8000 chars of body) ---');
  const html = await page.locator('body').innerHTML().catch(() => null);
  console.log((html || '').slice(0, 8000));

  await browser.close();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
