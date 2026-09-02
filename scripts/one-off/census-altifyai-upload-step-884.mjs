#!/usr/bin/env node
// QF-20260902-884: live DOM census of the stp-4de9 "upload a single image" step.
// Reuses buildStepExecutor('ALTIFYAI') to drive the REAL, already-shipped auth sequence
// (never re-implemented here) up to its "no verified UI mapping" throw, then -- in the SAME
// authenticated page/browser session -- censuses /upload for a file-input and submit control.
// Read-only census: never uploads a real file, never submits.
import 'dotenv/config';
import { chromium } from 'playwright';
import ventureStepExecutors from '../../lib/apa/venture-step-executors.js';
import { pathToFileURL } from 'node:url';

const { buildStepExecutor, getTestCredential } = ventureStepExecutors;

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
    console.log('NOT AUTHENTICATED -- cannot census the real post-auth upload UI. Aborting.');
    await browser.close();
    process.exit(1);
  }

  // Census /upload in the SAME authenticated session.
  await page.goto(`${baseUrl}/upload`, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => console.log('goto /upload error (continuing):', e.message));
  console.log('landed URL:', page.url());

  const fileInputs = await page.locator('input[type="file"]').count().catch(() => 0);
  console.log('input[type=file] count:', fileInputs);
  for (let i = 0; i < fileInputs; i++) {
    const el = page.locator('input[type="file"]').nth(i);
    console.log(`  [${i}] visible=${await el.isVisible().catch(() => null)} accept=${await el.getAttribute('accept').catch(() => null)} name=${await el.getAttribute('name').catch(() => null)} id=${await el.getAttribute('id').catch(() => null)}`);
  }

  const buttons = page.getByRole('button');
  const btnCount = await buttons.count().catch(() => 0);
  console.log('button count:', btnCount);
  for (let i = 0; i < btnCount; i++) {
    const b = buttons.nth(i);
    const name = (await b.textContent().catch(() => ''))?.trim().slice(0, 60) || null;
    console.log(`  button[${i}] name="${name}" visible=${await b.isVisible().catch(() => null)} enabled=${await b.isEnabled().catch(() => null)}`);
  }

  const bodyText = await page.locator('body').innerText().catch(() => null);
  console.log('page text (first 800 chars):', (bodyText || '').slice(0, 800));

  console.log('--- links on dashboard ---');
  const links = page.getByRole('link');
  const linkCount = await links.count().catch(() => 0);
  for (let i = 0; i < linkCount; i++) {
    const l = links.nth(i);
    const name = (await l.textContent().catch(() => ''))?.trim().slice(0, 60) || null;
    const href = await l.getAttribute('href').catch(() => null);
    console.log(`  link[${i}] name="${name}" href="${href}"`);
  }

  console.log('--- nav/aside/sidebar text ---');
  const navText = await page.locator('nav, aside, [role="navigation"]').first().innerText().catch(() => null);
  console.log(navText);

  console.log('--- full raw HTML (grep-friendly, first 6000 chars of body) ---');
  const html = await page.locator('body').innerHTML().catch(() => null);
  console.log((html || '').slice(0, 6000));

  console.log('--- any element containing "upload" or "image" (case-insensitive) ---');
  const hits = await page.locator('text=/upload|image/i').count().catch(() => 0);
  console.log('hit count:', hits);
  for (let i = 0; i < Math.min(hits, 10); i++) {
    const el = page.locator('text=/upload|image/i').nth(i);
    console.log(`  hit[${i}]:`, (await el.textContent().catch(() => '') || '').trim().slice(0, 100));
  }

  console.log('--- probing alternate routes in the SAME authenticated session ---');
  for (const route of ['/generate', '/create', '/images', '/alt-text', '/tools', '/content', '/new']) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle', timeout: 15000 }).catch((e) => console.log(route, 'goto error:', e.message));
    const url = page.url();
    const text = (await page.locator('body').innerText().catch(() => '') || '').trim().slice(0, 200);
    const fileCount = await page.locator('input[type="file"]').count().catch(() => 0);
    console.log(`${route} -> landed=${url} fileInputs=${fileCount} text="${text}"`);
  }

  await browser.close();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
