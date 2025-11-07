#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('📋 Applying handoff validation fix...\n');

// Read the migration SQL
const sql = readFileSync('/mnt/c/_EHG/EHG_Engineer/supabase/migrations/20251103000000_fix_handoff_validation_text_columns.sql', 'utf8');

// Split into individual statements (simple approach - split on CREATE OR REPLACE FUNCTION)
const statements = sql.split(/(?=CREATE OR REPLACE FUNCTION)/);

for (const [index, statement] of statements.entries()) {
  if (statement.trim().length === 0) continue;

  console.log(`Executing statement ${index + 1}/${statements.length}...`);

  // Use Supabase's SQL execution via RPC
  // Note: This requires a custom SQL execution function to be available
  const { error } = await supabase.rpc('execute_sql', {
    query: statement
  }).throwOnError();

  if (error) {
    console.error(`❌ Error in statement ${index + 1}:`, error.message);
    process.exit(1);
  }
}

console.log('\n✅ Migration applied successfully');
console.log('\n📋 Next: Create PLAN→EXEC handoff');
