#!/usr/bin/env node

/**
 * Post-Migration FK Integrity Verification
 *
 * This script verifies the migration was successful by:
 * 1. Confirming all base tables have FK constraints
 * 2. Checking for any remaining orphaned records
 * 3. Validating legacy_id migration completed
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function verifyPostMigration() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    console.log('✅ Post-Migration FK Integrity Verification\n');
    console.log('=' .repeat(80));

    // Step 1: Verify FK constraints exist
    console.log('\n📋 STEP 1: Verifying FK Constraints...\n');

    const expectedTables = [
      'active_github_operations',
      'agent_coordination_state',
      'agent_events',
      'claude_sessions',
      'github_operations',
      'handoff_audit_log',
      'handoff_readiness_dashboard',
      'handoff_verification_gates',
      'leo_mandatory_validations',
      'leo_reasoning_sessions',
      'model_usage_log',
      'plan_verification_results',
      'retro_notifications',
      'sd_baseline_items',
      'sd_capabilities',
      'sd_claims',
      'sd_execution_actuals',
      'sd_execution_timeline',
      'sd_session_activity',
      'strategic_directives_backlog',
      'sub_agent_execution_results',
      'ui_validation_results',
      'ui_validation_summary'
    ];

    const fkQuery = `
      SELECT
        tc.table_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND kcu.column_name = 'sd_id'
        AND tc.table_name = ANY($1::text[])
      ORDER BY tc.table_name;
    `;

    const fkResult = await client.query(fkQuery, [expectedTables]);
    const tablesWithFK = new Set(fkResult.rows.map(r => r.table_name));

    let allConstraintsPresent = true;

    expectedTables.forEach(table => {
      if (tablesWithFK.has(table)) {
        console.log(`✅ ${table} - FK constraint present`);
      } else {
        console.log(`❌ ${table} - MISSING FK constraint`);
        allConstraintsPresent = false;
      }
    });

    if (allConstraintsPresent) {
      console.log(`\n✅ All ${expectedTables.length} base tables have FK constraints`);
    } else {
      console.log('\n⚠️  Some tables missing FK constraints - migration may be incomplete');
    }

    // Step 2: Check for remaining orphaned records
    console.log('\n' + '='.repeat(80));
    console.log('\n🔍 STEP 2: Checking for Remaining Orphaned Records...\n');

    const orphanQuery = `
      SELECT * FROM v_remaining_orphaned_sd_ids
      ORDER BY record_count DESC;
    `;

    const orphanResult = await client.query(orphanQuery);

    if (orphanResult.rows.length === 0) {
      console.log('✅ No orphaned records found - migration successful!');
    } else {
      console.log(`⚠️  Found ${orphanResult.rows.length} unique orphaned sd_id values:\n`);
      orphanResult.rows.forEach(row => {
        console.log(`  ${row.table_name}: ${row.sd_id} (${row.record_count} records)`);
      });
      console.log('\n⚠️  These require manual review - see report for details');
    }

    // Step 3: Verify legacy_id migration
    console.log('\n' + '='.repeat(80));
    console.log('\n🔗 STEP 3: Checking for Unmigrated Legacy IDs...\n');

    const legacyCheckQuery = `
      SELECT
        table_name,
        COUNT(*) as unmigrated_count
      FROM (
        SELECT 'sub_agent_execution_results' as table_name, COUNT(*) as cnt
        FROM sub_agent_execution_results saer
        INNER JOIN strategic_directives_v2 sd ON saer.sd_id = sd.legacy_id
        WHERE saer.sd_id != sd.id

        UNION ALL

        SELECT 'handoff_audit_log', COUNT(*)
        FROM handoff_audit_log hal
        INNER JOIN strategic_directives_v2 sd ON hal.sd_id = sd.legacy_id
        WHERE hal.sd_id != sd.id

        UNION ALL

        SELECT 'retro_notifications', COUNT(*)
        FROM retro_notifications rn
        INNER JOIN strategic_directives_v2 sd ON rn.sd_id = sd.legacy_id
        WHERE rn.sd_id != sd.id

        UNION ALL

        SELECT 'model_usage_log', COUNT(*)
        FROM model_usage_log mul
        INNER JOIN strategic_directives_v2 sd ON mul.sd_id = sd.legacy_id
        WHERE mul.sd_id != sd.id

        UNION ALL

        SELECT 'sd_baseline_items', COUNT(*)
        FROM sd_baseline_items sbi
        INNER JOIN strategic_directives_v2 sd ON sbi.sd_id = sd.legacy_id
        WHERE sbi.sd_id != sd.id

        UNION ALL

        SELECT 'sd_execution_actuals', COUNT(*)
        FROM sd_execution_actuals sea
        INNER JOIN strategic_directives_v2 sd ON sea.sd_id = sd.legacy_id
        WHERE sea.sd_id != sd.id
      ) subquery
      WHERE cnt > 0
      GROUP BY table_name;
    `;

    const legacyResult = await client.query(legacyCheckQuery);

    if (legacyResult.rows.length === 0) {
      console.log('✅ No unmigrated legacy IDs found - all records use UUIDs');
    } else {
      console.log('⚠️  Found unmigrated legacy IDs:\n');
      legacyResult.rows.forEach(row => {
        console.log(`  ${row.table_name}: ${row.unmigrated_count} records`);
      });
      console.log('\n⚠️  Legacy ID migration may be incomplete');
    }

    // Step 4: Summary
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 VERIFICATION SUMMARY\n');
    console.log('='.repeat(80));

    const totalOrphans = orphanResult.rows.reduce((sum, r) => sum + parseInt(r.record_count), 0);
    const totalUnmigrated = legacyResult.rows.reduce((sum, r) => sum + parseInt(r.unmigrated_count), 0);

    console.log(`\n1. FK Constraints: ${allConstraintsPresent ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   - Expected: ${expectedTables.length} tables`);
    console.log(`   - With FK: ${tablesWithFK.size} tables`);

    console.log(`\n2. Orphaned Records: ${totalOrphans === 0 ? '✅ PASS' : '⚠️  NEEDS REVIEW'}`);
    console.log(`   - Total orphaned: ${totalOrphans} records`);
    console.log(`   - Unique sd_id values: ${orphanResult.rows.length}`);

    console.log(`\n3. Legacy ID Migration: ${totalUnmigrated === 0 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   - Unmigrated: ${totalUnmigrated} records`);

    const overallPass = allConstraintsPresent && totalOrphans === 0 && totalUnmigrated === 0;

    console.log(`\n${'='.repeat(80)}`);
    if (overallPass) {
      console.log('\n✅ MIGRATION SUCCESSFUL - All checks passed!');
    } else {
      console.log('\n⚠️  MIGRATION INCOMPLETE - Review issues above');
    }
    console.log(`\n${'='.repeat(80)}\n`);

  } catch (error) {
    console.error('❌ Error during verification:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the verification
verifyPostMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
