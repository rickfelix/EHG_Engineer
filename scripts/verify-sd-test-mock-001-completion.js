#!/usr/bin/env node

/**
 * Verify SD-TEST-MOCK-001 completion status
 * Comprehensive check to ensure retroactive SD is fully complete
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function verifySDCompletion() {
  const client = await createDatabaseClient('engineer', { verbose: false });

  try {
    console.log('🔍 COMPREHENSIVE SD-TEST-MOCK-001 COMPLETION CHECK\n');
    console.log('='.repeat(60));

    // 1. Strategic Directive Status
    console.log('\n1. Strategic Directive Record:');
    const sdResult = await client.query(`
      SELECT id, title, status, progress_percentage, current_phase, completion_date
      FROM strategic_directives_v2
      WHERE id = 'SD-TEST-MOCK-001'
    `);

    if (sdResult.rows.length === 0) {
      console.log('❌ SD not found in database');
      process.exit(1);
    }

    const sd = sdResult.rows[0];
    console.log('   ID:', sd.id);
    console.log('   Title:', sd.title);
    console.log('   Status:', sd.status);
    console.log('   Progress:', sd.progress_percentage + '%');
    console.log('   Phase:', sd.current_phase);
    console.log('   Completed:', sd.completion_date ? new Date(sd.completion_date).toISOString() : 'Not set');

    if (sd.status !== 'completed' || sd.progress_percentage !== 100) {
      console.log('   ⚠️  Status or progress not at 100%');
    } else {
      console.log('   ✅ Status and progress correct');
    }

    // 2. PRD Exists
    console.log('\n2. Product Requirements Document (PRD):');
    const prdResult = await client.query(`
      SELECT id, sd_id, title, status
      FROM product_requirements_v2
      WHERE sd_id = 'SD-TEST-MOCK-001'
    `);

    if (prdResult.rows.length === 0) {
      console.log('   ❌ No PRD found');
    } else {
      console.log('   ✅ PRD exists:', prdResult.rows[0].id);
      console.log('   Title:', prdResult.rows[0].title);
      console.log('   Status:', prdResult.rows[0].status);
    }

    // 3. Deliverables
    console.log('\n3. Scope Deliverables:');
    const deliverablesResult = await client.query(`
      SELECT deliverable_name, completion_status
      FROM sd_scope_deliverables
      WHERE sd_id = 'SD-TEST-MOCK-001'
      ORDER BY created_at
    `);

    if (deliverablesResult.rows.length === 0) {
      console.log('   ⚠️  No deliverables found (may be acceptable for retroactive entry)');
    } else {
      console.log(`   Found ${deliverablesResult.rows.length} deliverable(s):`);
      deliverablesResult.rows.forEach(d => {
        console.log(`   - ${d.deliverable_name}: ${d.completion_status}`);
      });
    }

    // 4. User Stories
    console.log('\n4. User Stories:');
    const userStoriesResult = await client.query(`
      SELECT id, title, validation_status
      FROM user_stories
      WHERE sd_id = 'SD-TEST-MOCK-001'
      ORDER BY created_at
    `);

    if (userStoriesResult.rows.length === 0) {
      console.log('   ⚠️  No user stories found (may be acceptable for retroactive entry)');
    } else {
      console.log(`   Found ${userStoriesResult.rows.length} user story/stories:`);
      const validated = userStoriesResult.rows.filter(s => s.validation_status === 'validated').length;
      console.log(`   Validated: ${validated}/${userStoriesResult.rows.length}`);
    }

    // 5. Handoffs
    console.log('\n5. Phase Handoffs:');
    const handoffsResult = await client.query(`
      SELECT handoff_type, status, created_at
      FROM sd_phase_handoffs
      WHERE sd_id = 'SD-TEST-MOCK-001'
      ORDER BY created_at
    `);

    if (handoffsResult.rows.length === 0) {
      console.log('   ⚠️  No handoffs found (retroactive entry - handoffs were not created during EXEC)');
    } else {
      console.log(`   Found ${handoffsResult.rows.length} handoff(s):`);
      handoffsResult.rows.forEach(h => {
        console.log(`   - ${h.handoff_type}: ${h.status}`);
      });
    }

    // 6. Retrospective
    console.log('\n6. Retrospective:');
    const retroResult = await client.query(`
      SELECT id, quality_score, status
      FROM retrospectives
      WHERE sd_id = 'SD-TEST-MOCK-001'
    `);

    if (retroResult.rows.length === 0) {
      console.log('   ⚠️  No retrospective found (should be generated for completed SDs)');
    } else {
      console.log('   ✅ Retrospective exists:', retroResult.rows[0].id);
      console.log('   Quality Score:', retroResult.rows[0].quality_score);
      console.log('   Status:', retroResult.rows[0].status);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('COMPLETION STATUS SUMMARY:\n');

    const issues = [];
    const warnings = [];

    if (sd.status !== 'completed') issues.push('SD status not completed');
    if (sd.progress_percentage !== 100) issues.push('Progress not 100%');
    if (prdResult.rows.length === 0) issues.push('No PRD found');

    if (deliverablesResult.rows.length === 0) warnings.push('No deliverables tracked');
    if (userStoriesResult.rows.length === 0) warnings.push('No user stories tracked');
    if (handoffsResult.rows.length === 0) warnings.push('No handoffs tracked (retroactive entry)');
    if (retroResult.rows.length === 0) warnings.push('No retrospective generated');

    if (issues.length > 0) {
      console.log('❌ BLOCKING ISSUES:');
      issues.forEach(i => console.log('   - ' + i));
      console.log('');
      process.exit(1);
    }

    if (warnings.length > 0) {
      console.log('⚠️  WARNINGS (acceptable for retroactive entry):');
      warnings.forEach(w => console.log('   - ' + w));
      console.log('');
    }

    console.log('✅ SD-TEST-MOCK-001 is COMPLETE in database');
    console.log('   Status: completed, Progress: 100%');

    if (warnings.length > 0) {
      console.log('\n   Note: Some metadata missing due to retroactive creation,');
      console.log('   but core SD record is valid and complete.');
    }

  } finally {
    await client.end();
  }
}

verifySDCompletion().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
