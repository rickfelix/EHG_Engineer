#!/usr/bin/env node
/**
 * Create LEO Protocol Tables via Supabase
 * Since tables don't exist, we'll create simplified version first
 */

import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAndCreateTables() {
  console.log('🔍 Testing LEO Protocol database tables...\n');
  
  // Test if tables exist by trying to query them
  const tables = [
    'leo_protocols',
    'leo_agents', 
    'leo_sub_agents',
    'leo_handoff_templates',
    'leo_validation_rules'
  ];
  
  for (const table of tables) {
    try {
      const { data: _data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        console.log(`❌ Table '${table}' does not exist: ${error.message}`);
        console.log('   You need to create this table in Supabase Dashboard');
      } else {
        console.log(`✅ Table '${table}' exists`);
      }
    } catch (err) {
      console.log(`❌ Error checking table '${table}':`, err.message);
    }
  }
  
  console.log('\n📋 Next Steps:');
  console.log('1. Go to Supabase Dashboard: https://app.supabase.com');
  console.log('2. Navigate to SQL Editor');
  console.log('3. Copy and paste the SQL from: database/schema/007_leo_protocol_schema.sql');
  console.log('4. Execute the SQL to create tables');
  console.log('5. Run this script again to verify');
  
  console.log('\n🔄 Alternative: Using mock data for now...');
  
  // For now, let's work with what we have and simulate the system
  return await simulateDatabaseFirst();
}

async function simulateDatabaseFirst() {
  console.log('\n🎭 Simulating database-first LEO Protocol...');
  
  // Create mock protocol data
  const mockProtocol = {
    id: 'leo-v4-1-2-database-first',
    version: '4.1.2_database_first',
    status: 'active',
    title: 'LEO Protocol v4.1.2 - Database-First Enforcement',
    content: 'Full protocol content here...',
    sections: [
      { type: 'agents', title: 'Agent Responsibilities', content: 'LEAD, PLAN, EXEC...' },
      { type: 'handoffs', title: 'Handoff Requirements', content: '7 mandatory elements...' },
      { type: 'subagents', title: 'Sub-Agent System', content: 'Automatic activation...' }
    ]
  };
  
  // Mock sub-agents
  const mockSubAgents = [
    { name: 'Database Sub-Agent', code: 'DB', activation_type: 'automatic', priority: 100 },
    { name: 'Security Sub-Agent', code: 'SEC', activation_type: 'automatic', priority: 95 },
    { name: 'Design Sub-Agent', code: 'DES', activation_type: 'conditional', priority: 90 },
    { name: 'Testing Sub-Agent', code: 'TEST', activation_type: 'automatic', priority: 85 },
    { name: 'Performance Sub-Agent', code: 'PERF', activation_type: 'conditional', priority: 80 }
  ];
  
  console.log('✅ Mock data prepared');
  console.log(`   - Active Protocol: v${mockProtocol.version}`);
  console.log(`   - Sub-Agents: ${mockSubAgents.length}`);
  
  return { mockProtocol, mockSubAgents };
}

async function main() {
  const result = await testAndCreateTables();
  
  if (result) {
    console.log('\n✅ Ready to test database-first system with mock data');
    console.log('Next: Run scripts/generate-claude-md-from-db.js');
  }
}

main().catch(console.error);