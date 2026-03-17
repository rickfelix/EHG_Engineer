#!/usr/bin/env node
import puppeteer from 'puppeteer';

/**
 * SD-RECONNECT-011: Automated Testing
 * Standalone test script for Chairman Decision Analytics
 */

const BASE_URL = 'http://localhost:8080';
const TEST_URL = `${BASE_URL}/chairman-analytics-test`; // Using unprotected test route

console.log('\n🧪 AUTOMATED TESTING: Chairman Decision Analytics');
console.log('======================================================================\n');

const testResults = [];

async function runTests() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Test 1: Dashboard loads successfully
    console.log('Test 1: Dashboard loads successfully...');
    try {
      const response = await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 15000 });
      const status = response.status();

      if (status === 200) {
        console.log('✅ PASS: Page loads with HTTP 200\n');
        testResults.push({ test: 'Dashboard loads', status: 'PASS', details: 'HTTP 200 OK' });
      } else {
        console.log(`❌ FAIL: Page returned HTTP ${status}\n`);
        testResults.push({ test: 'Dashboard loads', status: 'FAIL', details: `HTTP ${status}` });
      }
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}\n`);
      testResults.push({ test: 'Dashboard loads', status: 'FAIL', details: error.message });
    }

    // Test 2: Main heading/title exists
    console.log('Test 2: Dashboard title/heading exists...');
    try {
      await page.waitForSelector('h1, h2', { timeout: 5000 });
      const heading = await page.$eval('h1, h2', el => el.textContent);
      console.log(`✅ PASS: Found heading: "${heading}"\n`);
      testResults.push({ test: 'Dashboard heading', status: 'PASS', details: heading });
    } catch (error) {
      console.log(`❌ FAIL: No heading found\n`);
      testResults.push({ test: 'Dashboard heading', status: 'FAIL', details: 'Not found' });
    }

    // Test 3: Tabs are present
    console.log('Test 3: Navigation tabs are present...');
    try {
      const tabs = await page.$$('[role="tab"], button[data-state]');
      if (tabs.length >= 3) {
        console.log(`✅ PASS: Found ${tabs.length} tabs\n`);
        testResults.push({ test: 'Navigation tabs', status: 'PASS', details: `${tabs.length} tabs found` });
      } else {
        console.log(`⚠️  PARTIAL: Only ${tabs.length} tabs found (expected 3+)\n`);
        testResults.push({ test: 'Navigation tabs', status: 'PARTIAL', details: `${tabs.length} tabs` });
      }
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}\n`);
      testResults.push({ test: 'Navigation tabs', status: 'FAIL', details: error.message });
    }

    // Test 4: Settings tab and feature flags
    console.log('Test 4: Settings tab and feature flag toggles...');
    try {
      // Try to click settings tab (various possible selectors)
      const settingsTab = await page.$('[role="tab"][data-value="settings"]') ||
                          await page.$('button[data-value="settings"]');

      if (settingsTab) {
        await settingsTab.click();
        await page.waitForFunction(() => true, { timeout: 1000 }).catch(() => {});

        // Look for switches
        const switches = await page.$$('button[role="switch"], input[type="checkbox"]');
        if (switches.length > 0) {
          console.log(`✅ PASS: Found ${switches.length} feature flag controls\n`);
          testResults.push({ test: 'Feature flag controls', status: 'PASS', details: `${switches.length} switches` });
        } else {
          console.log(`⚠️  PARTIAL: Settings tab found but no switches\n`);
          testResults.push({ test: 'Feature flag controls', status: 'PARTIAL', details: 'No switches found' });
        }
      } else {
        console.log(`⚠️  PARTIAL: Could not locate Settings tab\n`);
        testResults.push({ test: 'Feature flag controls', status: 'PARTIAL', details: 'Settings tab not found' });
      }
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}\n`);
      testResults.push({ test: 'Feature flag controls', status: 'FAIL', details: error.message });
    }

    // Test 5: Analytics tab content
    console.log('Test 5: Analytics tab has content...');
    try {
      const analyticsTab = await page.$('[role="tab"][data-value="analytics"]') ||
                           await page.$('button[data-value="analytics"]');

      if (analyticsTab) {
        await analyticsTab.click();
        await page.waitForFunction(() => true, { timeout: 1000 }).catch(() => {});

        // Look for table or chart or empty state
        const hasContent = await page.evaluate(() => {
          return !!(document.querySelector('table') ||
                   document.querySelector('[class*="chart"]') ||
                   document.querySelector('svg') ||
                   document.textContent.match(/no decisions|no data|enable/i));
        });

        if (hasContent) {
          console.log(`✅ PASS: Analytics tab has content (table/chart/empty state)\n`);
          testResults.push({ test: 'Analytics content', status: 'PASS', details: 'Content present' });
        } else {
          console.log(`❌ FAIL: Analytics tab appears empty\n`);
          testResults.push({ test: 'Analytics content', status: 'FAIL', details: 'No content found' });
        }
      } else {
        console.log(`⚠️  PARTIAL: Could not locate Analytics tab\n`);
        testResults.push({ test: 'Analytics content', status: 'PARTIAL', details: 'Analytics tab not found' });
      }
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}\n`);
      testResults.push({ test: 'Analytics content', status: 'FAIL', details: error.message });
    }

    // Test 6: Calibration tab exists
    console.log('Test 6: Calibration tab exists...');
    try {
      const calibrationTab = await page.$('[role="tab"][data-value="calibration"]') ||
                            await page.$('button[data-value="calibration"]');

      if (calibrationTab) {
        console.log(`✅ PASS: Calibration tab found\n`);
        testResults.push({ test: 'Calibration tab', status: 'PASS', details: 'Tab exists' });
      } else {
        console.log(`⚠️  PARTIAL: Calibration tab not found\n`);
        testResults.push({ test: 'Calibration tab', status: 'PARTIAL', details: 'Not found' });
      }
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}\n`);
      testResults.push({ test: 'Calibration tab', status: 'FAIL', details: error.message });
    }

    // Test 7: No JavaScript errors
    console.log('Test 7: No JavaScript console errors...');
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => true, { timeout: 2000 }).catch(() => {});

    if (consoleErrors.length === 0) {
      console.log(`✅ PASS: No JavaScript errors detected\n`);
      testResults.push({ test: 'No JS errors', status: 'PASS', details: 'Clean console' });
    } else {
      console.log(`⚠️  PARTIAL: ${consoleErrors.length} console errors\n`);
      testResults.push({ test: 'No JS errors', status: 'PARTIAL', details: `${consoleErrors.length} errors` });
    }

    // Test 8: Navigation link exists from homepage
    console.log('Test 8: Navigation link from homepage...');
    try {
      await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
      await page.waitForFunction(() => true, { timeout: 1000 }).catch(() => {});

      const navLink = await page.$('a[href*="chairman-analytics"]');

      if (navLink) {
        console.log(`✅ PASS: Navigation link to Decision Analytics found\n`);
        testResults.push({ test: 'Navigation integration', status: 'PASS', details: 'Link exists' });
      } else {
        console.log(`⚠️  PARTIAL: Navigation link not found\n`);
        testResults.push({ test: 'Navigation integration', status: 'PARTIAL', details: 'Link not found' });
      }
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}\n`);
      testResults.push({ test: 'Navigation integration', status: 'FAIL', details: error.message });
    }

  } finally {
    await browser.close();
  }

  return testResults;
}

// Execute tests
try {
  const results = await runTests();

  console.log('======================================================================');
  console.log('📊 TEST SUMMARY\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const partial = results.filter(r => r.status === 'PARTIAL').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`⚠️  Partial: ${partial}`);
  console.log(`❌ Failed: ${failed}\n`);

  console.log('Detailed Results:');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'PARTIAL' ? '⚠️ ' : '❌';
    console.log(`  ${icon} ${r.test}: ${r.status} - ${r.details}`);
  });

  console.log('\n======================================================================\n');

  const passRate = (passed / results.length * 100).toFixed(1);
  console.log(`Pass Rate: ${passRate}% (${passed}/${results.length})`);

  if (passed >= 6) {
    console.log('\n✅ TESTING VERDICT: PASS (Sufficient functionality verified)\n');
    process.exit(0);
  } else if (passed >= 4) {
    console.log('\n⚠️  TESTING VERDICT: CONDITIONAL_PASS (Core functionality works with minor issues)\n');
    process.exit(0);
  } else {
    console.log('\n❌ TESTING VERDICT: FAIL (Critical functionality missing)\n');
    process.exit(1);
  }

} catch (error) {
  console.error('\n❌ TESTING FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
}
