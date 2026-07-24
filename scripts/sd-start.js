#!/usr/bin/env node
/**
 * SD Start - Claim an SD and begin work
 *
 * Usage: npm run sd:start <SD-ID>
 *
 * Actions:
 * 1. Claims the SD for current session (sets is_working_on = true)
 * 2. Displays SD info, current phase, and next recommended action
 *
 * This is the recommended way to start work on an SD outside of
 * the formal handoff workflow.
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { execSync } from 'child_process';
// SD-LEO-INFRA-CLAIM-FITNESS-FAILOPEN-BYPASS-001 (FR-1): no-throw best-effort claim release. Replaces the
// `await supabase.rpc('release_sd', {...}).catch(() => {})` calls — the PostgREST builder has no .catch, so
// that .catch threw a TypeError before the blocking process.exit(1) and the outer catch swallowed it (fail-OPEN).
import { bestEffortReleaseSd } from '../lib/fleet/best-effort-release.mjs';
// SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR5): getRepoRoot resolves the
// canonical main repo regardless of cwd; isInsideWorktree is used as an
// early guard to prevent nested-worktree creation when sd-start is
// accidentally invoked from inside a .worktrees/ subtree.
import { getRepoRoot, isInsideWorktree } from '../lib/repo-paths.js';
import os from 'os';
import path from 'node:path';
import dotenv from 'dotenv';
import { getOrCreateSession } from '../lib/session-manager.mjs'; // (updateHeartbeat import was long-dead — dropped with the FR-5/FR-6 extraction lint pass)
import { resolveOwnSession } from '../lib/resolve-own-session.js';
import { assertValidClaim, ClaimIdentityError } from '../lib/claim-validity-gate.js';
// SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001: FR-3 inbox poll + FR-2 sd_key drift detector
import { hasRecentClaimReleased, formatClaimReleasedAbort, detectSdKeyDrift } from '../lib/claim-lifecycle-release.mjs';
import sessionIdentitySot from '../lib/session-identity-sot.js';
import { findClaudeCodePid } from '../lib/terminal-identity.js';
import { resolveClaimIdentity, checkIdentityMismatch } from '../lib/claim/claim-identity.js';
import { claimGuard, formatClaimFailure } from '../lib/claim-guard.mjs';
import { checkClaimGateFreshness } from '../lib/claim/gate-freshness-check.mjs';
// SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001 — pre-claim multi-signal evidence-of-life gate.
// Wraps claimGuard's heartbeat/inactive auto-release to prevent hostile reclaim
// when the prior session has been released but its CC conversation is still active
// under a rotated session_id (the 2026-04-24 incident class).
import { checkPreClaimEvidence } from './modules/claim-health/triangulate.js';
import { isSDClaimed } from '../lib/session-conflict-checker.mjs';
import { isProcessRunning, startHeartbeat, stopHeartbeat } from '../lib/heartbeat-manager.mjs';
import { classifyOwnerLiveness } from '../lib/claim/owner-liveness.js';
import { getEstimatedDuration, formatEstimateDetailed } from './lib/duration-estimator.js';
import { resolve as resolveWorkdir } from './resolve-sd-workdir.js';
// SD-LEO-INFRA-FLEET-DASHBOARD-VISIBILITY-001: shared formatter so the roster
// also surfaces in-flight QF claims (quick_fixes.claiming_session_id), not just
// SD claims.
import { formatRosterClaim } from './modules/sd-next/display/claim-formatters.js';
// SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-008 / D2): consume the extended
// classification policy so 'outside_repo' / 'false_success' /
// 'target_changed_after_claim' hints surface with stable codes. The base
// classifier (lib/worktree-manager.js::classifyWorktreeError) is still used
// internally by the policy for the transient / already-checked-out / etc.
// patterns, so no behavior regresses for existing error shapes.
import { classify as classifyWorktreeFailure } from '../lib/protocol-policies/worktree-failure-classification.js';
import { decideOwnConflictReattach } from '../lib/exec-context-guard.mjs';
// SD-LEO-INFRA-SD-START-STALE-BASE-WARN-001: warn (or opt-in auto-rebase) when a resolved worktree's
// base is behind origin/main, so a worker never silently builds on a stale base (a merge-as-is would
// revert sibling work that landed after the base commit). Fail-open; reuses checkout-freshness.
import { runStaleBaseGuard } from '../lib/worktree/stale-base-guard.mjs';
import { checkSDAge, handleTimelineViolation, formatBlockMessage } from './modules/governance/timeline-violation-handler.js';
import {
  evaluateInstallDecision,
  writeMarker as writeFleetLockMarker,
  peerSessionSnapshot,
  emitFractureForDiff
} from '../lib/fleet-lock-hash.mjs';
// SD-LEO-INFRA-START-INSTALL-SKIP-001 FR4 (security-relevant): re-provision husky's git-hook
// shims independently of the dependency-install decision below -- a skip-path worktree must
// never end up with core.hooksPath pointing at a directory that doesn't exist.
import { defaultEnsureHuskyHooks } from '../lib/worktree-provision.js';
import { existsSync } from 'node:fs';
// SD-LEO-INFRA-SD-CREATION-TOOLING-001 Phase 4: cross-check scope vs target_application
import { validateTargetApplication, formatCrosscheckResult } from './modules/sd-validation/target-application-crosscheck.js';
import { shouldShowVenturePipelinePointer, VENTURE_PIPELINE_POINTER } from '../lib/leo/venture-pipeline-pointer.js';
// SD-FDBK-INFRA-DEPENDENCY-BLOCKS-ADVISORY-001: enforce declared dependencies at claim time.
import { evaluateDependencyGate, formatDependencyRefusal } from '../lib/sd-start/dependency-gate.mjs';
// SD-LEO-INFRA-WORKER-CLAIM-TIME-001 (FR-3): claim-time fitness fail-fast (repo-match + premise +
// preconditions). CJS module imported as default (Node CJS interop) for its named export.
import sdFit from '../lib/fleet/sd-executable-here.cjs';
// SD-LEO-INFRA-WORKER-CLAIM-TIME-001 (FR-5): propose-only partial-block triage surfaced on an unfit
// fail-fast (a missing-precondition block proposes a code/run split — never created here).
import unfitTriage from '../lib/fleet/unfit-triage.cjs';

dotenv.config();

const supabase = createSupabaseServiceClient();

// SD-ARCH-HOTSPOT-SD-START-001: the claim gate/queue phases live in shared
// lib/claim/*.cjs modules consumed by BOTH this CLI and worker-checkin.cjs
// (one eligibility truth — kills the claim-drift bug family). CJS so checkin
// can require() them; loaded here via the established createRequire interop
// (same pattern as the npm-install-lock load below). This CLI keeps ALL
// console/colors/process.exit/argv handling — the modules return pure verdicts.
import { createRequire } from 'node:module';
const cjsRequire = createRequire(import.meta.url);
const { evaluateClaimDependencyGate } = cjsRequire('../lib/claim/gates/dependency-gate.cjs');
const { verifyHandoffIntegrity: verifyHandoffIntegrityGate } = cjsRequire('../lib/claim/gates/handoff-integrity.cjs');
const { evaluateCadenceGate } = cjsRequire('../lib/claim/gates/cadence-gate.cjs');
const queueResolver = cjsRequire('../lib/claim/queue-resolver.cjs');
const { classifyAllDispatchIneligibility, liveClaimWriteFenceReason, CLAIM_WRITE_FENCE_AXES, execBoundaryHoldReason } = cjsRequire('../lib/fleet/claim-eligibility.cjs');
// SD-ARCH-HOTSPOT-SD-START-001 FR-7: dispatch-authorization polarity gate (flag-gated, observe-first).
const dispatchAuthGate = cjsRequire('../lib/claim/gates/dispatch-authorization.cjs');

// SD-FDBK-INFRA-DEPENDENCY-BLOCKS-ADVISORY-001: pre-claim DEPENDENCY gate.
// Dependency BLOCKS were advisory-only (computed by the sweep/dashboard but never
// enforced), so workers repeatedly claimed dependency-blocked child SDs. This
// resolves the effective SD's declared dependencies (strategic_directives_v2.
// dependencies JSONB) and REFUSES the claim when any is not 'completed'. --force
// warns and proceeds; any resolution error fails OPEN so a transient DB issue can
// never block every claim. Pure decision logic lives in lib/sd-start/dependency-gate.mjs.
async function enforceDependencyGate(sd, effectiveId) {
  // SD-ARCH-HOTSPOT-SD-START-001 FR-2: resolution moved to the SHARED gate
  // (lib/claim/gates/dependency-gate.cjs — the same one worker-checkin consumes,
  // one resolution truth). This CLI applies its native FAIL-OPEN polarity over
  // the raw axes: proceed-with-warning on resolution errors and unresolved refs;
  // refuse only CONFIRMED-incomplete deps (--force downgrades to warn-proceed).
  const gate = await evaluateClaimDependencyGate(supabase, sd);
  if (gate.queryError) {
    // Fail-open: a transient DB/resolution error must never block every claim.
    console.warn(`${colors.dim}(dependency gate skipped — resolution error, fail-open: ${gate.queryError})${colors.reset}`);
    return;
  }
  // The blocked_on_sd fold (retired enforceBlockedOnSdGate) is enforced by the
  // dedicated wrapper at its original pre-/post-route call sites; exclude it here
  // so `dependencies`-array semantics (incl. --force) stay byte-identical.
  const blockedOn = sd?.metadata?.blocked_on_sd;
  const resolved = gate.resolved.filter(d => d.sd_id !== blockedOn);
  if (resolved.length === 0) return; // no declared dependencies — nothing to enforce

  const force = process.argv.includes('--force');
  const result = evaluateDependencyGate(resolved, { force });

  if (result.verdict === 'refuse') {
    console.log(`\n${colors.red}${colors.bold}🚫 Unmet dependencies — claim refused for ${effectiveId}${colors.reset}`);
    console.log(`${colors.red}${formatDependencyRefusal(result.blocking, result.unresolved)}${colors.reset}`);
    console.log(`   ${colors.dim}Wait for the dependencies to reach 'completed', or pass --force to override (warn + proceed).${colors.reset}`);
    try {
      await supabase.from('audit_log').insert({
        event_type: 'DEPENDENCY_GATE_REFUSED',
        entity_type: 'strategic_directive',
        entity_id: sd.id,
        metadata: {
          sd_key: effectiveId,
          blocking: result.blocking,
          unresolved: result.unresolved,
          operator_session_id: process.env.CLAUDE_SESSION_ID || null,
        },
        severity: 'info',
      });
    } catch (auditErr) {
      console.warn(`${colors.dim}(audit-log refusal record failed non-blocking: ${auditErr.message})${colors.reset}`);
    }
    process.exit(1);
  }

  if (result.warn && (result.blocking.length || result.unresolved.length)) {
    const why = force && result.blocking.length ? '--force override' : 'unresolved reference(s)';
    console.log(`\n${colors.yellow}⚠️  Proceeding despite unmet dependencies (${why}) for ${effectiveId}:${colors.reset}`);
    console.log(`${colors.yellow}${formatDependencyRefusal(result.blocking, result.unresolved)}${colors.reset}`);
  }
}

// QF-20260703-295: HELD-SD claim gate, at parity with classifyDispatchIneligibility's
// human_action_required axis (already enforced by the self-claim/sweep paths). Idempotent —
// safe to call again after orchestrator routing reassigns `sd` to a leaf child, mirroring
// enforceCadenceGate's re-check pattern. Checks the metadata field directly rather than the
// full classifier's return value — classifyDispatchIneligibility short-circuits on the FIRST
// matching axis (orchestrator_parent / test_fixture_key are checked before human_action_required),
// so an == 'human_action_required' equality check would silently miss a HELD SD that is ALSO an
// orchestrator parent or test-fixture key (adversarial review finding, ship-gate self-review).
function enforceHumanActionGate(sd, effectiveId) {
  // SD-ARCH-HOTSPOT-SD-START-001 FR-6 (prospective-testing D6): route through the
  // shared ALL-MATCH classifier and key on the SPECIFIC axis — .includes(), never
  // length>0, so a HELD SD that is also an orchestrator/fixture still surfaces the
  // hold (the reason the old first-match classifier was avoided) while a
  // multi-axis orchestrator SD without the hold does NOT trip this gate.
  const axes = classifyAllDispatchIneligibility(sd || {});
  // QF-20260711-569 (root cause CONFIRMED by live repro on SPINE-001-E): this DIRECT-path
  // gate keyed ONLY on human_action_required, so a needs_coordinator_review fence was
  // claimable straight through sd-start. Key on the full coordinator-authority fence set
  // (CLAIM_WRITE_FENCE_AXES — same shared authority as QF-272/QF-937's write-boundary
  // fences), naming whichever axis matched.
  const fence = axes.find((a) => CLAIM_WRITE_FENCE_AXES.has(a));
  if (!fence) return;
  const detail = {
    human_action_required: 'metadata.requires_human_action=true — held for chairman/coordinator action.',
    needs_coordinator_review: 'metadata.needs_coordinator_review=true — review-HELD by the coordinator.',
    not_before_hold: 'metadata.not_before is in the future — sequencing hold.',
  }[fence] || fence;
  console.log(`\n${colors.red}❌ ${effectiveId} is FENCED (${fence}) — cannot be claimed${colors.reset}`);
  console.log(`   ${detail}`);
  console.log('   Only coordinator/human authority clears this fence — do not work this SD.');
  console.log(`\n${colors.bold}Action:${colors.reset} Pick a different SD with ${colors.cyan}npm run sd:next${colors.reset}`);
  process.exit(1);
}

// SD-LEO-INFRA-PHASE-SCOPED-FENCE-001 (FR-5/FR-8): DISTINCT, NON-BLOCKING claim-time
// display for metadata.exec_boundary_hold. Deliberately a separate function from
// enforceHumanActionGate above -- that gate BLOCKS the claim and process.exit(1)s;
// exec_boundary_hold must never do that (claim-allowed is the entire point of this
// axis). Called AFTER a successful claim, purely informational.
function displayExecBoundaryHoldNotice(sd) {
  const hold = execBoundaryHoldReason(sd);
  if (!hold) return;
  console.log(`\n${colors.yellow}⏸️  EXEC-parked: ${hold.reason}${colors.reset}`);
  if (hold.setAt) {
    const ms = Date.now() - Date.parse(hold.setAt);
    if (Number.isFinite(ms) && ms >= 0) {
      const hrs = ms / 3600000;
      const age = hrs < 1 ? `${Math.max(1, Math.round(ms / 60000))}m ago` : hrs < 48 ? `${Math.round(hrs)}h ago` : `${Math.round(hrs / 24)}d ago`;
      console.log(`${colors.dim}   Set ${age} — claim + PLAN work proceeds normally; PLAN-TO-EXEC will WAIT until the coordinator clears this.${colors.reset}`);
    }
  } else {
    console.log(`${colors.dim}   Claim + PLAN work proceeds normally; PLAN-TO-EXEC will WAIT until the coordinator clears this.${colors.reset}`);
  }
}

// QF-20260706-786: metadata.blocked_on_sd is an ad-hoc single-dependency hold that a
// worker's own claim-TTL-lapse self-heal can clear (requires_human_action=false) without
// the referenced SD actually completing (live incident: Bravo self-cleared the fence on
// LANDING-REBUILD-001 3min after FABLE-VENTURE-DESIGN-001 finished — safe by luck only).
// This re-derives eligibility from LIVE status every claim, independent of any boolean flag.
async function enforceBlockedOnSdGate(sd, effectiveId) {
  // SD-ARCH-HOTSPOT-SD-START-001 FR-2: resolution now rides the SHARED dependency
  // gate's blocked_on_sd fold (one resolution truth with worker-checkin). Parity
  // preserved exactly: fail-open on query faults / unresolvable refs, HARD refuse
  // (no --force override) when the referenced SD is live and not completed.
  const blockedOn = sd?.metadata?.blocked_on_sd;
  if (typeof blockedOn !== 'string' || !blockedOn || blockedOn === 'none') return;
  // dependencies:[] → only the blocked_on_sd fold resolves (single-ref lookup).
  const gate = await evaluateClaimDependencyGate(supabase, { ...sd, dependencies: [] });
  if (gate.queryError) return; // fail-open: can't verify -> don't strand the claim on a query fault
  const hit = gate.blocking.find(d => d.sd_id === blockedOn);
  if (hit) {
    console.log(`\n${colors.red}❌ ${effectiveId} is BLOCKED_ON ${blockedOn} — cannot be claimed${colors.reset}`);
    console.log(`   metadata.blocked_on_sd=${blockedOn} (status=${hit.status}) — dependency not yet completed.`);
    console.log(`\n${colors.bold}Action:${colors.reset} Wait for ${blockedOn} to complete, or pick a different SD with ${colors.cyan}npm run sd:next${colors.reset}`);
    process.exit(1);
  }
}

const MAX_FALLBACK_ATTEMPTS = 3;

/**
 * Display fleet roster — all active sessions with their claimed SDs and heartbeat ages.
 * SD-FLEETAWARE-SESSION-IDENTITY-HARDENING-ORCH-001-A
 */
async function displayFleetRoster() {
  try {
    const { data: sessions } = await supabase
      .from('v_active_sessions')
      .select('session_id, sd_key, sd_title, qf_id, qf_title, heartbeat_age_seconds, heartbeat_age_human, computed_status, hostname, pid')
      .in('computed_status', ['active', 'idle', 'stale']);

    if (!sessions || sessions.length === 0) {
      console.log(`\n${colors.dim}  No active fleet sessions${colors.reset}`);
      return;
    }

    console.log(`\n${colors.bold}📡 Fleet Roster (${sessions.length} session${sessions.length !== 1 ? 's' : ''}):${colors.reset}`);
    for (const s of sessions) {
      const shortId = s.session_id.substring(0, 12);
      const hbAge = s.heartbeat_age_human || formatHbAge(s.heartbeat_age_seconds);
      const staleTag = (s.heartbeat_age_seconds || 0) > 900 ? ` ${colors.red}STALE${colors.reset}` : '';
      const claimLabel = formatRosterClaim(s);
      console.log(`   ${shortId}  ${hbAge}${staleTag}  ${claimLabel}`);
    }
  } catch {
    // Non-blocking — roster display is informational
  }
}

function formatHbAge(seconds) {
  if (!seconds || seconds < 0) return 'just now';
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

/**
 * Check if auto-proceed is active for the current session.
 * Returns true by default (auto-proceed is ON unless explicitly disabled).
 */
async function getSessionAutoProceed(sessionId) {
  try {
    const { data } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', sessionId)
      .single();
    return data?.metadata?.auto_proceed ?? true;
  } catch {
    return true; // Default ON
  }
}

/**
 * Get the next workable SD from the queue, excluding specified SD keys.
 * Returns { sdKey, title, phase } or null if no workable SDs remain.
 *
 * SD-LEO-INFRA-PRE-CLAIM-CHECK-001: Used by auto-fallback when claim conflicts occur.
 */
// SD-ARCH-HOTSPOT-SD-START-001 FR-5: relocated to lib/claim/queue-resolver.cjs
// (shared with worker-checkin). Thin delegate — behavior parity pinned there.
function getNextWorkableSD(excludeKeys = []) {
  return queueResolver.getNextWorkableSD(supabase, excludeKeys);
}

/**
 * Map a phase to the appropriate CLAUDE_*.md context file.
 */
function getPhaseContextFile(phase) {
  if (!phase) return 'CLAUDE_LEAD.md';
  const p = phase.toUpperCase();
  if (p.startsWith('LEAD')) return 'CLAUDE_LEAD.md';
  if (p.startsWith('PLAN') || p.startsWith('PRD')) return 'CLAUDE_PLAN.md';
  if (p.startsWith('EXEC') || p.startsWith('IMPLEMENTATION')) return 'CLAUDE_EXEC.md';
  return 'CLAUDE_LEAD.md';
}

/**
 * Verify handoff integrity for an SD before resuming work.
 * Checks the last handoff in sd_phase_handoffs to ensure it was accepted.
 *
 * @returns {{ valid: boolean, lastHandoff: Object|null, message: string, recoveryOptions: string[] }}
 */
// SD-ARCH-HOTSPOT-SD-START-001 FR-3: relocated to lib/claim/gates/handoff-integrity.cjs
// (QF-20260609-564 sd_id keying + fail-open semantics preserved there verbatim).
// The CLI keeps the loud warning surface via onWarn.
function verifyHandoffIntegrity(sdUuid) {
  return verifyHandoffIntegrityGate(supabase, sdUuid, {
    onWarn: (msg) => console.warn(`⚠️  ${msg}`),
  });
}

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

async function getSDDetails(sdId) {
  // Note: legacy_id column was deprecated and removed - using sd_key instead
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, priority, progress_percentage, is_working_on, sd_type, created_at, target_application, venture_id, scope, governance_metadata, metadata, completion_date, updated_at, updated_by')
    .or(`sd_key.eq.${sdId},id.eq.${sdId}`)
    .single();

  if (error) {
    return { error: error.message };
  }

  return data;
}

/**
 * Check if an SD is an orchestrator (has children).
 * Returns the list of children if found, empty array otherwise.
 *
 * FIX: parent_sd_id stores the UUID `id`, not `sd_key`. Query by both
 * to handle both legacy (id === sd_key) and modern (id is UUID) SDs.
 */
/**
 * SD-FDBK-INFRA-ORCHESTRATOR-ROUTING-PHASE-001 (PAT-ORCH-ROUTING-PHASE-BLINDNESS-001):
 * Determine whether an orchestrator parent SD needs its own LEAD-TO-PLAN handoff
 * before any leaf children can be sequenced.
 *
 * Returns true ONLY when ALL of:
 *   1. sd.sd_type === 'orchestrator'
 *   2. sd.current_phase IN ('LEAD', 'LEAD_APPROVAL')
 *   3. sd_phase_handoffs has zero rows where sd_id=sd.id AND
 *      handoff_type='LEAD-TO-PLAN' AND status='accepted'
 *
 * FAIL-LOUD: throws on PostgrestError (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).
 * Pattern mirrors scripts/modules/parent-orchestrator-handler.js:456-462.
 */
async function hasParentNeedsOwnLeadToPlan(sd) {
  if (!sd || sd.sd_type !== 'orchestrator') return false;
  const phase = sd.current_phase;
  if (phase !== 'LEAD' && phase !== 'LEAD_APPROVAL') return false;

  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, status')
    .eq('sd_id', sd.id)
    .eq('handoff_type', 'LEAD-TO-PLAN')
    .eq('status', 'accepted')
    .limit(1);

  if (error) {
    throw new Error(
      `[hasParentNeedsOwnLeadToPlan] sd_phase_handoffs query failed for ${sd.sd_key || sd.id}: ${error.message || error.code || 'unknown error'}`
    );
  }

  return !data || data.length === 0;
}

// SD-ARCH-HOTSPOT-SD-START-001 FR-5: relocated to lib/claim/queue-resolver.cjs
// (shared with worker-checkin, incl. the sd_key→UUID resolve-and-retry fallback
// and the live-claim source-of-truth read). Thin delegates.
function getOrchestratorChildren(sdKeyOrId) {
  return queueResolver.getOrchestratorChildren(supabase, sdKeyOrId);
}

// SD-ARCH-HOTSPOT-SD-START-001 FR-5: the leaf/child resolution lives in
// lib/claim/queue-resolver.cjs (resolveLeafWorkItem composes findUnclaimedChild
// internally — shared with worker-checkin; stale-claim validation + urgency
// sorting intact). Thin delegate: the CLI supplies supabase + drilling trace.
function findLeafWorkItem(parentSdKey) {
  return queueResolver.resolveLeafWorkItem(supabase, parentSdKey, {
    onTrace: (msg) => console.log(`   ${colors.cyan}↳ ${msg}${colors.reset}`),
  });
}

async function getNextHandoff(sd) {
  const phase = sd.current_phase || 'LEAD';

  const handoffMap = {
    'LEAD': 'LEAD-TO-PLAN',
    'LEAD_APPROVAL': 'LEAD-TO-PLAN',
    'PLAN': 'PLAN-TO-EXEC',
    'EXEC': 'EXEC-TO-PLAN',
    'PLAN_VERIFY': 'PLAN-TO-LEAD',
    'LEAD_FINAL': 'LEAD-FINAL-APPROVAL'
  };

  return handoffMap[phase] || 'LEAD-TO-PLAN';
}

/**
 * Enforce SD-LEO-INFRA-PR-CADENCE-PRECLAIM-GATE-001 cadence gate.
 *
 * Idempotent — safe to call multiple times (e.g., once on the parent SD and
 * again after orchestrator routing reassigns `sd` to a leaf). Reads
 * governance_metadata + metadata directly off the passed `sd` object, so
 * callers must ensure those columns are selected before invoking.
 *
 * Refuses (process.exit(1)) when the gate is active and no valid override
 * is supplied. Override requires --override-cadence-gate "<≥20-char reason>"
 * plus either --pattern-id or --followup-sd-key, audit-logged fail-closed.
 */
async function enforceCadenceGate(sd, effectiveId) {
  // SD-ARCH-HOTSPOT-SD-START-001 FR-4: gate logic + audit contract live in the
  // shared lib/claim/gates/cadence-gate.cjs adapter (cadence SSOT untouched at
  // lib/cadence/pre-claim-gate.mjs). This CLI keeps argv parsing + rendering +
  // process.exit, applied over the adapter's pure verdict.
  const argv = process.argv;
  const overrideIdx = argv.findIndex(a => a === '--override-cadence-gate');
  const overrideReason = (overrideIdx !== -1 && argv[overrideIdx + 1]) ? argv[overrideIdx + 1] : null;
  const patternIdIdx = argv.findIndex(a => a === '--pattern-id');
  const followupIdx = argv.findIndex(a => a === '--followup-sd-key');
  const patternId = (patternIdIdx !== -1 && argv[patternIdIdx + 1]) ? argv[patternIdIdx + 1] : null;
  const followupSdKey = (followupIdx !== -1 && argv[followupIdx + 1]) ? argv[followupIdx + 1] : null;

  const verdict = await evaluateCadenceGate(supabase, sd, {
    sdKey: effectiveId,
    overrideReason,
    patternId,
    followupSdKey,
    sessionId: process.env.CLAUDE_SESSION_ID || null,
  });

  if (verdict.allowed && verdict.outcome === 'inactive') return;

  if (verdict.outcome === 'refused') {
    console.log(`\n${colors.red}${colors.bold}🚫 ${verdict.refusalMessage}${colors.reset}`);
    if (verdict.shortOverride) {
      console.log(`${colors.red}   (override reason must be ≥20 chars; got ${verdict.overrideReasonLength})${colors.reset}`);
    }
    if (!verdict.auditRecorded) {
      console.warn(`${colors.dim}(audit-log refusal record failed non-blocking: ${verdict.auditError})${colors.reset}`);
    }
    process.exit(1);
  }

  if (verdict.outcome === 'override_rejected') {
    console.log(`\n${colors.red}${colors.bold}🚫 Cadence override refused${colors.reset}`);
    console.log(`   ${verdict.message}`);
    process.exit(1);
  }

  if (verdict.outcome === 'audit_unavailable_fail_closed') {
    console.log(`\n${colors.red}${colors.bold}🚫 audit-log unavailable; cadence override cannot be safely recorded${colors.reset}`);
    console.log(`   audit_log error: ${verdict.auditError}`);
    console.log(`   ${colors.dim}fail-closed: claim refused${colors.reset}`);
    process.exit(1);
  }

  // override_accepted
  console.log(`${colors.yellow}⚠ Cadence gate override accepted${colors.reset}`);
  console.log(`   Reason:           "${verdict.overrideReason}"`);
  console.log(`   Pattern/Followup: ${verdict.patternRef}`);
  console.log(`   Audit row:        event_type=CADENCE_GATE_OVERRIDE on entity_id=${sd.id}`);
}

async function main() {
  // QF-20260511-069 / PAT-CLI-ARGV-POSITIONAL-FLAG-COLLISION-001:
  // The bare `process.argv[2]` reader previously swallowed leading flags
  // (e.g. `node sd-start.js --parent SD-X` made sdId='--parent') and surfaced
  // as PostgREST PGRST116 from getSDDetails(...).single() over zero rows.
  // Skip recognized zero-arity flags and value-arity flag pairs, then pick
  // the first remaining positional as the SD identifier.
  const VALUE_FLAGS = new Set([
    '--child',
    '--override-cadence-gate',
    '--pattern-id',
    '--followup-sd-key',
  ]);
  const argv = process.argv.slice(2);
  let sdId = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.has(a)) { i++; continue; }
    if (a.startsWith('--')) continue;
    sdId = a;
    break;
  }

  if (!sdId) {
    console.log(`${colors.red}${colors.bold}Error: SD ID required${colors.reset}`);
    console.log(`\nUsage: ${colors.cyan}npm run sd:start <SD-ID>${colors.reset}`);
    console.log(`\nExample: ${colors.dim}npm run sd:start SD-HARDENING-V2-001C${colors.reset}`);
    process.exit(1);
  }

  // SD-FDBK-INFRA-CLAIM-VISIBILITY-ATOMIC-001: QF ids are not SDs — route them
  // to the atomic QF claim path instead of querying strategic_directives_v2 and
  // crashing with 'Cannot coerce the result to a single JSON object'
  // (witnessed 2026-06-12 on QF-20260611-123).
  if (/^QF-/i.test(sdId)) {
    console.log(`${colors.yellow}${sdId} is a quick-fix, not an SD.${colors.reset}`);
    console.log(`Routing to the atomic QF claim: ${colors.cyan}node scripts/qf-start.js ${sdId}${colors.reset}\n`);
    const { spawnSync } = await import('node:child_process');
    const out = spawnSync(process.execPath, ['scripts/qf-start.js', sdId], { stdio: 'inherit' });
    process.exit(out.status ?? 1);
  }

  // SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR5 enhancement B):
  // Fail fast if this command is running from inside the .worktrees/ subtree.
  // Otherwise `git rev-parse --show-toplevel` (historically used downstream)
  // returns the worktree path, which causes sd-start to create a nested
  // `<worktree>/.worktrees/<sd>` path and then release the claim when the
  // worktree-creation step fails with "branch already used by worktree at ...".
  // Observed live on 2026-04-24 during this SD's own LEAD phase.
  const worktreeGuard = isInsideWorktree();
  if (worktreeGuard.inside) {
    console.log(`\n${colors.red}${colors.bold}Error: sd-start must run from the main repo root${colors.reset}`);
    console.log('\n  Current cwd is inside the worktrees subtree:');
    console.log(`    ${colors.dim}cwd:       ${process.cwd()}${colors.reset}`);
    console.log(`    ${colors.dim}worktrees: ${worktreeGuard.worktreesDir}${colors.reset}`);
    console.log(`\n  ${colors.cyan}cd ${worktreeGuard.repoRoot}${colors.reset}`);
    console.log(`  ${colors.cyan}node scripts/sd-start.js ${sdId}${colors.reset}`);
    console.log(`\n  ${colors.dim}(No claim changes made — safe to retry.)${colors.reset}`);
    process.exit(1);
  }

  // QF-20260703-758: refuse a claim from a checkout missing an upstream fix to this
  // very gate script — closes the window where yesterday's code claims through
  // a gate that was fixed hours earlier on origin/main.
  const gateFreshness = checkClaimGateFreshness(worktreeGuard.repoRoot, ['scripts/sd-start.js']);
  if (gateFreshness.stale) {
    console.log(`\n${colors.red}${colors.bold}🚫 RESYNC_REQUIRED${colors.reset}`);
    console.log(`   Your checkout is ${gateFreshness.missingCommitCount} commit(s) behind origin/main for ${gateFreshness.file}.`);
    console.log('   Claiming now risks bypassing a claim-gate fix merged upstream.');
    console.log(`   ${colors.cyan}git pull${colors.reset} in the main repo root, then retry.`);
    process.exit(1);
  }

  console.log(`\n${colors.bold}${colors.blue}SD START${colors.reset}`);
  console.log('═'.repeat(50));

  // 1. Get SD details
  const sd = await getSDDetails(sdId);

  if (sd.error) {
    console.log(`${colors.red}Error: ${sd.error}${colors.reset}`);
    process.exit(1);
  }

  if (!sd) {
    console.log(`${colors.red}Error: SD not found: ${sdId}${colors.reset}`);
    process.exit(1);
  }

  let effectiveId = sd.sd_key || sd.id;

  // 1.1 SD-LEO-INFRA-CONDITIONAL-QUEUE-GOVERNANCE-001: Reject claims on deferred SDs
  if (sd.metadata?.do_not_advance_without_trigger === true) {
    console.log(`\n${colors.red}❌ SD is DEFERRED — cannot be claimed${colors.reset}`);
    console.log('   This SD has a governance gate: do_not_advance_without_trigger=true');
    if (sd.metadata?.trigger_condition) {
      const tc = sd.metadata.trigger_condition;
      console.log(`\n   ${colors.cyan}Trigger condition:${colors.reset}`);
      console.log(`   Type: ${tc.type || 'unknown'}`);
      console.log(`   Threshold: ${tc.threshold || 'unknown'}`);
      if (tc.decision_venue) console.log(`   Decision venue: ${tc.decision_venue}`);
      if (tc.chairman_decision_required) console.log(`   ${colors.yellow}Chairman decision required${colors.reset}`);
    }
    if (sd.metadata?.auto_cancel_after_days) {
      console.log(`   Auto-cancel: ${sd.metadata.auto_cancel_after_days} days from creation`);
    }
    console.log(`\n   ${colors.dim}This SD will be promoted automatically when trigger conditions are met via EVA Friday.${colors.reset}`);
    process.exit(1);
  }

  // 1.2. QF-20260703-295: reject direct claims on HELD SDs (metadata.requires_human_action).
  enforceHumanActionGate(sd, effectiveId);

  // 1.3. QF-20260706-786: independently re-verify metadata.blocked_on_sd against live status.
  await enforceBlockedOnSdGate(sd, effectiveId);

  // 1.4. SD-LEO-INFRA-PR-CADENCE-PRECLAIM-GATE-001: Pre-claim cadence gate.
  // Refuses claim if SD is in a stability window. Re-runs after orchestrator
  // leaf routing so a cadence-blocked leaf is not silently claimed via the parent.
  await enforceCadenceGate(sd, effectiveId);

  // 1.5. Orchestrator detection — route to child instead of claiming parent
  //      EXCEPT when the parent itself needs its own LEAD-TO-PLAN handoff first
  //      (FR-2, PAT-ORCH-ROUTING-PHASE-BLINDNESS-001), or when --parent forces
  //      explicit parent claim (FR-3).
  const explicitChild = process.argv.includes('--child') ? process.argv[process.argv.indexOf('--child') + 1] : null;
  const parentFlag = process.argv.includes('--parent');
  const confirmParentFlag = process.argv.includes('--confirm');

  if (explicitChild && parentFlag) {
    console.log(`\n${colors.red}❌ --parent and --child are mutually exclusive${colors.reset}`);
    console.log(`   ${colors.dim}Use --parent to claim the orchestrator parent OR --child to claim a specific child, not both.${colors.reset}`);
    process.exit(1);
  }

  let claimingParentExplicitly = false;
  if (parentFlag) {
    // Explicit override — claim parent regardless of children/handoff state.
    // Safety: when parent is past LEAD-TO-PLAN AND children incomplete, require
    // --confirm to prevent double-claiming the wrong phase (FR-3 R5 mitigation).
    const parentNeeds = await hasParentNeedsOwnLeadToPlan(sd);
    if (!parentNeeds) {
      const childrenForCheck = await getOrchestratorChildren(effectiveId);
      const incomplete = childrenForCheck.some(c => c.status !== 'completed');
      if (incomplete && !confirmParentFlag) {
        console.log(`\n${colors.yellow}⚠️  --parent on past-LEAD orchestrator with incomplete children${colors.reset}`);
        console.log(`   ${colors.dim}Parent has accepted LEAD-TO-PLAN handoff; standard route-to-leaf is recommended.${colors.reset}`);
        console.log(`   ${colors.dim}Pass --parent --confirm to override.${colors.reset}`);
        process.exit(1);
      }
    }
    console.log(`\n${colors.cyan}🔧 --parent flag${colors.reset} — claiming parent orchestrator regardless of children state`);
    claimingParentExplicitly = true;
  }

  if (!explicitChild && !claimingParentExplicitly) {
    const children = await getOrchestratorChildren(effectiveId);
    if (children.length > 0) {
      // FR-2: Pre-route guard — does parent need its OWN LEAD-TO-PLAN first?
      // Without this guard, orchestrator parents whose own LEAD-TO-PLAN has not
      // yet run are structurally unreachable (PAT-ORCH-ROUTING-PHASE-BLINDNESS-001).
      if (await hasParentNeedsOwnLeadToPlan(sd)) {
        console.log(`\n${colors.cyan}🔀 ORCHESTRATOR PARENT${colors.reset} — own LEAD-TO-PLAN required`);
        console.log(`   ${colors.dim}Parent orchestrator needs own LEAD-TO-PLAN handoff first — claiming parent (PAT-ORCH-ROUTING-PHASE-BLINDNESS-001).${colors.reset}`);
        // Fall through to parent claim (skip the route-to-leaf block below).
      } else {
      console.log(`\n${colors.cyan}🔀 ORCHESTRATOR DETECTED${colors.reset} (${children.length} children)`);
      console.log(`   ${colors.dim}Routing to leaf-level work item (recursive through sub-orchestrators)${colors.reset}`);

      const { child, allComplete, reason, routingPath } = await findLeafWorkItem(effectiveId);

      if (allComplete) {
        // Ensure session row exists before exit — handoff.js needs it for claim validity gate.
        // Without this, the orchestrator completion handoff fails with no_deterministic_identity.
        try {
          const resolved = await resolveOwnSession(supabase, {
            select: 'session_id',
            warnOnFallback: false,
            requireDeterministic: true
          });
          if (!resolved.data) {
            const newSession = await getOrCreateSession();
            if (newSession) {
              console.log(`${colors.dim}(Session created: ${newSession.session_id})${colors.reset}`);
            }
          }
        } catch { /* non-fatal — handoff will surface the error */ }

        console.log(`\n${colors.green}✅ All children completed${colors.reset}`);
        // SD-FDBK-INFRA-HARDEN-ORCHESTRATOR-CHILD-001: the parent completion handoff writes a
        // rollup that requires the PARENT to be claimed, but sd-start routes orchestrators to
        // leaves and cannot claim the parent. Use the sanctioned claim helper, run the handoff,
        // then release — instead of an ad-hoc inline is_working_on UPDATE.
        console.log('   Orchestrator completion needs the PARENT claimed. Run:');
        console.log(`   ${colors.cyan}CLAUDE_SESSION_ID=<sid> node scripts/claim-orchestrator-for-rollup.mjs ${effectiveId}${colors.reset}`);
        console.log(`   ${colors.cyan}node scripts/handoff.js execute PLAN-TO-LEAD ${effectiveId}${colors.reset}`);
        console.log(`   ${colors.cyan}CLAUDE_SESSION_ID=<sid> node scripts/claim-orchestrator-for-rollup.mjs ${effectiveId} --release${colors.reset}`);
        console.log('═'.repeat(50));
        process.exit(0);
      }

      if (!child) {
        console.log(`\n${colors.yellow}⚠️  No unclaimed leaf work items available${colors.reset}`);
        console.log(`   ${colors.dim}Reason: ${reason}${colors.reset}`);

        if (routingPath && routingPath.length > 0) {
          console.log(`   ${colors.dim}Routing reached: ${routingPath.join(' → ')}${colors.reset}`);
        }

        // Show current top-level child status for visibility
        const claimed = children.filter(c => c.claiming_session_id);
        const completed = children.filter(c => c.status === 'completed');
        console.log(`\n   ${colors.bold}Top-level children:${colors.reset} Claimed: ${claimed.length} | Completed: ${completed.length} | Total: ${children.length}`);

        if (claimed.length > 0) {
          console.log(`\n${colors.bold}Currently claimed children:${colors.reset}`);
          claimed.forEach(c => {
            console.log(`   ${colors.yellow}🔒${colors.reset} ${c.sd_key} - ${c.title} (${c.current_phase || 'LEAD'})`);
          });
        }

        console.log(`\n${colors.bold}Action:${colors.reset} Pick a different SD with ${colors.cyan}npm run sd:next${colors.reset}`);
        console.log('═'.repeat(50));
        process.exit(1);
      }

      // Route to the leaf work item — update the SD reference for the rest of the flow
      const childId = child.sd_key || child.id;

      // Show routing path if we traversed through sub-orchestrators
      if (routingPath && routingPath.length > 1) {
        console.log(`\n${colors.green}→ Routing path (${routingPath.length} levels deep):${colors.reset}`);
        routingPath.forEach((key, i) => {
          const indent = '  '.repeat(i + 1);
          const arrow = i < routingPath.length - 1 ? `${colors.cyan}↳${colors.reset}` : `${colors.green}★${colors.reset}`;
          console.log(`   ${indent}${arrow} ${key}`);
        });
      } else {
        console.log(`\n${colors.green}→ Routing to child: ${childId}${colors.reset}`);
      }
      console.log(`   ${child.title}`);

      // Re-fetch the child SD details for the rest of the flow
      const childSd = await getSDDetails(childId);
      if (childSd.error || !childSd) {
        console.log(`${colors.red}Error fetching child SD: ${childSd?.error || 'not found'}${colors.reset}`);
        process.exit(1);
      }
      Object.assign(sd, childSd);
      effectiveId = childId;
      console.log(`   ${colors.dim}(Orchestrator ${sdId} not claimed — only leaf ${childId} will be claimed)${colors.reset}`);

      // Re-enforce cadence gate against the leaf's governance_metadata.
      // Without this re-check, a cadence-blocked leaf is silently claimed via
      // the parent (the parent has no next_workable_after of its own).
      await enforceCadenceGate(sd, effectiveId);
      // QF-20260703-295: same re-check for a HELD leaf — the child selector
      // (findUnclaimedChild) does not filter on requires_human_action, so a HELD
      // child routed to via the parent must still be refused here.
      enforceHumanActionGate(sd, effectiveId);
      // QF-20260706-786: same re-check for a leaf's own metadata.blocked_on_sd.
      await enforceBlockedOnSdGate(sd, effectiveId);
      } // close else (route-to-leaf)
    }
  }

  // 1.6. SD-FDBK-INFRA-DEPENDENCY-BLOCKS-ADVISORY-001: pre-claim dependency gate.
  // Enforces the SD's declared dependencies (refuses the claim when a declared
  // dependency SD is not yet 'completed'; --force overrides; fail-open on error).
  await enforceDependencyGate(sd, effectiveId);

  // 1.7. Day-28 blocking age gate (FR-001: SD-MAN-GEN-CORRECTIVE-VISION-GAP-007-03)
  // Block SDs older than threshold (default 28 days). Chairman override via --force.
  const forceOverride = process.argv.includes('--force');
  const ageCheck = await checkSDAge({
    supabase,
    sdKey: effectiveId,
    sdUuid: sd.id,
    createdAt: sd.created_at,
  });

  if (ageCheck.blocked) {
    const { escalationEventId, priorityBumped } = await handleTimelineViolation({
      supabase,
      sdKey: effectiveId,
      sdUuid: sd.id,
      ageDays: ageCheck.ageDays,
      threshold: ageCheck.threshold,
      currentPriority: sd.priority,
      isOverride: forceOverride,
    });

    if (!forceOverride) {
      console.log(formatBlockMessage({
        sdKey: effectiveId,
        ageDays: ageCheck.ageDays,
        threshold: ageCheck.threshold,
      }));
      if (escalationEventId) {
        console.log(`  ${colors.dim}Escalation event: ${escalationEventId}${colors.reset}`);
      }
      if (priorityBumped) {
        console.log(`  ${colors.yellow}Priority bumped to CRITICAL${colors.reset}`);
      }
      process.exit(1);
    } else {
      console.log(`\n  ${colors.yellow}⚠️  CHAIRMAN OVERRIDE: SD age ${ageCheck.ageDays}d > ${ageCheck.threshold}d threshold${colors.reset}`);
      console.log(`  ${colors.dim}Override logged to eva_orchestration_events${colors.reset}`);
      if (escalationEventId) {
        console.log(`  ${colors.dim}Event: ${escalationEventId}${colors.reset}`);
      }
    }
  }

  // 2. Ensure session row exists BEFORE claim validation.
  // SD-MAN-INFRA-SESSION-IDENTITY-BIRTH-001: The fail-closed gate (assertValidClaim)
  // requires a claude_sessions row to match against. Previously, getOrCreateSession()
  // ran AFTER assertValidClaim(), so new sessions always failed with
  // no_deterministic_identity. Fix: resolve or create the session first, then validate.
  let session = null;
  try {
    const resolved = await resolveOwnSession(supabase, {
      select: 'session_id, sd_key, status, heartbeat_at, terminal_id',
      warnOnFallback: false,
      requireDeterministic: true
    });
    // SD-MAN-INFRA-PARSE-SESSIONSTART-CLAUDE-001: Only accept env_var and marker_file.
    // terminal_id is non-deterministic (shared SSE port across CC Desktop windows).
    if (resolved.data && (resolved.source === 'env_var' || resolved.source === 'marker_file')) {
      session = resolved.data;
      const ccPid = resolved.data?.metadata?.cc_pid || process.pid;
      console.log(`${colors.dim}(Identity: source=${resolved.source} session=${session.session_id} cc_pid=${ccPid})${colors.reset}`);
    }
  } catch { /* fall through — will create new session */ }

  if (!session) {
    session = await getOrCreateSession();
  }

  // SD-LEO-INFRA-CLAIM-IDENTITY-INTEGRITY-001 (FR-2): identity-mismatch guard.
  // getOrCreateSession's findExistingSession matches by getTerminalId(), whose
  // marker/pointer fallback is last-writer-wins under concurrency — it can adopt
  // ANOTHER live session's identity and misattribute the claim (live-evidenced:
  // env=e2f6eecc claimed as e828c687, coordinator ask 5655cb68). A session that
  // CONTRADICTS the caller's env identity is never used for a claim — fail loud,
  // never misattribute. Absence of env identity is NOT a conflict (human runs).
  const claimIdentity = resolveClaimIdentity();
  const idCheck = checkIdentityMismatch(session, claimIdentity);
  if (idCheck.mismatch) {
    console.error(`${colors.red}🚫 CLAIM-IDENTITY MISMATCH — refusing to claim under an adopted identity${colors.reset}`);
    console.error(`   env CLAUDE_SESSION_ID: ${idCheck.envId}`);
    console.error(`   adopted session row:   ${idCheck.adoptedId}`);
    console.error('   The adopted row belongs to a DIFFERENT session (shared-pointer race).');
    console.error('   Remediation: ensure this session has its own claude_sessions row');
    console.error('   (SessionStart session-register hook), then re-run sd-start.');
    process.exit(1);
  }

  // 2.1 SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-B (FR-1, TR-1, TR-2):
  // Atomically reconcile the three identity sources so claim-validity-gate sees
  // all three in agreement. No-op when SESSION_IDENTITY_SOT_ENABLED is unset/false.
  // Uses a file lock (.claude/session-identity/.lock) to serialize concurrent boots
  // and tmp+fsync+rename for crash-safe writes.
  try {
    const reconcile = sessionIdentitySot.reconcileAtBoot(session.session_id, {
      repoRoot: sessionIdentitySot.discoverRepoRoot() || undefined
    });
    if (reconcile.applied) {
      console.log(`${colors.dim}(Identity SOT: reconciled — pointer=${reconcile.wrotePointer ? 'updated' : 'skipped'} envFile=${reconcile.wroteEnvFile ? 'updated' : 'n/a'})${colors.reset}`);
    }
  } catch (reconcileErr) {
    // Reconciliation errors are non-fatal during burn-in; log and continue so the
    // legacy identity path can still succeed. Disagreements surface at claim gate.
    console.warn(`${colors.yellow}⚠ session-identity reconciliation error (non-blocking): ${reconcileErr.message}${colors.reset}`);
  }

  // SD-FDBK-INFRA-HARNESS-F22-STALE-001: non-blocking WARN when the env
  // CLAUDE_SESSION_ID differs from this Claude Code process’s ambient session
  // (a stale/hardcoded id self-heals into a reaped ghost — re-derive before claiming).
  try {
    const _f22 = sessionIdentitySot.detectEnvAmbientMismatch({ ccPid: findClaudeCodePid() });
    if (_f22) console.warn(`${colors.yellow}⚠  SESSION IDENTITY MISMATCH (F22): CLAUDE_SESSION_ID=${_f22.envId} but this process’s ambient session is ${_f22.ambientId}. You may be operating under a stale/hardcoded session id (reaped ghost) — re-derive: export CLAUDE_SESSION_ID=${_f22.ambientId}${colors.reset}`);
  } catch { /* non-blocking */ }

  // 2a-pre. SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 FR-3: honor recent CLAIM_RELEASED
  // inbox messages BEFORE attempting any claim write. If a peer session has emitted
  // CLAIM_RELEASED for this SD within CLAIM_RELEASED_TTL_MS (5min), abort the claim
  // attempt — the peer is mid-release and may re-assert imminently.
  // CRITICAL: this poll is READ-ONLY (does NOT mark the message read). Marking-read
  // would close the FR-1/FR-3 race window: if the original consumer dies before its
  // retry, the next consumer would not see the (now-marked-read) message and claim
  // collision reopens. TTL retires messages naturally.
  try {
    const claimReleasedProbe = await hasRecentClaimReleased(effectiveId);
    if (claimReleasedProbe.recent) {
      const abortMsg = formatClaimReleasedAbort(effectiveId, claimReleasedProbe);
      console.log(
        `\n${colors.yellow}═══════════════════════════════════════════════════════════════════${colors.reset}`
      );
      console.log(
        `${colors.yellow}⏸  CLAIM_RELEASED inbox-honoring gate (SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 FR-3)${colors.reset}`
      );
      console.log(
        `${colors.yellow}═══════════════════════════════════════════════════════════════════${colors.reset}`
      );
      console.log(`  ${abortMsg}`);
      console.log('  Inbox row remains visible (read-only contract); next session will also see it.');
      console.log(
        `${colors.yellow}═══════════════════════════════════════════════════════════════════${colors.reset}\n`
      );
      process.exit(1);
    }
  } catch (probeErr) {
    // Fail-open on inbox probe error: do not block claim attempts on transient
    // network/DB issues. Log for observability; the existing claim-validity-gate
    // remains the source-of-truth.
    console.log(`${colors.yellow}⚠  CLAIM_RELEASED inbox probe non-fatal error: ${probeErr.message}${colors.reset}`);
  }

  // 2a. Validate claim identity + ownership now that session row exists.
  // SD-LEO-INFRA-FAIL-CLOSED-CLAIM-001: Invoke the fail-closed gate so cross-CC collisions
  // are surfaced with a structured error instead of silently merged via "newest heartbeat".
  // allowMainRepoForAcquisition=true because sd-start is the one operation legitimately
  // allowed to run from the main repo (it creates the worktree).
  try {
    await assertValidClaim(supabase, effectiveId, {
      operation: 'sd_start',
      allowMainRepoForAcquisition: true
    });
  } catch (e) {
    if (e instanceof ClaimIdentityError) {
      console.error(e.toBanner());
      await displayFleetRoster();
      process.exit(2);
    }
    throw e;
  }

  if (!session) {
    console.log(`${colors.red}Error: Could not create session${colors.reset}`);
    process.exit(1);
  }

  // 2b. Check adopted session (heartbeat guard adopted the existing session)
  // When adopted=true, we're reusing the main Claude process's session (same terminal).
  // This is normal for child processes like sd-start.js.
  if (session.adopted) {
    if (session.adopted_sd_id && session.adopted_sd_id === effectiveId) {
      console.log(`\n${colors.yellow}Note: Session already working on ${effectiveId}, refreshing claim...${colors.reset}`);
    } else if (session.adopted_sd_id) {
      console.log(`\n${colors.yellow}Note: Session currently working on ${session.adopted_sd_id}, switching to ${effectiveId}${colors.reset}`);
    }
  }

  // 2.9. SD-ARCH-HOTSPOT-SD-START-001 FR-7 (D8 placement): dispatch-authorization
  // check AFTER every eligibility gate, immediately BEFORE the claim write — the
  // observe-mode WOULD-DENY set equals exactly what enforce mode would block.
  // Flag ladder absent => mode 'off' => zero lookups, byte-identical behavior.
  {
    const authMode = await dispatchAuthGate.resolveDispatchAuthMode();
    const authVerdict = await dispatchAuthGate.evaluateDispatchAuthorization(sd, supabase, { mode: authMode });
    if (authVerdict.would_deny) {
      console.log(`${colors.yellow}${dispatchAuthGate.formatWouldDenyLine(effectiveId, authVerdict, 'sd_start_direct_claim')}${colors.reset}`);
      await dispatchAuthGate.recordWouldDenyEvidence(supabase, effectiveId, authVerdict, 'sd_start_direct_claim', sd);
    }
    if (!authVerdict.authorized) {
      console.log(`\n${colors.red}${colors.bold}🚫 ${effectiveId} is not dispatch-authorized (born-un-authorized polarity, enforce mode)${colors.reset}`);
      console.log(`   reason: ${authVerdict.reason}`);
      console.log(`   ${colors.dim}Grant path: a chairman/coordinator dispatch_auth disposition (see scripts/backfill-dispatch-auth-grants.mjs for the cutover tool).${colors.reset}`);
      process.exit(1);
    }
  }

  // 3. SD-LEO-INFRA-CLAIM-GUARD-001: Use centralized claimGuard
  // SD-LEO-INFRA-PRE-CLAIM-CHECK-001: Auto-fallback on claim conflict
  const autoProceed = await getSessionAutoProceed(session.session_id);
  const fallbackEnabled = autoProceed || process.argv.includes('--fallback');
  // SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001: --force-reclaim override flag (telemetry-emitting)
  const forceReclaim = process.argv.includes('--force-reclaim');
  let claimResult = await claimGuard(effectiveId, session.session_id, { autoFallback: fallbackEnabled });
  const skippedSDs = [];

  // QF-20260704-825: an explicit-target invocation on a terminal (completed/deferred) SD
  // must NEVER silently fall through to auto-fallback selection -- that claims an unrelated
  // SD while the operator believes they hold the one they named. This is not a claim
  // conflict (no owner to wait on or evict); exit loud regardless of fallbackEnabled.
  if (!claimResult.success && claimResult.error === 'sd_terminal_status') {
    console.log(`\n${colors.red}${colors.bold}🚫 TARGET_ALREADY_TERMINAL${colors.reset}`);
    console.log(`   ${effectiveId} has status=${claimResult.status} — already finished, cannot be (re)claimed.`);
    console.log(`   Completed: ${sd.completion_date || sd.updated_at || 'unknown'}${sd.updated_by ? ` (updated_by: ${sd.updated_by})` : ''}`);
    console.log(`\n   ${colors.bold}Action:${colors.reset} This was NOT a claim conflict — no fallback SD will be selected.`);
    console.log(`   Run ${colors.cyan}npm run sd:next${colors.reset} to pick a different, workable SD.`);
    console.log('═'.repeat(50));
    process.exit(1);
  }

  if (!claimResult.success) {
    // SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001 (FR2): Evidence-of-life pre-claim gate.
    // Before any auto-release path, check triangulate() for evidence that the prior
    // claim's CC conversation is still alive (cross-shell, rotated session_id, etc.).
    // If evidence is present and --force-reclaim not passed, FAIL CLOSED.
    try {
      const evidenceCheck = await checkPreClaimEvidence(supabase, effectiveId, {
        mySessionId: session.session_id
      });
      if (!evidenceCheck.allowReclaim && !forceReclaim) {
        const evidenceList = (evidenceCheck.evidence || []).join(', ') || 'unknown';
        console.log(
          `\n${colors.red}═══════════════════════════════════════════════════════════════════${colors.reset}`
        );
        console.log(
          `${colors.red}🚫 CROSS-SIGNAL EVIDENCE-OF-LIFE GATE BLOCKED — claim_protected${colors.reset}`
        );
        console.log(
          `${colors.red}═══════════════════════════════════════════════════════════════════${colors.reset}`
        );
        console.log(`  SD:             ${effectiveId}`);
        console.log(`  Classification: ${evidenceCheck.classification}`);
        console.log(`  Evidence:       ${evidenceList}`);
        console.log(`  My session:     ${session.session_id}`);
        console.log(`  Owner session:  ${claimResult.owner?.session_id || '(none)'}`);
        console.log('');
        console.log(`  ${colors.yellow}Why blocked:${colors.reset} The owning session is released or stale, but`);
        console.log('  triangulate() detected evidence the CC conversation is still active');
        console.log('  (sub-agent activity in last 5 min, sibling session on the branch,');
        console.log('  warm worktree, or matching plan-file). Auto-releasing this claim');
        console.log('  would clobber that other session\'s work.');
        console.log('');
        console.log(`  ${colors.cyan}Options:${colors.reset}`);
        console.log('    1. Pick a different SD: npm run sd:next');
        console.log('    2. Confirm the other session is truly gone, then retry with:');
        console.log(`       node scripts/sd-start.js ${effectiveId} --force-reclaim`);
        console.log(
          `${colors.red}═══════════════════════════════════════════════════════════════════${colors.reset}\n`
        );
        process.exit(1);
      }
      if (!evidenceCheck.allowReclaim && forceReclaim) {
        // Telemetry: log the override to audit_log so systemic false-positives surface.
        const evidenceList = (evidenceCheck.evidence || []).join(', ');

        // SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 FR-2: enrich the audit row with
        // sd_key drift status of the current owner. When the owner's sd_key has
        // drifted away from the SD they claim to hold, the --force-reclaim is
        // explicitly justified (sd_key is the source-of-truth, NOT claiming_session_id).
        // Mirrors CROSS-HOST FR-7 stale-heartbeat-equivalence pattern.
        let sdKeyDriftVerdict = 'unknown';
        try {
          const ownerSessionId = claimResult.owner?.session_id;
          if (ownerSessionId) {
            const { data: ownerRow } = await supabase
              .from('claude_sessions')
              .select('sd_key')
              .eq('session_id', ownerSessionId)
              .limit(1)
              .single();
            sdKeyDriftVerdict = detectSdKeyDrift(ownerRow, effectiveId);
          }
        } catch (driftErr) {
          // Drift inspection is observational; never blocks the override.
          sdKeyDriftVerdict = `error:${driftErr?.message?.slice(0, 80) || 'unknown'}`;
        }

        if (sdKeyDriftVerdict === 'drift') {
          console.log(
            `${colors.green}✓ sd_key drift detected on owner — --force-reclaim is justified (peer's sd_key has moved away from ${effectiveId}).${colors.reset}`
          );
        }
        console.log(
          `${colors.yellow}⚠ --force-reclaim override accepted. Evidence-of-life signals were present (${evidenceList}); proceeding anyway.${colors.reset}`
        );
        try {
          await supabase.from('audit_log').insert({
            event_type: 'claim_force_reclaim',
            severity: 'warning',
            actor: session.session_id,
            details: JSON.stringify({
              sd_key: effectiveId,
              classification: evidenceCheck.classification,
              evidence: evidenceCheck.evidence,
              owner_session: claimResult.owner?.session_id || null,
              my_session: session.session_id,
              // SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 FR-2 telemetry: enrich audit row
              // with sd_key drift verdict. 'drift' = override justified by SoT-mismatch.
              sd_key_drift: sdKeyDriftVerdict,
              at: new Date().toISOString(),
              source: 'sd-start.js',
              ref: 'SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001+SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001'
            })
          });
        } catch (auditErr) {
          // audit_log failure is non-blocking but should be visible
          console.log(`${colors.dim}(audit_log emission skipped: ${auditErr.message})${colors.reset}`);
        }
      }
    } catch (gateErr) {
      // Gate must fail-open on internal errors so we don't break the claim path entirely.
      // Real failures will still be caught by the existing claimGuard logic below.
      console.log(`${colors.dim}(cross-signal gate skipped: ${gateErr.message})${colors.reset}`);
    }

    // SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-001: Heartbeat TTL check (cross-machine compatible)
    // Releases claims from sessions whose heartbeat is >30 minutes stale, regardless of PID visibility.
    let autoReleased = false;
    const CLAIM_TTL_MS = 30 * 60 * 1000; // 30 minutes
    if (claimResult.owner?.session_id) {
      const { data: ownerSession } = await supabase
        .from('claude_sessions')
        .select('heartbeat_at, status')
        .eq('session_id', claimResult.owner.session_id)
        .maybeSingle();

      const heartbeatAge = ownerSession?.heartbeat_at
        ? Date.now() - new Date(ownerSession.heartbeat_at).getTime()
        : Infinity;
      // FR-5 (SD-LEO-INFRA-LEO-APP-LAUNCHER-001): dead-vs-live discrimination via the extracted,
      // behaviorally-tested classifier — preserves the QF-20260722-842 / 4d8fbb5 behavior exactly.
      const { isStale, isInactive } = classifyOwnerLiveness({ heartbeatAge, ownerSession, ttlMs: CLAIM_TTL_MS });

      if (isStale || isInactive) {
        const ageMin = Math.round(heartbeatAge / 60000);
        const reason = isInactive ? 'session inactive' : `heartbeat stale (${ageMin}m)`;
        console.log(`[claimGuard] ${reason} for ${claimResult.owner.session_id} — auto-releasing claim on ${effectiveId}`);
        const { error: releaseError } = await supabase.rpc('release_sd', {
          p_session_id: claimResult.owner.session_id,
          p_reason: 'ttl_expired'
        });
        if (!releaseError) {
          console.log(`${colors.green}   ✅ TTL-expired claim released. Retrying...${colors.reset}`);
          autoReleased = true;
        }
      } else if (forceReclaim) {
        // QF-20260722-842: --force-reclaim must EXPLICITLY refuse against a provably-live
        // owner (fresh heartbeat + active status), not silently fall through to a generic
        // failure. Without this, an operator/coordinator can be misled into believing a
        // reclaim "should have worked" when the TTL/PID safety net above correctly declined
        // to release a genuinely alive claim — surfacing WHY makes the safety net legible
        // instead of implicit-by-omission.
        const ageSec = Math.round(heartbeatAge / 1000);
        console.log(
          `\n${colors.red}🚫 force-reclaim REFUSED — owner is genuinely live (heartbeat ${ageSec}s old, status=${ownerSession?.status}).${colors.reset}`
        );
        console.log(`   Owner session: ${claimResult.owner.session_id}`);
        console.log('   This is not a stale/dead claim; --force-reclaim will not steal it.');
        process.exit(1);
      }
    }

    // PID-based liveness check for enhanced diagnostics (same machine only)
    if (!autoReleased && claimResult.owner) {
      const sameHost = claimResult.owner.hostname === os.hostname();
      const pidMatch = claimResult.owner.session_id?.match(/-(\d+)$/);
      const ownerPid = pidMatch ? parseInt(pidMatch[1]) : null;

      if (sameHost && ownerPid) {
        const pidAlive = isProcessRunning(ownerPid);
        if (pidAlive) {
          console.log(`\n${colors.yellow}🔒 ${effectiveId} claimed by active process (PID: ${ownerPid})${colors.reset}`);
        } else {
          console.log(`\n${colors.green}💀 PROCESS EXITED (PID: ${ownerPid} is dead) — auto-releasing orphaned claim${colors.reset}`);
          const { error: releaseError } = await supabase.rpc('release_sd', {
            p_session_id: claimResult.owner.session_id,
            p_reason: 'manual'
          });

          if (!releaseError) {
            console.log(`${colors.green}   ✅ Orphaned claim released. Retrying...${colors.reset}`);
            autoReleased = true;
          }
        }
      }
    }

    if (autoReleased) {
      claimResult = await claimGuard(effectiveId, session.session_id);
      if (claimResult.success) {
        console.log(`${colors.green}   ✅ Claim acquired on retry${colors.reset}`);
      }
    }

    // SD-LEO-INFRA-PRE-CLAIM-CHECK-001: Auto-fallback to next workable SD
    if (!claimResult.success && fallbackEnabled) {
      skippedSDs.push({ sdKey: effectiveId, reason: claimResult.error, owner: claimResult.owner?.session_id });
      console.log(`\n${colors.cyan}🔄 AUTO-FALLBACK: ${effectiveId} is claimed — searching for next workable SD...${colors.reset}`);

      const excludeKeys = [effectiveId];
      let fallbackAttempt = 0;
      let fallbackSuccess = false;

      while (fallbackAttempt < MAX_FALLBACK_ATTEMPTS) {
        fallbackAttempt++;
        const nextSD = await getNextWorkableSD(excludeKeys);

        if (!nextSD) {
          console.log(`${colors.yellow}   ⚠️  No more workable SDs in queue (attempt ${fallbackAttempt}/${MAX_FALLBACK_ATTEMPTS})${colors.reset}`);
          break;
        }

        console.log(`${colors.dim}   Attempt ${fallbackAttempt}/${MAX_FALLBACK_ATTEMPTS}: Trying ${nextSD.sdKey} — ${nextSD.title}${colors.reset}`);

        // SD-ARCH-HOTSPOT-SD-START-001 FR-7 (self-review gap fix): the fallback lane
        // claims a DIFFERENT SD than the one gated at 2.9 — without this check the
        // enforce mode would be bypassed (and observe would under-count) on exactly
        // this lane. Skip-polarity here (iterate to the next candidate), matching
        // checkin's self-claim semantics rather than sd-start's loud direct refusal.
        {
          const fbAuthMode = await dispatchAuthGate.resolveDispatchAuthMode();
          const fbVerdict = await dispatchAuthGate.evaluateDispatchAuthorization({ sd_key: nextSD.sdKey }, supabase, { mode: fbAuthMode });
          if (fbVerdict.would_deny) {
            console.log(`${colors.yellow}${dispatchAuthGate.formatWouldDenyLine(nextSD.sdKey, fbVerdict, 'sd_start_fallback_claim')}${colors.reset}`);
            await dispatchAuthGate.recordWouldDenyEvidence(supabase, nextSD.sdKey, fbVerdict, 'sd_start_fallback_claim', null);
          }
          if (!fbVerdict.authorized) {
            skippedSDs.push({ sdKey: nextSD.sdKey, reason: `dispatch_auth: ${fbVerdict.reason}` });
            excludeKeys.push(nextSD.sdKey);
            console.log(`${colors.yellow}   ⚠️  ${nextSD.sdKey} not dispatch-authorized (enforce mode) — skipping${colors.reset}`);
            continue;
          }
        }

        // QF-20260711-272: the fallback lane must enforce the same coordinator-authority fences
        // (requires_human_action / needs_coordinator_review / not_before) the direct path enforces
        // at 2.9 — live-fetched, so a fence stamped after queue assembly still blocks. Skip-polarity
        // (iterate to the next candidate), matching the dispatch-auth block above. Fail-closed:
        // 'eligibility_check_error' also skips.
        {
          const fbFence = await liveClaimWriteFenceReason(supabase, nextSD.sdKey);
          if (fbFence) {
            skippedSDs.push({ sdKey: nextSD.sdKey, reason: `claim_fenced:${fbFence}` });
            excludeKeys.push(nextSD.sdKey);
            console.log(`${colors.yellow}   ⚠️  ${nextSD.sdKey} fenced (${fbFence}) — skipping${colors.reset}`);
            continue;
          }
        }

        claimResult = await claimGuard(nextSD.sdKey, session.session_id, { autoFallback: true });

        if (claimResult.success) {
          // Update effectiveId and SD details to the fallback SD
          effectiveId = nextSD.sdKey;
          const fallbackSd = await getSDDetails(nextSD.sdKey);
          if (fallbackSd && !fallbackSd.error) {
            Object.assign(sd, fallbackSd);
          }
          fallbackSuccess = true;
          console.log(`${colors.green}   ✅ Claimed fallback SD: ${nextSD.sdKey}${colors.reset}`);
          break;
        }

        skippedSDs.push({ sdKey: nextSD.sdKey, reason: claimResult.error, owner: claimResult.owner?.session_id });
        excludeKeys.push(nextSD.sdKey);
        console.log(`${colors.yellow}   ⚠️  ${nextSD.sdKey} also claimed — skipping${colors.reset}`);
      }

      if (!fallbackSuccess) {
        console.log(`\n${colors.red}${colors.bold}❌ AUTO-FALLBACK EXHAUSTED${colors.reset}`);
        console.log(`   Attempted ${skippedSDs.length} SD(s), all claimed or unavailable:`);
        skippedSDs.forEach(s => {
          console.log(`   ${colors.dim}• ${s.sdKey} — ${s.reason}${s.owner ? ` (by ${s.owner})` : ''}${colors.reset}`);
        });
        await displayFleetRoster();
        console.log(`\n${colors.bold}Action:${colors.reset} Wait for a session to release, or run ${colors.cyan}npm run sd:next${colors.reset} to review the queue.`);
        console.log('═'.repeat(50));
        process.exit(1);
      }

      // Show summary of skipped SDs
      if (skippedSDs.length > 0) {
        console.log(`\n${colors.cyan}📋 Fallback Summary:${colors.reset}`);
        skippedSDs.forEach(s => {
          console.log(`   ${colors.dim}⏭️  Skipped ${s.sdKey} — ${s.reason}${colors.reset}`);
        });
      }
    } else if (!claimResult.success) {
      // Non-fallback path: show error and exit (original behavior)
      console.log(formatClaimFailure(claimResult));
      await displayFleetRoster();
      console.log(`\n${colors.bold}Action:${colors.reset} Pick a different SD with ${colors.cyan}npm run sd:next${colors.reset}`);
      console.log('═'.repeat(50));
      process.exit(1);
    }
  }

  // 4. Cross-path verification via v_active_sessions VIEW (independent of direct table query)
  // Non-blocking: logs warning on mismatch, doesn't abort (view can lag behind direct table)
  try {
    const viewCheck = await isSDClaimed(effectiveId, session.session_id);
    if (viewCheck.claimed) {
      console.log(`${colors.yellow}[Verify] ⚠️  Cross-path mismatch: v_active_sessions shows ${effectiveId} claimed by ${viewCheck.claimedBy}${colors.reset}`);
      console.log(`${colors.dim}   (View may lag — direct table query took precedence)${colors.reset}`);
    } else if (viewCheck.queryFailed) {
      console.log(`${colors.dim}[Verify] View query failed (non-blocking): ${viewCheck.error}${colors.reset}`);
    } else {
      console.log(`${colors.green}[Verify] Independent claim verification passed${colors.reset}`);
    }
  } catch {
    // Non-blocking — cross-path verification is defense-in-depth
  }

  // 4.4. SD-LEO-INFRA-SD-CREATION-TOOLING-001 Phase 4: scope vs target_application cross-check
  // Catches SDs where scope text and target_application disagree, which causes
  // sd-start to open a worktree in the wrong repo. Ships as WARN by default;
  // promotable to BLOCK via TARGET_APP_CROSSCHECK_VERDICT=BLOCK env var.
  try {
    const crosscheck = validateTargetApplication({
      scope: sd.scope,
      target_application: sd.target_application
    });
    if (crosscheck.verdict !== 'PASS') {
      console.log(`\n${colors.yellow}${formatCrosscheckResult(crosscheck)}${colors.reset}`);
    }
    if (crosscheck.verdict === 'BLOCK') {
      console.error(`${colors.red}   ❌  Cross-check BLOCK: refusing worktree creation.${colors.reset}`);
      console.error(`${colors.dim}   Fix: correct target_application or revise SD scope text.${colors.reset}`);
      // SD-LEO-INFRA-CLAIM-FITNESS-FAILOPEN-BYPASS-001 (FR-1/FR-3): best-effort release (never throws),
      // then UNCONDITIONALLY block the claim. (Was `.rpc(...).catch(() => {})` — the .catch threw on the
      // non-.catch-able builder before this exit, and the outer catch swallowed it as fail-open.)
      await bestEffortReleaseSd(supabase, session.session_id);
      process.exit(1);
    }
  } catch (ccErr) {
    // Non-blocking — cross-check is defense-in-depth
    console.log(`${colors.dim}[crosscheck] skipped: ${ccErr.message}${colors.reset}`);
  }

  // 4.45. SD-LEO-INFRA-WORKER-CLAIM-TIME-001 (FR-3): claim-time fitness fail-fast. Refuse to HOLD a
  // claim for an SD that is unfit for THIS checkout — a repo mismatch (SD targets a different app),
  // a closed premise (terminal/superseded/released), or a missing input-data precondition — and
  // release it back to the queue. Mirrors the target-application crosscheck BLOCK + release_sd path
  // above. FAIL-OPEN: isSdExecutableHere only returns fit:false on a POSITIVELY-determined unfit
  // condition, so an indeterminate signal (e.g. no target_application) never blocks a start.
  try {
    const fitVerdict = sdFit.isSdExecutableHere(
      { sd_key: sd.sd_key, target_application: sd.target_application, status: sd.status, metadata: sd.metadata },
      { cwd: process.cwd() }
    );
    if (fitVerdict && fitVerdict.fit === false) {
      console.error(`\n${colors.red}   ❌ UNFIT(${fitVerdict.blockClass}): ${(fitVerdict.reasons || []).join('; ')}${colors.reset}`);
      console.error(`${colors.dim}   Refusing to hold this claim from the current checkout; releasing ${effectiveId}.${colors.reset}`);
      console.error(`${colors.dim}   Route it: node scripts/worker-signal.cjs unfit "${fitVerdict.blockClass}: ${sd.sd_key}" --block-class ${fitVerdict.blockClass}${colors.reset}`);
      // FR-5: on a PARTIAL block (the code is buildable here but the run is gated), surface a
      // propose-only code/run decomposition for the coordinator. Nothing is created here.
      try {
        const proposal = unfitTriage.proposeUnfitDecomposition({ sd_key: sd.sd_key, title: sd.title }, fitVerdict);
        if (proposal && proposal.propose) {
          console.error(`${colors.dim}   Partial block — proposed split (propose-only, NOT created):${colors.reset}`);
          for (const c of proposal.children) {
            console.error(`${colors.dim}     - [${c.role}${c.blocked ? ' BLOCKED' : ''}] ${c.title}${colors.reset}`);
          }
        }
      } catch { /* triage is advisory — never block the release on it */ }
      // SD-LEO-INFRA-CLAIM-FITNESS-FAILOPEN-BYPASS-001 (FR-1): best-effort release (never throws), then
      // UNCONDITIONALLY block the claim + exit. The prior `.rpc(...).catch(() => {})` threw on the
      // non-.catch-able PostgREST builder BEFORE this exit, the outer catch swallowed it as 'fail-open',
      // and a positively-determined UNFIT (e.g. wrong-target_application) SD got claimed anyway.
      await bestEffortReleaseSd(supabase, session.session_id);
      process.exit(1);
    }
  } catch (fitErr) {
    // SD-LEO-INFRA-CLAIM-FITNESS-FAILOPEN-BYPASS-001 (FR-2): FAIL CLOSED on an UNEXPECTED error in the
    // fitness path — never fall through to claim an SD we could not confirm is fit. This is SAFE because
    // the predicate isSdExecutableHere (lib/fleet/sd-executable-here.cjs) is fail-open INTERNALLY: any
    // internal error or indeterminate signal (e.g. absent target_application) returns fit:true and it
    // NEVER throws, so that fail-open is the fleet-wide-stall guard. This outer catch therefore only fires
    // on a truly-novel error, where blocking the claim (not silently claiming wrong work) is correct.
    console.error(`${colors.red}   ❌ [fitness] UNEXPECTED error — failing CLOSED (blocking the claim): ${fitErr.message}${colors.reset}`);
    await bestEffortReleaseSd(supabase, session.session_id);
    process.exit(1);
  }

  // 4.5. Resolve worktree (creates if needed in claim mode)
  // SD-LEO-INFRA-AUTO-WORKTREE-START-001: single entry point for worktree creation
  //
  // Quick-fix QF-20260422-507: if worktree setup fails after claim acquisition,
  // release the claim before exiting so we don't leak orphan claims that block
  // parallel sessions until TTL expires. Uses same release_sd RPC as lines 692/715.
  const releaseClaimOnWorktreeFailure = async (phase) => {
    try {
      await supabase.rpc('release_sd', {
        p_session_id: session.session_id,
        p_reason: 'manual'
      });
      console.error(`${colors.dim}   ↩ Released claim on ${effectiveId} after worktree ${phase} failure${colors.reset}`);
    } catch (releaseErr) {
      console.error(`${colors.red}   ⚠ Failed to release claim: ${releaseErr.message}${colors.reset}`);
    }
  };
  let worktreeInfo = null;
  try {
    // SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR5): getRepoRoot() is
    // invariant regardless of process.cwd(); the legacy `git rev-parse
    // --show-toplevel` call returned the worktree path when cwd was inside
    // one, causing resolveWorkdir to create a nested worktree path.
    const repoRoot = getRepoRoot();
    worktreeInfo = await resolveWorkdir(effectiveId, 'claim', repoRoot);
    if (worktreeInfo && !worktreeInfo.success) {
      // SD-MULTISESSION-WORKTREE-SAFETY-ATOMIC-ORCH-001-C: Hard-fail on worktree failure
      // instead of silently continuing on main (which caused data loss from wrong-branch commits)
      const detail = worktreeInfo.error || worktreeInfo.errorCode || 'unknown';
      const classified = classifyWorktreeFailure(detail);
      console.error(`${colors.red}   ❌  Worktree creation failed: ${detail}${colors.reset}`);
      if (classified.code && classified.code !== 'unknown') {
        console.error(`${colors.dim}      [code: ${classified.code} | severity: ${classified.severity}]${colors.reset}`);
      }
      if (classified.hint) console.error(`${colors.yellow}   💡  ${classified.hint}${colors.reset}`);

      // SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 (FR-4, AC-6/AC-7): own-vs-foreign
      // worktree differentiation. When the conflict path matches the SD's
      // expected worktree dir, this is a benign already_checked_out — the SD's
      // own worktree exists and the user can re-attach. Releasing the claim
      // would leak it (witnessed harness backlog 28a71037).
      {
        const expectedPath = worktreeInfo?.worktree?.path || worktreeInfo?.cwd || null;
        const reattach = decideOwnConflictReattach(classified.code, detail, expectedPath);
        if (reattach.reattach) {
          console.error(`${colors.yellow}   ⚠  Recoverable: conflict path matches this SD's expected worktree dir.${colors.reset}`);
          console.error(`${colors.cyan}   Recovery: cd "${reattach.expectedPath}"${colors.reset}`);
          console.error(`${colors.dim}   Claim PRESERVED — re-run sd-start from inside the existing worktree.${colors.reset}`);
          process.exit(2); // exit 2 = recoverable; do NOT release claim
        }
      }

      console.error(`${colors.red}   Cannot proceed without worktree isolation. Pick a different SD or resolve the conflict.${colors.reset}`);
      await releaseClaimOnWorktreeFailure('creation');
      process.exit(1);
    }
  } catch (wtErr) {
    // SD-MULTISESSION-WORKTREE-SAFETY-ATOMIC-ORCH-001-C: Hard-fail on worktree error.
    // SD-LEO-INFRA-START-WORKTREE-BRANCH-001: pass typed err.code as context so
    // WorktreeBaseFetchFailedError surfaces with the dedicated remediation hint.
    const classified = classifyWorktreeFailure(wtErr, { errCode: wtErr?.code });
    console.error(`${colors.red}   ❌  Worktree resolution error: ${wtErr.message}${colors.reset}`);
    if (classified.code && classified.code !== 'unknown') {
      console.error(`${colors.dim}      [code: ${classified.code} | severity: ${classified.severity}]${colors.reset}`);
    }
    if (classified.hint) console.error(`${colors.yellow}   💡  ${classified.hint}${colors.reset}`);

    // SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 (FR-4, AC-6/AC-7): own-vs-foreign
    // differentiation on the resolution-error path mirrors the creation-failure
    // path above — preserve the claim when the conflict is the SD's own worktree.
    {
      const expectedPath = wtErr?.expectedWorktreePath || wtErr?.path || null;
      const reattach = decideOwnConflictReattach(classified.code, wtErr.message, expectedPath);
      if (reattach.reattach) {
        console.error(`${colors.yellow}   ⚠  Recoverable: conflict path matches this SD's expected worktree dir.${colors.reset}`);
        console.error(`${colors.cyan}   Recovery: cd "${reattach.expectedPath}"${colors.reset}`);
        console.error(`${colors.dim}   Claim PRESERVED — re-run sd-start from inside the existing worktree.${colors.reset}`);
        process.exit(2);
      }
    }

    console.error(`${colors.red}   Cannot proceed without worktree isolation. Pick a different SD or resolve the conflict.${colors.reset}`);
    await releaseClaimOnWorktreeFailure('resolution');
    process.exit(1);
  }

  // 4.7. SD-LEO-INFRA-SD-START-STALE-BASE-WARN-001: stale-base guard.
  // The worktree resolved successfully — now check whether its base is BEHIND origin/main. Building
  // on a stale base risks a merge-as-is reverting sibling work (esp. deletions) that landed after the
  // base commit. Warn-by-default with the safe remedy; opt-in auto-rebase via --rebase-base /
  // SD_START_AUTO_REBASE. Fail-open: the guard never throws / never blocks the claim.
  try {
    const wtCwd = worktreeInfo?.cwd || worktreeInfo?.worktree?.path || null;
    if (wtCwd) {
      const autoRebase = process.argv.includes('--rebase-base')
        || ['1', 'true', 'on'].includes(String(process.env.SD_START_AUTO_REBASE || '').toLowerCase());
      runStaleBaseGuard({ cwd: wtCwd, autoRebase });
    }
  } catch { /* fail-open: a stale-base check must never block sd-start */ }

  // 4.9. SD-LEO-INFRA-HANDOFF-INTEGRITY-RECOVERY-001: Pre-claim health check
  // Verify handoff chain integrity before proceeding
  try {
    const phase = sd.current_phase || 'LEAD';
    const PHASE_REQUIRES = {
      PLAN_PRD: { from: 'LEAD', to: 'PLAN' },
      PLAN: { from: 'LEAD', to: 'PLAN' },
      EXEC: { from: 'PLAN', to: 'EXEC' },
      EXEC_ACTIVE: { from: 'PLAN', to: 'EXEC' },
      EXEC_COMPLETE: { from: 'PLAN', to: 'EXEC' },
    };
    const req = PHASE_REQUIRES[phase];
    if (req) {
      // QF-20260509-393: was .eq('sd_key', sd.id) where sd.id is a UUID — wrong
      // column. sd_phase_handoffs.sd_id is the UUID FK. 9th-witness PAT-LEO-INFRA-
      // WRITER-CONSUMER-ASYMMETRY-001 (sibling: sd_phase_handoffs has BOTH sd_id
      // UUID and historical sd_key text values; matching the wrong column produces
      // false STUCK warnings on every PLAN_PRD-phase resume).
      const { data: handoffs } = await supabase
        .from('sd_phase_handoffs')
        .select('from_phase, to_phase, status')
        .eq('sd_id', sd.id)
        .eq('status', 'accepted');
      const hasRequired = (handoffs || []).some(h => h.from_phase === req.from && h.to_phase === req.to);
      if (!hasRequired) {
        console.log(`\n${colors.bgYellow}${colors.bold} STUCK SD WARNING ${colors.reset}`);
        console.log(`   ${colors.yellow}SD is in phase ${phase} but has no accepted ${req.from}→${req.to} handoff${colors.reset}`);
        console.log('   This SD may have a broken handoff chain.');
        console.log(`   ${colors.cyan}Run: npm run sd:recover -- ${effectiveId} --fix${colors.reset}`);
        console.log('');
      }
    }
  } catch (e) {
    // Non-fatal: health check failure should not block claiming
    console.debug('[sd-start] Health check error:', e?.message || e);
  }

  // SD-LEO-INFRA-CLAIM-IDENTITY-INTEGRITY-001 (FR-2): stamp identity provenance on
  // the claim_history entry (fail-soft) — 'env' vs 'pointer_fallback' makes
  // misattribution-prone claims queryable for the retro-audit / coordinator sweeps.
  if (claimResult.claim.status === 'newly_acquired') {
    try {
      const { stampClaim } = await import('../lib/fleet/claim-stamp.cjs').then((m) => m.default || m);
      await stampClaim(supabase, effectiveId, session.session_id, claimIdentity.source);
    } catch { /* fail-soft: stamping must never break the claim path */ }
  }

  // 5. Display SD info
  console.log(`\n${colors.green}✓ SD claimed successfully (${claimResult.claim.status})${colors.reset}`);
  console.log(`\n${colors.bold}SD: ${effectiveId}${colors.reset}`);
  console.log(`Title: ${sd.title}`);
  console.log(`Status: ${sd.status}`);
  console.log(`Phase: ${sd.current_phase || 'LEAD'}`);
  console.log(`Progress: ${sd.progress_percentage || 0}%`);
  console.log(`Type: ${sd.sd_type || 'feature'}`);
  console.log(`claiming_session_id: ${colors.green}${session.session_id}${colors.reset}`);
  displayExecBoundaryHoldNotice(sd);

  // 5.04. SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001 FR-3: start heartbeat
  // keep-alive subprocess. Prevents cleanup_stale_sessions cron (120s threshold)
  // from flipping claude_sessions.status='stale' during long sub-agent execution
  // — pairs with FR-2 trigger fix as defense-in-depth at the SOURCE (eliminates
  // trigger CONDITION) vs FR-2 (fixes trigger BEHAVIOUR if condition does fire).
  // Reuses existing lib/heartbeat-manager.mjs::startHeartbeat (30s setInterval,
  // graceful-release exit handlers, retry logic) — already wired into
  // add-prd-to-database.js / handoff.js / phase-preflight.js / BaseExecutor.js
  // but NOT previously called from sd-start.js (the gap this FR-3 closes).
  // ownershipMode='cooperative' matches existing caller conventions.
  try {
    const hbResult = await startHeartbeat(session.session_id, { ownershipMode: 'cooperative' });
    if (hbResult?.success !== false) {
      console.log(`${colors.dim}   ↻ Heartbeat keep-alive started (30s interval)${colors.reset}`);
    }
  } catch (hbErr) {
    // Non-fatal: keep-alive failure does not block sd-start. FR-2 trigger fix
    // provides backstop — claim cols preserved on stale even without keep-alive.
    console.log(`${colors.dim}   ⚠ Heartbeat keep-alive failed to start: ${hbErr?.message || hbErr}${colors.reset}`);
  }

  // 5.05. SD-LEO-INFRA-MULTI-REPO-ROUTING-001: Set venture context on claim
  // When an SD has target_application or venture_id, propagate to session metadata
  if (sd.target_application && sd.target_application !== 'EHG_Engineer') {
    try {
      const { VentureContextManager } = await import('../lib/eva/venture-context-manager.js');
      const vcm = new VentureContextManager({ supabaseClient: supabase });
      if (sd.venture_id) {
        await vcm.setActiveVenture(sd.venture_id);
        console.log(`\n${colors.cyan}   🏢 Venture context set: ${sd.target_application} (from SD venture_id)${colors.reset}`);
      } else {
        // Store target_application in session metadata even without venture_id
        await supabase.from('claude_sessions')
          .update({ metadata: supabase.rpc ? undefined : { active_target_application: sd.target_application } })
          .eq('session_id', session.session_id);
        console.log(`\n${colors.cyan}   🏢 Target application: ${sd.target_application}${colors.reset}`);
      }
    } catch {
      // Non-fatal — venture context is advisory
    }
  }

  // 5.1. Show worktree info + machine-readable activation directive
  if (worktreeInfo?.success && worktreeInfo.worktree?.exists) {
    console.log(`\n${colors.bold}Worktree:${colors.reset}`);
    console.log(`   Path:   ${colors.cyan}${worktreeInfo.cwd}${colors.reset}`);
    console.log(`   Branch: ${worktreeInfo.worktree.branch || 'unknown'}`);
    console.log(`   Source: ${worktreeInfo.source}${worktreeInfo.worktree.created ? ' (newly created)' : ''}`);
    // Machine-readable directive for agent consumption (PAT-WORKTREE-LIFECYCLE-001)
    console.log(`\n>>> WORKTREE_CWD=${worktreeInfo.cwd}`);

    // SD-LEO-INFRA-FAIL-CLOSED-CLAIM-001: Persist worktree_path so claim-validity-gate
    // can enforce cwd isolation on subsequent handoff/PRD operations. Non-fatal on error.
    // SD-LEARN-FIX-ADDRESS-PAT-PLANTOEXEC-001: Basename guard. Refuses to persist a
    // sibling SD's worktree_path (root cause of wrong_worktree in PAT-HF-PLANTOEXEC-dcb7e880).
    try {
      // Normalize separators so path.basename works on POSIX and Windows alike.
      const cwdNormalized = (worktreeInfo.cwd || '').replace(/\\/g, '/');
      const observedBasename = path.basename(cwdNormalized);
      if (observedBasename !== effectiveId) {
        // SD-LEO-INFRA-LEO-INFRA-SESSION-001 (FR-4): hard refusal — the prior
        // warn-and-proceed silently masked stale claude_sessions rows pointing
        // at the wrong worktree. Refuse to continue so the operator clears
        // the stale state explicitly.
        console.error(
          `\n${colors.red}[WORKTREE_BASENAME_MISMATCH]${colors.reset} sd-start refusing to proceed:\n` +
          `   Requested SD: ${effectiveId}\n` +
          `   Observed basename: ${observedBasename}\n` +
          `   Resolved path: ${worktreeInfo.cwd}\n` +
          '\nRemediation:\n' +
          `   1. ${colors.cyan}npm run session:check-concurrency${colors.reset} — confirm no peer sessions are using this worktree\n` +
          `   2. ${colors.cyan}node scripts/release-and-clean.js ${observedBasename}${colors.reset} — release the stale claim and clean the worktree\n` +
          `   3. Re-run /leo start ${effectiveId}\n`
        );
        process.exit(1);
      }
      await supabase
        .from('strategic_directives_v2')
        .update({ worktree_path: worktreeInfo.cwd })
        .eq('sd_key', effectiveId);
    } catch (e) {
      // Preserve the original WORKTREE_BASENAME_MISMATCH path — process.exit
      // above is unreachable from the catch. Other errors here remain
      // non-fatal (DB persistence is advisory, not load-bearing).
      console.warn(`   ${colors.yellow}⚠️  Failed to persist worktree_path: ${e?.message || e}${colors.reset}`);
    }

    // QF-20260314-250: Child claim verification gate
    // Warn when orchestrator sd:start resolves to a child's worktree
    // SD-LEO-INFRA-CONSOLIDATE-DUAL-DETECTION-001 FR-2: use canonical helper.
    const wtBranch = worktreeInfo.worktree.branch || '';
    const { isOrchestratorSync } = await import('../lib/sd/type-detection.js');
    if (isOrchestratorSync(sd) && wtBranch && !wtBranch.includes(effectiveId)) {
      const childMatch = wtBranch.match(/SD-[A-Z0-9-]+/);
      if (childMatch) {
        console.log(`\n${colors.yellow}⚠️  CHILD CLAIM VERIFICATION REQUIRED${colors.reset}`);
        console.log(`   Worktree resolved to child: ${childMatch[0]}`);
        console.log(`   You MUST run: npm run sd:start ${childMatch[0]}`);
        console.log('   Parent auto-routing is NOT a substitute for explicit child claim.');
      }
    }

    // SD-FDBK-INFRA-AUTO-PUSH-WIP-001 (FR-4): when this claim-bound branch already
    // carries commits ahead of origin/main (an abandoned park's pushed WIP after a
    // sweep re-route), surface them and fast-forward to the pushed origin tip
    // instead of appearing to start blank. Read-only + best-effort: every git probe
    // is wrapped so a missing origin/main or fetch failure is purely advisory and
    // NEVER blocks the claim. Mirrors lib/fleet/branch-ahead.cjs parseAheadCount.
    try {
      const wt = worktreeInfo.cwd;
      const branch = worktreeInfo.worktree.branch || '';
      const gitCount = (range) => {
        try {
          const out = execSync(`git rev-list --count ${range}`, { cwd: wt, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 });
          const n = parseInt(String(out).trim(), 10);
          return Number.isFinite(n) && n > 0 ? n : 0;
        } catch { return 0; }
      };
      const aheadOfMain = branch ? gitCount(`origin/main..${branch}`) : 0;
      if (aheadOfMain > 0) {
        let remoteAhead = 0, localAhead = 0;
        try { execSync(`git fetch origin ${branch}`, { cwd: wt, stdio: ['ignore', 'ignore', 'ignore'], timeout: 20000 }); } catch { /* advisory */ }
        remoteAhead = gitCount(`${branch}..origin/${branch}`);
        localAhead = gitCount(`origin/${branch}..${branch}`);
        const { decideResumeFromBranch } = await import('../lib/fleet/sdstart-resume.mjs');
        const d = decideResumeFromBranch({ aheadOfMain, branch, remoteAhead, localAhead });
        if (d.notice) console.log(`\n${colors.cyan}${d.notice}${colors.reset}`);
        if (d.fastForward) {
          try {
            execSync(`git merge --ff-only origin/${branch}`, { cwd: wt, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 });
            console.log(`   ${colors.dim}(fast-forwarded to origin/${branch})${colors.reset}`);
          } catch { /* advisory: leave HEAD as-is */ }
        }
      }
    } catch { /* FR-4 is advisory-only — never block the claim */ }
  }

  // 5.45. SD-MAN-INFRA-FLEET-NPM-INSTALL-001 + SD-LEO-INFRA-FLEET-SAFE-NODE-001:
  //   node_modules health check with lockfile-hash skip + coordination lock +
  //   install-race fracture telemetry.
  //
  //   Flow:
  //     (a) Evaluate install decision via sha256(package-lock.json)[:12] vs
  //         node_modules/.fleet-lock-hash marker, plus canary-module presence.
  //     (b) If skip -> log and continue (no npm spawn, no lock contention).
  //     (c) If install required -> snapshot peer sessions, acquire lock,
  //         run npm install, on success write the marker, snapshot peers
  //         again, and emit FRACTURE_CODE into any peer that was released
  //         during the install window.
  if (worktreeInfo?.success && worktreeInfo.cwd) {
    try {
      // SD-LEO-INFRA-START-INSTALL-SKIP-001 (5th recurrence, FR1): the FR5 comment this
      // replaces assumed every worktree's node_modules is ALWAYS a junction/symlink into the
      // coordinator repo (getRepoRoot()), so checking the coordinator's own canary/hash was
      // "equivalent". SD-LEO-INFRA-SMART-PER-WORKTREE-001 retired that invariant (worktrees can
      // get a REAL isolated node_modules under concurrency), and cross-repo venture worktrees
      // (a different repo entirely from the coordinator) were NEVER covered by that assumption
      // in the first place -- checking getRepoRoot() there checks EHG_Engineer's own deps, not
      // the target repo's, so a healthy coordinator install always false-positived "skip" no
      // matter what the actual worktree contained (the 5 recurred specimens, e.g.
      // SD-MARKETLENS-*-C1/G1). fs.existsSync follows symlinks, so resolving against the
      // WORKTREE's own path (worktreeInfo.cwd) is correct for junction, isolated, AND
      // cross-repo worktrees alike -- a broken/missing junction or a not-yet-installed isolated
      // worktree now correctly reports canaryPresent=false instead of silently inheriting the
      // coordinator's own unrelated install state.
      const installRepoRoot = worktreeInfo.cwd;

      const forceInstall = process.argv.includes('--force-install');
      const decision = await evaluateInstallDecision({
        repoRoot: installRepoRoot,
        forceInstall
      });

      // SD-LEO-INFRA-START-INSTALL-SKIP-001 FR4 (security-relevant): hook provisioning is
      // independent of the dependency-install decision above. `.husky/_` (what core.hooksPath
      // points at) is only ever created as a side-effect of npm install's `prepare` script, so
      // on the (common) skip fast path it never gets created and every git hook -- pre-commit
      // secret scanning, commit-msg checks, pre-push enforcement -- silently never fires. Check
      // and re-link regardless of decision.skip; fail-open (never blocks sd-start).
      if (!existsSync(path.join(installRepoRoot, '.husky', '_'))) {
        const hooks = defaultEnsureHuskyHooks(installRepoRoot);
        if (hooks.ok) {
          console.log(`   ${colors.green}✓ git hooks provisioned (.husky/_ was missing)${colors.reset}`);
        } else {
          console.log(`   ${colors.yellow}⚠️  git hook provisioning failed (non-fatal): ${hooks.error}${colors.reset}`);
        }
      }

      if (decision.skip) {
        // SD-LEO-INFRA-FLEET-LOCK-HASH-001 FR-2: distinguish skip-due-to-hash-match
        // from skip-due-to-staging-active so the log message is not silently
        // misleading when contention is the cause.
        if (decision.reason === 'staging_active') {
          const retry = decision.retry_after_seconds ?? 60;
          console.log(
            `   ${colors.yellow}⚠️  install required: staging contention — peer install in progress, retry in ${retry}s${colors.reset}`
          );
          if (decision.staging_path) {
            console.log(`   ${colors.dim}   staging path: ${decision.staging_path}${colors.reset}`);
          }
        } else if (decision.reason === 'staging_orphan_clean_failed') {
          console.log(
            `   ${colors.red}✖ staging orphan cleanup failed${colors.reset} — manual rm -rf required`
          );
          if (decision.staging_path) {
            console.log(`   ${colors.dim}   staging path: ${decision.staging_path}${colors.reset}`);
          }
        } else {
          console.log(`   ${colors.green}✓ ${decision.reason}${colors.reset}`);
        }
      } else {
        console.log(`\n${colors.yellow}   ⚠️  ${decision.reason} — coordinating install...${colors.reset}`);

        // SD-LEO-FIX-WORKTREE-CREATION-ATOMICITY-001 US-005: ESM fix.
        // This file is ESM (type=module). Use createRequire for CJS interop.
        const { createRequire } = await import('node:module');
        const esmRequire = createRequire(import.meta.url);
        const { acquireLock, waitForLock, releaseLock } = esmRequire('../lib/npm-install-lock.cjs');

        const peersBefore = await peerSessionSnapshot(supabase, session.session_id);
        let installSucceeded = false;

        const lock = await acquireLock(supabase, session.session_id);

        if (lock.held) {
          console.log(`   ⏳ Session ${lock.holder.slice(0, 8)} is installing dependencies — waiting...`);
          const waitResult = await waitForLock(supabase, {
            timeout: 120000,
            pollInterval: 5000,
            onPoll: ({ elapsed }) => {
              console.log(`   ⏳ Still waiting... (${Math.round(elapsed / 1000)}s)`);
            }
          });
          if (waitResult.resolved) {
            console.log(`   ${colors.green}✓ Dependencies ready (${waitResult.reason})${colors.reset}`);
            // Assume the other session wrote the marker.  Re-probe hash next run.
            installSucceeded = true;
          } else {
            console.log(`   ${colors.yellow}⚠️  Lock wait timed out${colors.reset}`);
          }
        } else if (lock.acquired) {
          console.log('   🔒 Lock acquired — running npm install...');
          try {
            execSync('npm install --ignore-scripts', {
              cwd: installRepoRoot, stdio: 'pipe', timeout: 120000
            });
            console.log(`   ${colors.green}✓ npm install complete${colors.reset}`);
            installSucceeded = true;
          } catch (npmErr) {
            console.log(`   ${colors.yellow}⚠️  npm install failed: ${npmErr.message?.split('\n')[0]}${colors.reset}`);
          } finally {
            await releaseLock(supabase, session.session_id);
            console.log('   🔓 Lock released');
          }
        }

        // Marker write: only on a successful install we performed.  If we
        // waited on a peer lock, we do not write (the peer owns the marker).
        if (installSucceeded && lock.acquired && decision.currentHash) {
          const writeResult = await writeFleetLockMarker(
            installRepoRoot,
            session.session_id,
            decision.currentHash
          );
          if (writeResult.written) {
            console.log(`   📌 fleet-lock-hash marker written (${decision.currentHash})`);
          }
        }

        // Fracture emission: peers present before install but gone after.
        const peersAfter = await peerSessionSnapshot(supabase, session.session_id);
        const emit = await emitFractureForDiff(supabase, peersBefore, peersAfter);
        if (emit.emitted > 0) {
          console.log(
            `   ${colors.yellow}⚠️  fracture code emitted for ${emit.emitted} peer session(s)${colors.reset}`
          );
        }
      }
    } catch (installErr) {
      // Non-fatal — install path failure must not block sd-start overall.
      console.debug(`[sd-start] install decision/coordination error: ${installErr?.message || installErr}`);
    }
  }

  // 5.5. Show duration estimate
  try {
    // Note: legacy_id was deprecated - using sd_key instead
    const { data: sdFull } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_type, category, priority')
      .eq('sd_key', effectiveId)
      .single();

    if (sdFull) {
      const estimate = await getEstimatedDuration(supabase, sdFull);
      console.log(`\n${colors.bold}Duration Estimate:${colors.reset}`);
      const lines = formatEstimateDetailed(estimate);
      lines.forEach(line => {
        if (line.startsWith('  •')) {
          console.log(`${colors.dim}${line}${colors.reset}`);
        } else if (line === '') {
          console.log();
        } else {
          console.log(`   ${line}`);
        }
      });
    }
  } catch {
    // Silent fail - estimate is optional
  }

  // 6. Handoff integrity verification (SD-LEO-INFRA-RESUME-INTEGRITY-HANDOFF-001)
  const forceResume = process.argv.includes('--force');
  const handoffCheck = await verifyHandoffIntegrity(sd.id);

  if (handoffCheck.valid) {
    if (handoffCheck.lastHandoff) {
      console.log(`\n${colors.green}✓ ${handoffCheck.message}${colors.reset}`);
      console.log(`   ${colors.dim}Handoff ID: ${handoffCheck.lastHandoff.id} | ${new Date(handoffCheck.lastHandoff.created_at).toLocaleString()}${colors.reset}`);
    }
  } else if (handoffCheck.status === 'missing' && (sd.current_phase === 'LEAD' || sd.current_phase === 'LEAD_APPROVAL')) {
    // No handoff expected for fresh LEAD phase SDs
    console.log(`\n${colors.dim}ℹ  No prior handoffs (expected for LEAD phase)${colors.reset}`);
  } else if (!forceResume) {
    console.log(`\n${colors.red}❌ HANDOFF INTEGRITY CHECK FAILED${colors.reset}`);
    console.log(`   ${colors.bold}Status:${colors.reset} ${handoffCheck.status}`);
    console.log(`   ${colors.bold}Detail:${colors.reset} ${handoffCheck.message}`);
    if (handoffCheck.reason) {
      console.log(`   ${colors.bold}Reason:${colors.reset} ${handoffCheck.reason}`);
    }
    if (handoffCheck.lastHandoff) {
      console.log(`   ${colors.bold}Handoff ID:${colors.reset} ${handoffCheck.lastHandoff.id}`);
    }
    console.log(`\n${colors.yellow}Recovery Options:${colors.reset}`);
    handoffCheck.recoveryOptions.forEach((opt, i) => {
      console.log(`   ${i + 1}. ${opt}`);
    });
    console.log(`\n${colors.dim}Use --force to override this check${colors.reset}`);
    console.log('═'.repeat(50));
    process.exit(1);
  } else {
    console.log(`\n${colors.yellow}⚠️  Handoff integrity: ${handoffCheck.message} (--force override)${colors.reset}`);
  }

  // 6.5. Phase-appropriate context file (SD-LEO-INFRA-RESUME-INTEGRITY-HANDOFF-001)
  const contextFile = getPhaseContextFile(sd.current_phase);
  console.log(`\n${colors.bold}Load context:${colors.reset} ${colors.cyan}${contextFile}${colors.reset}`);

  // SD-LEO-INFRA-VENTURE-LIFECYCLE-PIPELINE-001 (FR-4): surface the venture pipeline
  // pointer for orchestrator/venture SDs so LEAD sees the canonical sequence + circuit-breaker rule.
  if (shouldShowVenturePipelinePointer(sd)) {
    console.log(`\n${colors.bold}${colors.cyan}${VENTURE_PIPELINE_POINTER}${colors.reset}`);
  }

  // 6.7. Handoff count warning (SD-LEO-INFRA-SESSION-COMPACTION-CLAIM-001)
  // Warns when claiming an SD with extensive prior work — possible compacted session
  try {
    const { data: handoffRows } = await supabase
      .from('sd_phase_handoffs')
      .select('id', { count: 'exact', head: false })
      .eq('sd_id', sd.id); // QF-20260609-564: keyed by sd_id (UUID), not the non-existent text-key column (the >=3-handoffs warning never fired)
    const handoffCount = handoffRows?.length || 0;
    if (handoffCount >= 3) {
      console.log(`\n${colors.yellow}⚠️  PRIOR WORK WARNING: This SD has ${handoffCount} prior handoffs.${colors.reset}`);
      console.log(`${colors.dim}   Another session may have been working on this before context compaction.${colors.reset}`);
      console.log(`${colors.dim}   Check for local worktree: .worktrees/${effectiveId}${colors.reset}`);
    }
  } catch {
    // Non-blocking — handoff count warning is advisory
  }

  // 7. Show warnings if any
  if (claimResult.warnings?.length > 0) {
    console.log(`\n${colors.yellow}Warnings:${colors.reset}`);
    claimResult.warnings.forEach(w => {
      console.log(`   ⚠️  ${w.message}`);
    });
  }

  // 7.5. SD-LEO-INFRA-OKR-AUTO-COMPLEXITY-001: Brainstorm gate for high-complexity auto-SDs
  const needsBrainstorm = sd.metadata?.needs_brainstorm === true;
  if (needsBrainstorm && sd.status === 'draft' && sd.current_phase === 'LEAD') {
    console.log(`\n${colors.bgYellow}${colors.bold} BRAINSTORM REQUIRED ${colors.reset}`);
    console.log(`${colors.yellow}   This SD was auto-generated from a stale OKR and classified as high-complexity.${colors.reset}`);
    console.log(`${colors.yellow}   Run /brainstorm before proceeding to LEAD approval.${colors.reset}`);
    console.log(`${colors.dim}   Complexity: score ${sd.metadata.complexity_score || '?'}, reasons: ${(sd.metadata.complexity_reasons || []).join(', ') || 'n/a'}${colors.reset}`);
    console.log('\n>>> NEEDS_BRAINSTORM=true');
  }

  // 8. Show next action
  const nextHandoff = await getNextHandoff(sd);

  // SD-LEO-INFRA-ADOPTED-RESUME-FINAL-001 (FR-1): close the strand relay. Printing the
  // next-action command as a suggestion has failed 3x for the pending_approval/LEAD_FINAL
  // strand class (a worker adopts a stranded SD, then idles/TTL-releases without ever
  // running the final handoff). This is the ONLY seam where claim-ownership + worktree-cwd
  // + phase co-hold (claim-validity-gate.js requires cwd inside worktree_path;
  // worker-checkin.cjs runs before the worktree is attached and would always fail that
  // gate) — so auto-chain the execution here instead of only printing it. Every other
  // phase/status keeps the existing print-only behavior below, unchanged.
  const wtCwdForFinal = worktreeInfo?.cwd || worktreeInfo?.worktree?.path || null;
  const isStrandedAtLeadFinal = sd.status === 'pending_approval' && sd.current_phase === 'LEAD_FINAL';

  if (isStrandedAtLeadFinal && wtCwdForFinal) {
    console.log(`\n${colors.bold}${colors.bgYellow} AUTO-CHAINING ${nextHandoff} ${colors.reset}`);
    console.log(`${colors.dim}   This SD was stranded at pending_approval/LEAD_FINAL — executing the final handoff now instead of only printing it.${colors.reset}`);
    try {
      const output = execSync(`node scripts/handoff.js execute ${nextHandoff} ${effectiveId}`, {
        cwd: wtCwdForFinal,
        encoding: 'utf8',
        timeout: 300000,
        env: { ...process.env, CLAUDE_SESSION_ID: session.session_id },
      });
      console.log(output);
      console.log(`${colors.green}   ✅ ${nextHandoff} auto-chain completed.${colors.reset}`);
    } catch (finalErr) {
      const combined = `${finalErr.stdout || ''}\n${finalErr.stderr || ''}\n${finalErr.message || ''}`;
      console.log(combined);
      if (/PR_MERGE_VERIFICATION/.test(combined)) {
        console.log(`${colors.yellow}   ⏸  ${nextHandoff} blocked on PR_MERGE_VERIFICATION — merge the open PR, then re-run:${colors.reset}`);
        console.log(`${colors.cyan}   node scripts/sd-start.js ${effectiveId}${colors.reset}`);
      } else {
        console.log(`${colors.red}   ⚠ ${nextHandoff} auto-chain failed — retry manually:${colors.reset}`);
        console.log(`${colors.cyan}   CLAUDE_SESSION_ID=${session.session_id} node scripts/handoff.js execute ${nextHandoff} ${effectiveId}${colors.reset}`);
      }
    }
  } else if (needsBrainstorm && sd.status === 'draft') {
    console.log(`\n${colors.bold}Next Action:${colors.reset}`);
    console.log(`   ${colors.cyan}/brainstorm ${sd.title}${colors.reset}`);
    console.log(`${colors.dim}   After brainstorm completes with vision+arch, then:${colors.reset}`);
    console.log(`   ${colors.dim}CLAUDE_SESSION_ID=${session.session_id} node scripts/handoff.js execute ${nextHandoff} ${effectiveId}${colors.reset}`);
  } else {
    console.log(`\n${colors.bold}Next Action:${colors.reset}`);
    console.log(`   ${colors.cyan}CLAUDE_SESSION_ID=${session.session_id} node scripts/handoff.js execute ${nextHandoff} ${effectiveId}${colors.reset}`);
    console.log(`${colors.dim}   ⚠  Save this CLAUDE_SESSION_ID — all subsequent node script calls (handoff.js, etc.) require it.${colors.reset}`);
    console.log(`${colors.dim}   After context compaction, re-check SessionStart hook output or use the session ID shown above.${colors.reset}`);
    console.log(`${colors.dim}   Omitting it causes no_deterministic_identity failures at claim-validity gate.${colors.reset}`);
  }

  // SD-LEO-INFRA-SD-INTRAPHASE-PROGRESS-001: Emit a 5% entry tick on claim success so
  // the fleet dashboard immediately shows a non-zero progress signal for an active
  // worker. Monotonic — a higher existing progress_percentage (e.g. during re-acquire
  // mid-phase) is preserved. Fail-soft: any error is logged but does not affect flow.
  try {
    const { data: current } = await supabase
      .from('strategic_directives_v2')
      .select('progress_percentage')
      .eq('id', sd.id)
      .single();
    if ((current?.progress_percentage || 0) < 5) {
      await supabase
        .from('strategic_directives_v2')
        .update({ progress_percentage: 5 })
        .eq('id', sd.id);
    }
  } catch (e) {
    console.warn(`${colors.dim}   (entry-tick skipped: ${e?.message || e})${colors.reset}`);
  }

  console.log(`\n${colors.dim}Session: ${session.session_id}${colors.reset}`);
  console.log('═'.repeat(50));
}

main()
  .then(() => {
    // QF-20260523-820: sd-start is a claim-and-exit CLI. startHeartbeat() (called
    // mid-flow per FR-3 of SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001) arms a ref'd
    // 30s setInterval that holds Node's event loop open. Without an explicit exit the
    // success path never returns — the process hangs until an external watchdog
    // SIGTERMs it (exit 143). The orchestrator path masked this because its
    // all-complete / no-child branches exit before the heartbeat is armed; the
    // "found a workable child" branch falls through to here and hangs (true blast
    // radius: every non-error-terminating run). Stop the heartbeat and exit, mirroring
    // the QF-20260424-805 fix in add-prd-to-database.js. stopHeartbeat() clears the
    // interval but does NOT release the claim (cooperative ownership) — the claim
    // persists for the agent's subsequent work. RCA: sub_agent_execution_results
    // c0c08fd6-c722-44a7-95d4-5c4126c2dd40.
    stopHeartbeat();
    process.exit(0);
  })
  .catch(error => {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  });
