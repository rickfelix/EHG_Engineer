#!/usr/bin/env node

/**
 * Apply user_stories RLS Migration
 * Pattern: PAT-RLS-001 (PostgreSQL direct connection)
 * Context: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001 PLAN phase
 */

import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const { Client } = pg;

dotenv.config();

async function applyMigration() {
  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔧 Applying user_stories RLS Migration\n');
    console.log('Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    const sql = fs.readFileSync('database/migrations/2025-11-07_add_anon_rls_user_stories_final.sql', 'utf-8');

    console.log('Applying migration...');
    await client.query(sql);
    console.log('✅ Migration applied successfully!\n');

    // Verify policies
    console.log('Verifying policies...');
    const { rows } = await client.query(`
      SELECT policyname, cmd, roles
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'user_stories'
        AND policyname IN ('anon_insert_user_stories', 'anon_read_user_stories')
      ORDER BY policyname;
    `);

    if (rows.length >= 2) {
      console.log('✅ Policies verified:');
      rows.forEach(row => {
        console.log(`   - ${row.policyname} (${row.cmd}) for ${row.roles}`);
      });
    } else {
      console.log(`⚠️  Only ${rows.length}/2 policies found`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }

  // Test with ANON_KEY
  console.log('\nTesting ANON_KEY access...');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase
    .from('user_stories')
    .select('id')
    .limit(1);

  if (error) {
    console.error('❌ ANON SELECT test failed:', error.message);
    process.exit(1);
  }

  console.log('✅ ANON SELECT test passed\n');
  console.log('🎉 Migration complete! Retry user story generation.');
}

applyMigration();
