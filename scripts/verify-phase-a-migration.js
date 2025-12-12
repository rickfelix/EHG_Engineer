#!/usr/bin/env node

/**
 * Phase A Migration Final Verification
 *
 * Verifies all components migrated in Kochel Integration Phase A:
 * - Lifecycle configuration tables
 * - Strategic Directives hierarchy
 * - venture_artifacts quality columns
 * - Quality helper functions
 * - CrewAI contracts in leo_interfaces
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

const EXPECTED_COUNTS = {
  lifecycle_stages: 25,
  lifecycle_phases: 6,
  advisory_checkpoints: 3,
  vision_transition_sds: 12,
  crewai_contracts: 4
};

const REQUIRED_QUALITY_COLUMNS = [
  'quality_score',
  'validation_status',
  'validated_at',
  'validated_by'
];

const CREWAI_CONTRACT_IDS = [
  'kochel-prd-writer',
  'kochel-qa-validator',
  'kochel-code-reviewer',
  'kochel-test-engineer'
];

async function verifyMigration() {
  const client = await createDatabaseClient('engineer', { verify: false });
  const results = {
    timestamp: new Date().toISOString(),
    database: 'dedlbzhpgkmetvhbkyzq',
    checks: [],
    errors: [],
    warnings: [],
    overall_status: 'PENDING'
  };

  try {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     PHASE A MIGRATION VERIFICATION - FINAL ASSESSMENT      ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // CHECK 1: Lifecycle Stages
    console.log('📋 CHECK 1: Lifecycle Stage Configuration');
    console.log('─────────────────────────────────────────');
    const stagesResult = await client.query(`
      SELECT
        COUNT(*) as total_stages,
        COUNT(DISTINCT phase_id) as unique_phases,
        COUNT(CASE WHEN gate_criteria IS NULL THEN 1 END) as missing_criteria,
        COUNT(CASE WHEN stage_order IS NULL THEN 1 END) as missing_order
      FROM lifecycle_stage_config
    `);

    const stages = stagesResult.rows[0];
    console.log(`   Total stages: ${stages.total_stages} (expected: ${EXPECTED_COUNTS.lifecycle_stages})`);
    console.log(`   Unique phases: ${stages.unique_phases} (expected: ${EXPECTED_COUNTS.lifecycle_phases})`);
    console.log(`   Missing criteria: ${stages.missing_criteria}`);
    console.log(`   Missing order: ${stages.missing_order}`);

    const stagesCheck = {
      name: 'Lifecycle Stages',
      status: stages.total_stages == EXPECTED_COUNTS.lifecycle_stages &&
              stages.unique_phases == EXPECTED_COUNTS.lifecycle_phases &&
              stages.missing_criteria == 0 &&
              stages.missing_order == 0 ? 'PASS' : 'FAIL',
      details: stages
    };

    results.checks.push(stagesCheck);
    if (stagesCheck.status === 'PASS') {
      console.log('   ✅ PASS\n');
    } else {
      console.log('   ❌ FAIL\n');
      results.errors.push('Lifecycle stages count or integrity issue');
    }

    // CHECK 2: Lifecycle Phases
    console.log('📋 CHECK 2: Lifecycle Phases');
    console.log('─────────────────────────────────────────');
    const phasesResult = await client.query(`
      SELECT
        COUNT(*) as total_phases,
        COUNT(CASE WHEN phase_order IS NULL THEN 1 END) as missing_order,
        array_agg(phase_name ORDER BY phase_order) as phase_names
      FROM lifecycle_phases
    `);

    const phases = phasesResult.rows[0];
    console.log(`   Total phases: ${phases.total_phases} (expected: ${EXPECTED_COUNTS.lifecycle_phases})`);
    console.log(`   Missing order: ${phases.missing_order}`);
    console.log(`   Phase sequence: ${phases.phase_names.join(' → ')}`);

    const phasesCheck = {
      name: 'Lifecycle Phases',
      status: phases.total_phases == EXPECTED_COUNTS.lifecycle_phases &&
              phases.missing_order == 0 ? 'PASS' : 'FAIL',
      details: phases
    };

    results.checks.push(phasesCheck);
    if (phasesCheck.status === 'PASS') {
      console.log('   ✅ PASS\n');
    } else {
      console.log('   ❌ FAIL\n');
      results.errors.push('Lifecycle phases count or integrity issue');
    }

    // CHECK 3: Advisory Checkpoints
    console.log('📋 CHECK 3: Advisory Checkpoints');
    console.log('─────────────────────────────────────────');
    const checkpointsResult = await client.query(`
      SELECT
        COUNT(*) as total_checkpoints,
        COUNT(CASE WHEN trigger_conditions IS NULL THEN 1 END) as missing_conditions,
        array_agg(checkpoint_name ORDER BY checkpoint_name) as checkpoint_names
      FROM advisory_checkpoints
    `);

    const checkpoints = checkpointsResult.rows[0];
    console.log(`   Total checkpoints: ${checkpoints.total_checkpoints} (expected: ${EXPECTED_COUNTS.advisory_checkpoints})`);
    console.log(`   Missing conditions: ${checkpoints.missing_conditions}`);
    console.log(`   Checkpoints: ${checkpoints.checkpoint_names.join(', ')}`);

    const checkpointsCheck = {
      name: 'Advisory Checkpoints',
      status: checkpoints.total_checkpoints == EXPECTED_COUNTS.advisory_checkpoints &&
              checkpoints.missing_conditions == 0 ? 'PASS' : 'FAIL',
      details: checkpoints
    };

    results.checks.push(checkpointsCheck);
    if (checkpointsCheck.status === 'PASS') {
      console.log('   ✅ PASS\n');
    } else {
      console.log('   ❌ FAIL\n');
      results.errors.push('Advisory checkpoints count or integrity issue');
    }

    // CHECK 4: Vision Transition SD Hierarchy
    console.log('📋 CHECK 4: Vision Transition SD Hierarchy');
    console.log('─────────────────────────────────────────');
    const sdsResult = await client.query(`
      WITH RECURSIVE sd_tree AS (
        SELECT
          sd_id,
          title,
          parent_sd_id,
          0 as depth,
          ARRAY[sd_id] as path
        FROM strategic_directives
        WHERE sd_id = 'SD-VT-001'

        UNION ALL

        SELECT
          sd.sd_id,
          sd.title,
          sd.parent_sd_id,
          st.depth + 1,
          st.path || sd.sd_id
        FROM strategic_directives sd
        INNER JOIN sd_tree st ON sd.parent_sd_id = st.sd_id
      )
      SELECT
        COUNT(*) as total_sds,
        COUNT(CASE WHEN depth = 0 THEN 1 END) as root_sds,
        COUNT(CASE WHEN depth = 1 THEN 1 END) as child_sds,
        COUNT(CASE WHEN depth = 2 THEN 1 END) as grandchild_sds,
        MAX(depth) as max_depth
      FROM sd_tree
    `);

    const sds = sdsResult.rows[0];
    console.log(`   Total SDs in hierarchy: ${sds.total_sds} (expected: ${EXPECTED_COUNTS.vision_transition_sds})`);
    console.log(`   Root (SD-VT-001): ${sds.root_sds}`);
    console.log(`   Children: ${sds.child_sds} (expected: 5)`);
    console.log(`   Grandchildren: ${sds.grandchild_sds} (expected: 6)`);
    console.log(`   Max depth: ${sds.max_depth}`);

    const sdsCheck = {
      name: 'Vision Transition SDs',
      status: sds.total_sds == EXPECTED_COUNTS.vision_transition_sds &&
              sds.root_sds == 1 &&
              sds.child_sds == 5 &&
              sds.grandchild_sds == 6 &&
              sds.max_depth == 2 ? 'PASS' : 'FAIL',
      details: sds
    };

    results.checks.push(sdsCheck);
    if (sdsCheck.status === 'PASS') {
      console.log('   ✅ PASS\n');
    } else {
      console.log('   ❌ FAIL\n');
      results.errors.push('Vision Transition SD hierarchy incomplete or malformed');
    }

    // CHECK 5: venture_artifacts Quality Columns
    console.log('📋 CHECK 5: venture_artifacts Quality Columns');
    console.log('─────────────────────────────────────────');
    const columnsResult = await client.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'venture_artifacts'
        AND column_name IN ('quality_score', 'validation_status', 'validated_at', 'validated_by')
      ORDER BY column_name
    `);

    const columns = columnsResult.rows;
    console.log(`   Columns found: ${columns.length} (expected: ${REQUIRED_QUALITY_COLUMNS.length})`);

    const missingColumns = REQUIRED_QUALITY_COLUMNS.filter(
      col => !columns.find(c => c.column_name === col)
    );

    if (missingColumns.length > 0) {
      console.log(`   ❌ Missing columns: ${missingColumns.join(', ')}`);
      results.errors.push(`Missing quality columns: ${missingColumns.join(', ')}`);
    }

    columns.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

    const columnsCheck = {
      name: 'venture_artifacts Quality Columns',
      status: columns.length === REQUIRED_QUALITY_COLUMNS.length ? 'PASS' : 'FAIL',
      details: { columns_found: columns.length, columns: columns }
    };

    results.checks.push(columnsCheck);
    if (columnsCheck.status === 'PASS') {
      console.log('   ✅ PASS\n');
    } else {
      console.log('   ❌ FAIL\n');
    }

    // CHECK 6: Quality Helper Functions
    console.log('📋 CHECK 6: Quality Helper Functions');
    console.log('─────────────────────────────────────────');
    const functionsResult = await client.query(`
      SELECT
        proname as function_name,
        pg_get_functiondef(oid) as definition
      FROM pg_proc
      WHERE proname IN ('check_venture_quality_gate', 'get_artifacts_pending_validation')
      ORDER BY proname
    `);

    const functions = functionsResult.rows;
    console.log(`   Functions found: ${functions.length} (expected: 2)`);

    functions.forEach(func => {
      console.log(`   - ${func.function_name}`);
    });

    // Test check_venture_quality_gate function
    let gateTestPassed = false;
    try {
      const gateTestResult = await client.query(`
        SELECT check_venture_quality_gate(0.7) as result
      `);
      gateTestPassed = gateTestResult.rows[0].result === true;
      console.log(`   - Gate test (0.7): ${gateTestPassed ? '✅ TRUE' : '❌ FALSE'}`);

      const gateTestResult2 = await client.query(`
        SELECT check_venture_quality_gate(0.5) as result
      `);
      const gateTestPassed2 = gateTestResult2.rows[0].result === false;
      console.log(`   - Gate test (0.5): ${gateTestPassed2 ? '✅ FALSE' : '❌ TRUE (should be FALSE)'}`);
      gateTestPassed = gateTestPassed && gateTestPassed2;
    } catch (err) {
      console.log(`   ❌ Gate test error: ${err.message}`);
      results.errors.push(`Quality gate function test failed: ${err.message}`);
    }

    const functionsCheck = {
      name: 'Quality Helper Functions',
      status: functions.length === 2 && gateTestPassed ? 'PASS' : 'FAIL',
      details: { functions_found: functions.length, gate_test_passed: gateTestPassed }
    };

    results.checks.push(functionsCheck);
    if (functionsCheck.status === 'PASS') {
      console.log('   ✅ PASS\n');
    } else {
      console.log('   ❌ FAIL\n');
      if (functions.length !== 2) {
        results.errors.push('Missing quality helper functions');
      }
    }

    // CHECK 7: CrewAI Contracts in leo_interfaces
    console.log('📋 CHECK 7: CrewAI Contracts in leo_interfaces');
    console.log('─────────────────────────────────────────');
    const contractsResult = await client.query(`
      SELECT
        interface_id,
        interface_type,
        interface_name,
        spec_version,
        jsonb_object_keys(contract_spec) as spec_keys
      FROM leo_interfaces
      WHERE interface_id = ANY($1)
      ORDER BY interface_id
    `, [CREWAI_CONTRACT_IDS]);

    const contracts = contractsResult.rows;
    console.log(`   Contracts found: ${contracts.length} (expected: ${EXPECTED_COUNTS.crewai_contracts})`);

    const missingContracts = CREWAI_CONTRACT_IDS.filter(
      id => !contracts.find(c => c.interface_id === id)
    );

    if (missingContracts.length > 0) {
      console.log(`   ❌ Missing contracts: ${missingContracts.join(', ')}`);
      results.errors.push(`Missing CrewAI contracts: ${missingContracts.join(', ')}`);
    }

    // Detailed validation of each contract
    const requiredSpecKeys = ['role', 'goal', 'backstory', 'input_schema', 'output_schema'];

    for (const contractId of CREWAI_CONTRACT_IDS) {
      const detailResult = await client.query(`
        SELECT
          interface_id,
          interface_name,
          contract_spec,
          jsonb_object_keys(contract_spec) as keys
        FROM leo_interfaces
        WHERE interface_id = $1
      `, [contractId]);

      if (detailResult.rows.length === 0) {
        console.log(`   ❌ ${contractId}: NOT FOUND`);
        continue;
      }

      const contract = detailResult.rows[0];
      const spec = contract.contract_spec;

      console.log(`   - ${contractId} (${contract.interface_name})`);

      // Check required top-level keys
      const missingKeys = requiredSpecKeys.filter(key => !(key in spec));
      if (missingKeys.length > 0) {
        console.log(`     ⚠️  Missing keys: ${missingKeys.join(', ')}`);
        results.warnings.push(`${contractId} missing keys: ${missingKeys.join(', ')}`);
      }

      // Validate input/output schemas
      if (spec.input_schema) {
        const inputType = spec.input_schema.type || 'unknown';
        const inputProps = spec.input_schema.properties ? Object.keys(spec.input_schema.properties).length : 0;
        console.log(`     Input: ${inputType} (${inputProps} properties)`);
      } else {
        console.log('     ⚠️  Input schema missing');
      }

      if (spec.output_schema) {
        const outputType = spec.output_schema.type || 'unknown';
        const outputProps = spec.output_schema.properties ? Object.keys(spec.output_schema.properties).length : 0;
        console.log(`     Output: ${outputType} (${outputProps} properties)`);
      } else {
        console.log('     ⚠️  Output schema missing');
      }
    }

    const contractsCheck = {
      name: 'CrewAI Contracts',
      status: contracts.length === EXPECTED_COUNTS.crewai_contracts &&
              missingContracts.length === 0 ? 'PASS' : 'FAIL',
      details: { contracts_found: contracts.length, missing: missingContracts }
    };

    results.checks.push(contractsCheck);
    if (contractsCheck.status === 'PASS') {
      console.log('   ✅ PASS\n');
    } else {
      console.log('   ❌ FAIL\n');
    }

    // CHECK 8: Constraint Violations and Orphaned Records
    console.log('📋 CHECK 8: Constraint Violations & Orphaned Records');
    console.log('─────────────────────────────────────────');

    // Check for lifecycle stages with invalid phase_id
    const orphanedStagesResult = await client.query(`
      SELECT COUNT(*) as orphaned_count
      FROM lifecycle_stage_config lsc
      LEFT JOIN lifecycle_phases lp ON lsc.phase_id = lp.phase_id
      WHERE lp.phase_id IS NULL
    `);

    const orphanedStages = orphanedStagesResult.rows[0].orphaned_count;
    console.log(`   Orphaned lifecycle stages: ${orphanedStages}`);

    // Check for Vision Transition SDs with invalid parent_sd_id
    const orphanedSdsResult = await client.query(`
      WITH vision_sds AS (
        SELECT sd_id FROM strategic_directives
        WHERE sd_id LIKE 'SD-VT-%'
      )
      SELECT COUNT(*) as orphaned_count
      FROM strategic_directives sd
      WHERE sd.sd_id IN (SELECT sd_id FROM vision_sds)
        AND sd.parent_sd_id IS NOT NULL
        AND sd.parent_sd_id NOT IN (SELECT sd_id FROM vision_sds)
    `);

    const orphanedSds = orphanedSdsResult.rows[0].orphaned_count;
    console.log(`   Orphaned Vision Transition SDs: ${orphanedSds}`);

    const constraintsCheck = {
      name: 'Constraints & Orphaned Records',
      status: orphanedStages == 0 && orphanedSds == 0 ? 'PASS' : 'FAIL',
      details: { orphaned_stages: orphanedStages, orphaned_sds: orphanedSds }
    };

    results.checks.push(constraintsCheck);
    if (constraintsCheck.status === 'PASS') {
      console.log('   ✅ PASS\n');
    } else {
      console.log('   ❌ FAIL\n');
      if (orphanedStages > 0) {
        results.errors.push(`${orphanedStages} lifecycle stages have invalid phase_id`);
      }
      if (orphanedSds > 0) {
        results.errors.push(`${orphanedSds} Vision Transition SDs have invalid parent_sd_id`);
      }
    }

    // FINAL ASSESSMENT
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    FINAL ASSESSMENT                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const totalChecks = results.checks.length;
    const passedChecks = results.checks.filter(c => c.status === 'PASS').length;
    const failedChecks = totalChecks - passedChecks;

    console.log(`Total checks: ${totalChecks}`);
    console.log(`Passed: ${passedChecks}`);
    console.log(`Failed: ${failedChecks}`);
    console.log(`Warnings: ${results.warnings.length}`);
    console.log(`Errors: ${results.errors.length}\n`);

    if (failedChecks === 0 && results.errors.length === 0) {
      results.overall_status = 'PASS';
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║                     ✅ MIGRATION PASS                      ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      console.log('All Phase A migration components verified successfully.');
      console.log('Database is ready for Phase B (Stage Transition Schema).\n');
    } else {
      results.overall_status = 'FAIL';
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║                     ❌ MIGRATION FAIL                      ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      console.log('Issues detected:\n');
      results.errors.forEach((err, i) => {
        console.log(`${i + 1}. ${err}`);
      });
      console.log('');
    }

    if (results.warnings.length > 0) {
      console.log('Warnings (non-blocking):\n');
      results.warnings.forEach((warn, i) => {
        console.log(`${i + 1}. ${warn}`);
      });
      console.log('');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    results.errors.push(`Fatal error: ${error.message}`);
    results.overall_status = 'FAIL';
  } finally {
    await client.end();
  }

  return results;
}

// Run verification
verifyMigration()
  .then(results => {
    // Write results to file for chairman review
    const fs = require('fs');
    const resultsPath = '/mnt/c/_EHG/EHG_Engineer/logs/phase-a-verification-results.json';
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`📄 Detailed results written to: ${resultsPath}\n`);

    process.exit(results.overall_status === 'PASS' ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
