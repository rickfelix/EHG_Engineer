#!/usr/bin/env node

/**
 * Register Customer Intelligence Agent
 *
 * This script documents the Customer Intelligence Agent for future registration
 * when the agent registration API (POST /api/agents) is implemented.
 *
 * Related: SD-CUSTOMER-INTEL-001
 * Agent File: /mnt/c/_EHG/EHG/agent-platform/app/agents/research/customer_intelligence_agent.py
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Use EHG database (not EHG_Engineer)
const supabase = createClient(
  process.env.EHG_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EHG_SUPABASE_ANON_KEY
);

const agentDefinition = {
  agent_key: 'customer_intelligence_agent',
  name: 'Customer Intelligence Agent',
  role: 'Senior Customer Research Analyst',
  department: 'Research',
  goal: `Generate comprehensive customer intelligence for pre-launch ventures.

Objectives:
1. Conduct deep market research across Reddit, forums, G2, LinkedIn
2. Generate 3-5 detailed customer personas with demographics, psychographics, JTBD
3. Score ideal customer profiles (ICP) 0-100 with buying signal identification
4. Map customer journeys (awareness → consideration → decision → retention)
5. Analyze willingness-to-pay with pricing sensitivity modeling
6. Provide confidence scores for all outputs (target: 85%+)`,

  backstory: `You are a Senior Customer Research Analyst specializing in pre-launch
customer intelligence gathering. You excel at synthesizing data from multiple sources
(Reddit, G2, forums, LinkedIn) to create accurate customer personas, ICP profiles,
and willingness-to-pay models without conducting live customer interviews. Your
research informs product strategy, pricing, and go-to-market approaches.`,

  tools: [],  // Will add web scraping tools in future iterations
  llm_model: 'gpt-4-turbo-preview',
  max_tokens: 4000,
  temperature: 0.7,
  max_iterations: 15,  // Higher iteration count for multi-task agent
  allow_delegation: false,
  cache_enabled: true,

  // Metadata
  specialization: 'pre_launch_customer_research',
  output_types: [
    'customer_personas',
    'icp_profiles',
    'customer_journeys',
    'willingness_to_pay_analysis',
    'market_segments'
  ],

  research_sources: [
    'Reddit (subreddit discussions)',
    'G2/Capterra (competitor reviews)',
    'Forums (pain point identification)',
    'LinkedIn (professional buyer behaviors)'
  ],

  integration_stages: [3, 4, 15, 17, 32],  // Venture workflow stages

  // 5 specialized tasks
  tasks: [
    {
      name: 'Market Research',
      description: 'Gather data from public sources (Reddit, G2, forums, LinkedIn)',
      output_table: null,
      estimated_duration: '5-10 minutes'
    },
    {
      name: 'Persona Generation',
      description: 'Create 3-5 detailed customer personas',
      output_table: 'customer_personas',
      estimated_duration: '10-15 minutes'
    },
    {
      name: 'ICP Scoring',
      description: 'Score ideal customer profile 0-100',
      output_table: 'icp_profiles',
      estimated_duration: '5-7 minutes'
    },
    {
      name: 'Customer Journey Mapping',
      description: 'Map 4-stage customer journey',
      output_table: 'customer_journeys',
      estimated_duration: '7-10 minutes'
    },
    {
      name: 'Willingness-to-Pay Analysis',
      description: 'Analyze pricing sensitivity',
      output_table: 'willingness_to_pay',
      estimated_duration: '5-7 minutes'
    }
  ]
};

async function documentAgent() {
  console.log('📋 Customer Intelligence Agent Registration');
  console.log('='.repeat(60));
  console.log('\n🤖 Agent Details:');
  console.log(`   Key: ${agentDefinition.agent_key}`);
  console.log(`   Name: ${agentDefinition.name}`);
  console.log(`   Role: ${agentDefinition.role}`);
  console.log(`   Department: ${agentDefinition.department}`);
  console.log(`   Max Iterations: ${agentDefinition.max_iterations}`);

  console.log('\n🎯 Specialization:');
  console.log(`   - ${agentDefinition.specialization}`);

  console.log('\n📊 Output Types:');
  agentDefinition.output_types.forEach(type => {
    console.log(`   - ${type}`);
  });

  console.log('\n🔍 Research Sources:');
  agentDefinition.research_sources.forEach(source => {
    console.log(`   - ${source}`);
  });

  console.log('\n📋 Tasks:');
  agentDefinition.tasks.forEach((task, idx) => {
    console.log(`   ${idx + 1}. ${task.name} (${task.estimated_duration})`);
    console.log(`      → ${task.description}`);
    if (task.output_table) {
      console.log(`      → Stores in: ${task.output_table}`);
    }
  });

  console.log('\n🔗 Integration Stages:');
  console.log(`   Stages: ${agentDefinition.integration_stages.join(', ')}`);

  console.log('\n📁 File Location:');
  console.log('   /mnt/c/_EHG/EHG/agent-platform/app/agents/research/customer_intelligence_agent.py');

  console.log('\n📝 Status:');
  console.log('   ✅ Agent Python file created');
  console.log('   ✅ Database schema ready (20251011_customer_intelligence_system.sql)');
  console.log('   ⏳ Pending: Agent registration API implementation');
  console.log('   ⏳ Pending: Stage 3 UI integration');

  console.log('\n🚀 Next Steps:');
  console.log('   1. Wait for POST /api/agents endpoint to be implemented');
  console.log('   2. Register agent via API: POST /api/agents with agentDefinition');
  console.log('   3. Create Stage 3 UI tabs for persona dashboard');
  console.log('   4. Connect UI to agent execution endpoint');

  console.log('\n' + '='.repeat(60));
  console.log('✅ Agent documented and ready for registration\n');

  return agentDefinition;
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const definition = await documentAgent();

  // Optionally save to file for reference
  const fs = await import('fs/promises');
  await fs.writeFile(
    './customer-intelligence-agent-definition.json',
    JSON.stringify(definition, null, 2)
  );
  console.log('📄 Agent definition saved to: ./customer-intelligence-agent-definition.json');
}

export { agentDefinition, documentAgent };
