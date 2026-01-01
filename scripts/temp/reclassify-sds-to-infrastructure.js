#!/usr/bin/env node

/**
 * Reclassify Strategic Directives from 'feature' to 'infrastructure'
 *
 * Context: SD-STAGE-ARCH-001-P4 through P10 were misclassified as 'feature'
 * when they are actually infrastructure work (scaffolding, tooling, governance).
 *
 * This script updates sd_type and adds governance_metadata.type_reclassification
 * to create audit trail.
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

const RECLASSIFICATIONS = [
  {
    sd_id: 'SD-STAGE-ARCH-001-P4',
    reason: 'Stage 1-5 V2 implementation is scaffolding and developer tooling, not customer-facing features'
  },
  {
    sd_id: 'SD-STAGE-ARCH-001-P5',
    reason: 'Governance scripts, audit tools, and ADR documentation are internal development infrastructure'
  },
  {
    sd_id: 'SD-STAGE-ARCH-001-P6',
    reason: 'StageRouter resilience and timeout handling is internal infrastructure, not user-facing functionality'
  },
  {
    sd_id: 'SD-STAGE-ARCH-001-P7',
    reason: 'God component refactoring and ESLint rules are code quality infrastructure for maintainability'
  },
  {
    sd_id: 'SD-STAGE-ARCH-001-P8',
    reason: 'E2E test suite and Playwright fixtures are testing infrastructure, not customer features'
  },
  {
    sd_id: 'SD-STAGE-ARCH-001-P9',
    reason: 'Error boundaries, API error handlers, and performance hooks are observability infrastructure'
  },
  {
    sd_id: 'SD-STAGE-ARCH-001-P10',
    reason: 'Vision alignment review and follow-up SD creation is process documentation and planning infrastructure'
  }
];

async function reclassifySD(client, { sd_id, reason }) {
  console.log(`\n📝 Reclassifying ${sd_id}...`);
  console.log(`   Reason: ${reason}`);

  try {
    // First, verify the SD exists and get current type
    const checkQuery = `
      SELECT id, sd_type, governance_metadata
      FROM strategic_directives_v2
      WHERE id = $1
    `;

    const checkResult = await client.query(checkQuery, [sd_id]);

    if (checkResult.rows.length === 0) {
      console.error(`   ❌ ERROR: SD ${sd_id} not found`);
      return { sd_id, success: false, error: 'SD not found' };
    }

    const currentType = checkResult.rows[0].sd_type;
    const currentMetadata = checkResult.rows[0].governance_metadata || {};

    console.log(`   Current type: ${currentType}`);

    if (currentType === 'infrastructure') {
      console.log('   ⚠️  SKIP: Already classified as infrastructure');
      return { sd_id, success: true, skipped: true };
    }

    // Build reclassification metadata
    const reclassificationData = {
      from: currentType,
      to: 'infrastructure',
      reason: reason,
      approved_by: 'Chairman',
      reclassified_at: new Date().toISOString()
    };

    // Update the SD
    const updateQuery = `
      UPDATE strategic_directives_v2
      SET
        sd_type = 'infrastructure',
        governance_metadata = jsonb_set(
          COALESCE(governance_metadata, '{}'::jsonb),
          '{type_reclassification}',
          $2::jsonb
        ),
        updated_at = CURRENT_TIMESTAMP,
        updated_by = 'Chairman'
      WHERE id = $1
      RETURNING id, sd_type, governance_metadata
    `;

    const updateResult = await client.query(updateQuery, [
      sd_id,
      JSON.stringify(reclassificationData)
    ]);

    if (updateResult.rows.length > 0) {
      console.log(`   ✅ SUCCESS: ${sd_id} reclassified to infrastructure`);
      console.log('   Updated metadata:', JSON.stringify(updateResult.rows[0].governance_metadata.type_reclassification, null, 2));
      return { sd_id, success: true, result: updateResult.rows[0] };
    } else {
      console.error(`   ❌ ERROR: Update failed for ${sd_id}`);
      return { sd_id, success: false, error: 'Update returned no rows' };
    }

  } catch (error) {
    console.error(`   ❌ ERROR: ${error.message}`);
    return { sd_id, success: false, error: error.message };
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  SD Type Reclassification: feature → infrastructure        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nReclassifying ${RECLASSIFICATIONS.length} Strategic Directives...\n`);

  let client;

  try {
    // Create database connection
    client = await createDatabaseClient('engineer', { verify: false });
    console.log('✅ Database connection established\n');

    const results = [];

    // Process each reclassification
    for (const reclassification of RECLASSIFICATIONS) {
      const result = await reclassifySD(client, reclassification);
      results.push(result);
    }

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('SUMMARY');
    console.log('═'.repeat(60));

    const successful = results.filter(r => r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`✅ Successfully reclassified: ${successful}`);
    console.log(`⚠️  Skipped (already infrastructure): ${skipped}`);
    console.log(`❌ Failed: ${failed}`);

    if (failed > 0) {
      console.log('\nFailed SDs:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.sd_id}: ${r.error}`);
      });
    }

    console.log('\n✅ Reclassification complete!');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

main();
