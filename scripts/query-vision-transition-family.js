import { createDatabaseClient } from '../lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  console.log('===================================================================');
  console.log('       SD-VISION-TRANSITION-001 FAMILY STRUCTURE ANALYSIS         ');
  console.log('===================================================================\n');

  // Get parent SD
  const parentResult = await client.query(`
    SELECT
      id,
      title,
      status,
      current_phase,
      relationship_type,
      parent_sd_id,
      is_working_on,
      created_at
    FROM strategic_directives_v2
    WHERE id = 'SD-VISION-TRANSITION-001'
  `);

  if (parentResult.rows.length > 0) {
    const parent = parentResult.rows[0];
    console.log('=== PARENT SD ===\n');
    console.log('ID:                ', parent.id);
    console.log('Title:             ', parent.title);
    console.log('Status:            ', parent.status);
    console.log('Current Phase:     ', parent.current_phase);
    console.log('Relationship Type: ', parent.relationship_type);
    console.log('Parent SD ID:      ', parent.parent_sd_id || '(null - this is root)');
    console.log('Is Working On:     ', parent.is_working_on);
    console.log('Created:           ', parent.created_at);
    console.log('');
  } else {
    console.log('ERROR: Parent SD not found\n');
  }

  // Get child SDs
  const childrenResult = await client.query(`
    SELECT
      id,
      title,
      status,
      current_phase,
      relationship_type,
      parent_sd_id,
      is_working_on,
      created_at
    FROM strategic_directives_v2
    WHERE parent_sd_id = 'SD-VISION-TRANSITION-001'
    ORDER BY id
  `);

  console.log('=== CHILD SDs ===\n');

  if (childrenResult.rows.length > 0) {
    childrenResult.rows.forEach((child, idx) => {
      console.log(`--- Child #${idx + 1} ---`);
      console.log('ID:                ', child.id);
      console.log('Title:             ', child.title);
      console.log('Status:            ', child.status);
      console.log('Current Phase:     ', child.current_phase);
      console.log('Relationship Type: ', child.relationship_type);
      console.log('Parent SD ID:      ', child.parent_sd_id);
      console.log('Is Working On:     ', child.is_working_on);
      console.log('Created:           ', child.created_at);
      console.log('');
    });

    console.log(`Total child SDs: ${childrenResult.rows.length}\n`);
  } else {
    console.log('No child SDs found\n');
  }

  // Analysis
  console.log('=== ALIGNMENT ANALYSIS ===\n');

  const issues = [];

  if (parentResult.rows.length > 0) {
    const parent = parentResult.rows[0];

    // Check parent status
    if (parent.status !== 'active' && parent.status !== 'waiting') {
      issues.push(`WARNING: Parent status is '${parent.status}' - should be 'waiting' for Parent-Child Protocol`);
    }

    // Check parent relationship_type
    if (parent.relationship_type !== 'parent') {
      issues.push(`WARNING: Parent relationship_type is '${parent.relationship_type}' - should be 'parent'`);
    }

    // Check parent phase
    if (parent.current_phase !== 'EXEC_IMPLEMENTATION') {
      issues.push(`INFO: Parent current_phase is '${parent.current_phase}' - may need adjustment`);
    }
  }

  // Check children
  childrenResult.rows.forEach(child => {
    const validTypes = ['child', 'child_phase', 'child_independent'];
    if (!validTypes.includes(child.relationship_type)) {
      issues.push(`WARNING: Child ${child.id} has relationship_type '${child.relationship_type}' - should be child, child_phase, or child_independent`);
    }
  });

  if (issues.length === 0) {
    console.log('SUCCESS: No alignment issues detected\n');
  } else {
    console.log('Issues requiring attention:\n');
    issues.forEach(issue => console.log(`  - ${issue}`));
    console.log('');
  }

  // Expected structure
  console.log('=== EXPECTED PARENT-CHILD PROTOCOL STRUCTURE ===\n');
  console.log('Parent SD:');
  console.log('  - status: waiting');
  console.log('  - relationship_type: parent');
  console.log('  - current_phase: (any - orchestration only)');
  console.log('  - is_working_on: false (unless actively orchestrating)');
  console.log('');
  console.log('Child SDs:');
  console.log('  - relationship_type: child (inherits workflow) OR child_independent (own workflow)');
  console.log('  - parent_sd_id: SD-VISION-TRANSITION-001');
  console.log('  - Execute sequentially (not batch approved)');
  console.log('  - Each goes through full LEAD->PLAN->EXEC cycle');
  console.log('');

  await client.end();
})();
