#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const ehgSupabase = createClient(
  process.env.EHG_SUPABASE_URL,
  process.env.EHG_SUPABASE_ANON_KEY
);

async function findAgentTable() {
  console.log('Searching for tables with existing AI agent data...\n');

  const tablesToCheck = [
    'ai_agents',
    'agents',
    'ai_ceo_agents',
    'ceo_agents',
    'crewai_agents',
    'crew_agents',
    'llm_agents',
    'virtual_agents',
    'ai_personalities',
    'chat_agents'
  ];

  const found = [];

  for (const table of tablesToCheck) {
    try {
      const { data, error, count } = await ehgSupabase
        .from(table)
        .select('*', { count: 'exact' })
        .limit(3);

      if (!error && count > 0) {
        found.push({ table, count, sample: data });
      }
    } catch (_err) {
      // Skip tables that don't exist
    }
  }

  if (found.length === 0) {
    console.log('❌ No tables with existing agent data found');
    console.log('\nSearched:', tablesToCheck.join(', '));
  } else {
    found.forEach(result => {
      console.log(`✅ Found: ${result.table} (count: ${result.count})`);
      console.log('   Sample records:');
      result.sample.forEach(record => {
        const name = record.name || record.agent_name || record.title || record.agent_key || record.id;
        const role = record.role || record.agent_role || '';
        console.log(`   - ${name}${role ? ` (${role})` : ''}`);
      });
      console.log('');
    });
  }
}

findAgentTable().catch(err => console.error('Error:', err));
