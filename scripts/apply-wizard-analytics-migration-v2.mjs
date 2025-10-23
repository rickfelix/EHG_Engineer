#!/usr/bin/env node

/**
 * Apply wizard_analytics migration for SD-VWC-PHASE4-001 using direct PostgreSQL connection
 * This script uses pg package to execute raw SQL
 */

import fs from 'fs/promises';
import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;

// Load EHG environment variables
dotenv.config({ path: '/mnt/c/_EHG/ehg/.env' });

async function applyMigration() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  SD-VWC-PHASE4-001 Wizard Analytics Migration v2          ║');
  console.log('║  Using direct PostgreSQL connection                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Parse Supabase URL to get database connection details
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    console.error('❌ VITE_SUPABASE_URL not found in .env');
    process.exit(1);
  }

  // Extract project ref from URL (e.g., liapbndqlqxdcgpwntbv)
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    console.error('❌ Could not extract project ref from Supabase URL');
    process.exit(1);
  }

  console.log(`📍 Project: ${projectRef}`);
  console.log(`🌐 Supabase URL: ${supabaseUrl}\n`);

  // Connection string for Supabase direct connection
  // Note: This requires the database password which might not be in .env
  // Alternative: Use connection pooler with service role key converted to password

  console.log('⚠️  Direct PostgreSQL connection requires database password');
  console.log('💡 Alternative: Use Supabase Dashboard to apply migration manually\n');
  console.log('📄 Migration file location:');
  console.log('   /mnt/c/_EHG/ehg/supabase/migrations/20251023_wizard_analytics.sql\n');

  // Read and display migration content
  const migrationPath = '/mnt/c/_EHG/ehg/supabase/migrations/20251023_wizard_analytics.sql';
  const migrationSQL = await fs.readFile(migrationPath, 'utf8');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('📋 MIGRATION CONTENT');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(migrationSQL);
  console.log('\n═══════════════════════════════════════════════════════════');

  console.log('\n📝 MANUAL APPLICATION STEPS:');
  console.log('   1. Go to: https://supabase.com/dashboard/project/' + projectRef);
  console.log('   2. Navigate to: SQL Editor');
  console.log('   3. Create new query');
  console.log('   4. Copy/paste the migration SQL shown above');
  console.log('   5. Click "Run" to execute\n');

  console.log('🔍 VERIFICATION STEPS:');
  console.log('   1. After running, check "Table Editor"');
  console.log('   2. Confirm "wizard_analytics" table exists');
  console.log('   3. Click table → Policies → Verify 3 RLS policies');
  console.log('   4. Check Indexes tab → Verify 6 indexes created\n');

  return { status: 'MANUAL_ACTION_REQUIRED' };
}

applyMigration().catch(console.error);
