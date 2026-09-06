#!/usr/bin/env node
// SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001: explore the per-image detail surface
// (edit / copy / approve-needs-review / keywords / suggestions / JSON view) -- /images lists
// only batch-select/status/delete per row, so these controls likely live behind a click-through
// or a direct /images/<id> route. Measuring rather than guessing.
import 'dotenv/config';
import { chromium } from 'playwright';
import ventureStepExecutors from '../../lib/apa/venture-step-executors.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const { buildStepExecutor } = ventureStepExecutors;

async function authenticate(page, ctx) {
  const authProbeStep = { step_id: '__explore_auth_probe2__', goal: 'authenticate (existing)' };
  const authExecutor = buildStepExecutor(authProbeStep, 'ALTIFYAI');
  try {
    await authExecutor(page, { type: 'existing' }, ctx);
  } catch (err) {
    if (!ctx.authenticated) throw err;
  }
}

async function dumpPage(page, label) {
  console.log(`\n=== ${label} : ${page.url()} ===`);
  const testIds = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid]')].map((el) => ({
      testid: el.getAttribute('data-testid'),
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 80),
    }))
  ).catch((e) => [{ error: e.message }]);
  console.log('data-testid elements:', JSON.stringify(testIds, null, 2));
}

async function main() {
  const baseUrl = 'https://altifyai.rickfelix2000.workers.dev';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const ctx = { authenticated: false, baseUrl };
  await authenticate(page, ctx);

  const imageId = '970180bc-6c08-4ce2-b82e-82ed467fb4e7';

  // Try direct detail routes
  for (const route of [`/images/${imageId}`, `/image/${imageId}`, `/generate/${imageId}`]) {
    try {
      const resp = await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log(`\nROUTE ${route}: status=${resp?.status?.() ?? null}, landed=${page.url()}`);
      if (page.url().includes(imageId) || page.url().endsWith(route)) {
        await dumpPage(page, `detail route ${route}`);
      }
    } catch (e) {
      console.log(`ROUTE ${route}: error -- ${e.message}`);
    }
  }

  // Try clicking on the row/thumbnail itself from /images
  await page.goto(`${baseUrl}/images`, { waitUntil: 'networkidle', timeout: 15000 });
  console.log('\n--- Attempting click-through from /images list ---');
  const rowSelectors = [
    `[data-testid="batch-status-${imageId}"]`,
    `img[alt*="${imageId}"]`,
    `[data-testid*="${imageId}"]`,
  ];
  for (const sel of rowSelectors) {
    const count = await page.locator(sel).count().catch(() => 0);
    console.log(`selector "${sel}" count=${count}`);
  }
  // Dump the full row container HTML around one delete button to see what's actually there
  const rowHtml = await page.evaluate((id) => {
    const btn = document.querySelector(`[data-testid="delete-image-${id}"]`);
    if (!btn) return null;
    let el = btn;
    for (let i = 0; i < 5 && el.parentElement; i++) el = el.parentElement;
    return el.outerHTML.slice(0, 4000);
  }, imageId).catch((e) => `ERROR: ${e.message}`);
  console.log('\n--- Row container HTML (5 levels up from delete button) ---');
  console.log(rowHtml);

  await browser.close();
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
