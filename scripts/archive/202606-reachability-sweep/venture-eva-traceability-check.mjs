#!/usr/bin/env node

/**
 * Verify Venture EVA Traceability
 *
 * Checks that ventures processed through the updated pipeline have:
 * 1. EVA vision documents with venture_id populated
 * 2. EVA architecture plans with venture_id populated
 * 3. venture_artifacts with supports_vision_key / supports_plan_key
 * 4. Version progression on EVA records
 *
 * Usage:
 *   node scripts/verify-venture-eva-traceability.mjs                    # Check all 4 ventures
 *   node scripts/verify-venture-eva-traceability.mjs --venture "Certify AI"  # Check specific venture
 *   node scripts/verify-venture-eva-traceability.mjs --json             # JSON output
 *
 * Part of SD-LEO-INFRA-STREAM-VENTURE-EVA-002-D
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TARGET_VENTURES = ['AdmitArchitect', 'Certify AI', 'MarketSignal AI', 'SchemaSynth AI'];

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}
const jsonMode = process.argv.includes('--json');
const targetVenture = getArg('venture');

async function verify() {
  const names = targetVenture ? [targetVenture] : TARGET_VENTURES;

  const { data: ventures } = await supabase
    .from('ventures')
    .select('id, name, current_lifecycle_stage, status, vision_id, architecture_plan_id, orchestrator_state')
    .in('name', names);

  if (!ventures?.length) {
    console.error('No ventures found matching:', names.join(', '));
    process.exit(1);
  }

  const results = [];

  for (const v of ventures) {
    const result = {
      name: v.name,
      id: v.id,
      stage: v.current_lifecycle_stage,
      status: v.status,
      orchestrator_state: v.orchestrator_state,
      checks: {}
    };

    // Check 1: EVA vision documents with venture_id
    const { data: visions } = await supabase
      .from('eva_vision_documents')
      .select('id, vision_key, venture_id, version, status')
      .eq('venture_id', v.id);

    result.checks.vision_docs = {
      count: visions?.length || 0,
      pass: (visions?.length || 0) > 0,
      details: visions?.map(d => ({ key: d.vision_key, version: d.version })) || []
    };

    // Check 2: EVA architecture plans with venture_id
    const { data: plans } = await supabase
      .from('eva_architecture_plans')
      .select('id, plan_key, venture_id, version, status')
      .eq('venture_id', v.id);

    result.checks.arch_plans = {
      count: plans?.length || 0,
      pass: (plans?.length || 0) > 0,
      details: plans?.map(d => ({ key: d.plan_key, version: d.version })) || []
    };

    // Check 3: venture_artifacts with supports_vision_key
    const { data: visionArtifacts } = await supabase
      .from('venture_artifacts')
      .select('id, lifecycle_stage, artifact_type, supports_vision_key')
      .eq('venture_id', v.id)
      .not('supports_vision_key', 'is', null);

    result.checks.artifacts_with_vision_key = {
      count: visionArtifacts?.length || 0,
      pass: (visionArtifacts?.length || 0) > 0,
      stages: [...new Set(visionArtifacts?.map(a => a.lifecycle_stage) || [])]
    };

    // Check 4: venture_artifacts with supports_plan_key
    const { data: planArtifacts } = await supabase
      .from('venture_artifacts')
      .select('id, lifecycle_stage, artifact_type, supports_plan_key')
      .eq('venture_id', v.id)
      .not('supports_plan_key', 'is', null);

    result.checks.artifacts_with_plan_key = {
      count: planArtifacts?.length || 0,
      pass: (planArtifacts?.length || 0) > 0,
      stages: [...new Set(planArtifacts?.map(a => a.lifecycle_stage) || [])]
    };

    // Check 5: Version progression (vision version > 1)
    const maxVisionVersion = Math.max(0, ...(visions?.map(v => v.version) || [0]));
    result.checks.vision_version_progression = {
      max_version: maxVisionVersion,
      pass: maxVisionVersion > 1
    };

    // Check 6: Version progression (arch plan version > 1)
    const maxPlanVersion = Math.max(0, ...(plans?.map(p => p.version) || [0]));
    result.checks.arch_version_progression = {
      max_version: maxPlanVersion,
      pass: maxPlanVersion > 1
    };

    // Check 7: No NULL venture_id on linked EVA records
    const { data: nullVisionVentureId } = await supabase
      .from('eva_vision_documents')
      .select('id')
      .is('venture_id', null)
      .ilike('vision_key', `%${v.name.replace(/\s+/g, '')}%`);

    result.checks.no_null_venture_id = {
      null_vision_count: nullVisionVentureId?.length || 0,
      pass: (nullVisionVentureId?.length || 0) === 0
    };

    // Overall pass
    const allChecks = Object.values(result.checks);
    result.overall_pass = allChecks.every(c => c.pass);
    result.pass_count = allChecks.filter(c => c.pass).length;
    result.total_checks = allChecks.length;

    results.push(result);
  }

  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Pretty print
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' VENTURE EVA TRACEABILITY VERIFICATION');
  console.log('═══════════════════════════════════════════════════\n');

  for (const r of results) {
    const status = r.overall_pass ? '✅ PASS' : '⏳ PENDING';
    console.log(`${status} ${r.name}`);
    console.log(`  Stage: ${r.stage} | Status: ${r.status} | Orchestrator: ${r.orchestrator_state}`);
    console.log(`  Checks: ${r.pass_count}/${r.total_checks} passing\n`);

    for (const [name, check] of Object.entries(r.checks)) {
      const icon = check.pass ? '✅' : '❌';
      const detail = check.count !== undefined ? ` (${check.count})` : '';
      console.log(`    ${icon} ${name}${detail}`);
    }
    console.log('');
  }

  const allPass = results.every(r => r.overall_pass);
  console.log('═══════════════════════════════════════════════════');
  if (allPass) {
    console.log('✅ ALL VENTURES PASS TRACEABILITY VERIFICATION');
  } else {
    const pending = results.filter(r => !r.overall_pass);
    console.log(`⏳ ${pending.length} venture(s) pending — pipeline must process through Stage 17+`);
    console.log('   Run the stage-execution-worker to process ventures through the pipeline.');
    console.log('   Then re-run this verification script.');
  }
  console.log('═══════════════════════════════════════════════════\n');
}

verify().catch(err => {
  console.error('Verification failed:', err.message);
  process.exit(1);
});
