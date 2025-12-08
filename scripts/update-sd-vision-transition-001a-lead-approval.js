#!/usr/bin/env node

/**
 * Update SD-VISION-TRANSITION-001A with LEAD Approval
 *
 * Updates:
 * 1. Status: draft → active
 * 2. Current phase: LEAD_APPROVAL → PLAN_PRD
 * 3. Key principles array
 * 4. Risks array with mitigation strategies
 * 5. Scope reduction percentage: 15
 * 6. is_working_on: true (starting work)
 * 7. Strategic intent: Archive legacy documentation
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';

async function updateSDLeadApproval() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    console.log('\n🔍 Fetching current SD state...');

    // Query current state
    const currentResult = await client.query(`
      SELECT id, title, status, current_phase, key_principles, risks,
             scope_reduction_percentage, is_working_on, strategic_intent
      FROM strategic_directives_v2
      WHERE id = 'SD-VISION-TRANSITION-001A'
    `);

    if (currentResult.rows.length === 0) {
      console.error('❌ ERROR: SD-VISION-TRANSITION-001A not found in database');
      process.exit(1);
    }

    console.log('\n📊 Current State:');
    console.log(JSON.stringify(currentResult.rows[0], null, 2));

    // Prepare update data
    const keyPrinciples = [
      'Copy-first approach - never delete until verified',
      'Manifest completeness - document everything archived',
      'Reference check - verify no active links before cleanup'
    ];

    const risks = [
      {
        risk: 'Incorrect file paths during copy',
        probability: 'low',
        impact: 'medium',
        mitigation: 'Verify paths exist before copy operation'
      },
      {
        risk: 'Active references break',
        probability: 'medium',
        impact: 'high',
        mitigation: 'Grep for references in codebase before archive'
      },
      {
        risk: 'Missing files in manifest',
        probability: 'low',
        impact: 'low',
        mitigation: 'Generate manifest after copy, verify file counts'
      }
    ];

    const strategicIntent = 'Archive legacy 40-stage documentation while preserving historical context for future reference';

    console.log('\n✅ Applying LEAD Approval updates...');

    // Execute update
    const updateResult = await client.query(`
      UPDATE strategic_directives_v2
      SET
        status = 'active',
        current_phase = 'PLAN_PRD',
        key_principles = $1::jsonb,
        risks = $2::jsonb,
        scope_reduction_percentage = 15,
        is_working_on = true,
        strategic_intent = $3,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = 'database-agent:lead-approval'
      WHERE id = 'SD-VISION-TRANSITION-001A'
      RETURNING id, title, status, current_phase, scope_reduction_percentage,
                is_working_on, strategic_intent
    `, [
      JSON.stringify(keyPrinciples),
      JSON.stringify(risks),
      strategicIntent
    ]);

    console.log('\n✅ Update successful!');
    console.log('\n📊 New State:');
    console.log(JSON.stringify(updateResult.rows[0], null, 2));

    // Verify the update
    console.log('\n🔍 Verifying update...');
    const verifyResult = await client.query(`
      SELECT id, title, status, current_phase,
             array_length(key_principles::jsonb::json::text::json, 1) as key_principles_count,
             array_length(risks::jsonb::json::text::json, 1) as risks_count,
             scope_reduction_percentage, is_working_on, strategic_intent
      FROM strategic_directives_v2
      WHERE id = 'SD-VISION-TRANSITION-001A'
    `);

    const verification = verifyResult.rows[0];
    console.log('\n✅ Verification Results:');
    console.log(`   Status: ${verification.status} (expected: active)`);
    console.log(`   Current Phase: ${verification.current_phase} (expected: PLAN_PRD)`);
    console.log(`   Key Principles Count: ${verification.key_principles_count} (expected: 3)`);
    console.log(`   Risks Count: ${verification.risks_count} (expected: 3)`);
    console.log(`   Scope Reduction: ${verification.scope_reduction_percentage}% (expected: 15)`);
    console.log(`   Is Working On: ${verification.is_working_on} (expected: true)`);
    console.log(`   Strategic Intent: ${verification.strategic_intent?.substring(0, 50)}...`);

    console.log('\n✅ SD-VISION-TRANSITION-001A LEAD Approval complete!');
    console.log('   ➡️  Ready for PLAN phase');

  } catch (error) {
    console.error('\n❌ Error updating SD:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Execute
updateSDLeadApproval();
