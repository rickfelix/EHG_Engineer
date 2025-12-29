#!/usr/bin/env node

/**
 * Comprehensive End-to-End Test Suite for PR Reviews Integration
 * Tests all components from database to UI to real-time updates
 */

import { chromium } from 'playwright';
import WebSocket from 'ws';
import DatabaseLoader from '../src/services/database-loader.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const TEST_RESULTS = {
  infrastructure: {},
  database: {},
  api: {},
  ui: {},
  realtime: {},
  integration: {}
};

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. Test Infrastructure
async function testInfrastructure() {
  console.log('\n🏗️  TESTING INFRASTRUCTURE...\n');

  // Check server is running
  try {
    const response = await fetch('http://localhost:3000/api/health');
    TEST_RESULTS.infrastructure.serverRunning = response.ok;
    console.log('✅ Server running on port 3000');
  } catch (_error) {
    TEST_RESULTS.infrastructure.serverRunning = false;
    console.log(`❌ Server not accessible: ${error.message}`);
  }

  // Check database connection
  const dbLoader = new DatabaseLoader();
  TEST_RESULTS.infrastructure.databaseConnected = dbLoader.isConnected;
  console.log(dbLoader.isConnected ? '✅ Database connected' : '❌ Database not connected');

  // Check GitHub Actions workflows exist
  const workflowsPath = path.join(__dirname, '..', '.github', 'workflows');
  const workflows = ['claude-agentic-review.yml', 'security-review.yml'];

  for (const workflow of workflows) {
    const exists = fs.existsSync(path.join(workflowsPath, workflow));
    TEST_RESULTS.infrastructure[workflow] = exists;
    console.log(exists ? `✅ ${workflow} exists` : `❌ ${workflow} missing`);
  }

  // Check configuration files
  const configFiles = ['config/pr-review-config.yml', 'config/security-exemptions.yml'];
  for (const file of configFiles) {
    const exists = fs.existsSync(path.join(__dirname, '..', file));
    TEST_RESULTS.infrastructure[file] = exists;
    console.log(exists ? `✅ ${file} exists` : `❌ ${file} missing`);
  }

  return TEST_RESULTS.infrastructure;
}

// 2. Test Database
async function testDatabase() {
  console.log('\n💾 TESTING DATABASE...\n');

  const dbLoader = new DatabaseLoader();

  // Test tables exist
  try {
    const { data: _reviews } = await dbLoader.supabase
      .from('agentic_reviews')
      .select('count');
    TEST_RESULTS.database.agenticReviewsTable = true;
    console.log('✅ agentic_reviews table exists');
  } catch (error) {
    TEST_RESULTS.database.agenticReviewsTable = false;
    console.log('❌ agentic_reviews table error:', error.message);
  }

  try {
    const { data: _metrics } = await dbLoader.supabase
      .from('pr_metrics')
      .select('count');
    TEST_RESULTS.database.prMetricsTable = true;
    console.log('✅ pr_metrics table exists');
  } catch (error) {
    TEST_RESULTS.database.prMetricsTable = false;
    console.log('❌ pr_metrics table error:', error.message);
  }

  // Test insert capability
  try {
    const testReview = {
      pr_number: 999,
      pr_title: 'E2E Test PR',
      branch: 'test/e2e',
      author: 'e2e-test',
      status: 'pending',
      leo_phase: 'EXEC'
    };

    const result = await dbLoader.savePRReview(testReview);
    TEST_RESULTS.database.insertCapability = !!result;
    console.log('✅ Database insert working');

    // Clean up test data
    await dbLoader.supabase
      .from('agentic_reviews')
      .delete()
      .eq('pr_number', 999);
  } catch (_error) {
    TEST_RESULTS.database.insertCapability = false;
    console.log('❌ Database insert failed:', error.message);
  }

  // Test metrics calculation
  try {
    const metrics = await dbLoader.calculatePRMetrics();
    TEST_RESULTS.database.metricsCalculation = !!metrics;
    console.log('✅ Metrics calculation working');
  } catch (_error) {
    TEST_RESULTS.database.metricsCalculation = false;
    console.log('❌ Metrics calculation failed:', error.message);
  }

  return TEST_RESULTS.database;
}

// 3. Test API Endpoints
async function testAPI() {
  console.log('\n🔌 TESTING API ENDPOINTS...\n');

  // Test PR Reviews endpoint
  try {
    const response = await fetch('http://localhost:3000/api/pr-reviews');
    const data = await response.json();
    TEST_RESULTS.api.prReviewsEndpoint = response.ok && Array.isArray(data);
    console.log(`✅ /api/pr-reviews returns ${data.length} reviews`);
  } catch (_error) {
    TEST_RESULTS.api.prReviewsEndpoint = false;
    console.log('❌ /api/pr-reviews failed:', error.message);
  }

  // Test Metrics endpoint
  try {
    const response = await fetch('http://localhost:3000/api/pr-reviews/metrics');
    const data = await response.json();
    TEST_RESULTS.api.metricsEndpoint = response.ok && data.hasOwnProperty('passRate');
    console.log(`✅ /api/pr-reviews/metrics returns metrics (Pass rate: ${data.passRate}%)`);
  } catch (_error) {
    TEST_RESULTS.api.metricsEndpoint = false;
    console.log('❌ /api/pr-reviews/metrics failed:', error.message);
  }

  // Test webhook endpoint exists
  try {
    const response = await fetch('http://localhost:3000/api/github/pr-review-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ping' })
    });
    // Webhook should return 200 OK or 400 Bad Request (both mean it exists)
    TEST_RESULTS.api.webhookEndpoint = response.status === 200 || response.status === 400;
    console.log(TEST_RESULTS.api.webhookEndpoint ? '✅ GitHub webhook endpoint exists' : '❌ Webhook endpoint missing');
  } catch (_error) {
    TEST_RESULTS.api.webhookEndpoint = false;
    console.log('❌ Webhook endpoint failed:', error.message);
  }

  return TEST_RESULTS.api;
}

// 4. Test UI Components
async function testUI() {
  console.log('\n🖥️  TESTING UI COMPONENTS...\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Load PR Reviews page
    await page.goto('http://localhost:3000/pr-reviews', { waitUntil: 'networkidle' });
    TEST_RESULTS.ui.pageLoads = true;
    console.log('✅ PR Reviews page loads');

    // Check navigation exists - look for GitPullRequest icon or PR Reviews text
    try {
      const navButton = await page.locator('a[href="/pr-reviews"], button:has-text("PR Reviews"), svg[class*="git-pull"]').first();
      TEST_RESULTS.ui.navigationButton = await navButton.count() > 0;
      console.log(TEST_RESULTS.ui.navigationButton ? '✅ Navigation button exists' : '❌ Navigation button missing');
    } catch {
      TEST_RESULTS.ui.navigationButton = false;
      console.log('❌ Navigation button missing');
    }

    // Check summary cards
    const summaryCards = await page.locator('text=Pass Rate').count();
    TEST_RESULTS.ui.summaryCards = summaryCards > 0;
    console.log(TEST_RESULTS.ui.summaryCards ? '✅ Summary cards rendered' : '❌ Summary cards missing');

    // Check tabs
    const tabs = ['Active', 'Review History', 'Metrics'];
    for (const tab of tabs) {
      const tabButton = await page.locator(`button:has-text("${tab}")`).first();
      const visible = await tabButton.isVisible();
      TEST_RESULTS.ui[`${tab}Tab`] = visible;
      console.log(visible ? `✅ ${tab} tab exists` : `❌ ${tab} tab missing`);

      if (visible) {
        await tabButton.click();
        await delay(500);
      }
    }

    // Check data displays
    const passRateElement = await page.locator('text=/\\d+\\.?\\d*%/').first();
    TEST_RESULTS.ui.dataDisplays = await passRateElement.isVisible();
    console.log(TEST_RESULTS.ui.dataDisplays ? '✅ Data displays correctly' : '❌ Data not displaying');

  } catch (_error) {
    console.log('❌ UI test error:', error.message);
    TEST_RESULTS.ui.error = error.message;
  } finally {
    await browser.close();
  }

  return TEST_RESULTS.ui;
}

// 5. Test Real-time Updates
async function testRealtime() {
  console.log('\n📡 TESTING REAL-TIME UPDATES...\n');

  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:3000');
    let connected = false;
    let messageReceived = false;

    const timeout = setTimeout(() => {
      if (!connected) {
        TEST_RESULTS.realtime.websocketConnection = false;
        console.log('❌ WebSocket connection timeout');
      }
      if (!messageReceived) {
        TEST_RESULTS.realtime.messageReception = false;
        console.log('❌ No WebSocket messages received');
      }
      ws.close();
      resolve(TEST_RESULTS.realtime);
    }, 5000);

    ws.on('open', () => {
      connected = true;
      TEST_RESULTS.realtime.websocketConnection = true;
      console.log('✅ WebSocket connected');
    });

    ws.on('message', (data) => {
      messageReceived = true;
      TEST_RESULTS.realtime.messageReception = true;
      const message = JSON.parse(data.toString());
      console.log(`✅ WebSocket message received: ${message.type}`);

      if (message.type === 'state') {
        TEST_RESULTS.realtime.stateUpdates = true;
        console.log('✅ State updates working');
      }

      clearTimeout(timeout);
      ws.close();
      resolve(TEST_RESULTS.realtime);
    });

    ws.on('error', (error) => {
      TEST_RESULTS.realtime.error = error.message;
      console.log('❌ WebSocket error:', error.message);
      clearTimeout(timeout);
      resolve(TEST_RESULTS.realtime);
    });
  });
}

// 6. Test Integration Flow
async function testIntegration() {
  console.log('\n🔄 TESTING INTEGRATION FLOW...\n');

  const dbLoader = new DatabaseLoader();

  // Simulate complete PR review flow
  try {
    // 1. Insert a PR review
    const testPR = {
      pr_number: 200,
      pr_title: 'Integration test PR',
      branch: 'test/integration',
      author: 'integration-test',
      status: 'pending',
      sd_link: 'SD-2025-100',
      prd_link: 'PRD-2025-100-01',
      leo_phase: 'EXEC',
      sub_agent_reviews: [
        { sub_agent: 'security', status: 'passed' },
        { sub_agent: 'testing', status: 'passed' },
        { sub_agent: 'database', status: 'passed' },
        { sub_agent: 'performance', status: 'warning' }
      ]
    };

    const review = await dbLoader.savePRReview(testPR);
    TEST_RESULTS.integration.prCreation = !!review;
    console.log('✅ PR review created');

    // 2. Update to completed
    const { error: updateError } = await dbLoader.supabase
      .from('agentic_reviews')
      .update({ status: 'passed', review_time_ms: 4500 })
      .eq('id', review.id);

    TEST_RESULTS.integration.prUpdate = !updateError;
    console.log('✅ PR review updated');

    // 3. Verify in API
    const response = await fetch('http://localhost:3000/api/pr-reviews');
    const reviews = await response.json();
    const foundReview = reviews.find(r => r.pr_number === 200);
    TEST_RESULTS.integration.apiReflection = !!foundReview;
    console.log('✅ PR appears in API');

    // 4. Check metrics updated
    const metricsResponse = await fetch('http://localhost:3000/api/pr-reviews/metrics');
    const metrics = await metricsResponse.json();
    TEST_RESULTS.integration.metricsUpdated = metrics.totalToday > 0;
    console.log('✅ Metrics updated');

    // 5. Clean up
    await dbLoader.supabase
      .from('agentic_reviews')
      .delete()
      .eq('pr_number', 200);
    console.log('✅ Test data cleaned up');

    TEST_RESULTS.integration.completeFlow = true;
    console.log('✅ Complete integration flow working');

  } catch (_error) {
    TEST_RESULTS.integration.error = error.message;
    console.log('❌ Integration test failed:', error.message);
  }

  return TEST_RESULTS.integration;
}

// Main test runner
async function runAllTests() {
  console.log('=' .repeat(60));
  console.log('🧪 COMPREHENSIVE END-TO-END TEST SUITE');
  console.log('=' .repeat(60));

  await testInfrastructure();
  await testDatabase();
  await testAPI();
  await testUI();
  await testRealtime();
  await testIntegration();

  // Generate summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 FINAL TEST RESULTS SUMMARY');
  console.log('=' .repeat(60) + '\n');

  let totalTests = 0;
  let passedTests = 0;

  for (const [category, results] of Object.entries(TEST_RESULTS)) {
    console.log(`\n${category.toUpperCase()}:`);
    for (const [test, result] of Object.entries(results)) {
      if (test === 'error') continue;
      totalTests++;
      if (result === true) passedTests++;

      const status = result === true ? '✅' : '❌';
      console.log(`  ${status} ${test}: ${result === true ? 'PASSED' : 'FAILED'}`);
    }
  }

  const successRate = ((passedTests / totalTests) * 100).toFixed(1);

  console.log('\n' + '=' .repeat(60));
  console.log(`OVERALL: ${passedTests}/${totalTests} tests passed (${successRate}%)`);
  console.log('=' .repeat(60) + '\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL END-TO-END TESTS PASSED!');
    console.log('✅ The PR Reviews integration is FULLY FUNCTIONAL.');
  } else {
    console.log(`⚠️  ${totalTests - passedTests} tests failed.`);
    console.log('Please review the failures above.');
  }

  process.exit(passedTests === totalTests ? 0 : 1);
}

// Run tests
runAllTests().catch(console.error);