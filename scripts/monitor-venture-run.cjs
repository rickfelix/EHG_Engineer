/**
 * Venture Pipeline Monitor — ComplyCube push-through run
 * Push S3-S16 via chairman approval + API advance, stop at S17
 */
'use strict';

// env injected via process.env at startup
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const VENTURE_ID = 'da831b85-5acf-4b24-a3ed-faa68dc3a9a3';
const STOP_AT_STAGE = 17;
const POLL_MS = 30000;
const HARD_GATES = new Set([3, 5, 10, 13]);

const STAGE_NAMES = {
  1:'Ideation', 2:'Research', 3:'Validation', 4:'Market Analysis', 5:'Business Model',
  6:'Competitor Analysis', 7:'MVP Definition', 8:'Technical Assessment', 9:'Financial Modeling',
  10:'Team Formation', 11:'Prototype', 12:'User Testing', 13:'Pivot/Persevere',
  14:'Go-to-Market', 15:'Launch Prep', 16:'Soft Launch', 17:'Metrics Review (STITCH CURATION)'
};

let lastStage = null;
let issues = [];
let pollCount = 0;

function ts() { return new Date().toISOString().slice(11, 19); }

async function getVentureState() {
  const { data } = await sb.from('ventures')
    .select('current_lifecycle_stage, workflow_status, orchestrator_state, updated_at')
    .eq('id', VENTURE_ID).single();
  return data;
}

async function getPendingDecision(stage) {
  const { data } = await sb.from('chairman_decisions')
    .select('id, status, decision')
    .eq('venture_id', VENTURE_ID)
    .eq('lifecycle_stage', stage)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .limit(1);
  return data?.[0] || null;
}

async function getArtifacts(stage) {
  const { data } = await sb.from('venture_artifacts')
    .select('lifecycle_stage, artifact_type, title, created_at')
    .eq('venture_id', VENTURE_ID)
    .eq('lifecycle_stage', stage)
    .order('created_at', { ascending: false })
    .limit(5);
  return data || [];
}

async function getAllArtifacts() {
  const { data } = await sb.from('venture_artifacts')
    .select('lifecycle_stage, artifact_type, title, created_at')
    .eq('venture_id', VENTURE_ID)
    .order('lifecycle_stage', { ascending: true });
  return data || [];
}

async function checkStitchArtifacts() {
  const { data } = await sb.from('venture_artifacts')
    .select('lifecycle_stage, artifact_type, title, created_at, metadata')
    .eq('venture_id', VENTURE_ID)
    .in('artifact_type', [
      'stitch_curation', 'stitch_project', 'stitch_provisioned',
      'convergence_result', 'wireframe_final', 'stitch_export',
      'design_token_manifest', 'archetype_selection', 'style_brief'
    ])
    .order('created_at', { ascending: false })
    .limit(10);
  return data || [];
}

async function approveDecision(decisionId, stage) {
  const { data, error } = await sb.rpc('approve_chairman_decision', {
    p_decision_id: decisionId,
    p_rationale: `Auto-push monitoring: advancing S${stage} gate`,
    p_decided_by: 'monitoring_orchestrator'
  });
  return { data, error };
}

async function advanceViaRPC(toStage) {
  // Use advance_venture_stage RPC (same mechanism as the frontend)
  try {
    const { data, error } = await sb.rpc('advance_venture_stage', {
      p_venture_id: VENTURE_ID,
      p_to_stage: toStage
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

async function poll() {
  pollCount++;
  const state = await getVentureState();
  if (!state) {
    console.log(`[${ts()}] ERROR: Could not fetch venture state`);
    return true;
  }

  const stage = state.current_lifecycle_stage;
  const stageChanged = stage !== lastStage;
  lastStage = stage;
  const stageName = STAGE_NAMES[stage] || `Stage ${stage}`;

  const prefix = stageChanged ? '⬆️  STAGE CHANGE →' : `   Poll #${pollCount}     `;
  console.log(`[${ts()}] ${prefix} S${stage} (${stageName}) | orch=${state.orchestrator_state} | wf=${state.workflow_status}`);

  // STOP at S17
  if (stage >= STOP_AT_STAGE) {
    console.log(`\n[${ts()}] 🛑 REACHED S${STOP_AT_STAGE} — STOPPING AUTO-PUSH. Stitch curation begins naturally.`);
    const stitchArts = await checkStitchArtifacts();
    if (stitchArts.length > 0) {
      console.log(`[${ts()}] 🧵 STITCH ARTIFACTS (${stitchArts.length}):`);
      stitchArts.forEach(a => console.log(`   S${a.lifecycle_stage} | ${a.artifact_type} | ${a.title}`));
    } else {
      console.log(`[${ts()}] ⚠️  No stitch artifacts yet — worker may still be provisioning`);
    }
    console.log(`\n[${ts()}] 📊 FULL ARTIFACT SUMMARY:`);
    const all = await getAllArtifacts();
    const byStage = {};
    all.forEach(a => { (byStage[a.lifecycle_stage] = byStage[a.lifecycle_stage] || []).push(a.artifact_type); });
    Object.keys(byStage).sort((a,b)=>+a-+b).forEach(s => console.log(`   S${s}: ${byStage[s].join(', ')}`));
    return false;
  }

  // Show artifacts on stage change
  if (stageChanged) {
    const arts = await getArtifacts(stage);
    if (arts.length > 0) {
      console.log(`[${ts()}]    📦 S${stage} artifacts: ${arts.map(a => a.artifact_type).join(', ')}`);
    }
    // Stitch check at S14+
    if (stage >= 14) {
      const stitchArts = await checkStitchArtifacts();
      if (stitchArts.length > 0) {
        console.log(`[${ts()}]    🧵 Stitch: ${stitchArts.map(a => `S${a.lifecycle_stage}:${a.artifact_type}`).join(', ')}`);
      }
    }
  }

  // Handle blocked / pending orchestrator
  const isBlocked = state.orchestrator_state === 'blocked' || state.workflow_status === 'pending';

  if (isBlocked) {
    if (HARD_GATES.has(stage)) {
      const pending = await getPendingDecision(stage);
      if (pending) {
        console.log(`[${ts()}]    🔓 Gate S${stage} has pending decision ${pending.id} — APPROVING...`);
        const { data, error } = await approveDecision(pending.id, stage);
        if (error) {
          const msg = `S${stage} approval failed: ${error.message}`;
          console.log(`[${ts()}]    ❌ ${msg}`);
          issues.push({ stage, type: 'approval_failed', msg, ts: ts() });
        } else {
          console.log(`[${ts()}]    ✅ S${stage} APPROVED — worker will advance`);
        }
      } else {
        console.log(`[${ts()}]    ⏳ Gate S${stage}: no pending decision yet, waiting for worker...`);
      }
    } else {
      // Non-gate blocked — every stage gets a chairman_decisions row; approve it
      const pending = await getPendingDecision(stage);
      if (pending) {
        console.log(`[${ts()}]    🔓 S${stage} has pending decision — APPROVING...`);
        const { data, error } = await approveDecision(pending.id, stage);
        if (error) {
          console.log(`[${ts()}]    ❌ Approval failed: ${error.message}`);
          issues.push({ stage, type: 'approval_failed', msg: error.message, ts: ts() });
        } else {
          console.log(`[${ts()}]    ✅ S${stage} decision APPROVED — worker will advance`);
        }
      } else {
        console.log(`[${ts()}]    ⏳ S${stage} blocked — worker processing (LLM in-flight)...`);
      }
    }
  }

  return true;
}

async function main() {
  console.log(`\n${'='.repeat(65)}`);
  console.log(` VENTURE MONITOR — ComplyCube (da831b85)`);
  console.log(` Poll every 30s | Auto-push S3-S16 | STOP at S17`);
  console.log(` Hard gates needing approval: S3, S5, S10, S13`);
  console.log(` Stitch watch: S14, S15, S16 artifacts`);
  console.log(`${'='.repeat(65)}\n`);

  const cont = await poll();
  if (!cont) {
    console.log('\n[MONITOR] Done.');
    return;
  }

  const interval = setInterval(async () => {
    try {
      const cont = await poll();
      if (!cont) {
        clearInterval(interval);
        console.log(`\n[MONITOR] Monitoring complete.`);
        if (issues.length > 0) {
          console.log(`\n⚠️  ISSUES DETECTED (${issues.length}):`);
          console.log(JSON.stringify(issues, null, 2));
        } else {
          console.log('No issues detected. Pipeline ran cleanly to S17.');
        }
        process.exit(0);
      }
    } catch(e) {
      console.error(`[${ts()}] POLL ERROR:`, e.message);
      issues.push({ type: 'poll_error', msg: e.message, ts: ts() });
    }
  }, POLL_MS);

  // Max 3 hours
  setTimeout(() => {
    clearInterval(interval);
    console.log('\n[MONITOR] 3h timeout reached. Exiting.');
    process.exit(0);
  }, 10800000);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
