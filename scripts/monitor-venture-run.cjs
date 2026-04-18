/**
 * Venture Pipeline Monitor — LegacyGuard AI push-through run
 * Push S3-S16 via chairman approval + API advance, stop at S17
 * Monitors Stitch integration artifacts and flags pipeline issues
 */
'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const VENTURE_ID = 'ef9a1d12-9703-4a97-b432-4a3ea8452647';
const VENTURE_NAME = 'Aeterna Wills';
const STOP_AT_STAGE = 17;
const POLL_MS = 30000;

// Gate classification (from gate-constants.js)
const KILL_GATES = new Set([3, 5, 13]);       // can terminate venture
const PROMOTION_GATES = new Set([10, 17]);     // mode transition
const ALL_GATES = new Set([3, 5, 10, 13, 17]); // all blocking gates up to S17

const STAGE_NAMES = {
  1:'Ideation', 2:'Research', 3:'Validation', 4:'Market Analysis', 5:'Business Model',
  6:'Competitor Analysis', 7:'MVP Definition', 8:'Technical Assessment', 9:'Financial Modeling',
  10:'Team Formation', 11:'Prototype', 12:'User Testing', 13:'Pivot/Persevere',
  14:'Go-to-Market', 15:'Launch Prep', 16:'Soft Launch', 17:'Design Refinement (STITCH CURATION)'
};

const STITCH_ARTIFACT_TYPES = [
  'stitch_curation', 'stitch_project', 'stitch_provisioned',
  'convergence_result', 'wireframe_final', 'stitch_export', 'stitch_design_export',
  'design_token_manifest', 'archetype_selection', 'style_brief',
  's17_archetypes', 's17_session_state', 's17_approved', 's17_variant_scores',
  'stage_17_approved_mobile', 'stage_17_approved_desktop'
];

let lastStage = null;
let issues = [];
let pollCount = 0;
let stageTimings = {};  // stage -> { entered: Date, exited: Date }
let artifactLog = [];   // cumulative artifact log for post-run analysis

function ts() { return new Date().toISOString().slice(11, 19); }

async function getVentureState() {
  const { data, error } = await sb.from('ventures')
    .select('current_lifecycle_stage, workflow_status, orchestrator_state, updated_at')
    .eq('id', VENTURE_ID).single();
  if (error) {
    issues.push({ stage: lastStage, type: 'db_read_error', msg: error.message, ts: ts() });
    return null;
  }
  return data;
}

async function getPendingDecision(stage) {
  const { data } = await sb.from('chairman_decisions')
    .select('id, status, decision, lifecycle_stage')
    .eq('venture_id', VENTURE_ID)
    .eq('lifecycle_stage', stage)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .limit(1);
  return data?.[0] || null;
}

async function getArtifacts(stage) {
  const { data } = await sb.from('venture_artifacts')
    .select('lifecycle_stage, artifact_type, title, created_at, metadata')
    .eq('venture_id', VENTURE_ID)
    .eq('lifecycle_stage', stage)
    .order('created_at', { ascending: false })
    .limit(10);
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
    .in('artifact_type', STITCH_ARTIFACT_TYPES)
    .order('created_at', { ascending: false })
    .limit(20);
  return data || [];
}

async function getStageTransitions() {
  const { data } = await sb.from('venture_stage_transitions')
    .select('from_stage, to_stage, created_at, transition_type')
    .eq('venture_id', VENTURE_ID)
    .order('created_at', { ascending: false })
    .limit(20);
  return data || [];
}

async function approveDecision(decisionId, stage) {
  // Defense-in-depth: never approve at or past STOP_AT_STAGE
  if (stage >= STOP_AT_STAGE) {
    console.log(`[${ts()}]    BLOCKED: Refusing to approve S${stage} — at or past STOP_AT_STAGE (${STOP_AT_STAGE})`);
    return { data: null, error: { message: `Stage ${stage} >= STOP_AT_STAGE ${STOP_AT_STAGE}` } };
  }
  const gateType = KILL_GATES.has(stage) ? 'kill_gate' : PROMOTION_GATES.has(stage) ? 'promotion_gate' : 'standard';
  const { data, error } = await sb.rpc('approve_chairman_decision', {
    p_decision_id: decisionId,
    p_rationale: `Monitor auto-push: advancing ${VENTURE_NAME} S${stage} ${gateType} gate`,
    p_decided_by: 'venture_monitor'
  });
  return { data, error };
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

  // Track stage timing
  if (stageChanged) {
    if (lastStage !== null && stageTimings[lastStage]) {
      stageTimings[lastStage].exited = new Date();
      const dur = ((stageTimings[lastStage].exited - stageTimings[lastStage].entered) / 1000).toFixed(0);
      console.log(`[${ts()}]    [TIMING] S${lastStage} completed in ${dur}s`);
    }
    stageTimings[stage] = { entered: new Date(), exited: null };
  }
  lastStage = stage;
  const stageName = STAGE_NAMES[stage] || `Stage ${stage}`;
  const gateLabel = KILL_GATES.has(stage) ? ' [KILL GATE]' : PROMOTION_GATES.has(stage) ? ' [PROMO GATE]' : '';

  const prefix = stageChanged ? '>> STAGE CHANGE ->' : `   Poll #${pollCount}     `;
  console.log(`[${ts()}] ${prefix} S${stage} (${stageName})${gateLabel} | orch=${state.orchestrator_state} | wf=${state.workflow_status}`);

  // STOP at S17
  if (stage >= STOP_AT_STAGE) {
    console.log(`\n[${ts()}] REACHED S${STOP_AT_STAGE} — STOPPING AUTO-PUSH. Design refinement begins naturally.`);

    // Stitch artifact summary
    const stitchArts = await checkStitchArtifacts();
    if (stitchArts.length > 0) {
      console.log(`[${ts()}] STITCH ARTIFACTS (${stitchArts.length}):`);
      stitchArts.forEach(a => {
        const meta = a.metadata ? ` | keys: ${Object.keys(a.metadata).join(',')}` : '';
        console.log(`   S${a.lifecycle_stage} | ${a.artifact_type} | ${a.title}${meta}`);
      });
    } else {
      console.log(`[${ts()}] WARNING: No stitch artifacts yet — worker may still be provisioning`);
      issues.push({ stage, type: 'no_stitch_artifacts', msg: 'No stitch artifacts at S17 entry', ts: ts() });
    }

    // Full artifact summary
    console.log(`\n[${ts()}] FULL ARTIFACT SUMMARY:`);
    const all = await getAllArtifacts();
    const byStage = {};
    all.forEach(a => { (byStage[a.lifecycle_stage] = byStage[a.lifecycle_stage] || []).push(a.artifact_type); });
    Object.keys(byStage).sort((a,b)=>+a-+b).forEach(s => {
      console.log(`   S${s}: ${byStage[s].join(', ')}`);
    });

    // Stage timing summary
    console.log(`\n[${ts()}] STAGE TIMING SUMMARY:`);
    Object.keys(stageTimings).sort((a,b)=>+a-+b).forEach(s => {
      const t = stageTimings[s];
      if (t.entered) {
        const dur = ((t.exited || new Date()) - t.entered) / 1000;
        const durStr = dur > 60 ? `${(dur/60).toFixed(1)}m` : `${dur.toFixed(0)}s`;
        console.log(`   S${s}: ${durStr}`);
      }
    });

    // Transition log
    const transitions = await getStageTransitions();
    if (transitions.length > 0) {
      console.log(`\n[${ts()}] TRANSITION LOG:`);
      transitions.reverse().forEach(t => {
        console.log(`   S${t.from_stage} -> S${t.to_stage} | ${t.transition_type || 'normal'} | ${t.created_at}`);
      });
    }

    return false;
  }

  // Show artifacts on stage change
  if (stageChanged) {
    const arts = await getArtifacts(stage);
    if (arts.length > 0) {
      console.log(`[${ts()}]    ARTIFACTS S${stage}: ${arts.map(a => a.artifact_type).join(', ')}`);
      artifactLog.push(...arts.map(a => ({ stage, type: a.artifact_type, title: a.title, at: a.created_at })));
    }

    // Stitch tracking from S11+ (design tokens start here)
    if (stage >= 11) {
      const stitchArts = await checkStitchArtifacts();
      if (stitchArts.length > 0) {
        console.log(`[${ts()}]    STITCH: ${stitchArts.map(a => `S${a.lifecycle_stage}:${a.artifact_type}`).join(', ')}`);
      } else if (stage >= 15) {
        // S15 should have stitch provisioning
        console.log(`[${ts()}]    STITCH WARNING: No stitch artifacts by S${stage} — expected provisioning at S15`);
        issues.push({ stage, type: 'stitch_missing', msg: `No stitch artifacts by S${stage}`, ts: ts() });
      }
    }

    // Validate expected artifacts per stage
    validateStageArtifacts(stage, arts);
  }

  // Handle blocked / pending orchestrator
  const isBlocked = state.orchestrator_state === 'blocked' || state.workflow_status === 'pending';

  if (isBlocked) {
    const pending = await getPendingDecision(stage);
    if (pending) {
      const gateDesc = ALL_GATES.has(stage) ? `gate S${stage}` : `S${stage}`;
      console.log(`[${ts()}]    APPROVING ${gateDesc} decision ${pending.id.slice(0,8)}...`);
      const { data, error } = await approveDecision(pending.id, stage);
      if (error) {
        const msg = `S${stage} approval failed: ${error.message}`;
        console.log(`[${ts()}]    FAILED: ${msg}`);
        issues.push({ stage, type: 'approval_failed', msg, ts: ts() });
      } else {
        console.log(`[${ts()}]    APPROVED S${stage} — worker will advance`);
      }
    } else {
      console.log(`[${ts()}]    WAITING: S${stage} blocked — worker processing (LLM in-flight)...`);
    }
  }

  return true;
}

function validateStageArtifacts(stage, arts) {
  const types = new Set(arts.map(a => a.artifact_type));

  // Stage-specific artifact expectations (use actual artifact_type values from ARTIFACT_TYPES registry)
  if (stage === 11 && !types.has('identity_naming_visual') && !types.has('identity_brand_name') && !types.has('design_token_manifest')) {
    issues.push({ stage, type: 'missing_artifact', msg: 'S11 missing identity_naming_visual or design_token_manifest', ts: ts() });
    console.log(`[${ts()}]    ISSUE: S11 expected identity_naming_visual/design_token_manifest artifact`);
  }
  if (stage === 15 && !types.has('blueprint_wireframes') && !types.has('blueprint_user_story_pack')) {
    issues.push({ stage, type: 'missing_artifact', msg: 'S15 missing blueprint_wireframes artifact', ts: ts() });
    console.log(`[${ts()}]    ISSUE: S15 expected blueprint_wireframes artifact`);
  }
  if (stage === 16 && !types.has('stitch_curation') && !types.has('stitch_project')) {
    issues.push({ stage, type: 'missing_artifact', msg: 'S16 missing stitch_curation/stitch_project', ts: ts() });
    console.log(`[${ts()}]    ISSUE: S16 expected stitch_curation or stitch_project artifact`);
  }
}

async function main() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(` VENTURE MONITOR — ${VENTURE_NAME} (${VENTURE_ID.slice(0,8)})`);
  console.log(` Poll every ${POLL_MS/1000}s | Auto-push S3-S16 | STOP at S17`);
  console.log(` Kill gates: S3, S5, S13 | Promotion gates: S10, S17`);
  console.log(` Stitch watch: S11+ tokens, S15+ wireframes, S17 curation`);
  console.log(`${'='.repeat(70)}\n`);

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
          console.log(`\nISSUES DETECTED (${issues.length}):`);
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
