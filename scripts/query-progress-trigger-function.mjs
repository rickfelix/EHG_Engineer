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
    console.log('🔍 Analyzing calculate_sd_progress() Trigger Function');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Query the function definition
    console.log('1. Querying function definition...');
    const functionQuery = await client.query(`
      SELECT
        pg_get_functiondef(p.oid) as function_definition,
        p.proname as function_name,
        pg_catalog.pg_get_function_result(p.oid) as return_type
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'calculate_sd_progress'
        AND n.nspname = 'public'
    `);

    if (functionQuery.rows.length === 0) {
      console.log('   ❌ Function not found\n');
      return;
    }

    console.log('   ✅ Function found\n');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('FUNCTION DEFINITION');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(functionQuery.rows[0].function_definition);
    console.log('\n');

    // Query the trigger that uses this function
    console.log('2. Querying associated trigger...');
    const triggerQuery = await client.query(`
      SELECT
        t.tgname as trigger_name,
        c.relname as table_name,
        t.tgenabled as enabled,
        pg_get_triggerdef(t.oid) as trigger_definition
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE t.tgname LIKE '%progress%'
        OR pg_get_triggerdef(t.oid) LIKE '%calculate_sd_progress%'
    `);

    if (triggerQuery.rows.length > 0) {
      console.log('   ✅ Found trigger(s)\n');
      triggerQuery.rows.forEach((row, i) => {
        console.log(`Trigger ${i + 1}: ${row.trigger_name}`);
        console.log(`   Table: ${row.table_name}`);
        console.log(`   Enabled: ${row.enabled === 'O' ? 'YES' : 'NO'}`);
        console.log(`   Definition: ${row.trigger_definition}\n`);
      });
    } else {
      console.log('   ⚠️  No triggers found using this function\n');
    }

    // Query the get_progress_breakdown function (called by calculate_sd_progress)
    console.log('3. Querying get_progress_breakdown function...');
    const breakdownQuery = await client.query(`
      SELECT pg_get_functiondef(p.oid) as function_definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'get_progress_breakdown'
        AND n.nspname = 'public'
    `);

    if (breakdownQuery.rows.length > 0) {
      console.log('   ✅ Function found\n');
      console.log('════════════════════════════════════════════════════════════════');
      console.log('GET_PROGRESS_BREAKDOWN FUNCTION');
      console.log('════════════════════════════════════════════════════════════════');
      console.log(breakdownQuery.rows[0].function_definition);
      console.log('\n');
    }

    // Test the function with our SD
    console.log('4. Testing function with SD-BOARD-GOVERNANCE-001...');
    const testQuery = await client.query(`
      SELECT calculate_sd_progress('SD-BOARD-GOVERNANCE-001') as result
    `);
    console.log('   Result:', testQuery.rows[0].result);
    console.log('');

    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ ANALYSIS COMPLETE');
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
