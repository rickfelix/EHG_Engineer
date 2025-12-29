/**
 * Database Verification Script for SD-VISION-TRANSITION-001E
 * Verifies 40→25 stage migration completion
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 DATABASE VERIFICATION for SD-VISION-TRANSITION-001E');
console.log('=========================================================\n');

const results = {
  verdict: 'PASS',
  confidence: 100,
  critical_issues: [],
  warnings: [],
  recommendations: [],
  findings: {}
};

// FR-1: Verify lifecycle_stage_config has 25 stages
console.log('FR-1: Verifying lifecycle_stage_config has 25 stages...');
const { data: stages, error: stageError, count: stageCount } = await supabase
  .from('lifecycle_stage_config')
  .select('*', { count: 'exact' });

if (stageError) {
  console.log('   ❌ ERROR:', stageError.message);
  results.critical_issues.push('lifecycle_stage_config query failed: ' + stageError.message);
  results.verdict = 'FAIL';
} else {
  console.log(`   ✅ Found ${stageCount} stages`);
  results.findings.stage_count = stageCount;

  if (stageCount !== 25) {
    console.log(`   ❌ FAIL: Expected 25 stages, got ${stageCount}`);
    results.critical_issues.push(`Expected 25 stages, found ${stageCount}`);
    results.verdict = 'FAIL';
  }
}

// FR-1: Verify lifecycle_phases has 6 phases
console.log('\nFR-1: Verifying lifecycle_phases has 6 phases...');
const { data: _phases, error: phaseError, count: phaseCount } = await supabase
  .from('lifecycle_phases')
  .select('*', { count: 'exact' });

if (phaseError) {
  console.log('   ❌ ERROR:', phaseError.message);
  results.critical_issues.push('lifecycle_phases query failed: ' + phaseError.message);
  results.verdict = 'FAIL';
} else {
  console.log(`   ✅ Found ${phaseCount} phases`);
  results.findings.phase_count = phaseCount;

  if (phaseCount !== 6) {
    console.log(`   ❌ FAIL: Expected 6 phases, got ${phaseCount}`);
    results.critical_issues.push(`Expected 6 phases, found ${phaseCount}`);
    results.verdict = 'FAIL';
  }
}

// FR-1: Verify advisory_checkpoints has 3 checkpoints
console.log('\nFR-1: Verifying advisory_checkpoints has 3 checkpoints...');
const { data: checkpoints, error: checkpointError, count: checkpointCount } = await supabase
  .from('advisory_checkpoints')
  .select('*', { count: 'exact' });

if (checkpointError) {
  console.log('   ❌ ERROR:', checkpointError.message);
  results.critical_issues.push('advisory_checkpoints query failed: ' + checkpointError.message);
  results.verdict = 'FAIL';
} else {
  console.log(`   ✅ Found ${checkpointCount} checkpoints`);
  results.findings.checkpoint_count = checkpointCount;

  if (checkpointCount !== 3) {
    console.log(`   ❌ FAIL: Expected 3 checkpoints, got ${checkpointCount}`);
    results.critical_issues.push(`Expected 3 checkpoints, found ${checkpointCount}`);
    results.verdict = 'FAIL';
  }
}

// FR-3: Verify helper function: get_stage_info
console.log('\nFR-3: Verifying helper function: get_stage_info...');
try {
  const { data: stageInfo, error: fnError1 } = await supabase
    .rpc('get_stage_info', { stage_num: 1 });

  if (fnError1) {
    console.log('   ❌ ERROR:', fnError1.message);
    results.critical_issues.push('get_stage_info function failed: ' + fnError1.message);
    results.verdict = 'FAIL';
  } else if (!stageInfo) {
    console.log('   ❌ FAIL: get_stage_info returned no data');
    results.critical_issues.push('get_stage_info returned no data for stage 1');
    results.verdict = 'FAIL';
  } else {
    console.log(`   ✅ get_stage_info(1) returned: ${stageInfo.stage_name || 'data'}`);
    results.findings.get_stage_info = 'PASS';
  }
} catch (_err) {
  console.log('   ❌ ERROR:', err.message);
  results.critical_issues.push('get_stage_info test failed: ' + err.message);
  results.verdict = 'FAIL';
}

// FR-3: Verify helper function: get_sd_required_stages
console.log('\nFR-3: Verifying helper function: get_sd_required_stages...');
try {
  const { data: requiredStages, error: fnError2 } = await supabase
    .rpc('get_sd_required_stages', { p_sd_type: 'feature' });

  if (fnError2) {
    console.log('   ❌ ERROR:', fnError2.message);
    results.critical_issues.push('get_sd_required_stages function failed: ' + fnError2.message);
    results.verdict = 'FAIL';
  } else if (!requiredStages || requiredStages.length === 0) {
    console.log('   ❌ FAIL: get_sd_required_stages returned no data');
    results.critical_issues.push('get_sd_required_stages returned no data');
    results.verdict = 'FAIL';
  } else {
    console.log(`   ✅ get_sd_required_stages('feature') returned ${requiredStages.length} stages`);
    results.findings.get_sd_required_stages = 'PASS';
  }
} catch (_err) {
  console.log('   ❌ ERROR:', err.message);
  results.critical_issues.push('get_sd_required_stages test failed: ' + err.message);
  results.verdict = 'FAIL';
}

// FR-3: Verify helper function: get_stages_by_phase
console.log('\nFR-3: Verifying helper function: get_stages_by_phase...');
try {
  const { data: phaseStages, error: fnError3 } = await supabase
    .rpc('get_stages_by_phase', { p_phase_num: 1 });

  if (fnError3) {
    console.log('   ❌ ERROR:', fnError3.message);
    results.critical_issues.push('get_stages_by_phase function failed: ' + fnError3.message);
    results.verdict = 'FAIL';
  } else if (!phaseStages || phaseStages.length === 0) {
    console.log('   ❌ FAIL: get_stages_by_phase returned no data');
    results.critical_issues.push('get_stages_by_phase returned no data');
    results.verdict = 'FAIL';
  } else {
    console.log(`   ✅ get_stages_by_phase(1) returned ${phaseStages.length} stages`);
    results.findings.get_stages_by_phase = 'PASS';
  }
} catch (_err) {
  console.log('   ❌ ERROR:', err.message);
  results.critical_issues.push('get_stages_by_phase test failed: ' + err.message);
  results.verdict = 'FAIL';
}

// FR-4: Verify advisory checkpoints for stages 3, 5, 16
console.log('\nFR-4: Verifying advisory checkpoints for stages 3, 5, 16...');
const expectedCheckpointStages = [3, 5, 16];
for (const stageNum of expectedCheckpointStages) {
  const checkpoint = checkpoints?.find(c => c.stage_number === stageNum);
  if (!checkpoint) {
    console.log(`   ❌ FAIL: Missing checkpoint for stage ${stageNum}`);
    results.critical_issues.push(`Missing advisory checkpoint for stage ${stageNum}`);
    results.verdict = 'FAIL';
  } else {
    console.log(`   ✅ Found checkpoint for stage ${stageNum}: ${checkpoint.checkpoint_name || 'unnamed'}`);
  }
}

// FR-5: Verify no circular dependencies (basic check)
console.log('\nFR-5: Verifying dependency chains (no circular dependencies)...');
if (stages && stages.length > 0) {
  const hasCircular = stages.some(stage => {
    return stage.dependencies?.includes(stage.stage_number);
  });

  if (hasCircular) {
    console.log('   ❌ FAIL: Found self-referencing dependency');
    results.critical_issues.push('Circular dependency detected (self-reference)');
    results.verdict = 'FAIL';
  } else {
    console.log('   ✅ No self-referencing dependencies detected');
    results.findings.no_circular_deps = 'PASS';
  }
}

// Summary
console.log('\n=========================================================');
console.log(`VERDICT: ${results.verdict}`);
console.log(`CONFIDENCE: ${results.confidence}%`);
console.log(`CRITICAL ISSUES: ${results.critical_issues.length}`);
console.log(`WARNINGS: ${results.warnings.length}`);

if (results.critical_issues.length > 0) {
  console.log('\nCritical Issues:');
  results.critical_issues.forEach((issue, i) => {
    console.log(`  ${i + 1}. ${issue}`);
  });
}

// Store results
const record = {
  sd_id: 'SD-VISION-TRANSITION-001E',
  sub_agent_code: 'DATABASE',
  sub_agent_name: 'Database Verification',
  verdict: results.verdict,
  confidence: results.confidence,
  critical_issues: results.critical_issues,
  warnings: results.warnings,
  recommendations: results.recommendations,
  detailed_analysis: results.findings,
  execution_time: 0,
  validation_mode: 'retrospective',
  justification: 'Database verification SD - verifies 40→25 stage migration completion',
  metadata: {
    sub_agent_version: '4.2.0',
    original_verdict: results.verdict
  },
  created_at: new Date().toISOString()
};

const { data: stored, error: storeError } = await supabase
  .from('sub_agent_execution_results')
  .insert(record)
  .select()
  .single();

if (storeError) {
  console.log('\n❌ Failed to store results:', storeError.message);
} else {
  console.log(`\n✅ Results stored with ID: ${stored.id}`);
}
