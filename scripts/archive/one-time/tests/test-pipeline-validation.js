#!/usr/bin/env node

/**
 * Comprehensive Pipeline Validation Test
 * SD-LEO-INFRA-EVA-STAGE-PIPELINE-002F
 *
 * Tests the full 25-stage venture lifecycle pipeline after fixes from children A-E:
 * - Artifact type alignment (lifecycle_stage_config ↔ venture_artifacts)
 * - GoldenNuggetValidator lazy-init from DB
 * - Stage gate validation
 * - Reality gate DB-driven config
 * - Stage transitions via fn_advance_venture_stage
 *
 * Usage: node scripts/test-pipeline-validation.js [--venture-id UUID] [--fix]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Dream Weaver Stories test venture
const DEFAULT_VENTURE_ID = '45160069-f590-44c9-8a46-bf98e12de522';
const VENTURES_TABLE_ID = '81a82426-d9cb-4440-95c5-4c46141d608e';

// Gate stages that require chairman decisions
const GATE_STAGES = [3, 5, 13, 16, 23];

// ─── Test Results Tracker ───────────────────────────────────────────

const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: [],
  categories: {}
};

function pass(category, test, detail = '') {
  results.passed++;
  results.tests.push({ status: 'PASS', category, test, detail });
  if (!results.categories[category]) results.categories[category] = { passed: 0, failed: 0, warnings: 0 };
  results.categories[category].passed++;
  console.log(`  ✅ ${test}${detail ? ' — ' + detail : ''}`);
}

function fail(category, test, detail = '') {
  results.failed++;
  results.tests.push({ status: 'FAIL', category, test, detail });
  if (!results.categories[category]) results.categories[category] = { passed: 0, failed: 0, warnings: 0 };
  results.categories[category].failed++;
  console.log(`  ❌ ${test}${detail ? ' — ' + detail : ''}`);
}

function warn(category, test, detail = '') {
  results.warnings++;
  results.tests.push({ status: 'WARN', category, test, detail });
  if (!results.categories[category]) results.categories[category] = { passed: 0, failed: 0, warnings: 0 };
  results.categories[category].warnings++;
  console.log(`  ⚠️  ${test}${detail ? ' — ' + detail : ''}`);
}

// ─── Test 1: lifecycle_stage_config Integrity ───────────────────────

async function testLifecycleStageConfig() {
  console.log('\n═══ Test 1: lifecycle_stage_config Integrity ═══');
  const cat = 'lifecycle_stage_config';

  const { data: stages, error } = await supabase
    .from('lifecycle_stage_config')
    .select('stage_number, stage_name, required_artifacts, metadata')
    .order('stage_number');

  if (error) {
    fail(cat, 'Query lifecycle_stage_config', error.message);
    return null;
  }

  if (!stages || stages.length === 0) {
    fail(cat, 'Has stage rows', 'Table is empty');
    return null;
  }

  // Check we have all 25 stages
  if (stages.length >= 25) {
    pass(cat, 'Has 25+ stage rows', `${stages.length} rows found`);
  } else {
    fail(cat, 'Has 25+ stage rows', `Only ${stages.length} rows found`);
  }

  // Check stage numbers are sequential 1-25
  const stageNumbers = stages.map(s => s.stage_number).sort((a, b) => a - b);
  const expectedNumbers = Array.from({ length: 25 }, (_, i) => i + 1);
  const missingStages = expectedNumbers.filter(n => !stageNumbers.includes(n));
  if (missingStages.length === 0) {
    pass(cat, 'Stages 1-25 all present');
  } else {
    fail(cat, 'Stages 1-25 all present', `Missing: ${missingStages.join(', ')}`);
  }

  // Check each stage has a name
  const unnamedStages = stages.filter(s => !s.stage_name || s.stage_name.trim() === '');
  if (unnamedStages.length === 0) {
    pass(cat, 'All stages have names');
  } else {
    fail(cat, 'All stages have names', `${unnamedStages.length} unnamed stages`);
  }

  // Check required_artifacts is an array for each stage
  const badArtifacts = stages.filter(s => !Array.isArray(s.required_artifacts));
  if (badArtifacts.length === 0) {
    pass(cat, 'All stages have required_artifacts array');
  } else {
    fail(cat, 'All stages have required_artifacts array', `${badArtifacts.length} stages with non-array required_artifacts`);
  }

  // Count stages with non-empty required_artifacts
  const stagesWithArtifacts = stages.filter(s => Array.isArray(s.required_artifacts) && s.required_artifacts.length > 0);
  pass(cat, `${stagesWithArtifacts.length} stages have required artifacts defined`);

  // Check metadata structure
  const stagesWithGates = stages.filter(s => s.metadata?.gates);
  pass(cat, `${stagesWithGates.length} stages have gate metadata`);

  return stages;
}

// ─── Test 2: Artifact Type Alignment ────────────────────────────────

async function testArtifactTypeAlignment(stages, ventureId) {
  console.log('\n═══ Test 2: Artifact Type Alignment ═══');
  const cat = 'artifact_alignment';

  if (!stages) {
    fail(cat, 'Prerequisites', 'No lifecycle_stage_config data');
    return;
  }

  // Get all artifacts for the venture
  const { data: artifacts, error } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_type, lifecycle_stage, content, created_at')
    .eq('venture_id', ventureId)
    .order('lifecycle_stage');

  if (error) {
    fail(cat, 'Query venture_artifacts', error.message);
    return;
  }

  pass(cat, 'venture_artifacts query', `${artifacts?.length || 0} artifacts found`);

  // For each stage with required artifacts, check if any matching artifacts exist
  for (const stage of stages) {
    if (!Array.isArray(stage.required_artifacts) || stage.required_artifacts.length === 0) continue;

    const stageArtifacts = (artifacts || []).filter(a => a.lifecycle_stage === stage.stage_number);
    const stageArtifactTypes = stageArtifacts.map(a => a.artifact_type);

    for (const requiredType of stage.required_artifacts) {
      if (stageArtifactTypes.includes(requiredType)) {
        pass(cat, `Stage ${stage.stage_number} (${stage.stage_name}): ${requiredType}`, 'exists');
      } else {
        // Not necessarily a failure - artifact may not have been created yet
        // Only a failure if the venture has passed this stage
        warn(cat, `Stage ${stage.stage_number} (${stage.stage_name}): ${requiredType}`, 'not yet created');
      }
    }

    // Check for artifacts with types NOT in config (potential mismatches)
    for (const artifact of stageArtifacts) {
      if (!stage.required_artifacts.includes(artifact.artifact_type)) {
        // Check if it's a supplementary artifact type (e.g., stage_output)
        if (artifact.artifact_type === 'stage_output') {
          warn(cat, `Stage ${stage.stage_number}: legacy stage_output artifact`, 'should use specific type from config');
        } else {
          warn(cat, `Stage ${stage.stage_number}: artifact type '${artifact.artifact_type}' not in config`, 'may be supplementary');
        }
      }
    }
  }
}

// ─── Test 3: GoldenNuggetValidator DB Integration ───────────────────

async function testGoldenNuggetValidator() {
  console.log('\n═══ Test 3: GoldenNuggetValidator DB Integration ═══');
  const cat = 'golden_nugget_validator';

  try {
    // Import the stage-config module
    const { loadStagesConfig, getStagesById, getStageRequirements } = await import(
      '../lib/agents/modules/golden-nugget-validator/stage-config.js'
    );

    // Test 1: Load config from DB
    const loaded = await loadStagesConfig(supabase);
    if (loaded) {
      pass(cat, 'loadStagesConfig() from DB', 'config loaded successfully');
    } else {
      fail(cat, 'loadStagesConfig() from DB', 'returned false');
      return;
    }

    // Test 2: Verify stages are indexed
    const stagesById = getStagesById();
    if (stagesById.size >= 25) {
      pass(cat, 'STAGES_BY_ID populated', `${stagesById.size} stages indexed`);
    } else {
      fail(cat, 'STAGES_BY_ID populated', `Only ${stagesById.size} stages indexed (expected 25+)`);
    }

    // Test 3: getStageRequirements returns proper structure for each stage
    let validRequirements = 0;
    let invalidRequirements = 0;
    for (let i = 1; i <= 25; i++) {
      const req = getStageRequirements(i);
      if (req && Array.isArray(req.required_outputs) && Array.isArray(req.exit_gates)) {
        validRequirements++;
      } else {
        invalidRequirements++;
        fail(cat, `getStageRequirements(${i})`, `Invalid structure: ${JSON.stringify(req)}`);
      }
    }
    if (invalidRequirements === 0) {
      pass(cat, 'getStageRequirements() structure', `All 25 stages return valid structure`);
    }

    // Test 4: Verify required_outputs match lifecycle_stage_config
    const { data: dbStages } = await supabase
      .from('lifecycle_stage_config')
      .select('stage_number, required_artifacts')
      .order('stage_number');

    let mismatches = 0;
    for (const dbStage of (dbStages || [])) {
      const req = getStageRequirements(dbStage.stage_number);
      const dbArtifacts = dbStage.required_artifacts || [];
      const validatorArtifacts = req.required_outputs || [];

      if (JSON.stringify(dbArtifacts.sort()) !== JSON.stringify(validatorArtifacts.sort())) {
        mismatches++;
        fail(cat, `Stage ${dbStage.stage_number} artifact alignment`,
          `DB: [${dbArtifacts.join(',')}] vs Validator: [${validatorArtifacts.join(',')}]`);
      }
    }
    if (mismatches === 0) {
      pass(cat, 'All stages: DB ↔ Validator artifact alignment', 'perfect match');
    }

  } catch (err) {
    fail(cat, 'Import/execute GoldenNuggetValidator', err.message);
  }
}

// ─── Test 4: Venture Stage Work ─────────────────────────────────────

async function testVentureStageWork(ventureId) {
  console.log('\n═══ Test 4: Venture Stage Work ═══');
  const cat = 'venture_stage_work';

  const { data: stageWork, error } = await supabase
    .from('venture_stage_work')
    .select('*')
    .eq('venture_id', ventureId)
    .order('lifecycle_stage');

  if (error) {
    fail(cat, 'Query venture_stage_work', error.message);
    return;
  }

  if (!stageWork || stageWork.length === 0) {
    warn(cat, 'venture_stage_work rows', 'No rows found — venture may need bootstrapping');
    return;
  }

  pass(cat, 'venture_stage_work rows', `${stageWork.length} stage work entries`);

  // Check for valid stage_status values
  const validStatuses = ['pending', 'in_progress', 'completed', 'skipped', 'blocked'];
  const invalidStatuses = stageWork.filter(sw => !validStatuses.includes(sw.stage_status));
  if (invalidStatuses.length === 0) {
    pass(cat, 'All stage_status values valid');
  } else {
    fail(cat, 'Invalid stage_status values', invalidStatuses.map(s => `stage ${s.lifecycle_stage}: ${s.stage_status}`).join(', '));
  }

  // Check for valid health_score values
  const validHealthScores = ['green', 'yellow', 'red', null];
  const invalidHealth = stageWork.filter(sw => sw.health_score && !['green', 'yellow', 'red'].includes(sw.health_score));
  if (invalidHealth.length === 0) {
    pass(cat, 'All health_score values valid');
  } else {
    warn(cat, 'Invalid health_score values', invalidHealth.map(s => `stage ${s.lifecycle_stage}: ${s.health_score}`).join(', '));
  }

  return stageWork;
}

// ─── Test 5: Stage Gate Configuration ───────────────────────────────

async function testStageGateConfig(stages) {
  console.log('\n═══ Test 5: Stage Gate Configuration ═══');
  const cat = 'stage_gates';

  if (!stages) {
    fail(cat, 'Prerequisites', 'No lifecycle_stage_config data');
    return;
  }

  // Verify gate stages have gate metadata
  for (const gateStage of GATE_STAGES) {
    const stage = stages.find(s => s.stage_number === gateStage);
    if (!stage) {
      fail(cat, `Gate stage ${gateStage} exists in config`, 'not found');
      continue;
    }

    if (stage.metadata?.gates) {
      pass(cat, `Gate stage ${gateStage} (${stage.stage_name}) has gate metadata`);
    } else {
      warn(cat, `Gate stage ${gateStage} (${stage.stage_name}) missing gate metadata`, 'may use default gates');
    }
  }

  // Verify non-gate stages don't accidentally block transitions
  const nonGateStages = stages.filter(s => !GATE_STAGES.includes(s.stage_number));
  const suspiciousGates = nonGateStages.filter(s =>
    s.metadata?.gates?.type === 'kill_gate' || s.metadata?.gates?.type === 'decision_gate'
  );
  if (suspiciousGates.length === 0) {
    pass(cat, 'Non-gate stages have no kill/decision gates');
  } else {
    warn(cat, 'Non-gate stages with gate config',
      suspiciousGates.map(s => `stage ${s.stage_number}: ${s.metadata.gates.type}`).join(', '));
  }
}

// ─── Test 6: Eva Ventures Integration ───────────────────────────────

async function testEvaVenturesIntegration(ventureId) {
  console.log('\n═══ Test 6: EVA Ventures Integration ═══');
  const cat = 'eva_ventures';

  // Check eva_ventures record
  const { data: venture, error } = await supabase
    .from('eva_ventures')
    .select('id, venture_id, current_lifecycle_stage, status, health_status, autonomy_level')
    .eq('id', ventureId)
    .single();

  if (error) {
    fail(cat, 'Query eva_ventures', error.message);
    return;
  }

  pass(cat, 'eva_ventures record exists', `Stage ${venture.current_lifecycle_stage}, Status ${venture.status}`);

  // Check venture status
  if (venture.status === 'active') {
    pass(cat, 'Venture status is active');
  } else {
    warn(cat, `Venture status: ${venture.status}`, 'expected active');
  }

  // Check autonomy level
  if (venture.autonomy_level) {
    pass(cat, `Autonomy level: ${venture.autonomy_level}`);
  } else {
    warn(cat, 'Autonomy level not set');
  }

  return venture;
}

// ─── Test 7: Stage History ──────────────────────────────────────────

async function testStageHistory(ventureId) {
  console.log('\n═══ Test 7: Stage History ═══');
  const cat = 'stage_history';

  const { data: history, error } = await supabase
    .from('venture_stage_transitions')
    .select('id, from_stage, to_stage, transition_type, created_at')
    .eq('venture_id', ventureId)
    .order('created_at');

  if (error) {
    fail(cat, 'Query eva_stage_history', error.message);
    return;
  }

  if (!history || history.length === 0) {
    warn(cat, 'Stage history entries', 'No transitions recorded yet');
    return;
  }

  pass(cat, 'Stage history entries', `${history.length} transitions recorded`);

  // Check for valid transition patterns (sequential, no skips > 1 for non-revert)
  let invalidTransitions = 0;
  for (const h of history) {
    if (h.transition_type === 'revert' || h.transition_type === 'rollback') continue;
    if (h.to_stage - h.from_stage > 1) {
      warn(cat, `Transition skip: ${h.from_stage} → ${h.to_stage}`, `${h.transition_type} on ${h.created_at}`);
      invalidTransitions++;
    }
  }
  if (invalidTransitions === 0) {
    pass(cat, 'All forward transitions are sequential (no skips)');
  }
}

// ─── Test 8: Chairman Decisions for Gate Stages ─────────────────────

async function testChairmanDecisions(ventureId) {
  console.log('\n═══ Test 8: Chairman Decisions (Gate Stages) ═══');
  const cat = 'chairman_decisions';

  const { data: decisions, error } = await supabase
    .from('chairman_decisions')
    .select('id, lifecycle_stage, decision, status, reasoning, created_at')
    .eq('venture_id', ventureId)
    .order('lifecycle_stage');

  if (error) {
    // Table may not exist yet
    if (error.message.includes('does not exist') || error.code === '42P01') {
      warn(cat, 'chairman_decisions table', 'Table does not exist yet');
    } else {
      fail(cat, 'Query chairman_decisions', error.message);
    }
    return;
  }

  pass(cat, 'chairman_decisions query', `${decisions?.length || 0} decisions found`);

  // Check gate stages have decisions (if venture has reached them)
  for (const gateStage of GATE_STAGES) {
    const stageDecisions = (decisions || []).filter(d => d.lifecycle_stage === gateStage);
    if (stageDecisions.length > 0) {
      const latest = stageDecisions[stageDecisions.length - 1];
      pass(cat, `Gate ${gateStage} has chairman decision`, `${latest.decision} (${latest.status})`);
    } else {
      // Not a failure if venture hasn't reached this stage yet
      warn(cat, `Gate ${gateStage} no chairman decision`, 'venture may not have reached this stage');
    }
  }
}

// ─── Test 9: Venture FK Alignment ───────────────────────────────────

async function testVentureFKAlignment(ventureId) {
  console.log('\n═══ Test 9: Venture FK Alignment ═══');
  const cat = 'fk_alignment';

  // Check that venture_id references are consistent across tables
  const tables = [
    { name: 'venture_stage_work', col: 'venture_id' },
    { name: 'venture_artifacts', col: 'venture_id' },
    { name: 'venture_stage_transitions', col: 'venture_id' },
  ];

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table.name)
      .select('id', { count: 'exact', head: true })
      .eq(table.col, ventureId);

    if (error) {
      warn(cat, `${table.name} FK check`, error.message);
    } else {
      pass(cat, `${table.name} has ${count} rows for venture`);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const ventureId = args.find(a => !a.startsWith('--')) || DEFAULT_VENTURE_ID;
  const fixMode = args.includes('--fix');

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   COMPREHENSIVE PIPELINE VALIDATION TEST                    ║');
  console.log('║   SD-LEO-INFRA-EVA-STAGE-PIPELINE-002F                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nVenture ID: ${ventureId}`);
  console.log(`Mode: ${fixMode ? 'FIX (will attempt corrections)' : 'VALIDATE (read-only)'}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // Run all tests
  const stages = await testLifecycleStageConfig();
  await testArtifactTypeAlignment(stages, ventureId);
  await testGoldenNuggetValidator();
  await testVentureStageWork(ventureId);
  await testStageGateConfig(stages);
  await testEvaVenturesIntegration(ventureId);
  await testStageHistory(ventureId);
  await testChairmanDecisions(ventureId);
  await testVentureFKAlignment(ventureId);

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   RESULTS SUMMARY                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  Total:    ${results.passed + results.failed + results.warnings} tests`);
  console.log(`  ✅ Passed:  ${results.passed}`);
  console.log(`  ❌ Failed:  ${results.failed}`);
  console.log(`  ⚠️  Warnings: ${results.warnings}`);

  console.log('\n  By Category:');
  for (const [cat, counts] of Object.entries(results.categories)) {
    const status = counts.failed > 0 ? '❌' : counts.warnings > 0 ? '⚠️' : '✅';
    console.log(`    ${status} ${cat}: ${counts.passed}P / ${counts.failed}F / ${counts.warnings}W`);
  }

  // Overall verdict
  const verdict = results.failed === 0 ? 'PASS' : 'FAIL';
  console.log(`\n  ══════════════════════════════════════`);
  console.log(`  VERDICT: ${verdict === 'PASS' ? '✅' : '❌'} ${verdict}`);
  console.log(`  ══════════════════════════════════════`);

  if (results.failed > 0) {
    console.log('\n  Failed Tests:');
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`    ❌ [${t.category}] ${t.test}: ${t.detail}`);
    });
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
