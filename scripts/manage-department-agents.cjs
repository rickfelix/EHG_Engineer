#!/usr/bin/env node
/**
 * manage-department-agents.cjs - Assign/remove agents to/from departments
 * SD-LEO-ORCH-EHG-ORGANIZATIONAL-STRUCTURE-001-D
 *
 * Usage:
 *   node scripts/manage-department-agents.cjs --assign --agent-id <UUID> --department-id <UUID> [--role <role>]
 *   node scripts/manage-department-agents.cjs --remove --agent-id <UUID> --department-id <UUID>
 *   node scripts/manage-department-agents.cjs --list --department-id <UUID>
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--assign') parsed.action = 'assign';
    else if (args[i] === '--remove') parsed.action = 'remove';
    else if (args[i] === '--list') parsed.action = 'list';
    else if (args[i] === '--agent-id' && args[i + 1]) parsed.agentId = args[++i];
    else if (args[i] === '--department-id' && args[i + 1]) parsed.departmentId = args[++i];
    else if (args[i] === '--role' && args[i + 1]) parsed.role = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') parsed.help = true;
  }
  return parsed;
}

function showUsage() {
  console.log(`
Usage:
  node scripts/manage-department-agents.cjs --assign --agent-id <UUID> --department-id <UUID> [--role <role>]
  node scripts/manage-department-agents.cjs --remove --agent-id <UUID> --department-id <UUID>
  node scripts/manage-department-agents.cjs --list --department-id <UUID>

Options:
  --assign          Assign an agent to a department
  --remove          Remove an agent from a department
  --list            List all agents in a department
  --agent-id        Agent UUID from agent_registry
  --department-id   Department UUID from departments table
  --role            Role in department: lead, member, advisor (default: member)
  --help, -h        Show this help message
`);
}

async function assignAgent(agentId, departmentId, role) {
  const { data, error } = await supabase.rpc('assign_agent_to_department', {
    p_agent_id: agentId,
    p_department_id: departmentId,
    p_role: role || 'member'
  });

  if (error) {
    console.error('Error assigning agent:', error.message);
    process.exit(1);
  }

  console.log(`Agent ${agentId} assigned to department ${departmentId} as ${role || 'member'}`);
  console.log(`Assignment ID: ${data}`);
}

async function removeAgent(agentId, departmentId) {
  const { data, error } = await supabase.rpc('remove_agent_from_department', {
    p_agent_id: agentId,
    p_department_id: departmentId
  });

  if (error) {
    console.error('Error removing agent:', error.message);
    process.exit(1);
  }

  if (data) {
    console.log(`Agent ${agentId} removed from department ${departmentId}`);
  } else {
    console.log(`Agent ${agentId} was not in department ${departmentId}`);
  }
}

async function listAgents(departmentId) {
  const { data, error } = await supabase.rpc('get_department_agents', {
    p_department_id: departmentId
  });

  if (error) {
    console.error('Error listing agents:', error.message);
    process.exit(1);
  }

  // Get department name
  const { data: dept } = await supabase
    .from('departments')
    .select('name')
    .eq('id', departmentId)
    .single();

  const deptName = dept ? dept.name : departmentId;

  console.log('\n' + '='.repeat(70));
  console.log(`  AGENTS IN: ${deptName}`);
  console.log('='.repeat(70));

  if (!data || data.length === 0) {
    console.log('  No agents assigned to this department.');
  } else {
    const nameW = 25;
    const typeW = 15;
    const roleW = 12;

    console.log('  ' + 'Name'.padEnd(nameW) + 'Type'.padEnd(typeW) + 'Role'.padEnd(roleW) + 'Assigned');
    console.log('  ' + '-'.repeat(nameW + typeW + roleW + 20));

    for (const agent of data) {
      const assigned = new Date(agent.assigned_at).toLocaleDateString();
      console.log(
        '  ' +
        (agent.display_name || 'Unknown').substring(0, nameW - 1).padEnd(nameW) +
        (agent.agent_type || 'N/A').substring(0, typeW - 1).padEnd(typeW) +
        (agent.role_in_department || 'member').padEnd(roleW) +
        assigned
      );
    }
  }

  console.log('='.repeat(70) + '\n');
}

async function main() {
  const args = parseArgs();

  if (args.help || !args.action) {
    showUsage();
    return;
  }

  if (args.action === 'list') {
    if (!args.departmentId) {
      console.error('Error: --department-id is required for --list');
      process.exit(1);
    }
    await listAgents(args.departmentId);
  } else if (args.action === 'assign') {
    if (!args.agentId || !args.departmentId) {
      console.error('Error: --agent-id and --department-id are required for --assign');
      process.exit(1);
    }
    await assignAgent(args.agentId, args.departmentId, args.role);
  } else if (args.action === 'remove') {
    if (!args.agentId || !args.departmentId) {
      console.error('Error: --agent-id and --department-id are required for --remove');
      process.exit(1);
    }
    await removeAgent(args.agentId, args.departmentId);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
