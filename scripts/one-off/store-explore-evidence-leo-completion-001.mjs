// SD-LEO-INFRA-LEO-COMPLETION-001 — Explore sub-agent evidence writer (LEAD-TO-PLAN).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-LEO-COMPLETION-001';
const PHASE = 'LEAD-TO-PLAN';

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary:
    'Two parallel Explore-agent discovery passes mapped the current codebase state for all 4 gap areas (G1 launcher/respawn, ' +
    'G2 manifest, G3 operator surface, U4/relaunch-under-profile) before decomposition. Confirmed: no fleet-launcher ' +
    'supervisor process exists anywhere (lib/fleet/spawn-control.js is spawn-and-forget only, zero PID tracking after ' +
    'spawn); no kill-supervisor test exists (the only related test mocks spawnFn, never exercises the real detached path); ' +
    'no reboot/respawn/scheduled-task/--resume code exists in the fleet namespace, though a reusable schtasks pattern ' +
    'exists in an unrelated watcher script; the manifest (lib/fleet/session-manifest.js, from already-merged ' +
    'SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001) is role-count-shaped not slot-shaped, with a naming-collision risk already ' +
    'self-flagged in a sibling PRD payload; lib/fleet/browser-control.js and lib/fleet/session-detail-view.js (already-merged ' +
    'SD-LEO-INFRA-SESSION-VIEW-BROWSER-001 A/B) are fully built+tested but confirmed to have ZERO callers repo-wide; "U4" is ' +
    'undefined anywhere in-repo (a label from the Solomon review only). A follow-up Explore pass resolved the operator-surface ' +
    'ambiguity: a sibling EHG frontend repo exists but has zero session-view scaffolding (greenfield, cross-repo risk); ' +
    'scripts/fleet-dashboard.cjs is a live, actively-developed CLI operator surface and is the concrete lowest-risk ' +
    'integration target for Child E instead. These findings directly informed the 4-child decomposition (B substrate / ' +
    'C launcher-shell / D respawn-runner / E operator-cockpit) and each child\'s enriched description/scope.',
  findings: [
    { id: 'g1-supervisor-absent', severity: 'info', note: 'lib/fleet/spawn-control.js (385 lines): six verb functions (spawn/attach/stop/restart/relaunchUnderProfile/drainAndRestart), no persistent supervisor process, child.unref() only. Zero repo-wide hits for "launcher shell"/"LAUNCHER_SHELL".' },
    { id: 'g1-kill-test-masked', severity: 'info', note: 'tests/unit/fleet/spawn-control.test.js:148-158 mocks spawnFn and asserts only that it was called with expected args — never asserts the real detached:true/stdio:ignore flags reach child_process.spawn (spawn-control.js:146-150), and no test spawns/kills a real process. Confirms the Solomon G1 "test-masked" finding.' },
    { id: 'g1-respawn-absent', severity: 'info', note: 'Zero hits for reboot/respawn/scheduled-task/--resume/resume-UUID under lib/fleet/ or scripts/fleet/. scripts/setup-eva-watcher-task.mjs has a reusable buildSchtasksArgs pattern for an unrelated EVA watcher — adaptable, not wired to fleet respawn.' },
    { id: 'g2-manifest-shape', severity: 'info', note: 'lib/fleet/session-manifest.js (68 lines, from merged SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001): normalizeDesiredManifest/computeManifestDrift are {role,min} count-threshold shaped, not name/color/role/account/worktree/model+effort slot-shaped. .prd-payloads/PRD-SESSION-VIEW-BROWSER-001-A.json:122 already flags a naming-collision risk with this file for a future maintainer.' },
    { id: 'g3-zero-callers-confirmed', severity: 'info', note: 'Repo-wide grep for browser-control/session-detail-view import paths and every exported symbol name (requestBrowserSession, signalTakeover, signalHandBack, driveAction, buildSessionDetailView, mapAttachState, isBrowserMcpEnabled): zero matches outside the two source files and their own unit tests. Confirms Solomon G3 exactly.' },
    { id: 'u4-undefined', severity: 'warning', note: '"U4" (agent-browser cookie-non-leak guarantee) has no definition anywhere in-repo — greps for U4, relaunchUnderProfile-as-cookie-guard, "cookie non-leak" all miss. Must be formally specified by Child B before Child E can write a non-vacuous acceptance test against it.' },
    { id: 'g3-caller-target-resolved', severity: 'info', note: 'Follow-up Explore pass: sibling frontend repo C:\\Users\\rickf\\Projects\\_EHG\\ehg\\ is a real React/Vite SPA but has zero session-view scaffolding (greenfield). scripts/fleet-dashboard.cjs (2469 lines, npm run fleet:dashboard, commits same-day as this SD\'s sourcing) is a live, actively-used CLI operator surface with an existing WORKERS per-session section — the concrete lowest-risk integration target for Child E, folded into that child\'s scope.' },
    { id: 'decomposition-informed', severity: 'info', note: 'These findings, combined with a risk-agent CONDITIONAL_PASS (canary-isolation-harness and U4-spec-before-Child-E as blocking conditions), directly produced the shared-substrate-first 4-child cut: B (substrate, no deps) -> C (launcher, deps B) -> D (respawn, deps B+C); E (cockpit, deps B only, parallel to C/D).' },
  ],
  metadata: {
    explore_passes: 3,
    g1_supervisor_exists: false,
    g1_kill_test_exercises_real_path: false,
    g1_respawn_scaffolding_exists: false,
    g2_manifest_shape: 'role-count ({role,min}), not slot-shaped',
    g2_naming_collision_flagged: true,
    g3_production_callers: 0,
    g3_resolved_caller_target: 'scripts/fleet-dashboard.cjs',
    u4_defined_in_repo: false,
    sibling_frontend_repo: 'C:/Users/rickf/Projects/_EHG/ehg (React/Vite, no session-view scaffolding)',
    children_created: ['SD-LEO-INFRA-LEO-COMPLETION-001-B', 'SD-LEO-INFRA-LEO-COMPLETION-001-C', 'SD-LEO-INFRA-LEO-COMPLETION-001-D', 'SD-LEO-INFRA-LEO-COMPLETION-001-E'],
  },
  execution_time_ms: 1200000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'Explore',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Explore Discovery Agent' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
