#!/usr/bin/env node
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

const consoleMessages = [];
page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));

const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

const requestFailures = [];
page.on('requestfailed', request => requestFailures.push({ url: request.url(), failure: request.failure().errorText }));

console.log('Loading /chairman-analytics...\n');
try {
  await page.goto('http://localhost:8080/chairman-analytics', { waitUntil: 'networkidle2', timeout: 15000 });
} catch (error) {
  console.error('Page load error:', error.message);
}

await page.waitForFunction(() => true, { timeout: 3000 }).catch(() => {});

console.log('=== CONSOLE MESSAGES ===\n');
consoleMessages.forEach(msg => {
  if (msg.type === 'error' || msg.type === 'warning') {
    console.log(`[${msg.type.toUpperCase()}] ${msg.text}`);
  }
});

console.log('\n=== PAGE ERRORS ===\n');
pageErrors.forEach(err => console.log(err));

console.log('\n=== FAILED REQUESTS ===\n');
requestFailures.forEach(req => console.log(`${req.url}: ${req.failure}`));

await browser.close();
