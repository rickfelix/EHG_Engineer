#!/usr/bin/env node

/**
 * Create SD-TEST-MOCK-001 database record (retroactive)
 *
 * This SD was executed with full EXEC phase completion but never created in the database.
 * This script creates the database record retroactively for audit trail purposes.
 *
 * Prevention: Database verification gates have been added to unified-handoff-system.js
 * to prevent this from happening in the future.
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function createSDTestMock001() {
  console.log('🔍 Creating SD-TEST-MOCK-001 database record...\n');

  const client = await createDatabaseClient('engineer', { verbose: true });

  try {
    // Step 1: Insert Strategic Directive
    console.log('\nStep 1: Inserting Strategic Directive...');
    const sdResult = await client.query(`
      INSERT INTO strategic_directives_v2 (
        id,
        title,
        description,
        category,
        priority,
        rationale,
        scope,
        sd_key,
        sequence_rank,
        status,
        progress_percentage,
        current_phase,
        created_at,
        updated_at,
        completion_date
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        progress_percentage = EXCLUDED.progress_percentage,
        completion_date = EXCLUDED.completion_date
      RETURNING *;
    `, [
      'SD-TEST-MOCK-001',
      'Implement Mock Handler Patterns for Playwright Tests',
      'Create reusable mock handler patterns to prevent test duplication and improve test maintainability. Implements centralized mock request/response handling for API endpoints in Playwright E2E tests.',
      'testing',
      'medium',
      'Reduce test maintenance burden by eliminating duplicated mock setup code across E2E tests',
      'Refactor Playwright test files to use centralized mock handler patterns',
      'SD-TEST-MOCK-001',
      9999,  // Low priority sequence rank since it's a retroactive entry
      'completed',
      100,
      'LEAD',
      '2025-10-16T00:00:00Z'
    ]);

    const sd = sdResult.rows[0];
    console.log('✅ Strategic Directive created:', sd.id);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Status: ${sd.status}`);
    console.log(`   Progress: ${sd.progress_percentage}%\n`);

    // Step 2: Insert PRD
    console.log('Step 2: Inserting PRD...');

    // Generate unique ID for PRD
    const prdId = `PRD-${sd.id}`;

    const prdResult = await client.query(`
      INSERT INTO product_requirements_v2 (
        id,
        sd_id,
        directive_id,
        title,
        executive_summary,
        technical_requirements,
        acceptance_criteria,
        status,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status
      RETURNING *;
    `, [
      prdId,
      'SD-TEST-MOCK-001',
      'SD-TEST-MOCK-001',
      'Mock Handler Patterns for Playwright Tests',
      'Implement reusable mock handler patterns to eliminate duplicated mock setup code across Playwright E2E tests, improving test maintainability and reducing the risk of inconsistencies.',
      JSON.stringify({
        implementation: [
          'Create mock handler utilities',
          'Refactor 3+ test files to use patterns',
          'Document usage in test README'
        ],
        testing: [
          'Unit tests for mock handlers',
          'E2E tests pass with new patterns',
          'CI/CD pipeline validation'
        ]
      }),
      JSON.stringify([
        'Mock handler patterns implemented',
        'Existing tests refactored to use patterns',
        'Documentation updated',
        'All tests passing'
      ]),
      'approved',
      '2025-10-16T00:00:00Z'
    ]);

    const prd = prdResult.rows[0];
    console.log('✅ PRD created:', prd.sd_id);
    console.log(`   Title: ${prd.title}`);
    console.log(`   Status: ${prd.status}\n`);

    // Step 3: Link git commits (for reference)
    console.log('Step 3: Git commits linked to this SD:');
    console.log('   - 36ca2ec: Initial mock handler patterns implementation');
    console.log('   - af1aef4: User story validation gap fix');
    console.log('   - ebe1442: Auto-validation integration\n');

    console.log('✅ SD-TEST-MOCK-001 created successfully in database!');
    console.log('✅ Prevention mechanism: Database verification gates added to unified-handoff-system.js');

  } finally {
    await client.end();
  }
}

createSDTestMock001().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
