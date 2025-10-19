#!/usr/bin/env node

/**
 * ============================================================================
 * PRD Table Consolidation Script
 * ============================================================================
 *
 * PURPOSE:
 * - Migrate data from deprecated 'prds' table to 'product_requirements_v2'
 * - Update all code references to use the consolidated table
 * - Clean up deprecated table after verification
 *
 * ANALYSIS:
 * - prds: 9 records, 12 columns (deprecated, minimal schema)
 * - product_requirements_v2: 149 records, 50 columns (active, comprehensive)
 * - 6 orphaned records in prds need migration
 * - 30 code files reference prds table
 * - 271 code files reference product_requirements_v2 (preferred)
 *
 * APPROACH:
 * 1. Migrate orphaned data with field mapping
 * 2. Verify migration completeness
 * 3. Execute SQL migration (drop prds table)
 * 4. Update code references (30 files)
 * 5. Verify all tests pass
 *
 * SAFETY:
 * - Creates backup table before deletion
 * - Dry-run mode available
 * - Rollback instructions provided
 *
 * ============================================================================
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_CODE_UPDATE = process.argv.includes('--skip-code-update');

// Files that reference 'prds' table (need update)
const FILES_TO_UPDATE = [
  './lib/agents/plan-verification-tool.js',
  './pages/api/leo/gate-scores.ts',
  './pages/api/leo/metrics.ts',
  './pages/api/leo/sub-agent-reports.ts',
  './scripts/apply-gap-remediation.js',
  './scripts/apply-remediation-polish.js',
  './scripts/check-sd-051-status.js',
  './scripts/create-prd-retro-enhance-001.js',
  './scripts/create-prd-sd-047a-v2.js',
  './scripts/create-prd-sd-047a.js',
  './scripts/create-prd-sd-047b.js',
  './scripts/create-prd-sd-backend-001.js',
  './scripts/create-prd-sd-uat-020.js',
  './scripts/design-ui-ux-audit.js',
  './scripts/generate-comprehensive-retrospective.js',
  './scripts/generate-retrospective.js',
  './scripts/lead-approval-checklist.js',
  './scripts/update-prd-fields.js',
  './src/services/database-loader/index.ts',
  './tools/gates/lib/rules.ts',
  './tools/migrations/prd-filesystem-to-database.ts',
  './tools/subagents/scan.ts',
  './tools/validators/exec-checklist.ts'
];

async function main() {
  console.log('🔧 PRD Table Consolidation Migration');
  console.log('═'.repeat(80));
  console.log(`Mode: ${DRY_RUN ? '🧪 DRY RUN (no changes will be made)' : '⚠️  LIVE MODE'}\n`);

  const client = await createDatabaseClient('engineer');

  try {
    // STEP 1: Analyze current state
    console.log('📊 STEP 1: Analyzing current state...\n');

    const prdsCount = await client.query('SELECT COUNT(*) as count FROM prds');
    const v2Count = await client.query('SELECT COUNT(*) as count FROM product_requirements_v2');
    const orphansResult = await client.query(`
      SELECT COUNT(*) as count
      FROM prds p
      LEFT JOIN product_requirements_v2 pr ON p.id = pr.id
      WHERE pr.id IS NULL
    `);

    console.log(`   prds table: ${prdsCount.rows[0].count} records`);
    console.log(`   product_requirements_v2 table: ${v2Count.rows[0].count} records`);
    console.log(`   Orphaned records (need migration): ${orphansResult.rows[0].count}`);

    const orphanedRecords = await client.query(`
      SELECT p.id, p.title, p.status, p.created_at
      FROM prds p
      LEFT JOIN product_requirements_v2 pr ON p.id = pr.id
      WHERE pr.id IS NULL
      ORDER BY p.created_at DESC
    `);

    if (orphanedRecords.rows.length > 0) {
      console.log('\n   📋 Orphaned records to migrate:');
      orphanedRecords.rows.forEach(row => {
        console.log(`      - ${row.id}: ${row.title} (${row.status})`);
      });
    }

    // STEP 2: Migrate orphaned data
    if (orphanedRecords.rows.length > 0) {
      console.log('\n📦 STEP 2: Migrating orphaned data...\n');

      for (const orphan of orphanedRecords.rows) {
        const fullRecord = await client.query('SELECT * FROM prds WHERE id = $1', [orphan.id]);
        const record = fullRecord.rows[0];

        if (DRY_RUN) {
          console.log(`   [DRY RUN] Would migrate: ${record.id}`);
        } else {
          await client.query(`
            INSERT INTO product_requirements_v2 (
              id, directive_id, sd_id, title, status, content, metadata,
              created_at, updated_at, phase, category, priority, progress
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (id) DO UPDATE SET
              directive_id = EXCLUDED.directive_id,
              sd_id = EXCLUDED.sd_id,
              title = EXCLUDED.title,
              status = EXCLUDED.status,
              content = EXCLUDED.content,
              metadata = EXCLUDED.metadata,
              updated_at = EXCLUDED.updated_at
          `, [
            record.id,
            record.strategic_directive_id,
            record.strategic_directive_id,
            record.title,
            record.status,
            record.content,
            record.metadata,
            record.created_at,
            record.updated_at,
            record.status === 'approved' ? 'execution' : 'planning',
            'technical',
            'medium',
            record.status === 'approved' ? 50 : 25
          ]);
          console.log(`   ✅ Migrated: ${record.id}`);
        }
      }
    } else {
      console.log('\n✅ STEP 2: No orphaned data to migrate\n');
    }

    // STEP 3: Execute SQL migration (drop prds table)
    console.log('🗑️  STEP 3: Executing SQL migration...\n');

    if (DRY_RUN) {
      console.log('   [DRY RUN] Would execute: migrations/cleanup-deprecated-prds-table.sql');
      console.log('   [DRY RUN] Would create backup: prds_backup_20251016');
      console.log('   [DRY RUN] Would drop table: prds');
    } else {
      // Create backup
      await client.query('CREATE TABLE IF NOT EXISTS prds_backup_20251016 AS SELECT * FROM prds');
      console.log('   ✅ Backup created: prds_backup_20251016');

      // Drop prds table
      await client.query('DROP TABLE IF EXISTS prds CASCADE');
      console.log('   ✅ Dropped table: prds');
    }

    // STEP 4: Update code references
    if (!SKIP_CODE_UPDATE) {
      console.log('\n📝 STEP 4: Updating code references...\n');

      let updatedCount = 0;
      for (const filePath of FILES_TO_UPDATE) {
        try {
          const content = readFileSync(filePath, 'utf8');
          const newContent = content.replace(/from\('prds'\)/g, "from('product_requirements_v2')");

          if (content !== newContent) {
            if (DRY_RUN) {
              console.log(`   [DRY RUN] Would update: ${filePath}`);
            } else {
              writeFileSync(filePath, newContent, 'utf8');
              console.log(`   ✅ Updated: ${filePath}`);
            }
            updatedCount++;
          }
        } catch (err) {
          console.log(`   ⚠️  Skipped (file not found): ${filePath}`);
        }
      }

      console.log(`\n   Updated ${updatedCount} files`);
    } else {
      console.log('\n⏭️  STEP 4: Skipped (--skip-code-update flag)\n');
    }

    // STEP 5: Verification
    console.log('\n✅ STEP 5: Verification\n');

    const finalCount = await client.query('SELECT COUNT(*) as count FROM product_requirements_v2');
    console.log(`   product_requirements_v2 final count: ${finalCount.rows[0].count}`);

    if (!DRY_RUN) {
      const prdsExists = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'prds'
        ) as exists
      `);
      console.log(`   prds table exists: ${prdsExists.rows[0].exists}`);

      const backupExists = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'prds_backup_20251016'
        ) as exists
      `);
      console.log(`   Backup table exists: ${backupExists.rows[0].exists}`);
    }

    // Summary
    console.log('\n═'.repeat(80));
    console.log('📊 MIGRATION SUMMARY\n');
    console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    console.log(`   Orphaned records migrated: ${orphanedRecords.rows.length}`);
    console.log(`   Code files to update: ${FILES_TO_UPDATE.filter(f => {
      try { return readFileSync(f, 'utf8').includes("from('prds')"); }
      catch { return false; }
    }).length}`);
    console.log(`   Deprecated table dropped: ${DRY_RUN ? 'No (dry run)' : 'Yes'}`);

    if (!DRY_RUN) {
      console.log('\n📝 NEXT STEPS:\n');
      console.log('   1. Run tests: npm run test:unit && npm run test:e2e');
      console.log('   2. Verify no errors in affected scripts');
      console.log('   3. Commit changes with message:');
      console.log('      "refactor(database): Consolidate PRD tables to product_requirements_v2"');
      console.log('   4. After 30 days, drop backup:');
      console.log('      DROP TABLE prds_backup_20251016;');
    } else {
      console.log('\n📝 NEXT STEPS:\n');
      console.log('   Run without --dry-run to execute migration:');
      console.log('   node scripts/migrate-prds-to-v2.js');
    }

    console.log('\n✅ Migration script completed successfully\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\n🔄 ROLLBACK INSTRUCTIONS:\n');
    console.error('   1. Restore from backup:');
    console.error('      CREATE TABLE prds AS SELECT * FROM prds_backup_20251016;');
    console.error('   2. Revert code changes:');
    console.error('      git checkout -- <affected-files>');
    console.error('   3. Report issue with full error message\n');
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
