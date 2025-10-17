#!/usr/bin/env node
import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.dedlbzhpgkmetvhbkyzq',
  password: process.env.SUPABASE_DB_PASSWORD || 'Fl!M32DaM00n!1',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('════════════════════════════════════════════════════════════════');
    console.log('🔍 Investigating Handoff Validation Trigger');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Find all triggers on sd_phase_handoffs table
    console.log('1. Finding triggers on sd_phase_handoffs...');
    const triggers = await client.query(`
      SELECT
        t.tgname as trigger_name,
        pg_get_triggerdef(t.oid) as trigger_definition
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE c.relname = 'sd_phase_handoffs'
        AND NOT t.tgisinternal
      ORDER BY t.tgname
    `);

    console.log(`   Found ${triggers.rows.length} trigger(s):\n`);
    triggers.rows.forEach(row => {
      console.log(`   Trigger: ${row.trigger_name}`);
      console.log(`   Definition: ${row.trigger_definition}\n`);
    });

    // Find the validation function
    console.log('2. Finding validation function(s)...');
    const validationFunctions = await client.query(`
      SELECT
        p.proname as function_name,
        pg_get_functiondef(p.oid) as function_definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND (
          p.proname LIKE '%handoff%'
          OR p.proname LIKE '%validation%'
          OR p.proname LIKE '%accept%'
        )
      ORDER BY p.proname
    `);

    console.log(`   Found ${validationFunctions.rows.length} function(s):\n`);
    validationFunctions.rows.forEach(row => {
      console.log('════════════════════════════════════════════════════════════════');
      console.log(`Function: ${row.function_name}`);
      console.log('════════════════════════════════════════════════════════════════');
      console.log(row.function_definition);
      console.log('\n');
    });

    // Check the table schema for required columns
    console.log('3. Checking sd_phase_handoffs table schema...');
    const schema = await client.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'sd_phase_handoffs'
      ORDER BY ordinal_position
    `);

    console.log('   Columns:\n');
    schema.rows.forEach(row => {
      console.log(`   ${row.column_name}`);
      console.log(`      Type: ${row.data_type}`);
      console.log(`      Nullable: ${row.is_nullable}`);
      console.log(`      Default: ${row.column_default || 'None'}\n`);
    });

    // Test what happens when we try to insert
    console.log('4. Testing validation logic...');
    console.log('   Attempting to insert test handoff to see exact error...\n');

    try {
      await client.query('BEGIN');

      const testInsert = await client.query(`
        INSERT INTO sd_phase_handoffs (
          sd_id, from_phase, to_phase, handoff_type, status,
          executive_summary, deliverables_manifest, key_decisions,
          known_issues, resource_utilization, action_items
        ) VALUES (
          'TEST-SD',
          'LEAD',
          'PLAN',
          'LEAD-to-PLAN',
          'pending_acceptance',
          'Test summary',
          'Test manifest',
          'Test decisions',
          'Test issues',
          'Test resources',
          'Test actions'
        )
        RETURNING id
      `);

      console.log('   ✅ Test insert succeeded:', testInsert.rows[0].id);
      console.log('   This means all required fields are present\n');

      await client.query('ROLLBACK');
    } catch (testError) {
      await client.query('ROLLBACK');
      console.log('   ❌ Test insert failed:');
      console.log(`   Error: ${testError.message}\n`);
      console.log('   This reveals the validation requirements:\n');

      // Parse the error message to see which elements are missing
      if (testError.message.includes('Missing required elements')) {
        console.log('   The error message indicates missing elements.');
        console.log('   Parsing error details...\n');
      }
    }

    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Investigation error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
