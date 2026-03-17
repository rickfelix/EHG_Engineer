#!/usr/bin/env node

/**
 * Phase A Migration - Comprehensive Final Verification
 *
 * Verifies all components migrated in Kochel Integration Phase A
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

(async () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     PHASE A MIGRATION - COMPREHENSIVE FINAL VERIFICATION   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log('Database: dedlbzhpgkmetvhbkyzq (DEV)');
  console.log('Date:', new Date().toISOString());
  console.log('Verifier: Principal Database Architect\n');
  console.log('════════════════════════════════════════════════════════════\n');

  const client = await createDatabaseClient('engineer', { verify: false });
  const results = { pass: [], fail: [], warnings: [] };

  try {
    // CHECK 1: Lifecycle Phases
    console.log('📋 CHECK 1: lifecycle_phases Table');
    console.log('───────────────────────────────────────\n');

    const phases = await client.query(`
      SELECT phase_number, phase_name, stages, created_at
      FROM lifecycle_phases
      ORDER BY phase_number
    `);

    console.log(`   Found: ${phases.rows.length} phases (Expected: 6)`);
    phases.rows.forEach(p => {
      console.log(`   [${p.phase_number}] ${p.phase_name} (${p.stages.length} stages)`);
    });

    if (phases.rows.length === 6) {
      console.log('\n   ✅ PASS\n');
      results.pass.push('lifecycle_phases: 6 records');
    } else {
      console.log('\n   ❌ FAIL\n');
      results.fail.push(`lifecycle_phases: expected 6, found ${phases.rows.length}`);
    }

    // CHECK 2: Lifecycle Stage Config
    console.log('📋 CHECK 2: lifecycle_stage_config Table');
    console.log('───────────────────────────────────────\n');

    const stages = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT phase_number) as unique_phases,
        array_agg(DISTINCT phase_number ORDER BY phase_number) as phase_numbers
      FROM lifecycle_stage_config
    `);

    const stageRow = stages.rows[0];
    console.log(`   Total stages: ${stageRow.total} (Expected: 25)`);
    console.log(`   Unique phases: ${stageRow.unique_phases} (Expected: 6)`);
    console.log(`   Phase numbers: ${stageRow.phase_numbers.join(', ')}`);

    if (parseInt(stageRow.total) === 25 && parseInt(stageRow.unique_phases) === 6) {
      console.log('\n   ✅ PASS\n');
      results.pass.push('lifecycle_stage_config: 25 stages across 6 phases');
    } else {
      console.log('\n   ❌ FAIL\n');
      results.fail.push(`lifecycle_stage_config: expected 25 stages, found ${stageRow.total}`);
    }

    // CHECK 3: Advisory Checkpoints
    console.log('📋 CHECK 3: advisory_checkpoints Table');
    console.log('───────────────────────────────────────\n');

    const checkpoints = await client.query(`
      SELECT checkpoint_name, stage_number, created_at
      FROM advisory_checkpoints
      ORDER BY stage_number
    `);

    console.log(`   Found: ${checkpoints.rows.length} checkpoints (Expected: 3)`);
    checkpoints.rows.forEach(c => {
      console.log(`   - ${c.checkpoint_name} (Stage ${c.stage_number})`);
    });

    if (checkpoints.rows.length === 3) {
      console.log('\n   ✅ PASS\n');
      results.pass.push('advisory_checkpoints: 3 records');
    } else {
      console.log('\n   ❌ FAIL\n');
      results.fail.push(`advisory_checkpoints: expected 3, found ${checkpoints.rows.length}`);
    }

    // CHECK 4: Vision Transition SD Hierarchy
    console.log('📋 CHECK 4: Vision Transition SD Hierarchy');
    console.log('───────────────────────────────────────\n');

    const sdTree = await client.query(`
      WITH RECURSIVE sd_tree AS (
        SELECT id, title, parent_sd_id, 0 as level,
               ARRAY[id::text]::text[] as path
        FROM strategic_directives_v2
        WHERE id = 'SD-VISION-TRANSITION-001'

        UNION ALL

        SELECT s.id, s.title, s.parent_sd_id, t.level + 1,
               t.path || s.id::text
        FROM strategic_directives_v2 s
        JOIN sd_tree t ON s.parent_sd_id = t.id
      )
      SELECT level, id, title, parent_sd_id
      FROM sd_tree
      ORDER BY path
    `);

    console.log(`   Total SDs: ${sdTree.rows.length} (Expected: 12)`);

    const byLevel = {};
    sdTree.rows.forEach(sd => {
      byLevel[sd.level] = (byLevel[sd.level] || 0) + 1;
      const indent = '  '.repeat(sd.level);
      const shortTitle = sd.title.length > 50 ? sd.title.substring(0, 50) + '...' : sd.title;
      console.log(`   ${indent}[${sd.level}] ${sd.id}: ${shortTitle}`);
    });

    console.log(`\n   By Level: Root=${byLevel[0]||0}, Children=${byLevel[1]||0}, Grandchildren=${byLevel[2]||0}`);

    if (sdTree.rows.length === 12 && byLevel[0] === 1 && byLevel[1] === 5 && byLevel[2] === 6) {
      console.log('\n   ✅ PASS\n');
      results.pass.push('Vision Transition SDs: 12 records (1+5+6 hierarchy)');
    } else {
      console.log('\n   ❌ FAIL\n');
      results.fail.push(`Vision Transition SDs: expected 12 (1+5+6), found ${sdTree.rows.length} (${byLevel[0]||0}+${byLevel[1]||0}+${byLevel[2]||0})`);
    }

    // CHECK 5: venture_artifacts Quality Columns
    console.log('📋 CHECK 5: venture_artifacts Quality Columns');
    console.log('───────────────────────────────────────\n');

    const qualityCols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'venture_artifacts'
        AND column_name IN ('quality_score', 'validation_status', 'validated_at', 'validated_by')
      ORDER BY column_name
    `);

    const expectedCols = ['quality_score', 'validated_at', 'validated_by', 'validation_status'];
    console.log(`   Found: ${qualityCols.rows.length}/4 columns`);
    qualityCols.rows.forEach(c => {
      console.log(`   - ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`);
    });

    const foundCols = qualityCols.rows.map(c => c.column_name);
    const missingCols = expectedCols.filter(col => !foundCols.includes(col));

    if (qualityCols.rows.length === 4 && missingCols.length === 0) {
      console.log('\n   ✅ PASS\n');
      results.pass.push('venture_artifacts: 4 quality columns added');
    } else {
      console.log(`\n   ❌ FAIL (Missing: ${missingCols.join(', ')})\n`);
      results.fail.push(`venture_artifacts: expected 4 columns, found ${qualityCols.rows.length}`);
    }

    // CHECK 6: Quality Helper Functions
    console.log('📋 CHECK 6: Quality Helper Functions');
    console.log('───────────────────────────────────────\n');

    const funcs = await client.query(`
      SELECT proname
      FROM pg_proc
      WHERE proname IN ('check_venture_quality_gate', 'get_artifacts_pending_validation')
      ORDER BY proname
    `);

    console.log(`   Found: ${funcs.rows.length}/2 functions`);
    funcs.rows.forEach(f => {
      console.log(`   - ${f.proname}()`);
    });

    // Test check_venture_quality_gate
    let testPassed = false;
    if (funcs.rows.length === 2) {
      try {
        const testResult = await client.query(`
          SELECT check_venture_quality_gate(0.75) as result
        `);
        testPassed = testResult.rows[0].result === true;
        console.log(`   - Test check_venture_quality_gate(0.75): ${testPassed ? '✅ TRUE' : '❌ FALSE'}`);
      } catch (err) {
        console.log(`   - Test failed: ${err.message}`);
      }
    }

    if (funcs.rows.length === 2 && testPassed) {
      console.log('\n   ✅ PASS\n');
      results.pass.push('Quality helper functions: 2 functions, tested');
    } else {
      console.log('\n   ❌ FAIL\n');
      results.fail.push(`Quality functions: expected 2 working functions, found ${funcs.rows.length}`);
    }

    // CHECK 7: Kochel CrewAI Contracts
    console.log('📋 CHECK 7: Kochel CrewAI Contracts');
    console.log('───────────────────────────────────────\n');

    const contracts = await client.query(`
      SELECT id, name, kind, spec, version
      FROM leo_interfaces
      WHERE name ILIKE '%kochel%'
      ORDER BY name
    `);

    console.log(`   Found: ${contracts.rows.length}/4 contracts`);

    if (contracts.rows.length > 0) {
      contracts.rows.forEach(c => {
        console.log(`   - ${c.name} (v${c.version})`);
        if (c.spec) {
          const keys = Object.keys(c.spec);
          console.log(`     Keys: ${keys.length} (${keys.slice(0, 5).join(', ')}...)`);
        }
      });

      if (contracts.rows.length === 4) {
        console.log('\n   ✅ PASS\n');
        results.pass.push('Kochel CrewAI contracts: 4 contracts');
      } else {
        console.log('\n   ⚠️  PARTIAL (some contracts missing)\n');
        results.warnings.push(`Kochel contracts: expected 4, found ${contracts.rows.length}`);
      }
    } else {
      console.log('\n   ❌ FAIL (No contracts found)\n');
      results.fail.push('Kochel CrewAI contracts: 0 found, expected 4');
    }

    // CHECK 8: Data Integrity
    console.log('📋 CHECK 8: Data Integrity & Constraints');
    console.log('───────────────────────────────────────\n');

    // Orphaned lifecycle stages
    const orphanedStages = await client.query(`
      SELECT lsc.stage_number, lsc.phase_number
      FROM lifecycle_stage_config lsc
      LEFT JOIN lifecycle_phases lp ON lsc.phase_number = lp.phase_number
      WHERE lp.phase_number IS NULL
    `);

    console.log(`   Orphaned lifecycle stages: ${orphanedStages.rows.length}`);

    // Orphaned Vision SDs
    const orphanedSDs = await client.query(`
      SELECT s.id, s.parent_sd_id
      FROM strategic_directives_v2 s
      WHERE s.id LIKE 'SD-VISION-TRANSITION-%'
        AND s.parent_sd_id IS NOT NULL
        AND s.parent_sd_id NOT IN (
          SELECT id FROM strategic_directives_v2 WHERE id LIKE 'SD-VISION-TRANSITION-%'
        )
    `);

    console.log(`   Orphaned Vision Transition SDs: ${orphanedSDs.rows.length}`);

    if (orphanedStages.rows.length === 0 && orphanedSDs.rows.length === 0) {
      console.log('\n   ✅ PASS\n');
      results.pass.push('Data integrity: No orphaned records');
    } else {
      console.log('\n   ❌ FAIL\n');
      results.fail.push(`Data integrity: ${orphanedStages.rows.length} orphaned stages, ${orphanedSDs.rows.length} orphaned SDs`);
    }

    // FINAL ASSESSMENT
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    FINAL ASSESSMENT                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`✅ Passed: ${results.pass.length}`);
    results.pass.forEach(p => console.log(`   - ${p}`));

    if (results.warnings.length > 0) {
      console.log(`\n⚠️  Warnings: ${results.warnings.length}`);
      results.warnings.forEach(w => console.log(`   - ${w}`));
    }

    if (results.fail.length > 0) {
      console.log(`\n❌ Failed: ${results.fail.length}`);
      results.fail.forEach(f => console.log(`   - ${f}`));
    }

    console.log('\n════════════════════════════════════════════════════════════\n');

    if (results.fail.length === 0) {
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║              ✅ PHASE A MIGRATION: PASS                    ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      console.log('All critical components verified successfully.');
      if (results.warnings.length > 0) {
        console.log(`${results.warnings.length} non-blocking warning(s) noted.`);
      }
      console.log('\n✅ READY FOR PHASE B (Stage Transition Schema)\n');
    } else {
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║              ❌ PHASE A MIGRATION: FAIL                    ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      console.log(`${results.fail.length} critical issue(s) must be resolved before Phase B.\n`);
    }

  } catch (error) {
    console.error('\n❌ VERIFICATION ERROR:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await client.end();
  }
})();
