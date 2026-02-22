#!/usr/bin/env node
/**
 * create-department.js - Interactive department creation wizard
 * SD-LEO-FIX-ORG-STRUCTURE-CLI-001
 *
 * Usage:
 *   node scripts/create-department.js
 *   npm run dept:create
 */
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'readline';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    // Fetch existing departments for validation and parent selection
    const { data: departments, error } = await supabase
      .from('departments')
      .select('id, name, slug, hierarchy_path, is_active')
      .eq('is_active', true)
      .order('hierarchy_path');

    if (error) {
      console.error('Error connecting to database:', error.message);
      process.exit(1);
    }

    const existingNames = new Set((departments || []).map(d => d.name.toLowerCase()));
    const existingSlugs = new Set((departments || []).map(d => d.slug));

    console.log('\n' + '='.repeat(50));
    console.log('  CREATE DEPARTMENT');
    console.log('='.repeat(50) + '\n');

    // Step 1: Name
    let name;
    while (true) {
      name = (await prompt(rl, '  Department name: ')).trim();
      if (!name) { console.log('  Name is required.'); continue; }
      if (existingNames.has(name.toLowerCase())) { console.log(`  "${name}" already exists.`); continue; }
      break;
    }

    // Step 2: Slug
    const autoSlug = slugify(name);
    const slugInput = (await prompt(rl, `  Slug [${autoSlug}]: `)).trim();
    let slug = slugInput || autoSlug;
    slug = slug.replace(/[^a-z0-9_]/g, '');
    if (existingSlugs.has(slug)) {
      console.log(`  Warning: slug "${slug}" exists. Adding suffix.`);
      slug = slug + '_' + Date.now().toString(36).slice(-4);
    }

    // Step 3: Description
    const description = (await prompt(rl, '  Description (optional): ')).trim() || null;

    // Step 4: Parent department
    let parentId = null;
    let parentPath = null;
    if (departments && departments.length > 0) {
      console.log('\n  Available parents:');
      console.log('    0. None (root department)');
      departments.forEach((d, i) => {
        const indent = d.hierarchy_path ? '    ' + d.hierarchy_path.replace(/[^.]/g, '').replace(/\./g, '  ') : '';
        console.log(`    ${i + 1}. ${indent}${d.name} (${d.slug})`);
      });
      const parentChoice = (await prompt(rl, '\n  Parent [0]: ')).trim();
      const idx = parseInt(parentChoice, 10);
      if (idx > 0 && idx <= departments.length) {
        parentId = departments[idx - 1].id;
        parentPath = departments[idx - 1].hierarchy_path;
      }
    }

    // Compute hierarchy path
    const hierarchyPath = parentPath ? `${parentPath}.${slug}` : slug;

    // Warn on deep nesting
    const depth = hierarchyPath.split('.').length;
    if (depth > 5) {
      console.log(`\n  Warning: Depth ${depth} exceeds recommended maximum of 5 levels.`);
    }

    // Step 5: Confirmation
    console.log('\n' + '='.repeat(50));
    console.log('  CONFIRM DEPARTMENT');
    console.log('='.repeat(50));
    console.log(`    Name:        ${name}`);
    console.log(`    Slug:        ${slug}`);
    console.log(`    Description: ${description || '(none)'}`);
    console.log(`    Parent:      ${parentId ? departments.find(d => d.id === parentId)?.name : '(root)'}`);
    console.log(`    Path:        ${hierarchyPath}`);
    console.log('='.repeat(50));

    const confirm = (await prompt(rl, '\n  Create? (Y/n): ')).trim().toLowerCase();
    if (confirm === 'n' || confirm === 'no') {
      console.log('  Cancelled.\n');
      rl.close();
      return;
    }

    // Insert
    const { data: inserted, error: insertErr } = await supabase
      .from('departments')
      .insert({
        name,
        slug,
        description,
        hierarchy_path: hierarchyPath,
        parent_department_id: parentId,
        is_active: true
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('\n  Error creating department:', insertErr.message);
      process.exit(1);
    }

    console.log(`\n  Department created successfully.`);
    console.log(`  ID:   ${inserted.id}`);
    console.log(`  Path: ${hierarchyPath}`);
    console.log(`\n  Run 'npm run dept:hierarchy' to see the updated tree.\n`);
  } finally {
    rl.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
