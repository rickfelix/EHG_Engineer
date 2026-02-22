#!/usr/bin/env node
/**
 * list-departments.cjs - List all departments with hierarchy and agent counts
 * SD-LEO-ORCH-EHG-ORGANIZATIONAL-STRUCTURE-001-D
 */

function getClient() {
  require('dotenv').config();
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function main(supabase) {
  if (!supabase) supabase = getClient();
  const { data: departments, error } = await supabase
    .from('departments')
    .select('id, name, slug, hierarchy_path, description, parent_department_id, is_active')
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
  const { data: agentCounts, error: countError } = await supabase
    .from('department_agents')
    .select('department_id');

  if (countError) {
    console.error('Warning: Could not fetch agent counts:', countError.message);
  }

  const counts = {};
  if (agentCounts) {
    for (const row of agentCounts) {
      counts[row.department_id] = (counts[row.department_id] || 0) + 1;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('  DEPARTMENTS');
  console.log('='.repeat(80));
  console.log('');

  const nameWidth = 20;
  const slugWidth = 15;
  const pathWidth = 25;
  const countWidth = 8;
  const statusWidth = 8;

  console.log(
    '  ' +
    'Name'.padEnd(nameWidth) +
    'Slug'.padEnd(slugWidth) +
    'Hierarchy Path'.padEnd(pathWidth) +
    'Agents'.padEnd(countWidth) +
    'Active'.padEnd(statusWidth)
  );
  console.log('  ' + '-'.repeat(nameWidth + slugWidth + pathWidth + countWidth + statusWidth));

  for (const dept of departments) {
    const agentCount = counts[dept.id] || 0;
    const active = dept.is_active ? 'Yes' : 'No';

    console.log(
      '  ' +
      dept.name.substring(0, nameWidth - 1).padEnd(nameWidth) +
      dept.slug.substring(0, slugWidth - 1).padEnd(slugWidth) +
      (dept.hierarchy_path || '').substring(0, pathWidth - 1).padEnd(pathWidth) +
      String(agentCount).padEnd(countWidth) +
      active.padEnd(statusWidth)
    );
  }

  console.log('');
  console.log(`  Total: ${departments.length} department(s)`);
  console.log('='.repeat(80) + '\n');
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

module.exports = { main };
