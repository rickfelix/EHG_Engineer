#!/usr/bin/env node

/**
 * Apply RAID Log Migration to EHG_Engineer Database
 * Creates raid_log table for SD-VIF-REFINE-001 RAID tracking
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use EHG_Engineer database
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function applyMigration() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Apply RAID Log Migration (EHG_Engineer)                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Database: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log('');

  // Read migration file
  const migrationPath = join(__dirname, '../database/migrations/20251018_create_raid_log.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf-8');

  console.log('Reading migration file...');
  console.log(`  Path: ${migrationPath}`);
  console.log(`  Size: ${migrationSQL.length} characters`);
  console.log('');

  // Note: Supabase client doesn't support running raw SQL with DDL
  // User must apply this via Supabase SQL Editor
  console.log('⚠️  MIGRATION APPLICATION REQUIRED');
  console.log('─'.repeat(65));
  console.log('');
  console.log('The raid_log table migration must be applied manually.');
  console.log('');
  console.log('Steps:');
  console.log('  1. Open Supabase Dashboard: https://supabase.com/dashboard');
  console.log('  2. Select project: dedlbzhpgkmetvhbkyzq (EHG_Engineer)');
  console.log('  3. Navigate to: SQL Editor');
  console.log('  4. Copy the migration file contents:');
  console.log(`     database/migrations/20251018_create_raid_log.sql`);
  console.log('  5. Paste and run the SQL');
  console.log('');
  console.log('─'.repeat(65));
  console.log('');
  console.log('Alternative: Run via psql if you have database credentials');
  console.log('');

  // Check if table already exists
  console.log('Checking if raid_log table exists...');
  const { data, error } = await supabase
    .from('raid_log')
    .select('id')
    .limit(1);

  if (error) {
    if (error.message.includes('does not exist') || error.message.includes('not found')) {
      console.log('❌ Table does not exist - migration needs to be applied');
      console.log('');
      console.log('📋 Migration Preview (first 20 lines):');
      console.log('─'.repeat(65));
      const preview = migrationSQL.split('\n').slice(0, 20).join('\n');
      console.log(preview);
      console.log('...');
      console.log('─'.repeat(65));
    } else {
      console.error('❌ Error checking table:', error.message);
    }
  } else {
    console.log('✅ Table already exists!');
    console.log(`   Found ${data ? data.length : 0} rows`);
  }

  console.log('');
  console.log('Once migration is applied, run:');
  console.log('  node scripts/seed-raid-items-vif-refine.mjs');
  console.log('');
}

applyMigration().catch(console.error);
