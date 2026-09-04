#!/usr/bin/env node
/**
 * SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001 — Explore breadth search at LEAD-TO-PLAN.
 *
 * Read-only pass over the reaper stack (detectors.js, worktree-reaper.mjs,
 * worktree-manager.js, cc-pid-liveness.cjs, safe-worktree-remove.mjs,
 * worktree-reaper-tick.cjs, audit-sink.js, create-quick-fix.js/qf-start.js,
 * setup-*-task.mjs, worktree-reapability.js) confirming implementation seams
 * for FR-1/FR-2/FR-3/FR-5 and CONFIRMING the audit-sink severity bug
 * (audit_log_severity_check allows only info/warning/error/critical;
 * audit-sink.js writes low/medium). Flags one discrepancy: the SD's
 * "TWO CORRECTIONS" text describes safe-worktree-remove.mjs reading a null
 * owner as LIVE (fail-closed); the code as read does the opposite
 * (Boolean(null) = false = not live). VALIDATION's independent pass (same
 * LEAD-TO-PLAN gate) later resolved this precisely: resolveLiveClaim treats
 * claim-row PRESENCE as liveness with no liveness probe at all, so a session
 * that died without releasing pins its tree as live_owner forever -- the
 * stated cause (null-owner branch) doesn't exist, but FR-1's prescribed
 * remedy still fixes the real mechanism.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 88,
  phase: 'LEAD',
  execution_time_ms: 0,
  summary: 'Read-only breadth pass over the worktree-reaper stack for FR-0/FR-1/FR-2/FR-3/FR-5 implementation seams. Confirmed: (1) stageForCategories in scripts/worktree-reaper.mjs (~lines 810-820) is the natural PRESERVE/RECLAIM seam -- hasHardKeep-matched trees currently never enter `categories` at all (pre-check, not a category); (2) removeWorktreeViaGit exists at lib/worktree-manager.js:1526 with the {allowFail,guard,liveOwner,logger} signature the SD references as the sanctioned removal path; (3) lib/fleet/cc-pid-liveness.cjs markerDirs() (line 57) is the PID-liveness union RECLAIM needs, but callers must call it explicitly (not the single-markerDir default) to get both the local and main-worktree marker dirs; (4) FREEZE_CUT_MINUTES lives in lib/fleet/genuine-worker.mjs:75-77 (default 120min, floor 15min, env override FLEET_FREEZE_CUT_MINUTES), NOT in worktree-reaper-tick.cjs; (5) the audit-sink severity bug is CONFIRMED at the code level -- audit_log_severity_check (docs/reference/schema/engineer/tables/audit_log.md:38) allows only {info,warning,error,critical}, lib/worktree-reaper/audit-sink.js:44 writes severity: keep?"low":"medium", matching the exact "audit_log_severity_check" warning observed live this session; (6) scripts/qf-start.js has ZERO worktree/reaper references today (grepped) -- FR-5 needs fresh wiring, not a relocation of existing logic; (7) scripts/setup-liveness-watcher-task.mjs already registers and --verify-readbacks the exact "EHG LEO Stale-Session Sweep" task FR-2 needs to confirm, including a schtasks-XML readback pattern (never compares against submitted config) -- reusable model, but its --verify only confirms the OS task definition exists/enabled, not that the sweep->tick->reaper chain actually fires; (8) lib/worktree-reapability.js:88-99/114-126 confirms the shared-root walk-up detection (`git rev-parse --show-toplevel` climbing to an ancestor when the worktree .git is gone) the SD cites for why a resident PID with cwd inside a removed tree is dangerous.',
  critical_issues: [],
  warnings: [
    {
      id: 'EXP-1',
      severity: 'MEDIUM',
      issue: 'SD text\'s stated root cause for the reclaim-guard null-owner defect does not match the code as read',
      evidence: 'The SD\'s "TWO CORRECTIONS" section states "the current guard reads a NULL owner as LIVE (fail-closed)". scripts/safe-worktree-remove.mjs resolveLiveClaim(key, {supabaseClient}) (lines 53-71), as read in isolation: no key -> false; no Supabase config -> true (fail-closed); DB query error -> true (fail-closed); successful query with claiming_session_id null/absent -> Boolean(null) = false (NOT live) -- the OPPOSITE of the stated defect. Checked adjacent guards too: removeWorktreeViaGit liveOwner param defaults false; lib/worktree-reapability.js isReapable liveOwner=false default; lib/worktree-reaper/live-claim-guard.js liveClaimBlocksRemoval is a DIFFERENT, more conservative guard that fail-closes on an unresolvable work-key basename (reason: work_key_unresolvable), not on a null owner value per se. Flagged as open for PLAN/EXEC to reconcile against the live specimen (coordinator row 744ccfd7) rather than assumed resolved here -- possible the specimen exercised a different code path or a claim-row-presence-as-liveness read (claiming_session_id set but the session dead) rather than a genuinely null owner.',
      location: 'scripts/safe-worktree-remove.mjs:53-71',
    },
    {
      id: 'EXP-2',
      severity: 'LOW',
      issue: 'worktree-reaper.mjs removal-execution loop (where preserve-before-delete and removeWorktree interact at runtime) not fully read in this pass',
      evidence: 'File is 1868 lines total; this pass read through ~line 1417 (classifyWorktree/stageForCategories dispatch and CLI flow). The exact runtime interaction point further down the file, needed for precise PRESERVE/RECLAIM insertion-line targeting, is a follow-up read for PLAN/EXEC.',
      location: 'scripts/worktree-reaper.mjs (unread tail, ~1417-1868)',
    },
  ],
  recommendations: [
    'PLAN: reconcile EXP-1 (null-owner claim) against the live specimen (coordinator row 744ccfd7) before finalizing FR-1\'s reclaim-predicate wording -- the code-level mechanism found differs from the SD\'s stated cause even though the same fix likely applies.',
    'PLAN: thread PRESERVE/RECLAIM into scripts/worktree-reaper.mjs at the stageForCategories seam (~lines 810-820), since hasHardKeep-matched trees currently bypass `categories` entirely.',
    'PLAN: FR-5 (qf-start.js quota check) needs net-new code -- confirm no existing partial wiring was missed via a second targeted grep before EXEC scopes the LOC estimate.',
    'PLAN: extend setup-liveness-watcher-task.mjs\'s --verify readback pattern (schtasks XML, never compare-to-submitted) to confirm the sweep -> worktree-reaper-tick.cjs tick() -> reaper spawn chain, not just OS task-definition existence, for FR-2\'s exit predicate.',
  ],
  detailed_analysis: {
    searched_identifiers: ['hasHardKeep', 'stageForCategories', 'removeWorktreeViaGit', 'markerDirs', 'FREEZE_CUT_MINUTES', 'resolveLiveClaim', 'audit_log_severity_check', 'enforceWorktreeQuota', 'setup-*-task.mjs', 'resolveWorktreeRoot'],
    searched_paths: ['lib/worktree-reaper/', 'scripts/worktree-reaper.mjs', 'lib/worktree-manager.js', 'lib/fleet/cc-pid-liveness.cjs', 'scripts/safe-worktree-remove.mjs', 'scripts/fleet/worktree-reaper-tick.cjs', 'lib/fleet/genuine-worker.mjs', 'scripts/create-quick-fix.js', 'scripts/qf-start.js', 'scripts/setup-liveness-watcher-task.mjs', 'lib/worktree-reapability.js'],
    audit_severity_confirmed: {
      allowed: ['info', 'warning', 'error', 'critical'],
      written_by_audit_sink: ['low', 'medium'],
      file: 'lib/worktree-reaper/audit-sink.js:44',
    },
    fr5_qf_start_grep: 'zero matches for worktree/reaper in scripts/qf-start.js',
  },
  metadata: {
    breadth_search: true,
    exhaustive: false,
    worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/qf/QF-20260903-451',
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'EXPLORE',
  probeExistsRelative: 'scripts/one-off/sd-leo-infra-worktree-reaper-preserve-001-explore-lead-to-plan.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('EXPLORE', sdRow.id, { code: 'EXPLORE', name: 'Explore' }, results, {
  sdKey: SD_KEY,
  phase: 'LEAD',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
