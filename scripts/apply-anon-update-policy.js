#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function applyPolicy() {
  console.log('Applying anon UPDATE policy for sd_phase_handoffs...\n');

  const sql = readFileSync('database/migrations/allow_anon_update_handoffs.sql', 'utf8');

  // Split by semicolon and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  for (const statement of statements) {
    if (statement.includes('DROP POLICY') || statement.includes('CREATE POLICY')) {
      console.log('Executing:', statement.substring(0, 60) + '...');

      const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: statement + ';'
      });

      if (error) {
        console.log('  ❌ Error:', error.message);
      } else {
        console.log('  ✅ Success');
      }
    } else if (statement.includes('SELECT')) {
      console.log('\nVerifying policies...');
      const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: statement + ';'
      });

      if (error) {
        console.log('  ❌ Error:', error.message);
      } else {
        console.log('  ✅ Verification complete');
        if (data) console.log(JSON.stringify(data, null, 2));
      }
    }
  }
}

applyPolicy();
