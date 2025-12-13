#!/usr/bin/env node

import { createDatabaseClient } from '../lib/supabase-connection.js';

console.log('=== VISION V2 MIGRATION VALIDATION ===\n');

const client = await createDatabaseClient('engineer', { verify: false });

try {
  // 1. Vision V2 SDs created
  console.log('1. VISION V2 SDs CREATED:');
  const v2Result = await client.query(`
    SELECT id, title, status, parent_sd_id
    FROM strategic_directives_v2
    WHERE id LIKE 'SD-VISION-V2-%'
    ORDER BY id
  `);

  console.log(`Found ${v2Result.rows.length} Vision V2 SDs:\n`);
  v2Result.rows.forEach(sd => {
    console.log(`  - ${sd.id}: ${sd.title}`);
    console.log(`    Status: ${sd.status}, Parent: ${sd.parent_sd_id || 'null'}`);
  });

  // 2. Parent-child relationships
  console.log('\n2. PARENT-CHILD RELATIONSHIPS:');
  const parent = v2Result.rows.find(sd => sd.id === 'SD-VISION-V2-000');
  const children = v2Result.rows.filter(sd => sd.id !== 'SD-VISION-V2-000');

  if (parent) {
    console.log(`  Parent SD: ${parent.id}`);
    console.log(`  Parent's parent_sd_id: ${parent.parent_sd_id || 'null'} ${!parent.parent_sd_id ? '✓' : '⚠️'}`);
  } else {
    console.log('  ⚠️ Parent SD-VISION-V2-000 not found');
  }

  const childrenWithCorrectParent = children.filter(sd => sd.parent_sd_id === 'SD-VISION-V2-000');
  console.log(`  Children (001-008) with correct parent: ${childrenWithCorrectParent.length}/${children.length} ${childrenWithCorrectParent.length === 8 ? '✓' : '⚠️'}`);

  if (childrenWithCorrectParent.length !== children.length) {
    const incorrect = children.filter(sd => sd.parent_sd_id !== 'SD-VISION-V2-000');
    console.log('  ⚠️ SDs with incorrect parent:');
    incorrect.forEach(sd => console.log(`    - ${sd.id}: parent_sd_id = ${sd.parent_sd_id}`));
  }

  // 3. Phase tracking
  console.log('\n3. PHASE TRACKING:');
  const phaseResult = await client.query(`
    SELECT sd_id, phase_name, progress, is_complete
    FROM sd_phase_tracking
    WHERE sd_id LIKE 'SD-VISION-V2-%'
    ORDER BY sd_id, phase_name
  `);

  console.log(`Found ${phaseResult.rows.length} phase tracking records`);
  if (phaseResult.rows.length > 0) {
    const bySd = {};
    phaseResult.rows.forEach(p => {
      if (!bySd[p.sd_id]) bySd[p.sd_id] = [];
      bySd[p.sd_id].push(`${p.phase_name}(${p.progress}%${p.is_complete ? ', complete' : ''})`);
    });
    Object.entries(bySd).forEach(([sd, phases]) => {
      console.log(`  ${sd}: ${phases.join(', ')}`);
    });
  } else {
    console.log('  ⚠️ No phase tracking records found for Vision V2 SDs');
  }

  // 4. Archive check
  console.log('\n4. GOVERNANCE ARCHIVE:');

  // Check if governance_archive schema exists
  const schemaResult = await client.query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name = 'governance_archive'
  `);
  console.log(`  governance_archive schema exists: ${schemaResult.rows.length > 0 ? 'Yes ✓' : 'No ⚠️'}`);

  // Check archived records in strategic_directives_v2
  const archiveCountResult = await client.query(`
    SELECT COUNT(*) as count
    FROM strategic_directives_v2
    WHERE archived = true
  `);
  console.log(`  Archived records in strategic_directives_v2: ${archiveCountResult.rows[0].count}`);

  // 5. Vision spec references
  console.log('\n5. VISION SPEC REFERENCES:');
  const specResult = await client.query(`
    SELECT id, metadata
    FROM strategic_directives_v2
    WHERE id LIKE 'SD-VISION-V2-%'
  `);

  const withSpecs = specResult.rows.filter(sd =>
    sd.metadata?.vision_spec_references &&
    sd.metadata.vision_spec_references.length > 0
  );

  console.log(`  SDs with vision_spec_references: ${withSpecs.length}/${specResult.rows.length}`);

  if (withSpecs.length > 0) {
    withSpecs.forEach(sd => {
      const refs = sd.metadata.vision_spec_references;
      console.log(`  ${sd.id}: ${Array.isArray(refs) ? refs.join(', ') : JSON.stringify(refs)}`);
    });
  } else {
    console.log('  ⚠️ No SDs have vision_spec_references populated');
  }

  // 6. Additional checks
  console.log('\n6. ADDITIONAL CHECKS:');

  // Check if any SDs have dependencies defined
  const depsResult = await client.query(`
    SELECT id, dependencies
    FROM strategic_directives_v2
    WHERE id LIKE 'SD-VISION-V2-%'
      AND dependencies IS NOT NULL
      AND jsonb_array_length(dependencies) > 0
  `);
  console.log(`  SDs with dependencies: ${depsResult.rows.length}/${v2Result.rows.length}`);
  if (depsResult.rows.length > 0) {
    depsResult.rows.forEach(sd => {
      console.log(`    ${sd.id}: ${sd.dependencies.length} dependencies`);
    });
  }

  // Check creation timestamps
  const timestampResult = await client.query(`
    SELECT id, created_at
    FROM strategic_directives_v2
    WHERE id LIKE 'SD-VISION-V2-%'
    ORDER BY created_at
    LIMIT 1
  `);
  if (timestampResult.rows.length > 0) {
    console.log(`  Migration timestamp: ${timestampResult.rows[0].created_at}`);
  }

  console.log('\n=== VALIDATION SUMMARY ===');
  console.log(`Total Vision V2 SDs: ${v2Result.rows.length}`);
  console.log('Expected: 9 (000-008)');
  console.log(`Status: ${v2Result.rows.length === 9 ? '✓ PASS' : '⚠️ FAIL'}`);
  console.log(`\nParent-child relationships: ${childrenWithCorrectParent.length === 8 ? '✓ Valid (8/8)' : '⚠️ Issues found'}`);
  console.log(`Phase tracking records: ${phaseResult.rows.length} (${phaseResult.rows.length === 0 ? '⚠️ None created yet' : '✓'})`);
  console.log(`Archived records: ${archiveCountResult.rows[0].count}`);
  console.log(`Vision spec references: ${withSpecs.length}/${specResult.rows.length} populated`);

} catch (error) {
  console.error('\n⚠️ Validation error:', error.message);
  console.error('Details:', error);
} finally {
  await client.end();
}

console.log('\n=== VALIDATION COMPLETE ===');
