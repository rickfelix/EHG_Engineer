#!/usr/bin/env node
// Coordinator directive 6dead155 (Solomon 6ca21cd2, adopted): ONE hydrated, signed-in census
// of the /generate workspace, BEFORE and AFTER a real (fenced-identity) upload, so all 13
// remaining journey steps can be mapped against measured controls in a single pass instead of
// one 12-minute walk run per step. Read-only observation except for the one deliberate upload
// (a synthetic 1x1 PNG, generated in-memory -- never a real user photo, never committed).
import 'dotenv/config';
import { chromium } from 'playwright';
import ventureStepExecutors from '../../lib/apa/venture-step-executors.js';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { buildStepExecutor } = ventureStepExecutors;

// Smallest valid PNG: 1x1 transparent pixel.
const ONE_PX_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function censusInteractiveElements(page, label) {
  const out = { label, url: page.url(), elements: [] };

  async function describeLocator(locatorName, locator, roleGuess) {
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const el = locator.nth(i);
      const text = (await el.textContent().catch(() => '') || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      const testId = await el.getAttribute('data-testid').catch(() => null);
      const name = await el.getAttribute('name').catch(() => null);
      const type = await el.getAttribute('type').catch(() => null);
      const href = await el.getAttribute('href').catch(() => null);
      const visible = await el.isVisible().catch(() => null);
      out.elements.push({ source: locatorName, role: roleGuess, text, dataTestId: testId, name, type, href, visible });
    }
  }

  await describeLocator('button', page.getByRole('button'), 'button');
  await describeLocator('link', page.getByRole('link'), 'link');
  await describeLocator('input', page.locator('input'), 'input');
  await describeLocator('textarea', page.locator('textarea'), 'textarea');
  await describeLocator('[data-testid]', page.locator('[data-testid]'), 'testid-element');

  return out;
}

async function main() {
  const baseUrl = 'https://altifyai.rickfelix2000.workers.dev';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const ctx = { authenticated: false, baseUrl };
  const step = { step_id: 'stp-4de9-upload-a-single-imag', goal: 'upload a single image from my computer' };

  const executor = buildStepExecutor(step, 'ALTIFYAI');
  await page.goto(baseUrl);
  try {
    await executor(page, { type: 'existing' }, ctx);
  } catch (e) {
    if (!ctx.authenticated) { console.error('AUTH FAILED (unexpected):', e.message); process.exit(1); }
  }
  console.log('authenticated:', ctx.authenticated);

  await page.goto(`${baseUrl}/generate`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  // Poll for hydration (same discipline as recensus-altifyai-generate-hydrated-884.mjs).
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const c = await page.locator('input[type="file"]').count().catch(() => 0);
    if (c > 0) break;
    await page.waitForTimeout(250);
  }

  const before = await censusInteractiveElements(page, 'PRE-UPLOAD /generate');
  console.log('=== PRE-UPLOAD CENSUS ===');
  console.log(JSON.stringify(before, null, 2));

  // Write a synthetic 1x1 PNG to a temp file and drive the real file input.
  const tmpPng = path.join(os.tmpdir(), `altifyai-census-1px-${Date.now()}.png`);
  fs.writeFileSync(tmpPng, Buffer.from(ONE_PX_PNG_BASE64, 'base64'));
  console.log('driving input[type=file] with synthetic 1x1 PNG:', tmpPng);
  await page.locator('input[type="file"]').setInputFiles(tmpPng).catch((e) => console.log('setInputFiles error:', e.message));

  // Poll for post-upload state change up to 30s (generation may call a real backend/AI).
  const postDeadline = Date.now() + 30000;
  let lastHtmlLen = 0;
  while (Date.now() < postDeadline) {
    const html = await page.locator('body').innerHTML().catch(() => '');
    if (html.length !== lastHtmlLen) { lastHtmlLen = html.length; }
    await page.waitForTimeout(1000);
  }

  const after = await censusInteractiveElements(page, 'POST-UPLOAD /generate (30s after setInputFiles)');
  console.log('=== POST-UPLOAD CENSUS ===');
  console.log(JSON.stringify(after, null, 2));

  console.log('=== FULL BODY HTML (post-upload, first 10000 chars) ===');
  const finalHtml = await page.locator('body').innerHTML().catch(() => '');
  console.log(finalHtml.slice(0, 10000));

  fs.unlinkSync(tmpPng);
  await browser.close();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
