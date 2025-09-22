#!/usr/bin/env node
// Apply PRD view to database using Supabase RPC

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  console.log('📋 Applying PRD view to database...\n');
  
  // Read the SQL file
  const sqlPath = path.join(process.cwd(), 'database/schema/012_create_prd_view_v2.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  
  console.log('SQL to execute:');
  console.log('='.repeat(60));
  console.log(sql);
  console.log('='.repeat(60));
  console.log();
  
  // Since we can't execute raw SQL via RPC, provide instructions
  console.log('⚠️  Supabase client cannot execute raw SQL directly.');
  console.log('\n📝 Please execute this SQL manually:');
  console.log('\n1. Go to Supabase Dashboard:');
  console.log(`   ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log('\n2. Navigate to SQL Editor → New Query');
  console.log('\n3. Paste the SQL from above');
  console.log('\n4. Click "Run"');
  console.log('\n5. Come back here and run the next step');
  
  // Test if view exists
  console.log('\n🔍 Testing if view already exists...');
  const { data, error } = await supabase
    .from('v_prd_sd_payload')
    .select('sd_id')
    .limit(1);
  
  if (error && error.message.includes('relation')) {
    console.log('❌ View does not exist yet - please create it using the steps above');
  } else if (error) {
    console.log('⚠️  Error checking view:', error.message);
  } else {
    console.log('✅ View v_prd_sd_payload already exists!');
    
    // Count records
    const { count } = await supabase
      .from('v_prd_sd_payload')
      .select('*', { count: 'exact', head: true });
    
    console.log(`   Found ${count} SDs in the view`);
  }
}

main().catch(console.error);