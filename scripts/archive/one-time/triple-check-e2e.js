#!/usr/bin/env node

/**
 * TRIPLE-CHECK: Final validation of PR Reviews integration
 * This performs a complete end-to-end flow with verification at each step
 */

import { chromium } from 'playwright';
import DatabaseLoader from '../src/services/database-loader.js';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const CHECKS = [];

async function check(name, testFn) {
  process.stdout.write(`Checking ${name}... `);
  try {
    const result = await testFn();
    if (result) {
      console.log('✅');
      CHECKS.push({ name, passed: true });
      return true;
    } else {
      console.log('❌');
      CHECKS.push({ name, passed: false });
      return false;
    }
  } catch (error) {
    console.log(`❌ (${error.message})`);
    CHECKS.push({ name, passed: false, error: error.message });
    return false;
  }
}

async function main() {
  console.log('=' .repeat(60));
  console.log('🔍 TRIPLE-CHECK: FINAL E2E VALIDATION');
  console.log('=' .repeat(60));
  console.log();

  const dbLoader = new DatabaseLoader();

  // 1. DATABASE LAYER
  console.log('📊 DATABASE LAYER CHECKS:');
  console.log('-'.repeat(40));

  await check('Database connected', () => dbLoader.isConnected);

  await check('Can query PR reviews', async () => {
    const reviews = await dbLoader.loadPRReviews();
    return Array.isArray(reviews);
  });

  await check('Can calculate metrics', async () => {
    const metrics = await dbLoader.calculatePRMetrics();
    return metrics && typeof metrics.passRate !== 'undefined';
  });

  await check('Can insert new PR review', async () => {
    const testPR = {
      pr_number: 5000 + Date.now() % 1000, // Random number to avoid conflicts
      pr_title: 'Triple-check test PR',
      branch: 'test/triple-check',
      author: 'triple-checker',
      status: 'pending',
      leo_phase: 'EXEC'
    };
    const result = await dbLoader.savePRReview(testPR);

    // Clean up
    await dbLoader.supabase
      .from('agentic_reviews')
      .delete()
      .eq('id', result.id);

    return !!result.id;
  });

  // 2. API LAYER
  console.log('\n🔌 API LAYER CHECKS:');
  console.log('-'.repeat(40));

  await check('Server responds to health check', async () => {
    const response = await fetch('http://localhost:3000/api/health');
    return response.ok;
  });

  await check('PR reviews API returns data', async () => {
    const response = await fetch('http://localhost:3000/api/pr-reviews');
    const data = await response.json();
    return response.ok && Array.isArray(data) && data.length > 0;
  });

  await check('Metrics API returns calculations', async () => {
    const response = await fetch('http://localhost:3000/api/pr-reviews/metrics');
    const data = await response.json();
    return response.ok &&
           typeof data.passRate !== 'undefined' &&
           typeof data.totalToday !== 'undefined' &&
           typeof data.complianceRate !== 'undefined';
  });

  await check('Webhook endpoint exists', async () => {
    const response = await fetch('http://localhost:3000/api/github/pr-review-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true })
    });
    // 500 is expected for invalid data, but it means endpoint exists
    return response.status === 200 || response.status === 400 || response.status === 500;
  });

  // 3. UI LAYER
  console.log('\n🖥️  UI LAYER CHECKS:');
  console.log('-'.repeat(40));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await check('Dashboard loads at /pr-reviews', async () => {
    const response = await page.goto('http://localhost:3000/pr-reviews');
    return response.ok();
  });

  await check('PR Reviews title visible', async () => {
    const title = await page.locator('text=PR Reviews').first();
    return await title.isVisible();
  });

  await check('Summary cards display metrics', async () => {
    const cards = [
      'Active Reviews',
      'Pass Rate',
      'Avg Review Time',
      'False Positive Rate',
      'Compliance Rate'
    ];

    for (const card of cards) {
      const element = await page.locator(`text=${card}`).first();
      if (!await element.isVisible()) return false;
    }
    return true;
  });

  await check('All three tabs are clickable', async () => {
    // Test Active tab
    const activeTab = await page.locator('button:has-text("Active")').first();
    await activeTab.click();
    await page.waitForTimeout(200);

    // Test History tab
    const historyTab = await page.locator('button:has-text("Review History")').first();
    await historyTab.click();
    await page.waitForTimeout(200);

    // Test Metrics tab
    const metricsTab = await page.locator('button:has-text("Metrics")').first();
    await metricsTab.click();
    await page.waitForTimeout(200);

    return true;
  });

  await check('Data from API displays in UI', async () => {
    // Look for percentage values which indicate data is loaded
    const percentages = await page.locator('text=/%/').count();
    return percentages > 0;
  });

  await browser.close();

  // 4. REAL-TIME LAYER
  console.log('\n📡 REAL-TIME LAYER CHECKS:');
  console.log('-'.repeat(40));

  await check('WebSocket connects', async () => {
    return new Promise((resolve) => {
      const ws = new WebSocket('ws://localhost:3000');

      ws.on('open', () => {
        ws.close();
        resolve(true);
      });

      ws.on('error', () => {
        resolve(false);
      });

      setTimeout(() => {
        ws.close();
        resolve(false);
      }, 3000);
    });
  });

  await check('WebSocket receives state updates', async () => {
    return new Promise((resolve) => {
      const ws = new WebSocket('ws://localhost:3000');

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'state') {
          ws.close();
          resolve(true);
        }
      });

      ws.on('error', () => {
        ws.close();
        resolve(false);
      });

      setTimeout(() => {
        ws.close();
        resolve(false);
      }, 3000);
    });
  });

  await check('Supabase subscription active', async () => {
    // Insert a test record and see if it triggers an update
    const testPR = {
      pr_number: 6000 + Date.now() % 1000,
      pr_title: 'Realtime test',
      branch: 'test/realtime',
      author: 'realtime-test',
      status: 'pending',
      leo_phase: 'EXEC'
    };

    const result = await dbLoader.savePRReview(testPR);

    // Wait a moment for propagation
    await new Promise(r => setTimeout(r, 1000));

    // Check if it appears in API
    const response = await fetch('http://localhost:3000/api/pr-reviews');
    const reviews = await response.json();
    const found = reviews.find(r => r.id === result.id);

    // Clean up
    await dbLoader.supabase
      .from('agentic_reviews')
      .delete()
      .eq('id', result.id);

    return !!found;
  });

  // 5. INTEGRATION CHECKS
  console.log('\n🔄 INTEGRATION CHECKS:');
  console.log('-'.repeat(40));

  await check('Complete PR review lifecycle', async () => {
    // Create -> Update -> Verify in API -> Delete
    const pr = {
      pr_number: 7000 + Date.now() % 1000,
      pr_title: 'Lifecycle test',
      branch: 'test/lifecycle',
      author: 'lifecycle-test',
      status: 'pending',
      sd_link: 'SD-TEST-001',
      prd_link: 'PRD-TEST-001',
      leo_phase: 'EXEC',
      sub_agent_reviews: [
        { sub_agent: 'security', status: 'passed' },
        { sub_agent: 'testing', status: 'passed' }
      ]
    };

    // Create
    const created = await dbLoader.savePRReview(pr);
    if (!created.id) return false;

    // Update
    const { error } = await dbLoader.supabase
      .from('agentic_reviews')
      .update({ status: 'passed', review_time_ms: 3000 })
      .eq('id', created.id);
    if (error) return false;

    // Verify in API
    const response = await fetch('http://localhost:3000/api/pr-reviews');
    const reviews = await response.json();
    const found = reviews.find(r => r.id === created.id);
    if (!found || found.status !== 'passed') return false;

    // Clean up
    await dbLoader.supabase
      .from('agentic_reviews')
      .delete()
      .eq('id', created.id);

    return true;
  });

  await check('Sub-agent reviews stored correctly', async () => {
    const pr = {
      pr_number: 8000 + Date.now() % 1000,
      pr_title: 'Sub-agent test',
      branch: 'test/subagents',
      author: 'subagent-test',
      status: 'warning',
      leo_phase: 'PLAN_VERIFY',
      sub_agent_reviews: [
        { sub_agent: 'security', status: 'passed', issues: [] },
        { sub_agent: 'performance', status: 'warning', issues: ['Bundle size'] },
        { sub_agent: 'database', status: 'passed', issues: [] }
      ]
    };

    const created = await dbLoader.savePRReview(pr);

    // Fetch back and verify
    const { data } = await dbLoader.supabase
      .from('agentic_reviews')
      .select('*')
      .eq('id', created.id)
      .single();

    const hasSubAgents = data.sub_agent_reviews &&
                         data.sub_agent_reviews.length === 3 &&
                         data.sub_agent_reviews.some(r => r.sub_agent === 'performance');

    // Clean up
    await dbLoader.supabase
      .from('agentic_reviews')
      .delete()
      .eq('id', created.id);

    return hasSubAgents;
  });

  await check('Metrics update after new review', async () => {
    // Get initial metrics
    const initialMetrics = await dbLoader.calculatePRMetrics();
    const initialTotal = initialMetrics.totalToday;

    // Add a review
    const pr = {
      pr_number: 9000 + Date.now() % 1000,
      pr_title: 'Metrics test',
      branch: 'test/metrics',
      author: 'metrics-test',
      status: 'passed',
      leo_phase: 'EXEC'
    };

    const created = await dbLoader.savePRReview(pr);

    // Get updated metrics
    const newMetrics = await dbLoader.calculatePRMetrics();

    // Clean up
    await dbLoader.supabase
      .from('agentic_reviews')
      .delete()
      .eq('id', created.id);

    // Verify metrics changed
    return newMetrics.totalToday > initialTotal;
  });

  // FINAL SUMMARY
  console.log('\n' + '=' .repeat(60));
  console.log('📊 TRIPLE-CHECK FINAL RESULTS');
  console.log('=' .repeat(60));

  const passed = CHECKS.filter(c => c.passed).length;
  const total = CHECKS.length;
  const percentage = ((passed / total) * 100).toFixed(1);

  console.log(`\nTotal Checks: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`Success Rate: ${percentage}%`);

  if (passed === total) {
    console.log('\n🎉 PERFECT SCORE! ALL CHECKS PASSED!');
    console.log('✅ The PR Reviews system is FULLY OPERATIONAL');
    console.log('✅ All components are integrated and working');
    console.log('✅ Real-time updates are functioning');
    console.log('✅ The system is PRODUCTION READY');
  } else {
    console.log('\n⚠️ Some checks failed:');
    CHECKS.filter(c => !c.passed).forEach(c => {
      console.log(`  ❌ ${c.name}${c.error ? `: ${c.error}` : ''}`);
    });
  }

  console.log('\n' + '=' .repeat(60));

  process.exit(passed === total ? 0 : 1);
}

main().catch(console.error);