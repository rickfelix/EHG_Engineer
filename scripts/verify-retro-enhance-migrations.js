#!/usr/bin/env node

/**
 * Verify SD-RETRO-ENHANCE-001 Migration Deployment
 *
 * Comprehensive verification that all 3 migrations were applied correctly:
 * - Column existence and data types
 * - Index creation
 * - Trigger function existence
 * - Constraint enforcement
 * - pgvector extension status
 * - RPC function creation
 *
 * Usage:
 *   node scripts/verify-retro-enhance-migrations.js [--verbose]
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';

const VERBOSE = process.argv.includes('--verbose');

/**
 * Verification checks
 */
const CHECKS = [
  {
    name: 'Table Structure',
    description: 'Verify retrospectives table exists',
    check: async (client) => {
      const { rows } = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'retrospectives'
      `);
      return {
        passed: rows.length === 1,
        message: rows.length === 1 ? 'Table exists' : 'Table not found'
      };
    }
  },
  {
    name: 'Migration 1: Multi-App Context Columns',
    description: 'Verify 8 new columns were added',
    check: async (client) => {
      const expectedColumns = [
        { name: 'target_application', type: 'text' },
        { name: 'learning_category', type: 'text' },
        { name: 'applies_to_all_apps', type: 'boolean' },
        { name: 'related_files', type: 'ARRAY' },
        { name: 'related_commits', type: 'ARRAY' },
        { name: 'related_prs', type: 'ARRAY' },
        { name: 'affected_components', type: 'ARRAY' },
        { name: 'tags', type: 'ARRAY' }
      ];

      const { rows } = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'retrospectives'
          AND column_name IN (${expectedColumns.map((_, i) => `$${i + 1}`).join(', ')})
      `, expectedColumns.map(c => c.name));

      const found = rows.map(r => r.column_name);
      const missing = expectedColumns.filter(c => !found.includes(c.name));

      return {
        passed: missing.length === 0,
        message: missing.length === 0
          ? 'All 8 columns present'
          : `Missing columns: ${missing.map(c => c.name).join(', ')}`,
        details: VERBOSE ? rows : undefined
      };
    }
  },
  {
    name: 'Migration 1: Indexes',
    description: 'Verify 11 indexes were created',
    check: async (client) => {
      const expectedIndexes = [
        'idx_retrospectives_target_application',
        'idx_retrospectives_learning_category',
        'idx_retrospectives_applies_to_all',
        'idx_retrospectives_related_files_gin',
        'idx_retrospectives_related_commits_gin',
        'idx_retrospectives_related_prs_gin',
        'idx_retrospectives_affected_components_gin',
        'idx_retrospectives_tags_gin'
      ];

      const { rows } = await client.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'retrospectives'
          AND indexname = ANY($1)
      `, [expectedIndexes]);

      const found = rows.map(r => r.indexname);
      const missing = expectedIndexes.filter(idx => !found.includes(idx));

      return {
        passed: missing.length === 0,
        message: missing.length === 0
          ? `All ${expectedIndexes.length} indexes present`
          : `Missing indexes: ${missing.join(', ')}`,
        details: VERBOSE ? found : undefined
      };
    }
  },
  {
    name: 'Migration 1: Auto-Population Trigger',
    description: 'Verify trigger function exists',
    check: async (client) => {
      const { rows: functions } = await client.query(`
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'public'
          AND routine_name = 'auto_populate_retrospective_fields'
      `);

      const { rows: triggers } = await client.query(`
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_table = 'retrospectives'
          AND trigger_name = 'trigger_auto_populate_retrospective_fields'
      `);

      return {
        passed: functions.length === 1 && triggers.length === 1,
        message: functions.length === 1 && triggers.length === 1
          ? 'Trigger and function present'
          : `Missing: ${functions.length === 0 ? 'function ' : ''}${triggers.length === 0 ? 'trigger' : ''}`
      };
    }
  },
  {
    name: 'Migration 1: Constraints',
    description: 'Verify CHECK constraints',
    check: async (client) => {
      const { rows } = await client.query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'retrospectives'
          AND constraint_type = 'CHECK'
          AND constraint_name IN ('check_target_application', 'check_learning_category')
      `);

      return {
        passed: rows.length === 2,
        message: rows.length === 2
          ? 'All CHECK constraints present'
          : `Found ${rows.length}/2 constraints`,
        details: VERBOSE ? rows.map(r => r.constraint_name) : undefined
      };
    }
  },
  {
    name: 'Migration 2: pgvector Extension',
    description: 'Verify pgvector extension is enabled',
    check: async (client) => {
      const { rows } = await client.query(`
        SELECT extname, extversion
        FROM pg_extension
        WHERE extname = 'vector'
      `);

      return {
        passed: rows.length === 1,
        message: rows.length === 1
          ? `pgvector ${rows[0].extversion} enabled`
          : 'pgvector extension not found'
      };
    }
  },
  {
    name: 'Migration 2: Embedding Column',
    description: 'Verify content_embedding column exists',
    check: async (client) => {
      const { rows } = await client.query(`
        SELECT column_name, udt_name
        FROM information_schema.columns
        WHERE table_name = 'retrospectives'
          AND column_name = 'content_embedding'
      `);

      return {
        passed: rows.length === 1,
        message: rows.length === 1
          ? `content_embedding column present (type: ${rows[0].udt_name})`
          : 'content_embedding column not found'
      };
    }
  },
  {
    name: 'Migration 2: Semantic Search Functions',
    description: 'Verify RPC functions were created',
    check: async (client) => {
      const expectedFunctions = [
        'search_retrospectives_semantic',
        'find_similar_retrospectives'
      ];

      const { rows } = await client.query(`
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'public'
          AND routine_name = ANY($1)
      `, [expectedFunctions]);

      const found = rows.map(r => r.routine_name);
      const missing = expectedFunctions.filter(fn => !found.includes(fn));

      return {
        passed: missing.length === 0,
        message: missing.length === 0
          ? `All ${expectedFunctions.length} RPC functions present`
          : `Missing functions: ${missing.join(', ')}`,
        details: VERBOSE ? found : undefined
      };
    }
  },
  {
    name: 'Migration 3: Quality Enforcement',
    description: 'Verify quality constraints exist',
    check: async (client) => {
      const { rows } = await client.query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'retrospectives'
          AND constraint_name LIKE '%quality%'
      `);

      return {
        passed: rows.length > 0,
        message: rows.length > 0
          ? `Found ${rows.length} quality constraint(s)`
          : 'No quality constraints found',
        details: VERBOSE ? rows.map(r => r.constraint_name) : undefined
      };
    }
  },
  {
    name: 'Data Integrity',
    description: 'Verify existing retrospectives have required fields populated',
    check: async (client) => {
      const { rows: [{ count }] } = await client.query('SELECT COUNT(*) as count FROM retrospectives');

      if (count === 0) {
        return {
          passed: true,
          message: 'No retrospectives to check (empty table)'
        };
      }

      // Check how many have the new fields populated
      const { rows: [stats] } = await client.query(`
        SELECT
          COUNT(*) as total,
          COUNT(target_application) as with_target_app,
          COUNT(learning_category) as with_category,
          COUNT(CASE WHEN applies_to_all_apps IS NOT NULL THEN 1 END) as with_applies_flag
        FROM retrospectives
      `);

      const allPopulated = stats.with_target_app === stats.total &&
                          stats.with_category === stats.total;

      return {
        passed: allPopulated,
        message: allPopulated
          ? `All ${stats.total} retrospectives have required fields`
          : `${stats.total - stats.with_target_app} missing target_application, ${stats.total - stats.with_category} missing learning_category`,
        details: VERBOSE ? stats : undefined
      };
    }
  }
];

/**
 * Run all verification checks
 */
async function runVerification() {
  console.log('🔍 SD-RETRO-ENHANCE-001 Migration Verification\n');
  console.log('Database: EHG_Engineer (dedlbzhpgkmetvhbkyzq)');
  console.log(`Mode: ${VERBOSE ? 'Verbose' : 'Standard'}\n`);

  let client;

  try {
    // Connect to database
    console.log('⏳ Connecting to database...');
    client = await createDatabaseClient('engineer', { verify: true });
    console.log('✅ Connected\n');

    console.log('=' .repeat(80));
    console.log('Running verification checks...');
    console.log('='.repeat(80) + '\n');

    let passed = 0;
    let failed = 0;
    const results = [];

    for (const check of CHECKS) {
      process.stdout.write(`⏳ ${check.name}... `);

      try {
        const result = await check.check(client);

        if (result.passed) {
          console.log(`✅ ${result.message}`);
          passed++;
        } else {
          console.log(`❌ ${result.message}`);
          failed++;
        }

        if (result.details && VERBOSE) {
          console.log('   Details:', JSON.stringify(result.details, null, 2));
        }

        results.push({
          check: check.name,
          ...result
        });
      } catch (_error) {
        console.log(`❌ Error: ${error.message}`);
        failed++;
        results.push({
          check: check.name,
          passed: false,
          message: error.message
        });
      }

      console.log('');
    }

    // Summary
    console.log('='.repeat(80));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(80));
    console.log(`✅ Passed: ${passed}/${CHECKS.length}`);
    console.log(`❌ Failed: ${failed}/${CHECKS.length}`);
    console.log('');

    if (failed === 0) {
      console.log('🎉 All migration verifications passed!');
      console.log('\n📋 Migration deployment is complete and verified.');
      console.log('\nNext steps:');
      console.log('1. Run backfill script to populate fields for existing retrospectives');
      console.log('2. Test semantic search functionality');
      console.log('3. Verify constraint enforcement with test data');
      return true;
    } else {
      console.error('⚠️  Some verifications failed. Review the output above.');
      console.error('\nFailed checks:');
      results.filter(r => !r.passed).forEach(r => {
        console.error(`  - ${r.check}: ${r.message}`);
      });
      return false;
    }

  } catch (_error) {
    console.error('\n❌ Verification failed:', error.message);
    return false;
  } finally {
    if (client) {
      await client.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Execute
runVerification()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
