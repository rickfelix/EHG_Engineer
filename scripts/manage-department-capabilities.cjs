#!/usr/bin/env node
/**
 * manage-department-capabilities.cjs - Add/remove/list department capabilities
 * SD-LEO-FIX-ORG-STRUCTURE-CLI-001
 *
 * Usage:
 *   node scripts/manage-department-capabilities.cjs --add --department-id <UUID> --name <name> [--description <desc>]
 *   node scripts/manage-department-capabilities.cjs --remove --department-id <UUID> --name <name>
 *   node scripts/manage-department-capabilities.cjs --list --department-id <UUID>
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
    if (args[i] === '--add') parsed.action = 'add';
    else if (args[i] === '--remove') parsed.action = 'remove';
    else if (args[i] === '--list') parsed.action = 'list';
    else if (args[i] === '--department-id' && args[i + 1]) parsed.departmentId = args[++i];
    else if (args[i] === '--name' && args[i + 1]) parsed.name = args[++i];
    else if (args[i] === '--description' && args[i + 1]) parsed.description = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') parsed.help = true;
  }
  return parsed;
}

function showUsage() {
  console.log(`
Usage:
  node scripts/manage-department-capabilities.cjs --add --department-id <UUID> --name <name> [--description <desc>]
  node scripts/manage-department-capabilities.cjs --remove --department-id <UUID> --name <name>
  node scripts/manage-department-capabilities.cjs --list --department-id <UUID>

Options:
  --add             Add a capability to a department
  --remove          Remove a capability from a department
  --list            List all capabilities for a department (includes inherited)
  --department-id   Department UUID
  --name            Capability name
  --description     Capability description (optional, for --add)
  --help, -h        Show this help message
`);
}

async function getDeptName(departmentId) {
  const { data } = await supabase
    .from('departments')
    .select('name')
    .eq('id', departmentId)
    .single();
  return data ? data.name : departmentId;
}

async function addCapability(departmentId, name, description) {
  const { data, error } = await supabase.rpc('add_department_capability', {
    p_department_id: departmentId,
    p_capability_name: name,
    p_description: description || null
  });

  if (error) {
    console.error('Error adding capability:', error.message);
    process.exit(1);
  }

  const deptName = await getDeptName(departmentId);
  console.log(`\n  Capability "${name}" added to ${deptName}`);
  if (description) console.log(`  Description: ${description}`);
  console.log(`  ID: ${data}\n`);
}

async function removeCapability(departmentId, name) {
  const { data, error } = await supabase.rpc('remove_department_capability', {
    p_department_id: departmentId,
    p_capability_name: name
  });

  if (error) {
    console.error('Error removing capability:', error.message);
    process.exit(1);
  }

  const deptName = await getDeptName(departmentId);
  if (data) {
    console.log(`\n  Capability "${name}" removed from ${deptName}\n`);
  } else {
    console.log(`\n  Capability "${name}" was not found in ${deptName}\n`);
  }
}

async function listCapabilities(departmentId) {
  // Query direct capabilities for this department
  const { data: direct, error: directErr } = await supabase
    .from('department_capabilities')
    .select('capability_name, description')
    .eq('department_id', departmentId);

  if (directErr) {
    console.error('Error listing capabilities:', directErr.message);
    process.exit(1);
  }

  // Get parent chain for inherited capabilities
  const { data: dept } = await supabase
    .from('departments')
    .select('hierarchy_path')
    .eq('id', departmentId)
    .single();

  let inherited = [];
  if (dept && dept.hierarchy_path && dept.hierarchy_path.includes('.')) {
    const parts = dept.hierarchy_path.split('.');
    const parentSlugs = parts.slice(0, -1);
    // Walk up the hierarchy and collect ancestor capabilities
    for (let i = parentSlugs.length; i > 0; i--) {
      const ancestorPath = parentSlugs.slice(0, i).join('.');
      const { data: ancestor } = await supabase
        .from('departments')
        .select('id, name')
        .eq('hierarchy_path', ancestorPath)
        .eq('is_active', true)
        .single();
      if (ancestor) {
        const { data: caps } = await supabase
          .from('department_capabilities')
          .select('capability_name, description')
          .eq('department_id', ancestor.id);
        if (caps) {
          inherited.push(...caps.map(c => ({ ...c, inherited_from: ancestor.name })));
        }
      }
    }
  }

  const deptName = await getDeptName(departmentId);

  console.log('\n' + '='.repeat(70));
  console.log(`  CAPABILITIES: ${deptName}`);
  console.log('='.repeat(70));

  const all = [
    ...(direct || []).map(c => ({ ...c, source: 'direct' })),
    ...inherited.map(c => ({ ...c, source: 'inherited' }))
  ];

  if (all.length === 0) {
    console.log('  No capabilities found for this department.');
  } else {
    const nameW = 25;
    const descW = 30;
    const srcW = 12;

    console.log('  ' + 'Name'.padEnd(nameW) + 'Description'.padEnd(descW) + 'Source'.padEnd(srcW));
    console.log('  ' + '-'.repeat(nameW + descW + srcW));

    for (const cap of all) {
      const desc = (cap.description || '').substring(0, descW - 1);
      console.log(
        '  ' +
        (cap.capability_name || '').substring(0, nameW - 1).padEnd(nameW) +
        desc.padEnd(descW) +
        cap.source.padEnd(srcW)
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

  if (!args.departmentId) {
    console.error('Error: --department-id is required');
    process.exit(1);
  }

  if (args.action === 'list') {
    await listCapabilities(args.departmentId);
  } else if (args.action === 'add') {
    if (!args.name) {
      console.error('Error: --name is required for --add');
      process.exit(1);
    }
    await addCapability(args.departmentId, args.name, args.description);
  } else if (args.action === 'remove') {
    if (!args.name) {
      console.error('Error: --name is required for --remove');
      process.exit(1);
    }
    await removeCapability(args.departmentId, args.name);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
