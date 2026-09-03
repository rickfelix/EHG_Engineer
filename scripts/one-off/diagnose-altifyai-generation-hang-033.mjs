#!/usr/bin/env node
// QF-20260902-033: Solomon STEP-0 constraint (c7dad710/8c90a171) requires diagnosing the
// ~120s "Loading alt text..." hang (measured by the census, commit 72765a93497) BEFORE
// writing any stp-e3e6/stp-6219 stepOverride -- an override is admissible only if it performs
// the real product action and the hang proves to be walker timing or a selector issue, never
// if it merely assumes/skips the step.
//
// This probe extends the census's own upload flow with: (1) a much longer poll window (240s,
// double the census's ~120s) to rule out "just needs more time"; (2) console + network
// observation during the wait, to surface an error signal the census's DOM-only polling could
// not see; (3) an explicit final-state read of both data-testid=alt-text-display and its
// data-testid=state-loading child.
import 'dotenv/config';
import { chromium } from 'playwright';
import ventureStepExecutors from '../../lib/apa/venture-step-executors.js';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { buildStepExecutor } = ventureStepExecutors;

const ONE_PX_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const POLL_WINDOW_MS = 240000; // 2x the census's ~120s
const POLL_INTERVAL_MS = 5000;

async function main() {
  const baseUrl = 'https://altifyai.rickfelix2000.workers.dev';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleMessages = [];
  page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  const networkEvents = [];
  page.on('response', (res) => {
    const url = res.url();
    if (/generate|alt.?text|api/i.test(url)) {
      networkEvents.push({ url, status: res.status(), ts: Date.now() });
    }
  });
  page.on('requestfailed', (req) => {
    networkEvents.push({ url: req.url(), failure: req.failure()?.errorText, ts: Date.now() });
  });

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
  const hydrationDeadline = Date.now() + 15000;
  while (Date.now() < hydrationDeadline) {
    const c = await page.locator('input[type="file"]').count().catch(() => 0);
    if (c > 0) break;
    await page.waitForTimeout(250);
  }

  const tmpPng = path.join(os.tmpdir(), `altifyai-diag-1px-${Date.now()}.png`);
  fs.writeFileSync(tmpPng, Buffer.from(ONE_PX_PNG_BASE64, 'base64'));
  const uploadStartMs = Date.now();
  await page.locator('[data-testid="file-input"]').setInputFiles(tmpPng).catch(async (e) => {
    console.log('data-testid=file-input setInputFiles error, falling back to input[type=file]:', e.message);
    await page.locator('input[type="file"]').setInputFiles(tmpPng);
  });

  // Assert status-success within 15s, per the QF's own spec for stp-e3e6.
  let statusSuccessSeenAtMs = null;
  const statusDeadline = Date.now() + 15000;
  while (Date.now() < statusDeadline) {
    const visible = await page.locator('[data-testid="status-success"]').isVisible().catch(() => false);
    if (visible) { statusSuccessSeenAtMs = Date.now(); break; }
    await page.waitForTimeout(250);
  }
  console.log('status-success observed:', statusSuccessSeenAtMs !== null, statusSuccessSeenAtMs ? `at +${statusSuccessSeenAtMs - uploadStartMs}ms` : '');

  // Extended poll (240s) for alt-text-display to leave state-loading, sampling every 5s.
  const samples = [];
  const pollDeadline = Date.now() + POLL_WINDOW_MS;
  let resolvedAtMs = null;
  let finalDisplayText = null;
  while (Date.now() < pollDeadline) {
    const displayVisible = await page.locator('[data-testid="alt-text-display"]').isVisible().catch(() => false);
    const loadingVisible = await page.locator('[data-testid="state-loading"]').isVisible().catch(() => false);
    const displayText = displayVisible
      ? (await page.locator('[data-testid="alt-text-display"]').textContent().catch(() => '') || '').trim()
      : null;
    samples.push({ elapsedMs: Date.now() - uploadStartMs, displayVisible, loadingVisible, displayTextLen: displayText ? displayText.length : 0 });
    if (displayVisible && !loadingVisible && displayText) {
      resolvedAtMs = Date.now();
      finalDisplayText = displayText;
      break;
    }
    await page.waitForTimeout(POLL_INTERVAL_MS);
  }

  console.log('=== SAMPLES (every 5s) ===');
  console.log(JSON.stringify(samples, null, 2));
  console.log('=== RESULT ===');
  console.log(JSON.stringify({
    resolved: resolvedAtMs !== null,
    elapsedMsIfResolved: resolvedAtMs ? resolvedAtMs - uploadStartMs : null,
    finalDisplayTextPreview: finalDisplayText ? finalDisplayText.slice(0, 200) : null,
    totalPolledMs: POLL_WINDOW_MS,
  }, null, 2));
  console.log('=== CONSOLE MESSAGES ===');
  console.log(JSON.stringify(consoleMessages.filter(m => m.type === 'error' || m.type === 'warning'), null, 2));
  console.log('=== NETWORK EVENTS (generate/alt-text/api) ===');
  console.log(JSON.stringify(networkEvents, null, 2));

  fs.unlinkSync(tmpPng);
  await browser.close();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
