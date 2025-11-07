#!/usr/bin/env node
/**
 * Check crewai_agents table schema in live database
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  console.log('🔍 Checking crewai_agents table schema...\n');

  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'crewai_agents'
      ORDER BY ordinal_position;
    `
  });

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('📋 Columns in crewai_agents table:\n');
  if (data && data.length > 0) {
    data.forEach(col => {
      console.log(`   ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    console.log(`\n✅ Total columns: ${data.length}`);
  } else {
    console.log('   No columns found or table does not exist');
  }
}

checkSchema();
