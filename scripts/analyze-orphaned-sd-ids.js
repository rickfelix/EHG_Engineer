#!/usr/bin/env node

/**
 * Analyze Orphaned SD-ID Records
 *
 * This script investigates the orphaned sd_id values to understand if they are:
 * 1. Legacy IDs that need migration to UUIDs
 * 2. Test data that should be cleaned up
 * 3. Data from deleted SDs that should be preserved
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function analyzeOrphanedRecords() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    console.log('🔍 Analyzing Orphaned SD-ID Records\n');
    console.log('=' .repeat(80));

    // Tables with significant orphaned records
    const tablesToAnalyze = [
      'sub_agent_execution_results',   // 4070 orphaned
      'handoff_audit_log',              // 412 orphaned
      'retro_notifications',            // 285 orphaned
      'model_usage_log',                // 163 orphaned
      'sd_baseline_items',              // 50 orphaned
      'sd_execution_actuals',           // 50 orphaned
      'agent_events',                   // 7 orphaned
      'sd_execution_timeline',          // 3 orphaned
      'leo_mandatory_validations',      // 2 orphaned
      'sd_claims'                       // 1 orphaned
    ];

    for (const tableName of tablesToAnalyze) {
      console.log(`\n📊 ${tableName.toUpperCase()}`);
      console.log('-'.repeat(80));

      // Get unique orphaned sd_id values
      const uniqueQuery = `
        SELECT DISTINCT t.sd_id, COUNT(*) as record_count
        FROM ${tableName} t
        WHERE t.sd_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM strategic_directives_v2 sd
            WHERE sd.id = t.sd_id
          )
        GROUP BY t.sd_id
        ORDER BY record_count DESC
        LIMIT 20;
      `;

      const uniqueResult = await client.query(uniqueQuery);

      console.log(`\nFound ${uniqueResult.rows.length} unique orphaned sd_id values:\n`);

      uniqueResult.rows.forEach(row => {
        const sdId = row.sd_id;
        const count = row.record_count;

        // Classify the sd_id
        let category = 'UNKNOWN';
        if (sdId.startsWith('test-') || sdId === 'QUERY' || sdId === 'MIGRATION' || sdId === 'OVERRIDE-TEST-001') {
          category = 'TEST_DATA';
        } else if (sdId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          category = 'UUID (deleted SD?)';
        } else if (sdId.startsWith('SD-')) {
          category = 'LEGACY_ID';
        } else {
          category = 'UNKNOWN_FORMAT';
        }

        console.log(`  ${sdId} (${count} records) - ${category}`);
      });

      // Get date range for orphaned records
      const dateQuery = `
        SELECT
          MIN(created_at) as earliest,
          MAX(created_at) as latest
        FROM ${tableName}
        WHERE sd_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM strategic_directives_v2 sd
            WHERE sd.id = t.sd_id
          );
      `;

      try {
        const dateResult = await client.query(dateQuery);
        if (dateResult.rows.length > 0 && dateResult.rows[0].earliest) {
          console.log(`\n  Date Range: ${dateResult.rows[0].earliest} to ${dateResult.rows[0].latest}`);
        }
      } catch (err) {
        // Some tables might not have created_at column
        console.log('  (No date range available - missing created_at column)');
      }
    }

    // Check if any orphaned sd_id values exist in strategic_directives_v2.legacy_id
    console.log('\n' + '='.repeat(80));
    console.log('\n🔗 Checking for Legacy ID Matches\n');

    const legacyCheckQuery = `
      SELECT DISTINCT
        t.sd_id,
        sd.id as uuid_id,
        sd.legacy_id
      FROM (
        SELECT DISTINCT sd_id FROM sub_agent_execution_results
        UNION
        SELECT DISTINCT sd_id FROM handoff_audit_log
        UNION
        SELECT DISTINCT sd_id FROM retro_notifications
        UNION
        SELECT DISTINCT sd_id FROM model_usage_log
        UNION
        SELECT DISTINCT sd_id FROM sd_baseline_items
        UNION
        SELECT DISTINCT sd_id FROM sd_execution_actuals
      ) t
      INNER JOIN strategic_directives_v2 sd ON t.sd_id = sd.legacy_id
      WHERE t.sd_id IS NOT NULL
      ORDER BY t.sd_id;
    `;

    const legacyResult = await client.query(legacyCheckQuery);

    if (legacyResult.rows.length > 0) {
      console.log(`Found ${legacyResult.rows.length} orphaned sd_id values that match legacy_id:\n`);
      legacyResult.rows.forEach(row => {
        console.log(`  ${row.sd_id} -> UUID: ${row.uuid_id}`);
      });
      console.log('\n⚠️  These records need sd_id migration from legacy_id to UUID!');
    } else {
      console.log('No orphaned sd_id values match legacy_id in strategic_directives_v2');
    }

    // Summary recommendations
    console.log('\n' + '='.repeat(80));
    console.log('\n📋 RECOMMENDATIONS\n');
    console.log('='.repeat(80));

    console.log('\n1. TEST DATA CLEANUP:');
    console.log('   - Delete records with sd_id like \'test-%\', \'QUERY\', \'MIGRATION\', etc.');
    console.log('   - These are development/testing artifacts\n');

    console.log('2. LEGACY ID MIGRATION:');
    console.log('   - Update records where sd_id matches strategic_directives_v2.legacy_id');
    console.log('   - Change sd_id from legacy_id to corresponding UUID\n');

    console.log('3. DELETED SD RECORDS:');
    console.log('   - Review UUID-format orphaned records');
    console.log('   - Determine if data should be preserved or deleted');
    console.log('   - Consider soft-delete pattern for strategic_directives_v2\n');

    console.log('4. UNKNOWN FORMAT:');
    console.log('   - Investigate any sd_id values with unexpected format');
    console.log('   - May indicate data corruption or incorrect insertion\n');

  } catch (error) {
    console.error('❌ Error during analysis:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the analysis
analyzeOrphanedRecords().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
