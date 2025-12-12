#!/usr/bin/env node

import { createDatabaseClient } from './lib/supabase-connection.js';

async function validateD6Schema() {
  const client = await createDatabaseClient('engineer', { verify: false });

  console.log('=== VERIFYING D6 REQUIREMENTS (STAGES 21-25) ===\n');

  // Check lifecycle_stage_config for stages 21-25
  console.log('1. Checking lifecycle_stage_config for stages 21-25:\n');
  const stages = await client.query(`
    SELECT stage_number, stage_name, phase_name, work_type, required_artifacts
    FROM lifecycle_stage_config
    WHERE stage_number BETWEEN 21 AND 25
    ORDER BY stage_number
  `);

  if (stages.rows.length === 0) {
    console.log('❌ MISSING: No stages 21-25 found in lifecycle_stage_config\n');
  } else {
    stages.rows.forEach(stage => {
      console.log(`✅ Stage ${stage.stage_number}: ${stage.stage_name}`);
      console.log(`   Phase: ${stage.phase_name}`);
      console.log(`   Work Type: ${stage.work_type}`);
      console.log(`   Required Artifacts: ${stage.required_artifacts || 'none'}`);
      console.log('');
    });
  }

  // Check artifact_type constraints
  console.log('2. Checking venture_artifacts artifact_type constraints:\n');
  const artifactTypes = await client.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) as definition
    FROM pg_constraint
    WHERE conrelid = 'venture_artifacts'::regclass
    AND contype = 'c'
    AND conname LIKE '%artifact_type%'
  `);

  if (artifactTypes.rows.length > 0) {
    artifactTypes.rows.forEach(constraint => {
      console.log(`   ${constraint.conname}:`);
      console.log(`   ${constraint.definition}`);
      console.log('');
    });
  } else {
    console.log('⚠️  No CHECK constraint on artifact_type - all values allowed\n');
  }

  // Check actual artifact types in use
  console.log('3. Checking existing artifact types in venture_artifacts:\n');
  const existingTypes = await client.query(`
    SELECT DISTINCT artifact_type, COUNT(*) as count
    FROM venture_artifacts
    GROUP BY artifact_type
    ORDER BY artifact_type
  `);

  if (existingTypes.rows.length > 0) {
    existingTypes.rows.forEach(type => {
      console.log(`   - ${type.artifact_type} (used ${type.count} times)`);
    });
  } else {
    console.log('   (no artifacts created yet)');
  }
  console.log('');

  // Check RLS policies
  console.log('4. Checking RLS policies for venture tables:\n');
  const rlsPolicies = await client.query(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd
    FROM pg_policies
    WHERE tablename IN ('venture_stage_work', 'venture_artifacts', 'assumption_sets', 'lifecycle_stage_config')
    ORDER BY tablename, policyname
  `);

  if (rlsPolicies.rows.length > 0) {
    let currentTable = '';
    rlsPolicies.rows.forEach(policy => {
      if (policy.tablename !== currentTable) {
        console.log(`\n   Table: ${policy.tablename}`);
        currentTable = policy.tablename;
      }
      const rolesStr = Array.isArray(policy.roles) ? policy.roles.join(', ') : String(policy.roles);
      console.log(`     ✅ ${policy.policyname} (FOR ${policy.cmd}, ROLES: ${rolesStr})`);
    });
  } else {
    console.log('   ⚠️  No RLS policies found');
  }
  console.log('');

  // Check indexes
  console.log('5. Checking indexes for common queries:\n');
  const indexes = await client.query(`
    SELECT
      tablename,
      indexname,
      indexdef
    FROM pg_indexes
    WHERE tablename IN ('venture_stage_work', 'venture_artifacts', 'assumption_sets', 'lifecycle_stage_config')
    AND schemaname = 'public'
    ORDER BY tablename, indexname
  `);

  indexes.rows.forEach(idx => {
    console.log(`   ${idx.tablename}.${idx.indexname}`);
    console.log(`     ${idx.indexdef}`);
    console.log('');
  });

  await client.end();
}

validateD6Schema().catch(console.error);
