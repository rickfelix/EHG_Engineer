#!/usr/bin/env node
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });

console.log('Navigating to /chairman-analytics...');
await page.goto('http://localhost:8080/chairman-analytics', { waitUntil: 'networkidle2' });

console.log('Taking screenshot...');
await page.screenshot({ path: '/tmp/chairman-analytics.png', fullPage: true });

console.log('\n✅ Screenshot saved to: /tmp/chairman-analytics.png');

console.log('\nPage HTML structure:');
const bodyHTML = await page.evaluate(() => document.body.innerHTML);
console.log(bodyHTML.substring(0, 2000) + '...');

await browser.close();
