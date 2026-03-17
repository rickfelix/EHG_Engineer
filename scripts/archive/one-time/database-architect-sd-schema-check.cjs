#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY
);

async function checkSchema() {
  console.log('🗄️  DATABASE ARCHITECT: Schema Investigation');
  console.log('='.repeat(80));

  // Get one SD to see actual structure
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-VIDEO-VARIANT-001')
    .single();

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('\n📊 Actual SD Structure (all fields):');
  Object.keys(sd).forEach(key => {
    const value = sd[key];
    const type = Array.isArray(value) ? 'array' : typeof value;
    const preview = Array.isArray(value) 
      ? `${value.length} items`
      : type === 'string' 
        ? value?.substring(0, 50) + '...'
        : type === 'object' && value
          ? JSON.stringify(value).substring(0, 50) + '...'
          : String(value);
    console.log(`  ${key}: (${type}) ${preview}`);
  });

  console.log('\n' + '='.repeat(80));
}

checkSchema();
