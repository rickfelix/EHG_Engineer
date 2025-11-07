#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('📋 Applying handoff validation fix migration...\n');

const sql = readFileSync('/mnt/c/_EHG/EHG_Engineer/supabase/migrations/20251103000000_fix_handoff_validation_text_columns.sql', 'utf8');

const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

if (error) {
  console.error('❌ Migration failed:', error.message);
  console.error('Details:', error);
  process.exit(1);
}

console.log('✅ Migration applied successfully');
console.log('\n📋 Next: Create PLAN→EXEC handoff');
