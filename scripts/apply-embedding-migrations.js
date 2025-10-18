#!/usr/bin/env node
/**
 * Apply Vector Embedding Migrations
 * Directly executes SQL migrations via Supabase client
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function executeSQLFile(filePath, description) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📦 ${description}`);
  console.log('='.repeat(70));

  const sql = readFileSync(filePath, 'utf8');

  // Split by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Found ${statements.length} SQL statements to execute\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');

    console.log(`[${i + 1}/${statements.length}] ${preview}...`);

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' });

      if (error) {
        console.log(`   ❌ Error: ${error.message}`);
        errorCount++;
      } else {
        console.log(`   ✅ Success`);
        successCount++;
      }
    } catch (err) {
      console.log(`   ❌ Exception: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\n📊 Results: ${successCount} success, ${errorCount} errors\n`);
  return { successCount, errorCount };
}

async function main() {
  console.log('\n🚀 Vector Embedding Migrations');
  console.log('Database:', process.env.SUPABASE_URL);

  // Verify connection
  console.log('\n🔍 Verifying database connection...');
  const { data, error } = await supabase
    .from('leo_sub_agents')
    .select('code')
    .limit(1);

  if (error) {
    console.error('❌ Cannot connect to database:', error.message);
    console.error('   Make sure SUPABASE_SERVICE_ROLE_KEY is set in .env');
    process.exit(1);
  }

  console.log('✅ Connection verified\n');

  // Apply migrations
  const results = [];

  results.push(await executeSQLFile(
    'database/migrations/20251017_add_subagent_embeddings.sql',
    'Migration 1: Sub-Agent Embeddings'
  ));

  results.push(await executeSQLFile(
    'database/migrations/20251017_add_sd_embeddings.sql',
    'Migration 2: SD Embeddings'
  ));

  // Summary
  console.log('='.repeat(70));
  console.log('📊 Final Summary');
  console.log('='.repeat(70));
  results.forEach((r, i) => {
    console.log(`Migration ${i + 1}: ${r.successCount} success, ${r.errorCount} errors`);
  });
  console.log('='.repeat(70));
}

main().catch(console.error);
