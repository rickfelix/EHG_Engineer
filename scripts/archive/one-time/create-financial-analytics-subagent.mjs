#!/usr/bin/env node
/**
 * Create Financial Analytics Sub-Agent
 * Expert in financial modeling, projections, risk analysis, and VC metrics
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const subAgentId = randomUUID();

const subAgentData = {
  id: subAgentId,
  code: 'FINANCIAL_ANALYTICS',
  name: 'Senior Financial Analytics Engineer',
  description: 'Expert in venture capital financial modeling, projections, risk analysis, and investment metrics. Specializes in Monte Carlo simulations, scenario analysis, and portfolio risk assessment. Philosophy: Financial accuracy is non-negotiable - every calculation must be validated against industry standards.',
  activation_type: 'automatic',
  priority: 8,
  active: true,
  context_file: '/docs/financial-analytics-guidelines.md',
  script_path: 'scripts/financial-analytics-validation.js',
  metadata: {
    expertise: [
      'financial_modeling',
      'venture_capital_metrics',
      'projection_algorithms',
      'monte_carlo_simulation',
      'scenario_analysis',
      'risk_assessment',
      'portfolio_analytics',
      'cash_flow_analysis',
      'valuation_models',
      'burn_rate_calculations',
      'runway_estimation',
      'sensitivity_analysis'
    ],
    responsibilities: [
      'Review and validate all financial calculation algorithms',
      'Ensure projection accuracy with industry-standard formulas',
      'Validate Monte Carlo simulation implementations',
      'Review risk model calculations and portfolio aggregation',
      'Verify VC metrics (MRR, ARR, CAC, LTV, burn rate, runway)',
      'Validate scenario analysis logic',
      'Review cash flow projection accuracy',
      'Ensure numerical stability and edge case handling',
      'Provide financial domain expertise for API design'
    ]
  },
  capabilities: [
    'financial_algorithm_validation',
    'projection_accuracy_review',
    'monte_carlo_optimization',
    'risk_model_verification',
    'vc_metrics_calculation',
    'numerical_stability_analysis'
  ],
  created_at: new Date().toISOString()
};

// Create sub-agent
const { data: agent, error: agentError } = await supabase
  .from('leo_sub_agents')
  .insert(subAgentData)
  .select()
  .single();

if (agentError) {
  console.error('❌ Error creating sub-agent:', agentError.message);
  process.exit(1);
}

console.log('✅ Financial Analytics Sub-Agent Created');
console.log(`   ID: ${agent.id}`);
console.log(`   Code: ${agent.code}`);
console.log(`   Name: ${agent.name}`);
console.log(`   Priority: ${agent.priority}`);

// Create activation triggers
const triggers = [
  { trigger_phrase: 'financial modeling', trigger_type: 'keyword' },
  { trigger_phrase: 'projection algorithm', trigger_type: 'keyword' },
  { trigger_phrase: 'monte carlo', trigger_type: 'keyword' },
  { trigger_phrase: 'scenario analysis', trigger_type: 'keyword' },
  { trigger_phrase: 'risk calculation', trigger_type: 'keyword' },
  { trigger_phrase: 'portfolio risk', trigger_type: 'keyword' },
  { trigger_phrase: 'burn rate', trigger_type: 'keyword' },
  { trigger_phrase: 'runway calculation', trigger_type: 'keyword' },
  { trigger_phrase: 'cash flow projection', trigger_type: 'keyword' },
  { trigger_phrase: 'valuation model', trigger_type: 'keyword' },
  { trigger_phrase: 'financial validation', trigger_type: 'keyword' },
  { trigger_phrase: 'vc metrics', trigger_type: 'keyword' },
  { trigger_phrase: 'sensitivity analysis', trigger_type: 'keyword' }
];

for (const trigger of triggers) {
  const { error: triggerError } = await supabase
    .from('leo_sub_agent_triggers')
    .insert({
      sub_agent_id: agent.id,
      trigger_phrase: trigger.trigger_phrase,
      trigger_type: trigger.trigger_type,
      active: true,
      created_at: new Date().toISOString()
    });

  if (triggerError) {
    console.error(`⚠️  Error creating trigger "${trigger.trigger_phrase}":`, triggerError.message);
  } else {
    console.log(`   ✅ Trigger: "${trigger.trigger_phrase}"`);
  }
}

console.log('\n📋 Financial Analytics Sub-Agent Activation:');
console.log('   Triggers on: financial modeling, projections, risk analysis, monte carlo, etc.');
console.log('   Expertise: VC metrics, cash flow, valuations, scenario analysis');
console.log('   Priority: 8 (high)');
console.log('\n✅ Sub-agent ready for SD-BACKEND-002C implementation!');
