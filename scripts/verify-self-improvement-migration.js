/**
 * Verification script for self-improvement system migration
 * Tests all components of 20251210_retrospective_self_improvement_system.sql
 *
 * Run after migration: node scripts/verify-self-improvement-migration.js
 */

const { createDatabaseClient } = require('./lib/supabase-connection.js');

const CHECKS = {
  COLUMN: '✓ retrospective_type column',
  TABLE: '✓ protocol_improvement_queue table',
  TRIGGER: '✓ extraction trigger',
  VIEWS: '✓ helper views',
  FUNCTIONS: '✓ helper functions',
  RLS: '✓ RLS policies',
  DATA: '✓ data integrity'
};

async function verifyMigration() {
  const client = await createDatabaseClient('engineer', { verify: false });
  const results = {
    passed: [],
    failed: [],
    warnings: []
  };

  try {
    console.log('🔍 Verifying Self-Improvement System Migration...\n');

    // ============================================================
    // Check 1: retrospective_type column exists
    // ============================================================
    console.log('Checking retrospective_type column...');
    const columnCheck = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'retrospectives' AND column_name = 'retrospective_type';
    `);

    if (columnCheck.rows.length === 1) {
      results.passed.push(CHECKS.COLUMN);
      console.log(`  ${CHECKS.COLUMN}`);
      console.log(`    Type: ${columnCheck.rows[0].data_type}`);
      console.log(`    Default: ${columnCheck.rows[0].column_default}`);
    } else {
      results.failed.push(CHECKS.COLUMN);
      console.log('  ✗ retrospective_type column not found');
    }

    // Check constraint
    const constraintCheck = await client.query(`
      SELECT constraint_name
      FROM information_schema.constraint_column_usage
      WHERE table_name = 'retrospectives'
        AND column_name = 'retrospective_type';
    `);
    console.log(`    Constraints: ${constraintCheck.rows.length} found`);

    // Check index
    const indexCheck = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'retrospectives'
        AND indexname = 'idx_retrospectives_retrospective_type';
    `);
    console.log(`    Index: ${indexCheck.rows.length > 0 ? 'exists' : 'missing'}`);

    // ============================================================
    // Check 2: protocol_improvement_queue table
    // ============================================================
    console.log('\nChecking protocol_improvement_queue table...');
    const tableCheck = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'protocol_improvement_queue'
      ORDER BY ordinal_position;
    `);

    if (tableCheck.rows.length > 0) {
      results.passed.push(CHECKS.TABLE);
      console.log(`  ${CHECKS.TABLE}`);
      console.log(`    Columns: ${tableCheck.rows.length}`);

      // Check required columns
      const requiredColumns = [
        'id', 'source_retro_id', 'source_type', 'improvement_type',
        'target_table', 'target_operation', 'payload', 'description',
        'evidence_count', 'status', 'created_at'
      ];
      const actualColumns = tableCheck.rows.map(r => r.column_name);
      const missingColumns = requiredColumns.filter(c => !actualColumns.includes(c));

      if (missingColumns.length > 0) {
        results.warnings.push(`Missing columns: ${missingColumns.join(', ')}`);
        console.log(`    ⚠ Missing columns: ${missingColumns.join(', ')}`);
      }
    } else {
      results.failed.push(CHECKS.TABLE);
      console.log('  ✗ protocol_improvement_queue table not found');
    }

    // Check table constraints
    const tableConstraints = await client.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'protocol_improvement_queue';
    `);
    console.log(`    Constraints: ${tableConstraints.rows.length} found`);
    tableConstraints.rows.forEach(c => {
      console.log(`      - ${c.constraint_name} (${c.constraint_type})`);
    });

    // Check indexes
    const tableIndexes = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'protocol_improvement_queue';
    `);
    console.log(`    Indexes: ${tableIndexes.rows.length} found`);

    // ============================================================
    // Check 3: Extraction trigger
    // ============================================================
    console.log('\nChecking extraction trigger...');
    const triggerCheck = await client.query(`
      SELECT trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'retrospectives'
        AND trigger_name = 'extract_improvements_trigger';
    `);

    if (triggerCheck.rows.length > 0) {
      results.passed.push(CHECKS.TRIGGER);
      console.log(`  ${CHECKS.TRIGGER}`);
      console.log(`    Events: ${triggerCheck.rows.map(r => r.event_manipulation).join(', ')}`);
    } else {
      results.failed.push(CHECKS.TRIGGER);
      console.log('  ✗ extract_improvements_trigger not found');
    }

    // Check trigger function
    const functionCheck = await client.query(`
      SELECT routine_name, routine_type
      FROM information_schema.routines
      WHERE routine_name = 'extract_protocol_improvements_from_retro';
    `);
    console.log(`    Function: ${functionCheck.rows.length > 0 ? 'exists' : 'missing'}`);

    // ============================================================
    // Check 4: Helper views
    // ============================================================
    console.log('\nChecking helper views...');
    const viewCheck = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_name IN ('v_pending_improvements', 'v_improvement_effectiveness')
      ORDER BY table_name;
    `);

    if (viewCheck.rows.length === 2) {
      results.passed.push(CHECKS.VIEWS);
      console.log(`  ${CHECKS.VIEWS}`);
      viewCheck.rows.forEach(v => console.log(`    - ${v.table_name}`));
    } else {
      results.failed.push(CHECKS.VIEWS);
      console.log(`  ✗ Expected 2 views, found ${viewCheck.rows.length}`);
    }

    // ============================================================
    // Check 5: Helper functions
    // ============================================================
    console.log('\nChecking helper functions...');
    const functionsCheck = await client.query(`
      SELECT routine_name, routine_type
      FROM information_schema.routines
      WHERE routine_name IN (
        'apply_protocol_improvement',
        'consolidate_similar_improvements',
        'get_pre_handoff_warnings'
      )
      ORDER BY routine_name;
    `);

    if (functionsCheck.rows.length === 3) {
      results.passed.push(CHECKS.FUNCTIONS);
      console.log(`  ${CHECKS.FUNCTIONS}`);
      functionsCheck.rows.forEach(f => console.log(`    - ${f.routine_name}`));
    } else {
      results.failed.push(CHECKS.FUNCTIONS);
      console.log(`  ✗ Expected 3 functions, found ${functionsCheck.rows.length}`);
    }

    // ============================================================
    // Check 6: RLS policies
    // ============================================================
    console.log('\nChecking RLS policies...');
    const rlsCheck = await client.query(`
      SELECT schemaname, tablename, policyname, roles
      FROM pg_policies
      WHERE tablename = 'protocol_improvement_queue';
    `);

    if (rlsCheck.rows.length >= 2) {
      results.passed.push(CHECKS.RLS);
      console.log(`  ${CHECKS.RLS}`);
      rlsCheck.rows.forEach(p => {
        console.log(`    - ${p.policyname} (${p.roles.join(', ')})`);
      });
    } else {
      results.failed.push(CHECKS.RLS);
      console.log(`  ✗ Expected at least 2 policies, found ${rlsCheck.rows.length}`);
    }

    // ============================================================
    // Check 7: Data integrity
    // ============================================================
    console.log('\nChecking data integrity...');

    // Check retrospective_type backfill
    const backfillCheck = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(retrospective_type) as with_type,
        COUNT(*) FILTER (WHERE retrospective_type = 'SD_COMPLETION') as sd_completion
      FROM retrospectives;
    `);

    const backfill = backfillCheck.rows[0];
    console.log(`    Retrospectives: ${backfill.total} total`);
    console.log(`    With type: ${backfill.with_type} (${((backfill.with_type / backfill.total) * 100).toFixed(1)}%)`);
    console.log(`    SD_COMPLETION: ${backfill.sd_completion}`);

    if (parseInt(backfill.total) === parseInt(backfill.with_type)) {
      results.passed.push(CHECKS.DATA);
      console.log(`  ${CHECKS.DATA}`);
    } else {
      results.warnings.push('Some retrospectives missing retrospective_type');
      console.log(`  ⚠ ${backfill.total - backfill.with_type} retrospectives missing type`);
    }

    // Check queue table is accessible
    const queueAccessCheck = await client.query(`
      SELECT COUNT(*) as count FROM protocol_improvement_queue;
    `);
    console.log(`    Queue entries: ${queueAccessCheck.rows[0].count}`);

    // ============================================================
    // Test trigger with sample data (optional)
    // ============================================================
    console.log('\nTesting extraction trigger (optional)...');
    console.log('  Skipping live test to avoid test data insertion');
    console.log('  To test manually, insert a retrospective with protocol_improvements array');

    // ============================================================
    // Summary
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(60));

    console.log(`\n✓ Passed: ${results.passed.length}/${Object.keys(CHECKS).length}`);
    results.passed.forEach(check => console.log(`  ${check}`));

    if (results.failed.length > 0) {
      console.log(`\n✗ Failed: ${results.failed.length}`);
      results.failed.forEach(check => console.log(`  ${check}`));
    }

    if (results.warnings.length > 0) {
      console.log(`\n⚠ Warnings: ${results.warnings.length}`);
      results.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    console.log('\n' + '='.repeat(60));

    if (results.failed.length === 0) {
      console.log('✅ MIGRATION VERIFIED SUCCESSFULLY');
      console.log('\nNext steps:');
      console.log('1. Query pending improvements: SELECT * FROM v_pending_improvements;');
      console.log('2. Test trigger by creating retrospective with protocol_improvements');
      console.log('3. Integrate pre-handoff warnings into handoff scripts');
      return 0;
    } else {
      console.log('❌ MIGRATION VERIFICATION FAILED');
      console.log('\nPlease review failed checks and re-run migration if needed.');
      return 1;
    }

  } catch (_error) {
    console.error('\n❌ Verification error:', error.message);
    console.error(error.stack);
    return 1;
  } finally {
    await client.end();
  }
}

// Run verification
if (require.main === module) {
  verifyMigration()
    .then(exitCode => process.exit(exitCode))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { verifyMigration };
