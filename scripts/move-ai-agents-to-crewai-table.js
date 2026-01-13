#!/usr/bin/env node
/**
 * CORRECTED: Move AI Agents from ai_agents to crewai_agents
 *
 * RESEARCH, STORIES, and FINANCIAL_ANALYTICS are customer-facing AI agents
 * that should be in the crewai_agents table (which the UI actually queries).
 *
 * This script:
 * 1. Gets them from ai_agents table (where they were incorrectly placed)
 * 2. Transforms and inserts into crewai_agents table (correct table)
 * 3. Removes them from ai_agents table
 * 4. Removes them from EHG_Engineer leo_sub_agents table (cleanup)
 */

import { createClient } from '@supabase/supabase-js';
import { createDatabaseClient } from '../ehg/scripts/lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

// Connect to EHG_Engineer via Supabase (for reading leo_sub_agents)
const engineerSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function moveAIAgents() {
  console.log('='.repeat(70));
  console.log('MOVING AI AGENTS TO CORRECT TABLE (crewai_agents)');
  console.log('='.repeat(70));
  console.log('');

  let ehgClient;

  try {
    // Connect to EHG database
    ehgClient = await createDatabaseClient('ehg', {
      verify: true,
      verbose: true
    });

    // Step 1: Get agents from ai_agents table (where they were incorrectly placed)
    console.log('Step 1: Getting AI agents from EHG ai_agents table...');
    const { rows: aiAgents } = await ehgClient.query(
      'SELECT * FROM ai_agents WHERE agent_type IN ($1, $2, $3)',
      ['PRODUCT', 'RESEARCH_VP', 'FINANCE']
    );

    console.log(`✅ Found ${aiAgents.length} agents to move from ai_agents\n`);

    if (aiAgents.length === 0) {
      console.log('⏩ No agents found in ai_agents table to move');
      return;
    }

    // Step 2: Transform and insert into crewai_agents
    console.log('Step 2: Transforming and inserting into crewai_agents table...');

    for (const agent of aiAgents) {
      // Generate agent_key from name
      const agentKey = agent.name.toLowerCase().replace(/\s+/g, '-');

      // Map agent_type to role
      const roleMap = {
        'PRODUCT': 'Product Requirements Specialist',
        'RESEARCH_VP': 'VP of Portfolio Research',
        'FINANCE': 'Senior Financial Analyst'
      };

      // Generate appropriate goals
      const goalMap = {
        'PRODUCT': 'Translate business requirements into detailed product specifications and user stories',
        'RESEARCH_VP': 'Lead strategic research initiatives and competitive intelligence gathering',
        'FINANCE': 'Analyze financial metrics, projections, and investment scenarios for ventures'
      };

      // Generate backstories
      const backstoryMap = {
        'PRODUCT': 'Expert product manager with 25 years translating business needs into actionable development tasks. Specializes in user story generation and acceptance criteria definition.',
        'RESEARCH_VP': 'Seasoned research executive with deep experience in portfolio intelligence, trend detection, and competitive monitoring. Leads research team operations.',
        'FINANCE': 'Financial engineering specialist with expertise in venture capital modeling, burn rate analysis, runway calculations, and investment projections.'
      };

      const crewaiAgent = {
        id: agent.id, // Keep same UUID
        agent_key: agentKey,
        name: agent.name,
        role: roleMap[agent.agent_type],
        goal: goalMap[agent.agent_type],
        backstory: backstoryMap[agent.agent_type],
        department_id: null, // Not assigned to departments yet
        tools: agent.capabilities || [],
        llm_model: 'gpt-4',
        max_tokens: 4000,
        temperature: 0.7,
        status: agent.is_active ? 'active' : 'inactive',
        execution_count: 0,
        avg_execution_time_ms: 0,
        last_executed_at: null
      };

      // Insert into crewai_agents
      const insertSQL = `
        INSERT INTO crewai_agents (
          id, agent_key, name, role, goal, backstory,
          department_id, tools, llm_model, max_tokens, temperature,
          status, execution_count, avg_execution_time_ms, last_executed_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
        ON CONFLICT (id) DO UPDATE SET
          agent_key = EXCLUDED.agent_key,
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          goal = EXCLUDED.goal,
          backstory = EXCLUDED.backstory,
          updated_at = NOW()
        RETURNING id, name, agent_key, role;
      `;

      const result = await ehgClient.query(insertSQL, [
        crewaiAgent.id,
        crewaiAgent.agent_key,
        crewaiAgent.name,
        crewaiAgent.role,
        crewaiAgent.goal,
        crewaiAgent.backstory,
        crewaiAgent.department_id,
        crewaiAgent.tools,
        crewaiAgent.llm_model,
        crewaiAgent.max_tokens,
        crewaiAgent.temperature,
        crewaiAgent.status,
        crewaiAgent.execution_count,
        crewaiAgent.avg_execution_time_ms,
        crewaiAgent.last_executed_at
      ]);

      console.log(`   ✅ ${result.rows[0].name} (${result.rows[0].agent_key})`);
      console.log(`      Role: ${result.rows[0].role}`);
    }

    console.log('');

    // Step 3: Remove from ai_agents table
    console.log('Step 3: Removing from EHG ai_agents table...');
    await ehgClient.query(
      'DELETE FROM ai_agents WHERE agent_type IN ($1, $2, $3)',
      ['PRODUCT', 'RESEARCH_VP', 'FINANCE']
    );
    console.log(`✅ Removed ${aiAgents.length} agents from ai_agents\n`);

    // Step 4: Remove from leo_sub_agents table (cleanup from earlier)
    console.log('Step 4: Removing from EHG_Engineer leo_sub_agents (cleanup)...');

    const { data: leoAgents } = await engineerSupabase
      .from('leo_sub_agents')
      .select('id')
      .in('code', ['RESEARCH', 'STORIES', 'FINANCIAL_ANALYTICS']);

    if (leoAgents && leoAgents.length > 0) {
      const agentIds = leoAgents.map(a => a.id);

      // Delete triggers first
      await engineerSupabase
        .from('leo_sub_agent_triggers')
        .delete()
        .in('sub_agent_id', agentIds);

      // Delete agents
      await engineerSupabase
        .from('leo_sub_agents')
        .delete()
        .in('code', ['RESEARCH', 'STORIES', 'FINANCIAL_ANALYTICS']);

      console.log(`✅ Removed ${leoAgents.length} agents from leo_sub_agents\n`);
    } else {
      console.log('⏩ No agents found in leo_sub_agents (already cleaned up)\n');
    }

    // Step 5: Verify
    console.log('Step 5: Verifying...');

    const { rows: crewaiCount } = await ehgClient.query(
      'SELECT id, agent_key, name, role, status FROM crewai_agents ORDER BY created_at DESC'
    );

    const { rows: aiCount } = await ehgClient.query(
      'SELECT id, name, agent_type FROM ai_agents WHERE agent_type IN ($1, $2, $3)',
      ['PRODUCT', 'RESEARCH_VP', 'FINANCE']
    );

    const { data: leoCount } = await engineerSupabase
      .from('leo_sub_agents')
      .select('code, name')
      .order('priority', { ascending: false });

    console.log(`\n✅ EHG crewai_agents now has ${crewaiCount.length} agents (Customer-facing AI)`);
    crewaiCount.forEach(agent => {
      console.log(`   - ${agent.agent_key}: ${agent.name} (${agent.role})`);
    });

    console.log(`\n✅ EHG ai_agents now has ${aiCount.length} matching agents (should be 0)`);
    if (aiCount.length > 0) {
      aiCount.forEach(agent => {
        console.log(`   ⚠️  Still in ai_agents: ${agent.name} (${agent.agent_type})`);
      });
    }

    console.log(`\n✅ EHG_Engineer leo_sub_agents now has ${leoCount.length} agents (LEO Protocol only)`);
    leoCount.forEach(agent => {
      console.log(`   - ${agent.code}: ${agent.name}`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('MIGRATION COMPLETE ✅');
    console.log('='.repeat(70));
    console.log('');
    console.log('Summary:');
    console.log('  - Moved 3 AI agents from ai_agents to crewai_agents');
    console.log('  - Cleaned up leo_sub_agents table');
    console.log(`  - EHG crewai_agents: ${crewaiCount.length} (Customer-facing AI - UI ready)`);
    console.log(`  - EHG_Engineer leo_sub_agents: ${leoCount.length} (LEO Protocol validation only)`);
    console.log('');

  } catch (error) {
    console.error('\n❌ Migration error:', error.message);
    console.error('   Details:', error);
    process.exit(1);
  } finally {
    if (ehgClient) {
      await ehgClient.end();
    }
  }
}

moveAIAgents().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
