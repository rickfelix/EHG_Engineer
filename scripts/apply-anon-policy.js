#!/usr/bin/env node

/**
 * Apply ANON SELECT policy to system_health table
 * Purpose: Allow read-only monitoring access for health check scripts
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

async function applyMigration() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('❌ Missing required environment variables');
    console.error('   SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
    console.error('   SUPABASE_ANON_KEY:', anonKey ? '✓' : '✗');
    process.exit(1);
  }

  let client;

  try {
    console.log('📋 Applying migration: 010_add_anon_select_system_health.sql');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Connect using established pattern
    console.log('Connecting to database...');
    client = await createDatabaseClient('engineer', { verify: false });
    console.log('✅ Connected successfully');
    console.log('');

    // Read migration file
    const sql = readFileSync('supabase/migrations/010_add_anon_select_system_health.sql', 'utf8');

    // Split into statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    // Step 1: Drop existing policy if it exists
    console.log('1️⃣  Dropping existing policy (if exists)...');
    try {
      await client.query(`DROP POLICY IF EXISTS "Allow anon users to read system_health" ON system_health`);
      console.log('   ✅ Policy dropped (or did not exist)');
    } catch (err) {
      console.error('   ⚠️  Drop policy warning:', err.message);
    }

    // Step 2: Create new ANON SELECT policy
    console.log('');
    console.log('2️⃣  Creating ANON SELECT policy...');
    try {
      await client.query(`
        CREATE POLICY "Allow anon users to read system_health"
          ON system_health FOR SELECT
          TO anon
          USING (true)
      `);
      console.log('   ✅ Policy created successfully');
    } catch (err) {
      console.error('   ❌ Failed to create policy:', err);
      throw err;
    }

    // Step 3: Grant SELECT to anon role
    console.log('');
    console.log('3️⃣  Granting SELECT to anon role...');
    try {
      await client.query(`GRANT SELECT ON system_health TO anon`);
      console.log('   ✅ SELECT granted to anon');
    } catch (err) {
      console.error('   ❌ Failed to grant SELECT:', err);
      throw err;
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Migration applied successfully!');
    console.log('');

    // Step 4: Verify with ANON key
    console.log('🔍 Verification: Testing ANON access...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const anonClient = createClient(supabaseUrl, anonKey);

    const { data: healthData, error: healthError } = await anonClient
      .from('system_health')
      .select('*')
      .eq('service_name', 'context7')
      .single();

    if (healthError) {
      console.error('❌ ANON verification FAILED:', healthError);
      console.error('');
      console.error('Policy was created but ANON role still cannot SELECT.');
      console.error('This may require manual database investigation.');
      process.exit(1);
    }

    console.log('✅ ANON SELECT verification PASSED');
    console.log('');
    console.log('Context7 Health Record:');
    console.log('  Service:', healthData.service_name);
    console.log('  State:', healthData.state);
    console.log('  Failure Count:', healthData.failure_count);
    console.log('  Last Failure:', healthData.last_failure_time || 'None');
    console.log('  Updated:', healthData.updated_at);
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Success! ANON users can now read system_health table.');
    console.log('');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  } finally {
    // Clean up connection
    if (client) {
      await client.end();
    }
  }
}

// Run migration
applyMigration();
