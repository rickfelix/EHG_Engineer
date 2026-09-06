#!/usr/bin/env node
// SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001: EXEC-phase live DOM exploration for the
// 8 remaining surfaces (list, multi-upload, batch-generate, edit, copy, delete, approve,
// export, keywords, suggestions, JSON view) -- authenticates via the SAME generic
// buildStepExecutor auth path every existing override reuses (never re-implement Clerk/testing-
// token/2FA), then navigates the live app and dumps data-testid attributes, button/link text,
// and route reachability so the actual overrides can be written against measured selectors,
// never guessed ones.
import 'dotenv/config';
import { chromium } from 'playwright';
import ventureStepExecutors from '../../lib/apa/venture-step-executors.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const { buildStepExecutor } = ventureStepExecutors;

async function authenticate(page, ctx) {
  const authProbeStep = { step_id: '__explore_auth_probe__', goal: 'authenticate (existing)' };
  const authExecutor = buildStepExecutor(authProbeStep, 'ALTIFYAI');
  try {
    await authExecutor(page, { type: 'existing' }, ctx);
  } catch (err) {
    if (!ctx.authenticated) throw err;
    // else: expected "authenticated, but no verified UI mapping" fallback -- auth succeeded.
  }
}

async function dumpPage(page, label) {
  console.log(`\n=== ${label} : ${page.url()} ===`);
  const testIds = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid]')].map((el) => ({
      testid: el.getAttribute('data-testid'),
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 60),
    }))
  ).catch((e) => [{ error: e.message }]);
  console.log('data-testid elements:', JSON.stringify(testIds, null, 2));

  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll('button, a[role="button"], [role="button"]')].map((el) => ({
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 60),
      testid: el.getAttribute('data-testid'),
    })).filter((b) => b.text || b.testid)
  ).catch((e) => [{ error: e.message }]);
  console.log('buttons/links:', JSON.stringify(buttons, null, 2));
}

async function main() {
  const baseUrl = 'https://altifyai.rickfelix2000.workers.dev';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const ctx = { authenticated: false, baseUrl };

  await authenticate(page, ctx);
  console.log('AUTHENTICATED:', ctx.authenticated);

  // Candidate routes to explore -- app structure is not yet known beyond the documented
  // /generate route. Try common patterns for a gallery/library/dashboard page.
  const candidateRoutes = ['/generate', '/dashboard', '/gallery', '/images', '/library', '/'];
  for (const route of candidateRoutes) {
    try {
      const resp = await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle', timeout: 15000 });
      const status = resp?.status?.() ?? null;
      console.log(`\nROUTE ${route}: status=${status}, landed=${page.url()}`);
      if (status && status < 400) {
        await dumpPage(page, `route ${route}`);
      }
    } catch (e) {
      console.log(`ROUTE ${route}: navigation error -- ${e.message}`);
    }
  }

  await browser.close();
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
