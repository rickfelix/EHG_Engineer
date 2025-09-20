#!/usr/bin/env node

import DatabaseLoader from '../src/services/database-loader.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testPRReviewInsertion() {
  const dbLoader = new DatabaseLoader();

  if (!dbLoader.isConnected) {
    console.error('❌ Database not connected');
    process.exit(1);
  }

  console.log('🔄 Inserting test PR review...');

  const testReview = {
    pr_number: 103,
    pr_title: 'Test real-time update feature',
    branch: 'test/realtime-updates',
    author: 'testuser',
    github_url: 'https://github.com/org/repo/pull/103',
    status: 'passed',
    summary: 'Testing real-time dashboard updates',
    issues: ['Minor: Consider adding more comments'],
    sub_agent_reviews: [
      { sub_agent: 'security', status: 'passed', issues: [] },
      { sub_agent: 'testing', status: 'passed', issues: [] },
      { sub_agent: 'performance', status: 'warning', issues: ['Consider optimizing bundle size'] }
    ],
    sd_link: 'SD-2025-004',
    prd_link: 'PRD-2025-004-01',
    leo_phase: 'PLAN_VERIFY',
    commit_sha: 'abc123def456',
    review_time_ms: 5200,
    is_false_positive: false,
    metadata: { test: true, timestamp: new Date().toISOString() }
  };

  try {
    const result = await dbLoader.savePRReview(testReview);
    console.log('✅ PR Review inserted successfully:', result.id);
    console.log('📊 Review details:', {
      pr_number: result.pr_number,
      status: result.status,
      sub_agents: result.sub_agent_reviews.length
    });

    // Update metrics
    await dbLoader.updatePRMetrics();
    console.log('✅ Metrics updated');

    // Fetch updated metrics
    const metrics = await dbLoader.calculatePRMetrics();
    console.log('📈 Current metrics:', metrics);

  } catch (error) {
    console.error('❌ Error inserting PR review:', error);
  }

  process.exit(0);
}

testPRReviewInsertion();