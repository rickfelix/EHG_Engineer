#!/usr/bin/env node
/**
 * Venture Restart Script — SD-LEO-INFRA-STREAM-VENTURE-EVA-002-D (A4)
 *
 * Resets 4 ventures to Stage 0 and clears old pipeline state so they can
 * be re-run through the updated EVA pipeline (with vision_key/plan_key support).
 *
 * Usage:
 *   node scripts/temp-venture-restart.mjs reset          # Reset all 4 ventures
 *   node scripts/temp-venture-restart.mjs verify          # Verify EVA records after pipeline run
 *   node scripts/temp-venture-restart.mjs run <venture>   # Run a single venture from stage 1
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const VENTURES = [
  { id: 'abb70fb3-4f90-43c8-b700-c299fdb6d825', name: 'AdmitArchitect' },
  { id: '5c25aa95-c187-4c63-b469-4b8beb0026a5', name: 'Certify AI' },
  { id: 'ed90c257-4161-43f9-8de3-d65885791fef', name: 'MarketSignal AI' },
  { id: '32872bec-279a-4370-8ae8-429b849ae972', name: 'SchemaSynth AI' },
];

// Duplicate to clean up
const DUPLICATE_ID = 'c12d8b1e-611a-40a2-8aca-5750d2931222'; // SchemaSynth AI (2)

async function resetVentures() {
  console.log('=== VENTURE RESET ===\n');

  // 1. Delete duplicate SchemaSynth AI (2)
  console.log('1. Cleaning up duplicate SchemaSynth AI (2)...');
  const { count: dupArtifacts } = await supabase
    .from('venture_artifacts')
    .select('*', { count: 'exact', head: true })
    .eq('venture_id', DUPLICATE_ID);

  if (dupArtifacts > 0) {
    await supabase.from('venture_artifacts').delete().eq('venture_id', DUPLICATE_ID);
    console.log(`   Deleted ${dupArtifacts} artifacts for duplicate`);
  }

  // Soft-delete the duplicate
  await supabase.from('ventures').update({
    deleted_at: new Date().toISOString(),
    status: 'killed',
    kill_reason: 'Duplicate of SchemaSynth AI — cleaned up by A4 restart'
  }).eq('id', DUPLICATE_ID);
  console.log('   Duplicate soft-deleted\n');

  // 2. Reset each venture
  for (const v of VENTURES) {
    console.log(`2. Resetting ${v.name} (${v.id.substring(0, 8)})...`);

    // Count existing artifacts
    const { count: artCount } = await supabase
      .from('venture_artifacts')
      .select('*', { count: 'exact', head: true })
      .eq('venture_id', v.id);

    // Delete venture_artifacts
    if (artCount > 0) {
      const { error: delErr } = await supabase
        .from('venture_artifacts')
        .delete()
        .eq('venture_id', v.id);
      if (delErr) console.log(`   ⚠️  Error deleting artifacts: ${delErr.message}`);
      else console.log(`   Deleted ${artCount} artifacts`);
    }

    // Delete venture_stage_transitions
    const { error: transErr } = await supabase
      .from('venture_stage_transitions')
      .delete()
      .eq('venture_id', v.id);
    if (transErr && !transErr.message.includes('Could not find')) {
      console.log(`   ⚠️  Stage transitions: ${transErr.message}`);
    }

    // Reset venture state
    const { error: updateErr } = await supabase.from('ventures').update({
      current_lifecycle_stage: 0,
      orchestrator_state: 'idle',
      orchestrator_lock_id: null,
      orchestrator_lock_acquired_at: null,
      workflow_status: 'pending',
      workflow_started_at: null,
      workflow_completed_at: null,
      deleted_at: null, // Un-delete MarketSignal AI
      pipeline_mode: 'evaluation',
      vision_id: null,
      architecture_plan_id: null,
      recursion_state: {},
    }).eq('id', v.id);

    if (updateErr) console.log(`   ⚠️  Reset error: ${updateErr.message}`);
    else console.log(`   Reset to stage 0, orchestrator_state=idle`);
  }

  // 3. Clean up EVA records linked to these ventures (if any)
  const ventureIds = VENTURES.map(v => v.id);

  const { error: evaVErr } = await supabase
    .from('eva_vision_documents')
    .delete()
    .in('venture_id', ventureIds);
  if (evaVErr && !evaVErr.message.includes('Could not find')) {
    console.log(`\n⚠️  EVA vision cleanup: ${evaVErr.message}`);
  }

  const { error: evaAErr } = await supabase
    .from('eva_architecture_plans')
    .delete()
    .in('venture_id', ventureIds);
  if (evaAErr && !evaAErr.message.includes('Could not find')) {
    console.log(`\n⚠️  EVA arch cleanup: ${evaAErr.message}`);
  }

  console.log('\n✅ All 4 ventures reset to stage 0. Ready for pipeline restart.');
  console.log('\nNext steps:');
  console.log('  node scripts/eva-run.js <venture_id> --stage 1');
  console.log('  node scripts/temp-venture-restart.mjs verify');
}

async function verifyEvaRecords() {
  console.log('=== EVA RECORD VERIFICATION ===\n');

  let allPass = true;

  for (const v of VENTURES) {
    console.log(`--- ${v.name} ---`);

    // Check venture state
    const { data: venture } = await supabase
      .from('ventures')
      .select('current_lifecycle_stage, orchestrator_state, vision_id, architecture_plan_id')
      .eq('id', v.id)
      .single();
    console.log(`  Stage: ${venture?.current_lifecycle_stage} | State: ${venture?.orchestrator_state}`);
    console.log(`  vision_id: ${venture?.vision_id || 'null'} | architecture_plan_id: ${venture?.architecture_plan_id || 'null'}`);

    // Check EVA vision records
    const { data: visions } = await supabase
      .from('eva_vision_documents')
      .select('vision_key, version, status, venture_id')
      .eq('venture_id', v.id);

    if (visions && visions.length > 0) {
      for (const vis of visions) {
        console.log(`  ✅ Vision: ${vis.vision_key} v${vis.version} (${vis.status}) venture_id=${vis.venture_id ? 'SET' : 'NULL'}`);
      }
    } else {
      console.log(`  ❌ No EVA vision records`);
      allPass = false;
    }

    // Check EVA architecture records
    const { data: archs } = await supabase
      .from('eva_architecture_plans')
      .select('plan_key, version, status, venture_id')
      .eq('venture_id', v.id);

    if (archs && archs.length > 0) {
      for (const arch of archs) {
        console.log(`  ✅ Arch: ${arch.plan_key} v${arch.version} (${arch.status}) venture_id=${arch.venture_id ? 'SET' : 'NULL'}`);
      }
    } else {
      console.log(`  ⚠️  No EVA architecture records (expected after stage 13)`);
    }

    // Check venture_artifacts with vision/plan keys
    const { count: withVision } = await supabase
      .from('venture_artifacts')
      .select('*', { count: 'exact', head: true })
      .eq('venture_id', v.id)
      .not('supports_vision_key', 'is', null);

    const { count: withPlan } = await supabase
      .from('venture_artifacts')
      .select('*', { count: 'exact', head: true })
      .eq('venture_id', v.id)
      .not('supports_plan_key', 'is', null);

    const { count: totalArts } = await supabase
      .from('venture_artifacts')
      .select('*', { count: 'exact', head: true })
      .eq('venture_id', v.id);

    console.log(`  Artifacts: ${totalArts} total, ${withVision} with vision_key, ${withPlan} with plan_key`);
    console.log('');
  }

  console.log(allPass ? '✅ All verification checks passed' : '❌ Some checks failed — see above');
}

// Main
const command = process.argv[2];
if (command === 'reset') {
  await resetVentures();
} else if (command === 'verify') {
  await verifyEvaRecords();
} else if (command === 'run') {
  const ventureName = process.argv[3];
  const venture = VENTURES.find(v => v.name.toLowerCase().includes((ventureName || '').toLowerCase()));
  if (!venture) {
    console.error('Usage: node scripts/temp-venture-restart.mjs run <venture-name>');
    console.error('Ventures:', VENTURES.map(v => v.name).join(', '));
    process.exit(1);
  }
  console.log(`Starting ${venture.name} from stage 1...`);
  const { spawn } = await import('child_process');
  const child = spawn('node', ['scripts/eva-run.js', venture.id, '--stage', '1'], {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  child.on('exit', (code) => process.exit(code));
} else {
  console.log('Usage:');
  console.log('  node scripts/temp-venture-restart.mjs reset    # Reset all ventures');
  console.log('  node scripts/temp-venture-restart.mjs verify   # Verify EVA records');
  console.log('  node scripts/temp-venture-restart.mjs run <name> # Run venture');
}
