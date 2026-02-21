#!/usr/bin/env node
/**
 * department-hierarchy.cjs - ASCII tree visualization of department structure
 * SD-LEO-ORCH-EHG-ORGANIZATIONAL-STRUCTURE-001-D
 *
 * Usage:
 *   node scripts/department-hierarchy.cjs
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Fetch all departments ordered by hierarchy path
  const { data: departments, error } = await supabase
    .from('departments')
    .select('id, name, slug, hierarchy_path, parent_department_id, is_active, description')
    .order('hierarchy_path');

  if (error) {
    console.error('Error fetching departments:', error.message);
    process.exit(1);
  }

  if (!departments || departments.length === 0) {
    console.log('No departments found.');
    return;
  }

  // Get agent counts per department
  const { data: agentData } = await supabase
    .from('department_agents')
    .select('department_id');

  const agentCounts = {};
  if (agentData) {
    for (const row of agentData) {
      agentCounts[row.department_id] = (agentCounts[row.department_id] || 0) + 1;
    }
  }

  // Get capability counts per department
  const { data: capData } = await supabase
    .from('department_capabilities')
    .select('department_id');

  const capCounts = {};
  if (capData) {
    for (const row of capData) {
      capCounts[row.department_id] = (capCounts[row.department_id] || 0) + 1;
    }
  }

  // Build tree structure
  const byId = {};
  const roots = [];

  for (const dept of departments) {
    byId[dept.id] = { ...dept, children: [] };
  }

  for (const dept of departments) {
    if (dept.parent_department_id && byId[dept.parent_department_id]) {
      byId[dept.parent_department_id].children.push(byId[dept.id]);
    } else {
      roots.push(byId[dept.id]);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  EHG DEPARTMENT HIERARCHY');
  console.log('='.repeat(70));
  console.log('');

  function renderTree(node, prefix, isLast) {
    const connector = isLast ? '└── ' : '├── ';
    const agents = agentCounts[node.id] || 0;
    const caps = capCounts[node.id] || 0;
    const status = node.is_active ? '' : ' [INACTIVE]';
    const meta = [];
    if (agents > 0) meta.push(`${agents} agent${agents > 1 ? 's' : ''}`);
    if (caps > 0) meta.push(`${caps} cap${caps > 1 ? 's' : ''}`);
    const metaStr = meta.length > 0 ? ` (${meta.join(', ')})` : '';

    console.log(`  ${prefix}${connector}${node.name}${metaStr}${status}`);

    if (node.description) {
      const descPrefix = isLast ? '    ' : '│   ';
      console.log(`  ${prefix}${descPrefix}  ${node.description.substring(0, 60)}`);
    }

    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    for (let i = 0; i < node.children.length; i++) {
      renderTree(node.children[i], childPrefix, i === node.children.length - 1);
    }
  }

  // Render each root
  for (let i = 0; i < roots.length; i++) {
    const root = roots[i];
    const agents = agentCounts[root.id] || 0;
    const caps = capCounts[root.id] || 0;
    const status = root.is_active ? '' : ' [INACTIVE]';
    const meta = [];
    if (agents > 0) meta.push(`${agents} agent${agents > 1 ? 's' : ''}`);
    if (caps > 0) meta.push(`${caps} cap${caps > 1 ? 's' : ''}`);
    const metaStr = meta.length > 0 ? ` (${meta.join(', ')})` : '';

    console.log(`  ${root.name}${metaStr}${status}`);
    if (root.description) {
      console.log(`    ${root.description.substring(0, 60)}`);
    }

    for (let j = 0; j < root.children.length; j++) {
      renderTree(root.children[j], '', j === root.children.length - 1);
    }

    if (i < roots.length - 1) console.log('');
  }

  console.log('');

  // Summary
  const total = departments.length;
  const active = departments.filter(d => d.is_active).length;
  const totalAgents = Object.values(agentCounts).reduce((a, b) => a + b, 0);
  const totalCaps = Object.values(capCounts).reduce((a, b) => a + b, 0);

  console.log(`  Summary: ${total} departments (${active} active), ${totalAgents} agent assignments, ${totalCaps} capabilities`);
  console.log('='.repeat(70) + '\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
