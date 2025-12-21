/**
 * Run Industrial Sub-Agent Registration Migration
 * Registers 9 new sub-agents in leo_sub_agents table
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SUB_AGENTS = [
  {
    id: 'a1b2c3d4-1111-4111-8111-111111111111',
    name: 'Pricing Strategy Sub-Agent',
    code: 'PRICING',
    description: 'Handles pricing model development, unit economics, pricing tiers, sensitivity analysis, and competitive pricing research.',
    activation_type: 'automatic',
    priority: 75,
    script_path: 'lib/sub-agents/pricing.js',
    active: true
  },
  {
    id: 'a1b2c3d4-2222-4222-8222-222222222222',
    name: 'Financial Modeling Sub-Agent',
    code: 'FINANCIAL',
    description: 'Handles financial projections, P&L modeling, cash flow analysis, business model canvas financial sections.',
    activation_type: 'automatic',
    priority: 80,
    script_path: 'lib/sub-agents/financial.js',
    active: true
  },
  {
    id: 'a1b2c3d4-3333-4333-8333-333333333333',
    name: 'Marketing & GTM Sub-Agent',
    code: 'MARKETING',
    description: 'Handles go-to-market strategy, marketing campaigns, channel selection, messaging, and brand positioning.',
    activation_type: 'automatic',
    priority: 70,
    script_path: 'lib/sub-agents/marketing.js',
    active: true
  },
  {
    id: 'a1b2c3d4-4444-4444-8444-444444444444',
    name: 'Sales Process Sub-Agent',
    code: 'SALES',
    description: 'Handles sales playbook development, pipeline management, objection handling, and sales enablement.',
    activation_type: 'automatic',
    priority: 70,
    script_path: 'lib/sub-agents/sales.js',
    active: true
  },
  {
    id: 'a1b2c3d4-5555-4555-8555-555555555555',
    name: 'CRM Sub-Agent',
    code: 'CRM',
    description: 'Handles customer relationship management, lead tracking, customer success metrics, and retention strategies.',
    activation_type: 'automatic',
    priority: 65,
    script_path: 'lib/sub-agents/crm.js',
    active: true
  },
  {
    id: 'a1b2c3d4-6666-4666-8666-666666666666',
    name: 'Analytics Sub-Agent',
    code: 'ANALYTICS',
    description: 'Handles analytics setup, metrics definition, dashboard creation, and data-driven insights.',
    activation_type: 'automatic',
    priority: 75,
    script_path: 'lib/sub-agents/analytics.js',
    active: true
  },
  {
    id: 'a1b2c3d4-7777-4777-8777-777777777777',
    name: 'Monitoring Sub-Agent',
    code: 'MONITORING',
    description: 'Handles monitoring setup, alerting, SLA definition, health checks, and incident response.',
    activation_type: 'automatic',
    priority: 80,
    script_path: 'lib/sub-agents/monitoring.js',
    active: true
  },
  {
    id: 'a1b2c3d4-8888-4888-8888-888888888888',
    name: 'Launch Orchestration Sub-Agent',
    code: 'LAUNCH',
    description: 'Handles production launch orchestration, go-live checklists, launch readiness, and rollback procedures.',
    activation_type: 'automatic',
    priority: 85,
    script_path: 'lib/sub-agents/launch.js',
    active: true
  },
  {
    id: 'a1b2c3d4-9999-4999-8999-999999999999',
    name: 'Valuation Sub-Agent',
    code: 'VALUATION',
    description: 'Handles exit valuation modeling, comparable analysis, DCF calculations, and investor-ready metrics.',
    activation_type: 'automatic',
    priority: 70,
    script_path: 'lib/sub-agents/valuation.js',
    active: true
  }
];

async function runMigration() {
  console.log('=== Industrial Sub-Agent Registration Migration ===\n');

  // Check if leo_sub_agents table exists
  const { data: tableCheck, error: tableError } = await supabase
    .from('leo_sub_agents')
    .select('id')
    .limit(1);

  if (tableError && tableError.message.includes('does not exist')) {
    console.error('❌ Table leo_sub_agents does not exist!');
    console.log('Please create the table first or check your database schema.');
    process.exit(1);
  }

  console.log(`Registering ${SUB_AGENTS.length} sub-agents...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const agent of SUB_AGENTS) {
    process.stdout.write(`  ${agent.code}... `);

    const { data, error } = await supabase
      .from('leo_sub_agents')
      .upsert(agent, { onConflict: 'id' })
      .select();

    if (error) {
      console.log(`❌ ${error.message}`);
      errorCount++;
    } else {
      console.log('✓');
      successCount++;
    }
  }

  console.log('\n=== Results ===');
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors:  ${errorCount}`);

  if (errorCount === 0) {
    console.log('\n✅ All 9 Industrial sub-agents registered successfully!');
  } else {
    console.log('\n⚠️  Some sub-agents failed to register. Check errors above.');
    process.exit(1);
  }
}

runMigration();
