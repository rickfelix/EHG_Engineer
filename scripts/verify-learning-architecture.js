#!/usr/bin/env node
/**
 * Verify Learning Architecture schema
 * SD: SD-LEO-INFRA-LEARNING-ARCHITECTURE-001
 *
 * Quick verification that all learning architecture migrations are applied
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function verifySchema() {
  console.log('\n🔍 Verifying Learning Architecture Schema...\n');

  const connStr = process.env.SUPABASE_POOLER_URL;
  if (!connStr) {
    throw new Error('SUPABASE_POOLER_URL not found in .env file');
  }

  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    const checks = [];

    // 1. Check issue_patterns columns
    const { rows: ip } = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.columns
      WHERE table_name = 'issue_patterns'
        AND column_name IN ('source', 'source_feedback_ids')
    `);
    checks.push({
      name: 'issue_patterns columns (source, source_feedback_ids)',
      passed: parseInt(ip[0].count) === 2,
      expected: 2,
      actual: parseInt(ip[0].count)
    });

    // 2. Check feedback column
    const { rows: fb } = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.columns
      WHERE table_name = 'feedback'
        AND column_name = 'cluster_processed_at'
    `);
    checks.push({
      name: 'feedback.cluster_processed_at column',
      passed: parseInt(fb[0].count) === 1,
      expected: 1,
      actual: parseInt(fb[0].count)
    });

    // 3. Check retrospectives column
    const { rows: retro } = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.columns
      WHERE table_name = 'retrospectives'
        AND column_name = 'learning_extracted_at'
    `);
    checks.push({
      name: 'retrospectives.learning_extracted_at column',
      passed: parseInt(retro[0].count) === 1,
      expected: 1,
      actual: parseInt(retro[0].count)
    });

    // 4. Check learning_inbox table
    const { rows: inbox } = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_name = 'learning_inbox'
    `);
    checks.push({
      name: 'learning_inbox table exists',
      passed: parseInt(inbox[0].count) === 1,
      expected: 1,
      actual: parseInt(inbox[0].count)
    });

    // 5. Check constraint
    const { rows: constraint } = await client.query(`
      SELECT COUNT(*) as count
      FROM pg_constraint
      WHERE conname = 'issue_patterns_source_check'
    `);
    checks.push({
      name: 'issue_patterns_source_check constraint',
      passed: parseInt(constraint[0].count) === 1,
      expected: 1,
      actual: parseInt(constraint[0].count)
    });

    // 6. Check indexes
    const { rows: indexes } = await client.query(`
      SELECT COUNT(*) as count
      FROM pg_indexes
      WHERE indexname IN (
        'idx_issue_patterns_source',
        'idx_feedback_clustering',
        'idx_retrospectives_unextracted',
        'idx_learning_inbox_pending',
        'idx_learning_inbox_source'
      )
    `);
    checks.push({
      name: 'Learning architecture indexes',
      passed: parseInt(indexes[0].count) === 5,
      expected: 5,
      actual: parseInt(indexes[0].count)
    });

    // Display results
    const allPassed = checks.every(c => c.passed);

    console.log('Results:\n');
    checks.forEach(check => {
      const icon = check.passed ? '✅' : '❌';
      console.log(`${icon} ${check.name}`);
      if (!check.passed) {
        console.log(`   Expected: ${check.expected}, Found: ${check.actual}`);
      }
    });

    console.log('\n' + '─'.repeat(60));

    if (allPassed) {
      console.log('\n✅ All learning architecture migrations verified!\n');
      console.log('Schema is ready for:');
      console.log('  - Feedback clustering (feedback.cluster_processed_at)');
      console.log('  - Retrospective extraction (retrospectives.learning_extracted_at)');
      console.log('  - Pattern source tracking (issue_patterns.source)');
      console.log('  - Unified learning inbox (learning_inbox table)\n');
    } else {
      console.log('\n❌ Some checks failed. Run: node scripts/apply-learning-architecture-migrations.js\n');
      process.exit(1);
    }

    await client.end();

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    await client.end();
    process.exit(1);
  }
}

verifySchema().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
