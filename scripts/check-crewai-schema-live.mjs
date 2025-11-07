#!/usr/bin/env node
/**
 * Check actual crewai_agents schema by querying the table
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  console.log('🔍 Checking crewai_agents table schema (live query)...\n');

  // Query existing agents to see schema
  const { data: agents, error } = await supabase
    .from('crewai_agents')
    .select('*')
    .limit(1);

  if (error) {
    console.error('❌ Error:', error.message);

    // If table is empty, try minimal insert to see required fields
    console.log('\n🧪 Testing minimal insert to discover required fields...');
    const { error: insertError } = await supabase
      .from('crewai_agents')
      .insert({
        agent_key: '_test_schema',
        name: 'Test'
      });

    if (insertError) {
      console.log(`Insert test result: ${insertError.message}`);
    }
    return;
  }

  if (agents && agents.length > 0) {
    console.log('✅ Found existing agent! Available columns:\n');
    const columns = Object.keys(agents[0]);
    columns.forEach(col => {
      const val = agents[0][col];
      const type = val === null ? 'null' : typeof val;
      console.log(`   ${col.padEnd(35)} ${type.padEnd(10)} = ${JSON.stringify(val)?.substring(0, 60)}`);
    });
    console.log(`\n✅ Total columns: ${columns.length}`);
  } else {
    console.log('⚠️  Table is empty - trying test insert to discover schema...\n');

    const { data: testData, error: testError } = await supabase
      .from('crewai_agents')
      .insert({
        agent_key: '_schema_test',
        name: 'Schema Test Agent',
        role: 'Test Role',
        goal: 'Test Goal',
        backstory: 'Test Backstory'
      })
      .select();

    if (testError) {
      console.log(`❌ Test insert failed: ${testError.message}`);
    } else if (testData && testData.length > 0) {
      console.log('✅ Test insert succeeded! Columns:\n');
      Object.keys(testData[0]).forEach(col => {
        console.log(`   ${col.padEnd(35)} ${typeof testData[0][col]}`);
      });

      // Clean up
      await supabase.from('crewai_agents').delete().eq('agent_key', '_schema_test');
      console.log('\n🧹 Test row cleaned up');
    }
  }
}

checkSchema();
