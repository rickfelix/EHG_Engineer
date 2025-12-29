#!/usr/bin/env node
// Apply EHG Backlog Schema to Supabase

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  console.log('📋 Applying EHG Backlog schema...');
  
  try {
    // Read SQL file
    const _sql = await fs.readFile('database/schema/010_ehg_backlog_schema.sql', 'utf-8');
    
    // Note: Supabase JS client doesn't support raw SQL execution
    // For production, use Supabase dashboard or psql
    console.log('⚠️  Please apply the schema using one of these methods:');
    console.log('1. Supabase Dashboard SQL Editor: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
    console.log('2. Copy and paste the SQL from: database/schema/010_ehg_backlog_schema.sql');
    console.log('\n✅ Schema file created at: database/schema/010_ehg_backlog_schema.sql');
    
    // Check if tables exist
    const { data: _tables, error } = await supabase
      .from('strategic_directives_backlog')
      .select('sd_id')
      .limit(1);
    
    if (!error) {
      console.log('✅ Table strategic_directives_backlog already exists');
    } else if (error.code === '42P01') {
      console.log('⚠️  Table strategic_directives_backlog does not exist yet');
      console.log('   Please apply the schema using the methods above');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();