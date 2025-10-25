#!/usr/bin/env node

/**
 * Diagnostic script to investigate quality_score constraint issue
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function diagnose() {
  console.log('\n🔍 QUALITY SCORE CONSTRAINT DIAGNOSTIC\n');
  console.log('═'.repeat(60));

  const client = await createDatabaseClient('engineer', { verbose: true });

  try {
    // 1. Check all constraints on retrospectives table
    console.log('\n1️⃣ ACTIVE CONSTRAINTS:\n');
    const constraintsQuery = `
      SELECT
        conname AS constraint_name,
        pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint
      WHERE conrelid = 'retrospectives'::regclass
        AND conname LIKE '%quality%'
      ORDER BY conname;
    `;
    const constraintsResult = await client.query(constraintsQuery);
    console.table(constraintsResult.rows);

    // 2. Check all triggers on retrospectives table
    console.log('\n2️⃣ ACTIVE TRIGGERS:\n');
    const triggersQuery = `
      SELECT
        tgname AS trigger_name,
        pg_get_triggerdef(oid) AS trigger_definition
      FROM pg_trigger
      WHERE tgrelid = 'retrospectives'::regclass
        AND NOT tgisinternal
      ORDER BY tgname;
    `;
    const triggersResult = await client.query(triggersQuery);
    console.table(triggersResult.rows);

    // 3. Check for quality_score calculation function
    console.log('\n3️⃣ QUALITY SCORE FUNCTIONS:\n');
    const functionsQuery = `
      SELECT
        proname AS function_name,
        pg_get_functiondef(oid) AS function_definition
      FROM pg_proc
      WHERE proname LIKE '%quality%'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      ORDER BY proname;
    `;
    const functionsResult = await client.query(functionsQuery);

    if (functionsResult.rows.length > 0) {
      for (const row of functionsResult.rows) {
        console.log(`\n📦 Function: ${row.function_name}`);
        console.log('─'.repeat(60));
        console.log(row.function_definition);
      }
    } else {
      console.log('No quality-related functions found');
    }

    // 4. Test insertion with quality_score = 85
    console.log('\n4️⃣ TEST INSERTION (quality_score = 85):\n');

    const testInsert = `
      INSERT INTO retrospectives (
        sd_id,
        target_application,
        project_name,
        retro_type,
        title,
        description,
        conducted_date,
        what_went_well,
        key_learnings,
        action_items,
        what_needs_improvement,
        learning_category,
        quality_score,
        status
      ) VALUES (
        'TEST-DIAG-001',
        'EHG_engineer',
        'Test Project',
        'TEST',
        'Diagnostic Test Retrospective',
        'Testing quality_score constraint',
        NOW(),
        ARRAY['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5', 'Item 6'],
        ARRAY['Learning 1', 'Learning 2', 'Learning 3', 'Learning 4', 'Learning 5'],
        ARRAY['Action 1', 'Action 2', 'Action 3', 'Action 4'],
        ARRAY['Improvement 1', 'Improvement 2', 'Improvement 3'],
        'APPLICATION_ISSUE',
        85,
        'DRAFT'
      )
      RETURNING id, quality_score;
    `;

    try {
      const testResult = await client.query(testInsert);
      console.log('✅ INSERT SUCCEEDED');
      console.log('   Returned quality_score:', testResult.rows[0].quality_score);
      console.log('   Returned ID:', testResult.rows[0].id);

      // Clean up test record
      await client.query('DELETE FROM retrospectives WHERE sd_id = \'TEST-DIAG-001\'');
      console.log('   Test record cleaned up');
    } catch (error) {
      console.log('❌ INSERT FAILED');
      console.log('   Error:', error.message);
      console.log('\n   Full error details:');
      console.log('   ─'.repeat(60));
      console.log(JSON.stringify(error, null, 2));
    }

    // 5. Check migration history
    console.log('\n5️⃣ MIGRATION HISTORY (quality_score related):\n');
    const migrationsQuery = `
      SELECT
        version,
        name,
        applied_at
      FROM schema_migrations
      WHERE name LIKE '%quality%'
      ORDER BY applied_at DESC;
    `;

    try {
      const migrationsResult = await client.query(migrationsQuery);
      if (migrationsResult.rows.length > 0) {
        console.table(migrationsResult.rows);
      } else {
        console.log('No quality-related migrations in schema_migrations table');
        console.log('(This is normal if using a different migration tracking system)');
      }
    } catch (error) {
      console.log('Migration tracking table not found or not accessible');
    }

  } finally {
    await client.end();
    console.log('\n' + '═'.repeat(60));
    console.log('✅ Diagnostic complete\n');
  }
}

diagnose().catch(err => {
  console.error('\n❌ Diagnostic failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
