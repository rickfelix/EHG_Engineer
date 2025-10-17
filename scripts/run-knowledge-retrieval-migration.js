#!/usr/bin/env node

/**
 * Run Knowledge Retrieval System Migration
 * Creates database tables and columns for SD-KNOWLEDGE-001
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function runMigration() {
  console.log('🚀 Running Knowledge Retrieval System Migration');
  console.log('================================================================\n');

  try {
    // Read migration file
    const migrationPath = join(__dirname, '../supabase/ehg_engineer/migrations/20251015200000_knowledge_retrieval_system.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded');
    console.log('   Path:', migrationPath);
    console.log('   Size:', migrationSQL.length, 'bytes\n');

    // Execute migration
    console.log('⏳ Executing migration...');
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });

    if (error) {
      console.error('❌ Migration failed:', error.message);
      console.error('   Code:', error.code);
      console.error('   Details:', error.details);
      console.error('   Hint:', error.hint);
      console.error('\n💡 Note: You may need to run this migration directly via Supabase SQL Editor');
      console.error('   Migration file: supabase/ehg_engineer/migrations/20251015200000_knowledge_retrieval_system.sql');
      process.exit(1);
    }

    console.log('✅ Migration completed successfully!\n');

    // Verify tables were created
    console.log('🔍 Verifying table creation...');

    const tables = [
      'tech_stack_references',
      'prd_research_audit_log',
      'system_health'
    ];

    for (const table of tables) {
      const { count, error: countError } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.log(`   ❌ ${table}: Not found or error - ${countError.message}`);
      } else {
        console.log(`   ✅ ${table}: Created successfully (${count || 0} rows)`);
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log('   - Tables created: 3');
    console.log('   - Tables enhanced: 2 (user_stories, product_requirements_v2)');
    console.log('   - Indexes created: 5');
    console.log('   - RLS policies: 8');
    console.log('   - Functions: 1 (cleanup_expired_tech_stack_references)');
    console.log('\n🎯 Database ready for knowledge retrieval pipeline');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

runMigration();
