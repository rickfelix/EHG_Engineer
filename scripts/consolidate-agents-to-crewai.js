#!/usr/bin/env node
/**
 * Consolidate Agent Tables: ai_agents → crewai_agents
 *
 * Moves all 9 agents from ai_agents table to crewai_agents table to establish
 * crewai_agents as the single source of truth for all AI agents.
 *
 * This script:
 * 1. Reads all 9 agents from ai_agents table
 * 2. Transforms them to match crewai_agents schema
 * 3. Inserts into crewai_agents table
 * 4. Verifies successful migration
 *
 * Agents being moved:
 * - 3 AI CEO agents (Strategic Decision, Market Research, Workflow Coordinator)
 * - 5 Research Analysts (Competitive Intelligence, Customer Insights, Financial Research, Market Trends, Viral Content)
 * - 1 Research Manager
 */

import { createDatabaseClient } from '/mnt/c/_EHG/EHG/scripts/lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Generate agent_key from name (kebab-case)
 */
function generateAgentKey(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Map AI CEO agent to crewai_agents schema
 */
function mapAICEOAgent(agent) {
  return {
    id: agent.id,
    agent_key: generateAgentKey(agent.name),
    name: agent.name,
    role: 'AI Chief Executive Officer',
    goal: 'Provide strategic decision-making and venture oversight with data-driven insights',
    backstory: `Advanced AI CEO agent specialized in ${agent.name.toLowerCase()}. Combines strategic planning with tactical execution to guide venture success.`,
    department_id: null,
    tools: agent.capabilities || [],
    llm_model: 'gpt-4',
    max_tokens: 4000,
    temperature: 0.7,
    status: agent.is_active ? 'active' : 'inactive',
    execution_count: 0,
    avg_execution_time_ms: 0,
    last_executed_at: agent.last_activity || null
  };
}

/**
 * Map Research Analyst to crewai_agents schema
 */
function mapResearchAnalyst(agent) {
  const specialtyGoals = {
    'Competitive Intelligence': 'Monitor competitive landscape, identify market opportunities, and track competitor movements',
    'Customer Insights': 'Analyze customer behavior patterns, feedback, and sentiment to inform product decisions',
    'Financial Research': 'Conduct financial analysis, market projections, and investment opportunity assessment',
    'Market Trends': 'Track emerging market trends, industry shifts, and technological disruptions',
    'Viral Content': 'Identify viral content patterns, social media trends, and engagement opportunities'
  };

  const specialtyBackstories = {
    'Competitive Intelligence': 'Expert analyst with 15 years tracking competitive dynamics. Specializes in identifying market positioning opportunities and competitive threats before they materialize.',
    'Customer Insights': 'Seasoned researcher with deep expertise in customer psychology and behavior analysis. Translates raw feedback into actionable product insights.',
    'Financial Research': 'Financial analyst with MBA and 20 years experience in venture capital modeling. Expert in burn rate analysis, runway projections, and valuation modeling.',
    'Market Trends': 'Trend forecaster with proven track record identifying emerging markets. Combines quantitative analysis with qualitative insight to spot opportunities early.',
    'Viral Content': 'Digital marketing specialist with expertise in viral mechanics and social media algorithms. Tracks content patterns across platforms to identify engagement opportunities.'
  };

  return {
    id: agent.id,
    agent_key: generateAgentKey(agent.specialty + ' Analyst'),
    name: agent.name,
    role: `Research Analyst - ${agent.specialty}`,
    goal: specialtyGoals[agent.specialty] || `Conduct ${agent.specialty} research and analysis`,
    backstory: specialtyBackstories[agent.specialty] || `Expert analyst specializing in ${agent.specialty} with years of experience delivering actionable insights.`,
    department_id: null,
    tools: ['research', 'data_analysis', 'reporting'],
    llm_model: 'gpt-4',
    max_tokens: 3000,
    temperature: 0.6,
    status: agent.is_active ? 'active' : 'inactive',
    execution_count: 0,
    avg_execution_time_ms: 0,
    last_executed_at: null
  };
}

/**
 * Map Research Manager to crewai_agents schema
 */
function mapResearchManager(agent) {
  return {
    id: agent.id,
    agent_key: 'research-manager',
    name: agent.name,
    role: 'Research Department Manager',
    goal: 'Oversee research operations, coordinate analyst teams, and ensure high-quality research deliverables',
    backstory: 'Experienced research leader with 25 years managing portfolio intelligence operations. Expert in coordinating cross-functional research teams and synthesizing insights for executive decision-making.',
    department_id: null,
    tools: ['team_coordination', 'research_planning', 'quality_review', 'reporting'],
    llm_model: 'gpt-4',
    max_tokens: 4000,
    temperature: 0.7,
    status: agent.is_active ? 'active' : 'inactive',
    execution_count: 0,
    avg_execution_time_ms: 0,
    last_executed_at: null
  };
}

async function consolidateAgents() {
  console.log('='.repeat(70));
  console.log('CONSOLIDATING AGENT TABLES: ai_agents → crewai_agents');
  console.log('='.repeat(70));
  console.log('');

  let ehgClient;

  try {
    // Connect to EHG database
    ehgClient = await createDatabaseClient('ehg', {
      verify: true,
      verbose: true
    });

    // Step 1: Get all agents from ai_agents table
    console.log('Step 1: Reading agents from ai_agents table...');
    const { rows: aiAgents } = await ehgClient.query('SELECT * FROM ai_agents ORDER BY agent_type, role, specialty');

    console.log(`✅ Found ${aiAgents.length} agents to migrate\n`);

    if (aiAgents.length === 0) {
      console.log('⏩ No agents found in ai_agents table');
      return;
    }

    // Step 2: Transform agents to crewai_agents schema
    console.log('Step 2: Transforming agents to crewai_agents schema...');

    const crewaiAgents = aiAgents.map(agent => {
      if (agent.agent_type === 'AI_CEO') {
        return mapAICEOAgent(agent);
      } else if (agent.agent_type === 'RESEARCH_ANALYST') {
        return mapResearchAnalyst(agent);
      } else if (agent.agent_type === 'RESEARCH_MANAGER') {
        return mapResearchManager(agent);
      } else {
        throw new Error(`Unknown agent_type: ${agent.agent_type}`);
      }
    });

    console.log(`✅ Transformed ${crewaiAgents.length} agents\n`);

    // Step 3: Insert into crewai_agents
    console.log('Step 3: Inserting agents into crewai_agents table...');

    for (const agent of crewaiAgents) {
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
          tools = EXCLUDED.tools,
          status = EXCLUDED.status,
          updated_at = NOW()
        RETURNING id, name, agent_key, role, status;
      `;

      const result = await ehgClient.query(insertSQL, [
        agent.id,
        agent.agent_key,
        agent.name,
        agent.role,
        agent.goal,
        agent.backstory,
        agent.department_id,
        agent.tools,
        agent.llm_model,
        agent.max_tokens,
        agent.temperature,
        agent.status,
        agent.execution_count,
        agent.avg_execution_time_ms,
        agent.last_executed_at
      ]);

      const inserted = result.rows[0];
      console.log(`   ✅ ${inserted.name}`);
      console.log(`      Key: ${inserted.agent_key}`);
      console.log(`      Role: ${inserted.role}`);
      console.log(`      Status: ${inserted.status}`);
    }

    console.log('');

    // Step 4: Verify migration
    console.log('Step 4: Verifying migration...');

    const { rows: crewaiCount } = await ehgClient.query('SELECT COUNT(*) FROM crewai_agents');
    const { rows: aiCount } = await ehgClient.query('SELECT COUNT(*) FROM ai_agents');

    console.log('\n✅ Verification Results:');
    console.log(`   ai_agents table: ${aiCount[0].count} agents (source)`);
    console.log(`   crewai_agents table: ${crewaiCount[0].count} agents (target)`);

    // Get breakdown by role
    const { rows: roleBreakdown } = await ehgClient.query(`
      SELECT role, COUNT(*) as count, status
      FROM crewai_agents
      WHERE id IN (SELECT id FROM ai_agents)
      GROUP BY role, status
      ORDER BY role
    `);

    console.log('\n📊 Agent breakdown in crewai_agents:');
    roleBreakdown.forEach(row => {
      console.log(`   - ${row.role}: ${row.count} (${row.status})`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('MIGRATION COMPLETE ✅');
    console.log('='.repeat(70));
    console.log('');
    console.log('Summary:');
    console.log(`  - Migrated ${aiAgents.length} agents from ai_agents to crewai_agents`);
    console.log(`  - Total agents in crewai_agents: ${crewaiCount[0].count}`);
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Update TypeScript files to query crewai_agents');
    console.log('  2. Test application to verify agents load correctly');
    console.log('  3. Delete ai_agents table: DROP TABLE ai_agents CASCADE');
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

consolidateAgents().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
