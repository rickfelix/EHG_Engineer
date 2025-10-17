#!/usr/bin/env node
/**
 * Move AI Agents from leo_sub_agents to ai_agents
 *
 * RESEARCH, STORIES, and FINANCIAL_ANALYTICS are customer-facing AI agents
 * in the EHG application, not LEO Protocol validation sub-agents.
 *
 * This script:
 * 1. Gets them from EHG_Engineer leo_sub_agents table (via Supabase client)
 * 2. Inserts into EHG ai_agents table (via direct DB connection to bypass RLS)
 * 3. Removes them from EHG_Engineer leo_sub_agents table (via Supabase client)
 */

import { createClient } from '@supabase/supabase-js';
import { createDatabaseClient } from '/mnt/c/_EHG/ehg/scripts/lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

// Connect to EHG_Engineer via Supabase (for reading)
const engineerSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function moveAIAgents() {
  console.log('='.repeat(70));
  console.log('MOVING AI AGENTS TO CORRECT DATABASE');
  console.log('='.repeat(70));
  console.log('');

  // Step 1: Get agents from leo_sub_agents
  console.log('Step 1: Getting AI agents from EHG_Engineer leo_sub_agents...');
  const { data: leoAgents, error: fetchError } = await engineerSupabase
    .from('leo_sub_agents')
    .select('*')
    .in('code', ['RESEARCH', 'STORIES', 'FINANCIAL_ANALYTICS']);

  if (fetchError) {
    console.error('❌ Error fetching agents:', fetchError.message);
    process.exit(1);
  }

  console.log(`✅ Found ${leoAgents.length} agents to move\n`);

  // Step 2: Transform and insert into ai_agents
  console.log('Step 2: Inserting into EHG ai_agents table...');

  const aiAgents = leoAgents.map(agent => {
    // Map to agent_type enum values
    const agentTypeMap = {
      'RESEARCH': 'RESEARCH_VP',              // Research agent
      'STORIES': 'PRODUCT',                   // Product management
      'FINANCIAL_ANALYTICS': 'FINANCE'        // Financial analysis
    };

    // Extract capabilities from metadata
    const capabilities = agent.capabilities || agent.metadata?.capabilities || [];

    return {
      id: agent.id, // Keep same UUID
      name: agent.name,
      agent_type: agentTypeMap[agent.code],
      is_active: agent.active,
      capabilities: Array.isArray(capabilities) ? capabilities : [],
      company_id: 'd73aac88-9dd1-402d-9f9f-ca21c2f8f89b', // EHG company ID
      description: agent.description,
      performance_metrics: {
        performance: 0,
        tasks_completed: 0,
        uptime_percent: 100,
        success_rate: 0,
        average_confidence: 0
      },
      decision_framework: {},
      priority_weights: {}
    };
  });

  // Use direct database connection to bypass RLS
  let dbClient;
  try {
    dbClient = await createDatabaseClient('ehg', {
      verify: true,
      verbose: true
    });

    // Insert each agent
    for (const agent of aiAgents) {
      const insertSQL = `
        INSERT INTO ai_agents (
          id, company_id, name, agent_type, is_active,
          capabilities, description, performance_metrics,
          decision_framework, priority_weights
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id, name, agent_type;
      `;

      const result = await dbClient.query(insertSQL, [
        agent.id,
        agent.company_id,
        agent.name,
        agent.agent_type,
        agent.is_active,
        agent.capabilities,
        agent.description,
        JSON.stringify(agent.performance_metrics),
        JSON.stringify(agent.decision_framework),
        JSON.stringify(agent.priority_weights)
      ]);

      if (result.rows.length > 0) {
        console.log(`   ✅ ${result.rows[0].name} (${result.rows[0].agent_type})`);
      } else {
        console.log(`   ⏩ ${agent.name} (already exists)`);
      }
    }

    console.log('');

  } catch (error) {
    console.error('❌ Error inserting agents:', error.message);
    console.error('   Details:', error);
    process.exit(1);
  } finally {
    if (dbClient) {
      await dbClient.end();
    }
  }

  // Step 3: Remove from leo_sub_agents (and related triggers)
  console.log('Step 3: Removing from EHG_Engineer leo_sub_agents...');

  // First, delete related triggers
  const { data: agentsToDelete } = await engineerSupabase
    .from('leo_sub_agents')
    .select('id')
    .in('code', ['RESEARCH', 'STORIES', 'FINANCIAL_ANALYTICS']);

  if (agentsToDelete && agentsToDelete.length > 0) {
    const agentIds = agentsToDelete.map(a => a.id);

    // Delete triggers first (foreign key constraint)
    const { error: triggerDeleteError } = await engineerSupabase
      .from('leo_sub_agent_triggers')
      .delete()
      .in('sub_agent_id', agentIds);

    if (triggerDeleteError) {
      console.error('⚠️  Warning deleting triggers:', triggerDeleteError.message);
      // Continue anyway - triggers might not exist
    } else {
      console.log(`   ✅ Removed related triggers`);
    }
  }

  // Now delete the agents
  const { error: deleteError } = await engineerSupabase
    .from('leo_sub_agents')
    .delete()
    .in('code', ['RESEARCH', 'STORIES', 'FINANCIAL_ANALYTICS']);

  if (deleteError) {
    console.error('❌ Error deleting agents:', deleteError.message);
    process.exit(1);
  }

  console.log(`✅ Removed 3 agents from leo_sub_agents\n`);

  // Step 4: Verify
  console.log('Step 4: Verifying...');

  const { data: remainingLeo } = await engineerSupabase
    .from('leo_sub_agents')
    .select('code, name')
    .order('priority', { ascending: false });

  // Verify in EHG via direct connection
  dbClient = await createDatabaseClient('ehg', { verify: false });
  const { rows: aiAgentsCount } = await dbClient.query(
    'SELECT id, name, agent_type FROM ai_agents WHERE agent_type IN ($1, $2, $3)',
    ['RESEARCH_VP', 'PRODUCT', 'FINANCE']
  );
  await dbClient.end();

  console.log(`\n✅ EHG_Engineer leo_sub_agents now has ${remainingLeo.length} agents (LEO Protocol only)`);
  remainingLeo.forEach(agent => {
    console.log(`   - ${agent.code}: ${agent.name}`);
  });

  console.log(`\n✅ EHG ai_agents now has ${aiAgentsCount.length} matching agents (Customer-facing AI)`);
  aiAgentsCount.forEach(agent => {
    console.log(`   - ${agent.agent_type}: ${agent.name}`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('MIGRATION COMPLETE ✅');
  console.log('='.repeat(70));
  console.log('');
  console.log('Summary:');
  console.log(`  - Moved 3 AI agents from EHG_Engineer to EHG`);
  console.log(`  - EHG_Engineer leo_sub_agents: ${remainingLeo.length} (LEO Protocol validation only)`);
  console.log(`  - EHG ai_agents: ${aiAgentsCount.length} (Customer-facing AI services)`);
  console.log('');
}

moveAIAgents().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
