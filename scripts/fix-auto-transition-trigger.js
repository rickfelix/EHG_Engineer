#!/usr/bin/env node

/**
 * Fix auto_transition_status() trigger bug on strategic_directives_v2
 *
 * Issue: Trigger references NEW.phase but column is named current_phase
 * Context: SD-AGENT-ADMIN-003 LEO Protocol execution
 *
 * This script:
 * 1. Connects to EHG_Engineer database (dedlbzhpgkmetvhbkyzq)
 * 2. Updates auto_transition_status() function to use current_phase
 * 3. Verifies the fix by checking trigger definition
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixTrigger() {
  console.log('🔧 Fixing auto_transition_status() trigger function...\n');

  // The fixed trigger function
  const fixedTriggerSQL = `
    CREATE OR REPLACE FUNCTION auto_transition_status()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Fix: Use current_phase instead of phase
      IF NEW.current_phase = 'EXEC' AND NEW.progress >= 100 THEN
        NEW.status = 'pending_approval';
      END IF;

      IF NEW.current_phase = 'PLAN' AND NEW.progress >= 100 THEN
        NEW.status = 'pending_lead_approval';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;

  try {
    // Execute the fix via RPC (since we can't run DDL directly via Supabase client)
    console.log('📝 Creating fixed trigger function...');

    // We'll use the pooler connection for this
    const { Client } = await import('pg');
    const client = new Client({
      connectionString: process.env.SUPABASE_POOLER_URL,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();
    console.log('✅ Connected to database\n');

    // Execute the fix
    await client.query(fixedTriggerSQL);
    console.log('✅ Trigger function updated successfully\n');

    // Verify the fix by checking trigger definition
    const verifyQuery = `
      SELECT
        pg_get_functiondef(oid) as function_definition
      FROM pg_proc
      WHERE proname = 'auto_transition_status';
    `;

    const result = await client.query(verifyQuery);

    if (result.rows.length > 0) {
      console.log('📋 Updated trigger function:');
      console.log(result.rows[0].function_definition);
      console.log('\n');

      // Check if it contains the fix
      const definition = result.rows[0].function_definition;
      if (definition.includes('current_phase')) {
        console.log('✅ Verification PASSED: Function now uses current_phase');
      } else {
        console.log('⚠️  Warning: Function definition may not be updated');
      }
    }

    // Test the fix by trying to update a test SD
    console.log('\n🧪 Testing trigger with sample update...');
    const testQuery = `
      UPDATE strategic_directives_v2
      SET progress = progress + 0, updated_at = NOW()
      WHERE id = 'SD-AGENT-ADMIN-003'
      RETURNING id, status, current_phase, progress;
    `;

    const testResult = await client.query(testQuery);
    if (testResult.rows.length > 0) {
      const sd = testResult.rows[0];
      console.log('✅ Test update successful!');
      console.log(`   SD: ${sd.id}`);
      console.log(`   Status: ${sd.status}`);
      console.log(`   Phase: ${sd.current_phase}`);
      console.log(`   Progress: ${sd.progress}%`);
    }

    await client.end();
    console.log('\n✅ Trigger fix complete!\n');

    console.log('📌 Next steps:');
    console.log('   1. Update SD progress to 90% (PLAN verification complete)');
    console.log('   2. Accept PLAN→LEAD handoff');
    console.log('   3. Complete LEAD approval\n');

  } catch (error) {
    console.error('❌ Error fixing trigger:', error.message);
    if (error.detail) console.error('   Detail:', error.detail);
    if (error.hint) console.error('   Hint:', error.hint);
    process.exit(1);
  }
}

fixTrigger();
