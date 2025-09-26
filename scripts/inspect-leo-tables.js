#!/usr/bin/env node

/**
 * Inspect LEO Protocol Database Tables Structure
 * Check what columns exist for agents and sub-agents
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function inspectTables() {
  console.log('🔍 Inspecting LEO Protocol Database Tables');
  console.log('═══════════════════════════════════════════');

  try {
    // Check leo_agents table structure
    console.log('\n📋 LEO_AGENTS Table Structure:');
    const { data: agents, error: agentsError } = await supabase
      .from('leo_agents')
      .select('*')
      .limit(1);

    if (agentsError) {
      console.error('❌ Error querying leo_agents:', agentsError);
    } else if (agents && agents.length > 0) {
      console.log('Columns:', Object.keys(agents[0]).join(', '));
      console.log('Sample record:', JSON.stringify(agents[0], null, 2));
    } else {
      console.log('No records found in leo_agents');
    }

    // Check leo_sub_agents table structure
    console.log('\n📋 LEO_SUB_AGENTS Table Structure:');
    const { data: subAgents, error: subAgentsError } = await supabase
      .from('leo_sub_agents')
      .select('*')
      .limit(1);

    if (subAgentsError) {
      console.error('❌ Error querying leo_sub_agents:', subAgentsError);
    } else if (subAgents && subAgents.length > 0) {
      console.log('Columns:', Object.keys(subAgents[0]).join(', '));
      console.log('Sample record:', JSON.stringify(subAgents[0], null, 2));
    } else {
      console.log('No records found in leo_sub_agents');
    }

    // Check leo_protocols table structure
    console.log('\n📋 LEO_PROTOCOLS Table Structure:');
    const { data: protocols, error: protocolsError } = await supabase
      .from('leo_protocols')
      .select('*')
      .eq('status', 'active')
      .limit(1);

    if (protocolsError) {
      console.error('❌ Error querying leo_protocols:', protocolsError);
    } else if (protocols && protocols.length > 0) {
      console.log('Columns:', Object.keys(protocols[0]).join(', '));
      console.log('Active protocol ID:', protocols[0].id);
      console.log('Version:', protocols[0].version);
    } else {
      console.log('No active protocol found');
    }

  } catch (error) {
    console.error('❌ Error inspecting tables:', error);
  }
}

inspectTables();