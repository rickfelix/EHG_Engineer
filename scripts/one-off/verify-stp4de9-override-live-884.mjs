#!/usr/bin/env node
// QF-20260902-884: end-to-end LIVE verification of the newly-registered stp-4de9 stepOverride
// (never trust mocks alone for a live-DOM-dependent flow) -- drives the REAL buildStepExecutor
// for the REAL 'ALTIFYAI' registration against the live app, exactly as the actual UAT walk
// would call it, and confirms it returns success with stepOverrideUsed=true.
import 'dotenv/config';
import { chromium } from 'playwright';
import ventureStepExecutors from '../../lib/apa/venture-step-executors.js';
import { pathToFileURL } from 'node:url';

const { buildStepExecutor } = ventureStepExecutors;

async function main() {
  const baseUrl = 'https://altifyai.rickfelix2000.workers.dev';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const ctx = { authenticated: false, baseUrl };
  const step = { step_id: 'stp-4de9-upload-a-single-imag', goal: 'upload a single image from my computer' };

  const executor = buildStepExecutor(step, 'ALTIFYAI');
  await page.goto(baseUrl);
  try {
    const result = await executor(page, { type: 'existing' }, ctx);
    console.log('RESULT:', JSON.stringify(result, null, 2));
    console.log('ctx.authenticated:', ctx.authenticated);
    console.log(result.stepOverrideUsed === true ? 'PASS: stepOverrideUsed=true' : 'FAIL: stepOverrideUsed not true');
  } catch (e) {
    console.error('THREW (unexpected):', e.message);
    process.exitCode = 1;
  }
  await browser.close();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
