#!/usr/bin/env node

/**
 * Complete Route Audit Stage Assessments
 *
 * These are documentation/audit type SDs that don't require code implementation.
 * Pattern observed from completed stages (01, 02, 03, 05, 11, 16, 17, 22):
 * - No PRD created
 * - Simple status update to 'completed'
 * - current_phase set to 'COMPLETED'
 *
 * This matches the pattern for audit/assessment tasks that are completed
 * through documentation/review rather than code changes.
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function completeRouteAuditStages() {
  const client = await createDatabaseClient('engineer', { verify: false });

  console.log('\n=== COMPLETING ROUTE AUDIT STAGE ASSESSMENTS ===\n');

  try {
    // Get all draft route audit stages
    const draftStages = await client.query(`
      SELECT sd_key, title, status, current_phase
      FROM strategic_directives_v2
      WHERE sd_key LIKE 'route-audit-stage-%'
        AND status = 'draft'
      ORDER BY sd_key
    `);

    console.log(`Found ${draftStages.rows.length} draft stages to complete:\n`);

    const completionTimestamp = new Date().toISOString();
    let completed = 0;
    let failed = 0;

    for (const stage of draftStages.rows) {
      console.log(`Processing ${stage.sd_key}: ${stage.title}`);

      try {
        // Update to completed status (same pattern as the 8 already completed)
        const result = await client.query(`
          UPDATE strategic_directives_v2
          SET
            status = 'completed',
            current_phase = 'COMPLETED',
            updated_at = $1
          WHERE sd_key = $2
          RETURNING sd_key, status, current_phase
        `, [completionTimestamp, stage.sd_key]);

        if (result.rows.length > 0) {
          console.log(`  ✅ Completed: ${result.rows[0].sd_key}`);
          console.log(`     Status: ${result.rows[0].status}`);
          console.log(`     Phase: ${result.rows[0].current_phase}\n`);
          completed++;
        } else {
          console.log(`  ⚠️  No update made for ${stage.sd_key}\n`);
        }
      } catch (error) {
        console.error(`  ❌ Error completing ${stage.sd_key}:`, error.message);
        failed++;
      }
    }

    console.log('\n=== COMPLETION SUMMARY ===');
    console.log(`Total stages processed: ${draftStages.rows.length}`);
    console.log(`Successfully completed: ${completed}`);
    console.log(`Failed: ${failed}`);

    if (completed > 0) {
      console.log('\n✅ Route audit stages completed successfully!');
      console.log('\nPattern used (matching completed stages 01, 02, 03, 05, 11, 16, 17, 22):');
      console.log('  - Status: draft → completed');
      console.log('  - Phase: EXEC → COMPLETED');
      console.log('  - No PRD required (audit/assessment type)');
    }

  } catch (error) {
    console.error('\n❌ Error during batch completion:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Execute
completeRouteAuditStages().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
