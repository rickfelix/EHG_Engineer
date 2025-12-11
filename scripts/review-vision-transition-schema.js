#!/usr/bin/env node

import { createDatabaseClient } from '../lib/supabase-connection.js';

async function main() {
  const client = await createDatabaseClient('engineer', { verify: false });

  console.log('=== SCHEMA REVIEW: SD-VISION-TRANSITION-001D4 ===');
  console.log('Phase 4 Stages: THE BLUEPRINT (Stages 13-16)\n');

  // 1. Check lifecycle_stage_config entries
  console.log('=== 1. LIFECYCLE_STAGE_CONFIG: STAGES 13-16 ===\n');
  const stagesResult = await client.query(`
    SELECT
      stage_number,
      stage_name,
      description,
      phase_number,
      phase_name,
      work_type,
      sd_required,
      sd_suffix,
      advisory_enabled,
      depends_on,
      required_artifacts
    FROM lifecycle_stage_config
    WHERE stage_number BETWEEN 13 AND 16
    ORDER BY stage_number
  `);

  if (stagesResult.rows.length === 0) {
    console.log('⚠️  NO ENTRIES FOUND for stages 13-16');
  } else {
    stagesResult.rows.forEach(row => {
      console.log(`Stage ${row.stage_number}: ${row.stage_name}`);
      console.log(`  Phase: ${row.phase_number} - ${row.phase_name}`);
      console.log(`  Work Type: ${row.work_type}`);
      console.log(`  SD Required: ${row.sd_required}`);
      console.log(`  SD Suffix: ${row.sd_suffix || 'N/A'}`);
      console.log(`  Advisory: ${row.advisory_enabled}`);
      console.log(`  Depends On: ${JSON.stringify(row.depends_on || [])}`);
      console.log(`  Required Artifacts: ${JSON.stringify(row.required_artifacts || [])}`);
      console.log(`  Description: ${row.description}`);
      console.log('');
    });
  }

  // 2. Check venture_artifacts supported types
  console.log('\n=== 2. VENTURE_ARTIFACTS: SUPPORTED ARTIFACT TYPES ===\n');
  const constraintResult = await client.query(`
    SELECT pg_get_constraintdef(oid) as definition
    FROM pg_constraint
    WHERE conrelid = 'venture_artifacts'::regclass
      AND contype = 'c'
      AND conname LIKE '%artifact_type%'
  `);

  if (constraintResult.rows.length > 0) {
    console.log('Constraint Definition:');
    console.log(constraintResult.rows[0].definition);

    // Parse out the artifact types
    const def = constraintResult.rows[0].definition;
    const match = def.match(/ARRAY\[(.*?)\]/);
    if (match) {
      const types = match[1].split(',').map(t => t.trim().replace(/'/g, '').replace(/::character varying/g, ''));
      console.log('\nSupported Types:');
      types.forEach(t => console.log(`  - ${t}`));

      // Check for required types
      const requiredTypes = [
        'tech_stack_decision',
        'data_model',
        'erd_diagram',
        'user_story_pack',
        'api_contract',
        'schema_spec'
      ];

      console.log('\nRequired Types for Stages 13-16:');
      requiredTypes.forEach(reqType => {
        const found = types.includes(reqType);
        console.log(`  ${found ? '✅' : '❌'} ${reqType}`);
      });
    }
  } else {
    console.log('⚠️  No artifact_type constraint found');
  }

  // 3. Check venture_stage_work schema
  console.log('\n=== 3. VENTURE_STAGE_WORK: SCHEMA ===\n');
  const stageWorkResult = await client.query(`
    SELECT
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_name = 'venture_stage_work'
    ORDER BY ordinal_position
  `);

  console.log('Columns:');
  stageWorkResult.rows.forEach(col => {
    console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
  });

  // Check for necessary columns
  const necessaryColumns = ['venture_id', 'lifecycle_stage', 'sd_id', 'stage_status', 'work_type'];
  console.log('\nNecessary Columns Check:');
  necessaryColumns.forEach(colName => {
    const found = stageWorkResult.rows.some(col => col.column_name === colName);
    console.log(`  ${found ? '✅' : '❌'} ${colName}`);
  });

  // 4. Check RLS policies
  console.log('\n=== 4. RLS POLICIES ON VENTURE TABLES ===\n');
  const rlsResult = await client.query(`
    SELECT
      tablename,
      policyname,
      cmd,
      roles
    FROM pg_policies
    WHERE tablename IN ('venture_artifacts', 'venture_stage_work', 'ventures')
    ORDER BY tablename, policyname
  `);

  if (rlsResult.rows.length > 0) {
    let currentTable = '';
    rlsResult.rows.forEach(policy => {
      if (policy.tablename !== currentTable) {
        console.log(`\nTable: ${policy.tablename}`);
        currentTable = policy.tablename;
      }
      console.log(`  Policy: ${policy.policyname}`);
      console.log(`    Command: ${policy.cmd}`);
      console.log(`    Roles: ${JSON.stringify(policy.roles)}`);
    });
  } else {
    console.log('⚠️  No RLS policies found on venture tables');
  }

  // 5. Check indexes
  console.log('\n=== 5. INDEXES ON VENTURE TABLES ===\n');
  const indexResult = await client.query(`
    SELECT
      tablename,
      indexname,
      indexdef
    FROM pg_indexes
    WHERE tablename IN ('venture_artifacts', 'venture_stage_work')
      AND schemaname = 'public'
    ORDER BY tablename, indexname
  `);

  if (indexResult.rows.length > 0) {
    let currentTable = '';
    indexResult.rows.forEach(idx => {
      if (idx.tablename !== currentTable) {
        console.log(`\nTable: ${idx.tablename}`);
        currentTable = idx.tablename;
      }
      console.log(`  ${idx.indexname}`);
    });
  }

  // 6. Check foreign key relationships
  console.log('\n=== 6. FOREIGN KEY RELATIONSHIPS ===\n');
  const fkResult = await client.query(`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('venture_artifacts', 'venture_stage_work')
    ORDER BY tc.table_name, kcu.column_name
  `);

  if (fkResult.rows.length > 0) {
    fkResult.rows.forEach(fk => {
      console.log(`${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });
  }

  // 7. Summary and Recommendations
  console.log('\n=== 7. SUMMARY & RECOMMENDATIONS ===\n');

  const recommendations = [];

  if (stagesResult.rows.length < 4) {
    recommendations.push({
      priority: 'HIGH',
      area: 'lifecycle_stage_config',
      issue: `Only ${stagesResult.rows.length} stages found for stages 13-16`,
      action: 'Add missing stage configurations for Phase 4 (THE BLUEPRINT)'
    });
  }

  // Check if all required artifact types exist
  const artifactTypesNeeded = [
    'tech_stack_decision',
    'data_model',
    'erd_diagram',
    'user_story_pack',
    'api_contract',
    'schema_spec'
  ];

  if (constraintResult.rows.length > 0) {
    const def = constraintResult.rows[0].definition;
    const match = def.match(/ARRAY\[(.*?)\]/);
    if (match) {
      const existingTypes = match[1].split(',').map(t => t.trim().replace(/'/g, '').replace(/::character varying/g, ''));
      const missingTypes = artifactTypesNeeded.filter(t => !existingTypes.includes(t));

      if (missingTypes.length > 0) {
        recommendations.push({
          priority: 'HIGH',
          area: 'venture_artifacts',
          issue: `Missing artifact types: ${missingTypes.join(', ')}`,
          action: 'Update artifact_type CHECK constraint to include all Phase 4 artifact types'
        });
      }
    }
  }

  if (recommendations.length === 0) {
    console.log('✅ Schema appears ready for SD-VISION-TRANSITION-001D4');
    console.log('   All required tables, columns, and artifact types are present.');
  } else {
    console.log('⚠️  Issues Found:\n');
    recommendations.forEach((rec, idx) => {
      console.log(`${idx + 1}. [${rec.priority}] ${rec.area}`);
      console.log(`   Issue: ${rec.issue}`);
      console.log(`   Action: ${rec.action}`);
      console.log('');
    });
  }

  await client.end();
}

main().catch(console.error);
