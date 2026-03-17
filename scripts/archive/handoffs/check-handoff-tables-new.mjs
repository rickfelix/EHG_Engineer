#!/usr/bin/env node

/**
 * Check which handoff tables exist in database
 * Returns table name to use for handoff storage
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkHandoffTables() {
  console.log('🔍 Checking available handoff tables...\n');

  const tablesToCheck = [
    { name: 'handoff_tracking', schema: 'standard' },
    { name: 'leo_sub_agent_handoffs', schema: 'legacy' },
    { name: 'v_handoff_chain', schema: 'view' }
  ];

  const availableTables = [];

  for (const table of tablesToCheck) {
    const { data, error } = await supabase
      .from(table.name)
      .select('*')
      .limit(1);

    if (!error || (error && !error.message.includes('not find'))) {
      availableTables.push(table);
      console.log(`✅ ${table.name} - ${table.schema} schema`);
    } else {
      console.log(`❌ ${table.name} - NOT FOUND`);
    }
  }

  console.log('\n📊 Summary:');
  if (availableTables.length === 0) {
    console.log('⚠️  No handoff tables found');
    console.log('   → Use fallback: Git commit handoffs');
    console.log('   → Or run: node scripts/create-handoff-tracking-tables.js');
  } else {
    console.log(`✅ ${availableTables.length} handoff table(s) available`);
    console.log(`   → Recommended: ${availableTables[0].name}`);
  }

  return availableTables[0]?.name || null;
}

checkHandoffTables()
  .then(table => {
    if (table) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
