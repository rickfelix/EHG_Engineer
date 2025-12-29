#!/usr/bin/env node

/**
 * SD-ID Foreign Key Integrity Verification
 *
 * This script verifies that all tables with sd_id columns have proper FK constraints
 * to strategic_directives_v2.id and identifies any orphaned records.
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function verifySDIdIntegrity() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    console.log('🔍 SD-ID Foreign Key Integrity Analysis\n');
    console.log('=' .repeat(80));

    // Step 1: Find all tables with sd_id column (excluding uuid_id)
    console.log('\n📊 STEP 1: Finding all tables with sd_id column...\n');

    const tablesQuery = `
      SELECT
        table_name,
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'sd_id'
      ORDER BY table_name;
    `;

    const tablesResult = await client.query(tablesQuery);
    console.log(`Found ${tablesResult.rows.length} tables with sd_id column:\n`);

    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name} (${row.data_type}, nullable: ${row.is_nullable})`);
    });

    // Step 2: Check FK constraints for each table
    console.log('\n' + '='.repeat(80));
    console.log('\n📋 STEP 2: Checking FK constraints...\n');

    const fkQuery = `
      SELECT
        tc.table_name,
        kcu.column_name,
        tc.constraint_name,
        tc.constraint_type,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND kcu.column_name = 'sd_id'
      ORDER BY tc.table_name;
    `;

    const fkResult = await client.query(fkQuery);

    // Create lookup map of tables with FK constraints
    const tablesWithFK = new Set(fkResult.rows.map(r => r.table_name));
    const tablesWithoutFK = tablesResult.rows
      .map(r => r.table_name)
      .filter(t => !tablesWithFK.has(t));

    console.log('✅ Tables WITH proper FK constraints:\n');
    fkResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}.${row.column_name}`);
      console.log(`    └─> ${row.foreign_table_name}.${row.foreign_column_name}`);
      console.log(`    Constraint: ${row.constraint_name}\n`);
    });

    if (tablesWithoutFK.length > 0) {
      console.log('\n❌ Tables WITHOUT FK constraints:\n');
      tablesWithoutFK.forEach(table => {
        console.log(`  - ${table}`);
      });
    }

    // Step 3: Check for orphaned records in each table
    console.log('\n' + '='.repeat(80));
    console.log('\n🔍 STEP 3: Checking for orphaned records...\n');

    let totalOrphaned = 0;
    const orphanedDetails = [];

    for (const row of tablesResult.rows) {
      const tableName = row.table_name;

      // Skip if table is strategic_directives_v2 itself
      if (tableName === 'strategic_directives_v2') {
        continue;
      }

      const orphanQuery = `
        SELECT COUNT(*) as orphan_count
        FROM ${tableName} t
        WHERE t.sd_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM strategic_directives_v2 sd
            WHERE sd.id = t.sd_id
          );
      `;

      try {
        const orphanResult = await client.query(orphanQuery);
        const orphanCount = parseInt(orphanResult.rows[0].orphan_count);

        if (orphanCount > 0) {
          console.log(`❌ ${tableName}: ${orphanCount} orphaned record(s)`);
          totalOrphaned += orphanCount;

          // Get sample orphaned records
          const sampleQuery = `
            SELECT t.sd_id
            FROM ${tableName} t
            WHERE t.sd_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM strategic_directives_v2 sd
                WHERE sd.id = t.sd_id
              )
            LIMIT 5;
          `;

          const sampleResult = await client.query(sampleQuery);
          orphanedDetails.push({
            table: tableName,
            count: orphanCount,
            samples: sampleResult.rows.map(r => r.sd_id)
          });

          console.log(`   Sample sd_id values: ${sampleResult.rows.map(r => r.sd_id).join(', ')}\n`);
        } else {
          console.log(`✅ ${tableName}: No orphaned records`);
        }
      } catch (_err) {
        console.log(`⚠️  ${tableName}: Error checking orphans - ${err.message}`);
      }
    }

    // Step 4: Summary Report
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 SUMMARY REPORT\n');
    console.log('='.repeat(80));

    console.log(`\n1. TABLES WITH sd_id COLUMN: ${tablesResult.rows.length}`);
    console.log(`   - With FK constraints: ${tablesWithFK.size}`);
    console.log(`   - Without FK constraints: ${tablesWithoutFK.length}`);

    console.log(`\n2. ORPHANED RECORDS: ${totalOrphaned}`);
    if (orphanedDetails.length > 0) {
      console.log('\n   Details:');
      orphanedDetails.forEach(detail => {
        console.log(`   - ${detail.table}: ${detail.count} orphaned record(s)`);
        console.log(`     Sample sd_id values: ${detail.samples.join(', ')}`);
      });
    }

    // Step 5: Recommendations
    console.log('\n' + '='.repeat(80));
    console.log('\n🔧 RECOMMENDATIONS\n');
    console.log('='.repeat(80));

    if (tablesWithoutFK.length > 0) {
      console.log('\n1. ADD FOREIGN KEY CONSTRAINTS:');
      console.log('\n```sql');
      tablesWithoutFK.forEach(table => {
        console.log(`-- Add FK constraint for ${table}.sd_id`);
        console.log(`ALTER TABLE ${table}`);
        console.log(`  ADD CONSTRAINT fk_${table}_sd_id`);
        console.log('  FOREIGN KEY (sd_id)');
        console.log('  REFERENCES strategic_directives_v2(id)');
        console.log('  ON DELETE CASCADE;\n');
      });
      console.log('```');
    }

    if (orphanedDetails.length > 0) {
      console.log('\n2. FIX ORPHANED RECORDS:');
      console.log('\n   Option A: Delete orphaned records (recommended if data is invalid)');
      console.log('   ```sql');
      orphanedDetails.forEach(detail => {
        console.log(`   DELETE FROM ${detail.table}`);
        console.log('   WHERE sd_id NOT IN (SELECT id FROM strategic_directives_v2);\n');
      });
      console.log('   ```');

      console.log('\n   Option B: Update to valid sd_id (if data should be preserved)');
      console.log('   - Requires manual review of each orphaned record');
      console.log('   - Determine correct sd_id based on business logic');
    }

    if (tablesWithoutFK.length === 0 && totalOrphaned === 0) {
      console.log('\n✅ NO ISSUES FOUND - All sd_id columns have proper FK constraints');
      console.log('   and no orphaned records exist.');
    }

    console.log('\n' + '='.repeat(80));

  } catch (_error) {
    console.error('❌ Error during integrity check:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the verification
verifySDIdIntegrity().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
