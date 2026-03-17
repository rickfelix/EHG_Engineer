#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  // Get handoff table structure
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error.message);
  } else if (data && data.length > 0) {
    console.log('Handoff Columns:', Object.keys(data[0]));
    console.log('\nSample handoff:');
    console.log(JSON.stringify(data[0], null, 2));
  } else {
    console.log('No handoffs found, trying to get table info...');
    // Try a different approach - check tables
    const { data: tables, error: tableError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'sd_phase_handoffs');
    
    if (tableError) {
      console.log('Table info error:', tableError);
    } else {
      console.log('Columns:', tables);
    }
  }
}

checkSchema();
