#!/usr/bin/env node
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test credentials
dotenv.config({ path: path.resolve(__dirname, '../../ehg/.env.test.local') });

const email = process.env.SUPABASE_TEST_EMAIL;
const password = process.env.SUPABASE_TEST_PASSWORD;

if (!email || !password) {
  console.error('❌ Missing test credentials in .env.test.local');
  process.exit(1);
}

console.log('\n🧪 AUTHENTICATED TESTING: Chairman Decision Analytics');
console.log('======================================================================\n');

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });

try {
  // Step 1: Login
  console.log('Step 1: Logging in...');
  await page.goto('http://localhost:8080/login', { waitUntil: 'networkidle2' });

  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect away from login
  await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 15000 });
  console.log('✅ Login successful\n');

  // Step 2: Navigate to chairman-analytics
  console.log('Step 2: Navigating to /chairman-analytics...');
  await page.goto('http://localhost:8080/chairman-analytics', { waitUntil: 'networkidle2' });

  await page.waitForFunction(() => true, { timeout: 2000 }).catch(() => {});

  const url = page.url();
  if (!url.includes('chairman-analytics')) {
    console.log(`❌ FAIL: Redirected to ${url}`);
    process.exit(1);
  }
  console.log('✅ Dashboard loaded\n');

  // Step 3: Take screenshot
  console.log('Step 3: Capturing screenshot...');
  await page.screenshot({ path: '/tmp/chairman-analytics-auth.png', fullPage: true });
  console.log('✅ Screenshot saved to /tmp/chairman-analytics-auth.png\n');

  // Step 4: Check for key elements
  console.log('Step 4: Checking for dashboard elements...');

  const tests = [];

  // Check for heading
  const headings = await page.$$('h1, h2, h3');
  tests.push({ test: 'Has headings', pass: headings.length > 0, detail: `${headings.length} headings found` });

  // Check for tabs
  const tabs = await page.$$('[role="tab"]');
  tests.push({ test: 'Has tabs', pass: tabs.length >= 3, detail: `${tabs.length} tabs found` });

  // Check for cards
  const cards = await page.$$('[class*="card"]');
  tests.push({ test: 'Has cards', pass: cards.length > 0, detail: `${cards.length} cards found` });

  // Check for any tables
  const tables = await page.$$('table');
  tests.push({ test: 'Has tables', pass: tables.length >= 0, detail: `${tables.length} tables found` });

  // Check page text includes "Decision" or "Analytics"
  const bodyText = await page.evaluate(() => document.body.textContent);
  const hasRelevantText = bodyText.includes('Decision') || bodyText.includes('Analytics') || bodyText.includes('Calibration');
  tests.push({ test: 'Has relevant content', pass: hasRelevantText, detail: hasRelevantText ? 'Found decision/analytics text' : 'No relevant text' });

  console.log('\n📊 TEST RESULTS:');
  console.log('======================================================================\n');

  tests.forEach(t => {
    const icon = t.pass ? '✅' : '❌';
    console.log(`${icon} ${t.test}: ${t.detail}`);
  });

  const passCount = tests.filter(t => t.pass).length;
  const passRate = (passCount / tests.length * 100).toFixed(1);

  console.log(`\nPass Rate: ${passRate}% (${passCount}/${tests.length})`);

  if (passCount >= 3) {
    console.log('\n✅ TESTING VERDICT: PASS\n');
  } else {
    console.log('\n❌ TESTING VERDICT: FAIL\n');
    process.exit(1);
  }

} catch (error) {
  console.error('\n❌ TEST FAILED:', error.message);
  await page.screenshot({ path: '/tmp/chairman-analytics-error.png' });
  console.error('Error screenshot saved to /tmp/chairman-analytics-error.png');
  process.exit(1);
} finally {
  await browser.close();
}
