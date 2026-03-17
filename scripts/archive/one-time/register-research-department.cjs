#!/usr/bin/env node
/**
 * register-research-department.cjs - Stand up Research Department
 * SD-LEO-FEAT-STAND-RESEARCH-DEPARTMENT-001
 *
 * Registers the Research Department as an internal EHG service:
 * 1. Creates Research department in departments table
 * 2. Registers Research Lead agent in agent_registry
 * 3. Assigns agent to department via RPC
 * 4. Registers Domain Intelligence capability via RPC
 * 5. Verifies messaging fan-out
 *
 * Usage:
 *   node scripts/register-research-department.cjs
 *   node scripts/register-research-department.cjs --verify  (verify only, no inserts)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RESEARCH_DEPT_ID = randomUUID();
const RESEARCH_AGENT_ID = randomUUID();

const VERIFY_ONLY = process.argv.includes('--verify');

async function step1_createDepartment() {
  console.log('\n  Step 1: Create Research Department');
  console.log('  ' + '-'.repeat(40));

  // Check if already exists
  const { data: existing } = await supabase
    .from('departments')
    .select('id, name, slug')
    .eq('slug', 'research');

  if (existing && existing.length > 0) {
    console.log(`  Already exists: ${existing[0].name} (${existing[0].id})`);
    return existing[0].id;
  }

  if (VERIFY_ONLY) {
    console.log('  [VERIFY] Would create Research department');
    return null;
  }

  const { data, error } = await supabase
    .from('departments')
    .insert({
      id: RESEARCH_DEPT_ID,
      name: 'Research',
      slug: 'research',
      hierarchy_path: 'research',
      description: 'Domain intelligence, market research, competitor analysis, and venture ideation support',
      parent_department_id: null,
      metadata: {
        sd_origin: 'SD-LEO-FEAT-STAND-RESEARCH-DEPARTMENT-001',
        services: ['domain_intelligence', 'competitor_analysis', 'market_research'],
        target_consumers: ['venture_ideation', 'stage_analysis', 'chairman_briefings']
      },
      is_active: true
    })
    .select()
    .single();

  if (error) {
    console.error('  ERROR:', error.message);
    process.exit(1);
  }

  console.log(`  Created: ${data.name} (${data.id})`);
  console.log(`  Hierarchy: ${data.hierarchy_path}`);
  return data.id;
}

async function step2_registerAgent() {
  console.log('\n  Step 2: Register Research Lead Agent');
  console.log('  ' + '-'.repeat(40));

  // Check if research agent already exists
  const { data: existing } = await supabase
    .from('agent_registry')
    .select('id, display_name, agent_type')
    .eq('display_name', 'Research Lead');

  if (existing && existing.length > 0) {
    console.log(`  Already exists: ${existing[0].display_name} (${existing[0].id})`);
    return existing[0].id;
  }

  if (VERIFY_ONLY) {
    console.log('  [VERIFY] Would create Research Lead agent');
    return null;
  }

  const { data, error } = await supabase
    .from('agent_registry')
    .insert({
      id: RESEARCH_AGENT_ID,
      agent_type: 'executive',
      display_name: 'Research Lead',
      description: 'Department lead for Research. Coordinates domain intelligence, competitor analysis, and market research across venture ideation pipeline.',
      parent_agent_id: '00000000-0000-0000-0000-000000000002', // EVA
      hierarchy_level: 3,
      hierarchy_path: 'chairman.eva.research_lead',
      capabilities: [
        'domain_intelligence',
        'competitor_analysis',
        'market_research',
        'venture_research',
        'technology_scanning'
      ],
      tool_access: [
        'research-engine',
        'competitor-intelligence',
        'venture-research'
      ],
      status: 'active'
    })
    .select()
    .single();

  if (error) {
    console.error('  ERROR:', error.message);
    process.exit(1);
  }

  console.log(`  Created: ${data.display_name} (${data.id})`);
  console.log(`  Hierarchy: ${data.hierarchy_path}`);
  return data.id;
}

async function step3_assignAgent(deptId, agentId) {
  console.log('\n  Step 3: Assign Agent to Department');
  console.log('  ' + '-'.repeat(40));

  if (!deptId || !agentId) {
    console.log('  [VERIFY] Would assign Research Lead as lead of Research department');
    return;
  }

  // Check if already assigned
  const { data: existing } = await supabase
    .from('department_agents')
    .select('id, role_in_department')
    .eq('department_id', deptId)
    .eq('agent_id', agentId);

  if (existing && existing.length > 0) {
    console.log(`  Already assigned: role=${existing[0].role_in_department}`);
    return;
  }

  const { data, error } = await supabase.rpc('assign_agent_to_department', {
    p_agent_id: agentId,
    p_department_id: deptId,
    p_role: 'lead'
  });

  if (error) {
    console.error('  ERROR:', error.message);
    process.exit(1);
  }

  console.log(`  Assigned Research Lead as department lead`);
  console.log(`  Assignment ID: ${data}`);
}

async function step4_registerCapability(deptId) {
  console.log('\n  Step 4: Register Domain Intelligence Capability');
  console.log('  ' + '-'.repeat(40));

  if (!deptId) {
    console.log('  [VERIFY] Would register domain_intelligence capability');
    return;
  }

  // Check if already exists
  const { data: existing } = await supabase
    .from('department_capabilities')
    .select('id, capability_name')
    .eq('department_id', deptId)
    .eq('capability_name', 'domain_intelligence');

  if (existing && existing.length > 0) {
    console.log(`  Already registered: ${existing[0].capability_name}`);
    return;
  }

  const { data, error } = await supabase.rpc('add_department_capability', {
    p_department_id: deptId,
    p_capability_name: 'domain_intelligence',
    p_description: 'Multi-model deep research for venture ideation: market analysis, competitor intelligence, technology scanning, regulatory landscape'
  });

  if (error) {
    // Fallback to direct insert if RPC not available
    console.log('  RPC not available, using direct insert...');
    const { data: inserted, error: insertErr } = await supabase
      .from('department_capabilities')
      .insert({
        department_id: deptId,
        capability_name: 'domain_intelligence',
        description: 'Multi-model deep research for venture ideation: market analysis, competitor intelligence, technology scanning, regulatory landscape'
      })
      .select()
      .single();

    if (insertErr) {
      console.error('  ERROR:', insertErr.message);
      process.exit(1);
    }

    console.log(`  Registered via direct insert: ${inserted.capability_name} (${inserted.id})`);
    return;
  }

  console.log(`  Registered: domain_intelligence (${data})`);
}

async function step5_verifyMessaging(deptId) {
  console.log('\n  Step 5: Verify Messaging Fan-Out');
  console.log('  ' + '-'.repeat(40));

  if (!deptId) {
    console.log('  [VERIFY] Would test send_department_message fan-out');
    return;
  }

  // Verify agents are assigned
  const { data: agents } = await supabase
    .from('department_agents')
    .select('agent_id, role_in_department')
    .eq('department_id', deptId);

  if (!agents || agents.length === 0) {
    console.log('  WARNING: No agents assigned - messaging fan-out will have no recipients');
    return;
  }

  console.log(`  Agents assigned: ${agents.length}`);
  agents.forEach(a => console.log(`    - ${a.agent_id} (${a.role_in_department})`));

  // Send a test message using correct RPC signature
  const { data, error } = await supabase.rpc('send_department_message', {
    p_department_id: deptId,
    p_sender_id: agents[0].agent_id,
    p_content: 'Research Department is now active and registered as an internal EHG service. Domain Intelligence capability is online.',
    p_metadata: { event: 'department_activation', sd: 'SD-LEO-FEAT-STAND-RESEARCH-DEPARTMENT-001' }
  });

  if (error) {
    console.error('  Messaging error:', error.message);
    console.log('  NOTE: With a single agent, fan-out has no additional recipients (sender is excluded).');
    return;
  }

  console.log(`  Message sent successfully. Message ID: ${data}`);
}

async function verify(deptId) {
  console.log('\n  Final Verification');
  console.log('  ' + '='.repeat(40));

  const { data: dept } = await supabase
    .from('departments')
    .select('*')
    .eq('slug', 'research')
    .single();

  if (!dept) {
    console.log('  FAIL: Research department not found');
    return false;
  }

  const { data: agents } = await supabase
    .from('department_agents')
    .select('agent_id, role_in_department')
    .eq('department_id', dept.id);

  const { data: caps } = await supabase
    .from('department_capabilities')
    .select('capability_name, description')
    .eq('department_id', dept.id);

  console.log(`  Department: ${dept.name} (${dept.id})`);
  console.log(`  Hierarchy:  ${dept.hierarchy_path}`);
  console.log(`  Active:     ${dept.is_active}`);
  console.log(`  Agents:     ${(agents || []).length}`);
  (agents || []).forEach(a => console.log(`    - ${a.agent_id} (${a.role_in_department})`));
  console.log(`  Capabilities: ${(caps || []).length}`);
  (caps || []).forEach(c => console.log(`    - ${c.capability_name}: ${c.description}`));

  const passed = dept.is_active
    && (agents || []).length >= 1
    && (caps || []).length >= 1;

  console.log(`\n  Result: ${passed ? 'PASS' : 'FAIL'}`);
  return passed;
}

async function main() {
  console.log('\n' + '='.repeat(50));
  console.log('  REGISTER RESEARCH DEPARTMENT');
  console.log('  SD-LEO-FEAT-STAND-RESEARCH-DEPARTMENT-001');
  if (VERIFY_ONLY) console.log('  MODE: Verify Only (no changes)');
  console.log('='.repeat(50));

  const deptId = await step1_createDepartment();
  const agentId = await step2_registerAgent();
  await step3_assignAgent(deptId, agentId);
  await step4_registerCapability(deptId);
  await step5_verifyMessaging(deptId);

  if (!VERIFY_ONLY) {
    const passed = await verify(deptId);
    if (!passed) process.exit(1);
  }

  console.log('\n' + '='.repeat(50));
  console.log('  REGISTRATION COMPLETE');
  console.log('='.repeat(50) + '\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
