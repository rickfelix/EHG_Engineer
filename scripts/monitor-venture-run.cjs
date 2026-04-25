/**
 * Venture Pipeline Monitor — ImpactPath run
 * Push S3-S16 via chairman approval RPC, HARD STOP at S17
 * Monitors wireframe_screens artifact (Stitch replacement) and flags pipeline issues
 *
 * SD-LEO-ORCH-REPLACE-GOOGLE-STITCH-001: Stitch replaced with wireframe_screens artifact path
 * SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001: Watch for strategy-driven variants, design mastering,
 *   cross-variant awareness, strategy stats feedback loop
 */
'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const VENTURE_ID = process.env.VENTURE_ID || '94856fc6-9ba9-4f56-9a5c-85041031a0fc';
const VENTURE_NAME = process.env.VENTURE_NAME || 'LexiGuard';
const STOP_AT_STAGE = 17;
const POLL_MS = 30000;

// Gate classification — sourced from lifecycle_stage_config (DB authoritative as of 2026-04-25)
// Decision gates require chairman_decision row before advance. PROMOTION = metadata.gate_type='promotion'.
// S23 is named "Launch Readiness Kill Gate" but stored as decision_gate; flagged here for log clarity.
const KILL_GATES = new Set([23]);
const PROMOTION_GATES = new Set([17]);
const BLOCKING_GATES = new Set([3, 5, 13, 16, 17, 23, 24]);
// Stages that need an SD/human input (work_type=sd_required) — auto-advance is unsafe
const SD_REQUIRED_STAGES = new Set([10, 18, 19]);

const STAGE_NAMES = {
   0:'Stage Zero',
   1:'Draft Idea',
   2:'AI Review',
   3:'Comprehensive Validation [GATE]',
   4:'Competitive Intelligence',
   5:'Profitability Forecasting [GATE]',
   6:'Risk Evaluation',
   7:'Revenue Architecture',
   8:'Business Model Canvas',
   9:'Exit Strategy',
  10:'Customer & Brand Foundation [SD]',
  11:'Naming & Visual Identity',
  12:'GTM & Sales Strategy',
  13:'Product Roadmap [GATE]',
  14:'Technical Architecture',
  15:'Design Studio',
  16:'Financial Projections [GATE]',
  17:'Blueprint Review [PROMO GATE]',
  18:'Marketing Copy Studio [SD]',
  19:'Build in Replit [SD]',
  20:'Code Quality Gate',
  21:'Visual Assets',
  22:'Distribution Setup',
  23:'Launch Readiness [KILL GATE]',
  24:'Go Live & Announce [GATE]',
  25:'Post-Launch Review',
  26:'Growth Playbook'
};

// Post-Stitch-replacement: monitor wireframe_screens instead of stitch artifacts
const DESIGN_ARTIFACT_TYPES = [
  'wireframe_screens',        // S15 post-hook writes this (replaces stitch provisioning)
  'blueprint_wireframes',     // S15 wireframes
  'design_token_manifest',    // S17 brand tokens
  's17_archetypes',           // S17 archetype variants
  's17_session_state',        // S17 session resume
  's17_approved',             // S17 final selections
  's17_approved_png',         // Playwright PNG screenshots
  's17_variant_scores',       // S17 scoring results
  's17_design_system',        // NEW: Design mastering output (SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001-B)
  's17_strategy_stats',       // NEW: Strategy effectiveness tracking (SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001-C)
  // Legacy (should NOT appear for new ventures post-Stitch-replacement)
  'stitch_curation', 'stitch_project', 'stitch_design_export',
];

// Stage artifact expectations — sourced from lifecycle_stage_config.required_artifacts (DB authoritative)
const EXPECTED_ARTIFACTS = {
   1: ['truth_idea_brief'],
   2: ['truth_ai_critique'],
   3: ['truth_validation_decision'],
   4: ['truth_competitive_analysis'],
   5: ['truth_financial_model'],
   6: ['engine_risk_matrix'],
   7: ['engine_pricing_model'],
   8: ['engine_business_model_canvas'],
   9: ['engine_exit_strategy'],
  10: ['identity_persona_brand'],
  11: ['identity_naming_visual'],
  12: ['identity_brand_guidelines', 'identity_gtm_sales_strategy'],
  13: ['blueprint_product_roadmap'],
  14: ['blueprint_technical_architecture', 'blueprint_data_model', 'blueprint_erd_diagram', 'blueprint_api_contract', 'blueprint_schema_spec'],
  15: ['blueprint_wireframes'],
  16: ['blueprint_financial_projection'],
  17: ['system_devils_advocate_review'],
};

let lastStage = null;
let issues = [];
let pollCount = 0;
let stageTimings = {};
let artifactLog = [];
let stitchCallDetected = false; // Flag if any stitch artifacts appear (shouldn't for new ventures)

function ts() { return new Date().toISOString().slice(11, 19); }
function pad(n) { return String(n).padStart(2, ' '); }

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
    .select('id, status, decision, lifecycle_stage, decision_type')
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

async function checkDesignArtifacts() {
  const { data } = await sb.from('venture_artifacts')
    .select('lifecycle_stage, artifact_type, title, created_at, metadata')
    .eq('venture_id', VENTURE_ID)
    .in('artifact_type', DESIGN_ARTIFACT_TYPES)
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
  if (stage >= STOP_AT_STAGE) {
    console.log(`[${ts()}]    BLOCKED: Refusing to approve S${stage} — at or past STOP_AT_STAGE (${STOP_AT_STAGE})`);
    return { data: null, error: { message: `Stage ${stage} >= STOP_AT_STAGE ${STOP_AT_STAGE}` } };
  }
  const gateType = KILL_GATES.has(stage) ? 'KILL' : PROMOTION_GATES.has(stage) ? 'PROMO' : 'STD';
  const { data, error } = await sb.rpc('approve_chairman_decision', {
    p_decision_id: decisionId,
    p_rationale: `Monitor auto-push: advancing ${VENTURE_NAME} S${stage} [${gateType}]`,
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
      console.log(`[${ts()}]    [TIMING] S${pad(lastStage)} completed in ${dur}s`);
    }
    stageTimings[stage] = { entered: new Date(), exited: null };
  }
  lastStage = stage;
  const stageName = STAGE_NAMES[stage] || `Stage ${stage}`;
  const gateLabel = KILL_GATES.has(stage) ? ' [KILL GATE]' : PROMOTION_GATES.has(stage) ? ' [PROMO GATE]' : '';

  const prefix = stageChanged ? '>> STAGE CHANGE ->' : `   Poll #${pollCount}     `;
  console.log(`[${ts()}] ${prefix} S${pad(stage)} (${stageName})${gateLabel} | orch=${state.orchestrator_state} | wf=${state.workflow_status}`);

  // STOP at S17
  if (stage >= STOP_AT_STAGE) {
    console.log(`\n[${ts()}] ${'='.repeat(60)}`);
    console.log(`[${ts()}] REACHED S${STOP_AT_STAGE} — STOPPING AUTO-PUSH`);
    console.log(`[${ts()}] Design refinement begins naturally (archetype generation via wireframe_screens)`);
    console.log(`[${ts()}] ${'='.repeat(60)}`);

    // Design artifact summary (post-Stitch-replacement monitoring)
    const designArts = await checkDesignArtifacts();
    const legacyStitch = designArts.filter(a => ['stitch_curation', 'stitch_project', 'stitch_design_export'].includes(a.artifact_type));
    const newPath = designArts.filter(a => ['wireframe_screens', 's17_archetypes', 's17_approved_png'].includes(a.artifact_type));

    console.log(`\n[${ts()}] STITCH REPLACEMENT CHECK:`);
    if (legacyStitch.length > 0) {
      console.log(`   WARNING: ${legacyStitch.length} legacy Stitch artifact(s) found — Stitch should be disabled!`);
      legacyStitch.forEach(a => console.log(`   LEGACY: S${a.lifecycle_stage} | ${a.artifact_type} | ${a.title}`));
      issues.push({ stage, type: 'stitch_not_disabled', msg: `${legacyStitch.length} legacy stitch artifacts found`, ts: ts() });
      stitchCallDetected = true;
    } else {
      console.log(`   OK: No legacy Stitch artifacts — Stitch replacement working correctly`);
    }
    if (newPath.length > 0) {
      console.log(`   NEW PATH: ${newPath.length} wireframe/archetype artifact(s):`);
      newPath.forEach(a => console.log(`   S${a.lifecycle_stage} | ${a.artifact_type} | ${a.title}`));
    }

    // Full artifact summary
    console.log(`\n[${ts()}] FULL ARTIFACT SUMMARY:`);
    const all = await getAllArtifacts();
    const byStage = {};
    all.forEach(a => { (byStage[a.lifecycle_stage] = byStage[a.lifecycle_stage] || []).push(a.artifact_type); });
    Object.keys(byStage).sort((a,b) => +a - +b).forEach(s => {
      console.log(`   S${pad(s)}: ${byStage[s].join(', ')}`);
    });

    // Stage timing summary
    console.log(`\n[${ts()}] STAGE TIMING SUMMARY:`);
    let totalSec = 0;
    Object.keys(stageTimings).sort((a,b) => +a - +b).forEach(s => {
      const t = stageTimings[s];
      if (t.entered) {
        const dur = ((t.exited || new Date()) - t.entered) / 1000;
        totalSec += dur;
        const durStr = dur > 60 ? `${(dur/60).toFixed(1)}m` : `${dur.toFixed(0)}s`;
        console.log(`   S${pad(s)}: ${durStr}`);
      }
    });
    console.log(`   TOTAL: ${(totalSec/60).toFixed(1)}m`);

    // Transition log
    const transitions = await getStageTransitions();
    if (transitions.length > 0) {
      console.log(`\n[${ts()}] TRANSITION LOG:`);
      transitions.reverse().forEach(t => {
        console.log(`   S${pad(t.from_stage)} -> S${pad(t.to_stage)} | ${t.transition_type || 'normal'} | ${t.created_at}`);
      });
    }

    // Issues summary
    if (issues.length > 0) {
      console.log(`\n[${ts()}] ISSUES DETECTED (${issues.length}):`);
      issues.forEach(i => console.log(`   [S${i.stage}] ${i.type}: ${i.msg} (${i.ts})`));
    }

    return false;
  }

  // Show artifacts on stage change
  if (stageChanged) {
    const arts = await getArtifacts(stage);
    if (arts.length > 0) {
      console.log(`[${ts()}]    ARTIFACTS S${pad(stage)}: ${arts.map(a => a.artifact_type).join(', ')}`);
      artifactLog.push(...arts.map(a => ({ stage, type: a.artifact_type, title: a.title, at: a.created_at })));
    }

    // Validate expected artifacts for previous stage
    if (lastStage !== null) {
      const prevArts = await getArtifacts(stage - 1);
      validateStageArtifacts(stage - 1, prevArts);
    }

    // Post-Stitch monitoring: track wireframe_screens at S15+
    if (stage >= 15) {
      const designArts = await checkDesignArtifacts();
      if (designArts.length > 0) {
        console.log(`[${ts()}]    DESIGN: ${designArts.map(a => `S${a.lifecycle_stage}:${a.artifact_type}`).join(', ')}`);
      }

      // Check for wireframe_screens specifically at S15+
      const wfScreens = designArts.filter(a => a.artifact_type === 'wireframe_screens');
      if (wfScreens.length > 0) {
        const screenCount = wfScreens[0].metadata?.screenCount ?? 'unknown';
        console.log(`[${ts()}]    WIREFRAME_SCREENS: ${screenCount} screens stored (Stitch replacement working)`);
      } else if (stage >= 16) {
        console.log(`[${ts()}]    WARNING: No wireframe_screens artifact at S${stage} — S15 hook may have failed`);
        issues.push({ stage, type: 'wireframe_screens_missing', msg: `No wireframe_screens by S${stage}`, ts: ts() });
      }

      // Alert if legacy stitch artifacts appear
      const legacy = designArts.filter(a => ['stitch_curation', 'stitch_project', 'stitch_design_export'].includes(a.artifact_type));
      if (legacy.length > 0) {
        console.log(`[${ts()}]    ALERT: Legacy Stitch artifacts detected — Stitch should be disabled!`);
        issues.push({ stage, type: 'stitch_not_disabled', msg: `Legacy stitch artifact: ${legacy[0].artifact_type}`, ts: ts() });
        stitchCallDetected = true;
      }
    }
  }

  // Handle blocked / pending orchestrator
  const isBlocked = state.orchestrator_state === 'blocked' || state.workflow_status === 'pending';

  if (isBlocked) {
    const pending = await getPendingDecision(stage);
    if (pending) {
      const typeLabel = pending.decision_type || 'unknown';
      console.log(`[${ts()}]    APPROVING S${pad(stage)} (${typeLabel}) decision ${pending.id.slice(0,8)}...`);
      const { data, error } = await approveDecision(pending.id, stage);
      if (error) {
        const msg = `S${stage} approval failed: ${error.message}`;
        console.log(`[${ts()}]    FAILED: ${msg}`);
        issues.push({ stage, type: 'approval_failed', msg, ts: ts() });
      } else {
        console.log(`[${ts()}]    APPROVED S${pad(stage)} — worker will advance`);
      }
    } else {
      // Check if there are older pending decisions (from re-entry attempts)
      const { data: allPending } = await sb.from('chairman_decisions')
        .select('id, lifecycle_stage, status, decision_type, attempt_number')
        .eq('venture_id', VENTURE_ID)
        .eq('status', 'pending')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(3);

      if (allPending && allPending.length > 0) {
        const nearest = allPending[0];
        console.log(`[${ts()}]    FOUND pending decision at S${nearest.lifecycle_stage} (attempt ${nearest.attempt_number || 1}) — approving...`);
        const { error } = await approveDecision(nearest.id, nearest.lifecycle_stage);
        if (error) {
          console.log(`[${ts()}]    FAILED: ${error.message}`);
        } else {
          console.log(`[${ts()}]    APPROVED S${nearest.lifecycle_stage} (cross-stage) — worker should unblock`);
        }
      } else {
        console.log(`[${ts()}]    WAITING: S${pad(stage)} blocked — worker processing (LLM in-flight)...`);
      }
    }
  }

  return true;
}

function validateStageArtifacts(stage, arts) {
  const types = new Set(arts.map(a => a.artifact_type));
  const expected = EXPECTED_ARTIFACTS[stage];
  if (!expected) return;

  const missing = expected.filter(e => !types.has(e));
  if (missing.length > 0) {
    const msg = `S${stage} missing expected: ${missing.join(', ')}`;
    issues.push({ stage, type: 'missing_artifact', msg, ts: ts() });
    console.log(`[${ts()}]    ISSUE: ${msg}`);
  }
}

async function main() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(` VENTURE MONITOR — ${VENTURE_NAME} (${VENTURE_ID.slice(0,8)})`);
  console.log(` Poll every ${POLL_MS/1000}s | Auto-push to S${STOP_AT_STAGE - 1} | HARD STOP at S${STOP_AT_STAGE}`);
  console.log(` Decision gates  : S3, S5, S13, S16, S17 (PROMO), S23 (KILL), S24`);
  console.log(` Manual / sd_req : S10 Brand, S18 Marketing Copy, S19 Build in Replit`);
  console.log(` Phases: 1 TRUTH(1-5) | 2 ENGINE(6-9) | 3 IDENTITY(10-12) | 4 BLUEPRINT(13-17) | 5 BUILD&MARKET(18-22) | 6 LAUNCH&GROW(23-26)`);
  console.log(` Stop point S${STOP_AT_STAGE} = Blueprint Review (promotion gate); next is S18 Marketing Copy (manual)`);
  console.log(` Watch: wireframe_screens (S15), s17_archetypes / s17_design_system / s17_strategy_stats (S17)`);
  console.log(` Legacy Stitch artifacts should NOT appear for new ventures`);
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
          issues.forEach(i => console.log(`  [S${i.stage}] ${i.type}: ${i.msg}`));
        } else {
          console.log('No issues detected. Pipeline ran cleanly to S17.');
        }
        if (stitchCallDetected) {
          console.log('\nSTITCH REPLACEMENT FAILURE: Legacy Stitch artifacts were created. RCA needed.');
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
