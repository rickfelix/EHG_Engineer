#!/usr/bin/env node
// Check if EHG Backlog tables exist

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function checkTables() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  console.log('Checking EHG Backlog tables...\n');
  
  // Check strategic_directives_backlog
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_backlog')
    .select('sd_id')
    .limit(1);
  
  if (sdError && sdError.code === '42P01') {
    console.log('❌ Table strategic_directives_backlog does not exist');
    console.log('\n⚠️  Please apply the schema first:');
    console.log('1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
    console.log('2. Copy SQL from: database/schema/010_ehg_backlog_schema.sql');
    console.log('3. Paste and execute in SQL Editor');
    return false;
  } else if (!sdError) {
    console.log('✅ Table strategic_directives_backlog exists');
  } else {
    console.log('⚠️  Unexpected error:', sdError.message);
    return false;
  }
  
  // Check sd_backlog_map
  const { data: mapData, error: mapError } = await supabase
    .from('sd_backlog_map')
    .select('backlog_id')
    .limit(1);
  
  if (mapError && mapError.code === '42P01') {
    console.log('❌ Table sd_backlog_map does not exist');
    return false;
  } else if (!mapError) {
    console.log('✅ Table sd_backlog_map exists');
  }
  
  // Check import_audit
  const { data: auditData, error: auditError } = await supabase
    .from('import_audit')
    .select('id')
    .limit(1);
  
  if (auditError && auditError.code === '42P01') {
    console.log('❌ Table import_audit does not exist');
    return false;
  } else if (!auditError) {
    console.log('✅ Table import_audit exists');
  }
  
  // Check product_requirements_v3
  const { data: prdData, error: prdError } = await supabase
    .from('product_requirements_v3')
    .select('prd_id')
    .limit(1);
  
  if (prdError && prdError.code === '42P01') {
    console.log('❌ Table product_requirements_v3 does not exist');
    return false;
  } else if (!prdError) {
    console.log('✅ Table product_requirements_v3 exists');
  }
  
  console.log('\n✅ All tables are ready for import!');
  return true;
}

checkTables().catch(console.error);