#!/usr/bin/env node
/**
 * query-capabilities.cjs - View effective capabilities per agent with inheritance source
 * SD-LEO-ORCH-EHG-ORGANIZATIONAL-STRUCTURE-001-D
 *
 * Usage:
 *   node scripts/query-capabilities.cjs --agent-id <UUID>
 *   node scripts/query-capabilities.cjs --all
 */

function getClient() {
  require('dotenv').config();
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent-id' && args[i + 1]) parsed.agentId = args[++i];
    else if (args[i] === '--all') parsed.all = true;
    else if (args[i] === '--help' || args[i] === '-h') parsed.help = true;
  }
  return parsed;
}

function showUsage() {
  console.log(`
Usage:
  node scripts/query-capabilities.cjs --agent-id <UUID>   Show capabilities for a specific agent
  node scripts/query-capabilities.cjs --all               Show capabilities for all agents
  node scripts/query-capabilities.cjs --help              Show this help message
`);
}

async function queryAgentCapabilities(supabase, agentId) {
  const { data, error } = await supabase.rpc('get_effective_capabilities', {
    p_agent_id: agentId
  });

  if (error) {
    console.error('Error querying capabilities:', error.message);
    process.exit(1);
  }

  // Get agent name
  const { data: agent } = await supabase
    .from('agent_registry')
    .select('display_name')
    .eq('id', agentId)
    .single();

  const agentName = agent ? agent.display_name : agentId;

  console.log('\n' + '='.repeat(80));
  console.log(`  EFFECTIVE CAPABILITIES: ${agentName}`);
  console.log('='.repeat(80));

  if (!data || data.length === 0) {
    console.log('  No capabilities found (agent may not be assigned to any department).');
  } else {
    const capW = 25;
    const srcW = 20;
    const typeW = 12;

    console.log('  ' + 'Capability'.padEnd(capW) + 'Source Dept'.padEnd(srcW) + 'Type'.padEnd(typeW));
    console.log('  ' + '-'.repeat(capW + srcW + typeW));

    for (const cap of data) {
      const typeLabel = cap.inheritance_type === 'direct' ? 'DIRECT' : 'INHERITED';
      console.log(
        '  ' +
        (cap.capability_name || '').substring(0, capW - 1).padEnd(capW) +
        (cap.source_department_name || '').substring(0, srcW - 1).padEnd(srcW) +
        typeLabel.padEnd(typeW)
      );
    }
  }

  console.log('='.repeat(80) + '\n');
}

async function queryAllCapabilities(supabase) {
  const { data, error } = await supabase
    .from('v_agent_effective_capabilities')
    .select('*')
    .order('agent_name')
    .order('inheritance_type')
    .order('capability_name');

  if (error) {
    console.error('Error querying capabilities:', error.message);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(90));
  console.log('  ALL AGENT EFFECTIVE CAPABILITIES');
  console.log('='.repeat(90));

  if (!data || data.length === 0) {
    console.log('  No capabilities assigned to any agents.');
  } else {
    const agentW = 20;
    const capW = 25;
    const srcW = 20;
    const typeW = 12;

    console.log(
      '  ' +
      'Agent'.padEnd(agentW) +
      'Capability'.padEnd(capW) +
      'Source Dept'.padEnd(srcW) +
      'Type'.padEnd(typeW)
    );
    console.log('  ' + '-'.repeat(agentW + capW + srcW + typeW));

    for (const row of data) {
      const typeLabel = row.inheritance_type === 'direct' ? 'DIRECT' : 'INHERITED';
      console.log(
        '  ' +
        (row.agent_name || '').substring(0, agentW - 1).padEnd(agentW) +
        (row.capability_name || '').substring(0, capW - 1).padEnd(capW) +
        (row.source_department_name || '').substring(0, srcW - 1).padEnd(srcW) +
        typeLabel.padEnd(typeW)
      );
    }
  }

  console.log(`\n  Total: ${data ? data.length : 0} capability assignment(s)`);
  console.log('='.repeat(90) + '\n');
}

async function main(supabase) {
  if (!supabase) supabase = getClient();
  const args = parseArgs();

  if (args.help) {
    showUsage();
    return;
  }

  if (args.agentId) {
    await queryAgentCapabilities(supabase, args.agentId);
  } else if (args.all) {
    await queryAllCapabilities(supabase);
  } else {
    showUsage();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

module.exports = { main, parseArgs };
