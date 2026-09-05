#!/usr/bin/env node
/**
 * SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001 — FR-1
 *
 * Repo-wide sweep for readers of min_tier_rank / tier_rank / tierRank, printed alongside the
 * known-posture rows so the census can be re-verified on demand rather than trusted as a static
 * list. Read-only -- issues no writes.
 *
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-F — FR-1: a SECOND, independent axis was added below
 * (parent-lead/dependency: parent_sd_id / parentLeadPending / parentLeadPendingVerdict).
 * sweep() is now parameterized by pattern so both axes reuse the same sweep mechanic without
 * merging their KNOWN_SURFACES tables -- the tier axis's posture vocabulary (e.g. "advisory
 * (dead by construction)") is tier-specific history and must not silently apply to a different
 * axis's rows.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PATTERN = 'min_tier_rank|tier_rank|tierRank';
const PARENT_LEAD_PATTERN = 'parent_sd_id|parentLeadPending|parentLeadPendingVerdict';

export const KNOWN_SURFACES = [
  {
    file: 'lib/coordinator/dispatch.cjs',
    line: 868,
    symbol: 'assertWorkerTierAllowed',
    posture: 'advisory',
    note: 'RETIRED to advisory-only by QF-20260831-419: both throw branches (above_worker_tier/tier_stamp_missing at :921, reserved_no_lower_backlog at :943) now only log.info and fall through -- no throw remains. Slated for deletion by SD-FDBK-INFRA-RETIRE-SEAT-TIER-001 (chairman ratification 20dc072b).',
  },
  {
    file: 'lib/fleet/claim-eligibility.cjs',
    line: 366,
    symbol: 'tierAxes',
    posture: 'advisory (partially -- see note)',
    note: 'The above_worker_tier/tier_stamp_missing/reserved_no_lower_backlog branches (QF-20260831-419) are advisory-only. The SAME function also holds two genuinely-still-enforcing branches -- fable_window_downward_claim_blocked (:394-404, ruling QF-20260709-881) and unverified_seat_capability (:390-392, ruling FLEET-MODEL-REGISTRY-001 FR-6) -- which SD-FDBK-INFRA-RETIRE-SEAT-TIER-001 fences and must NOT delete.',
  },
  {
    file: 'lib/fleet/tier-claimable.cjs',
    line: 108,
    symbol: 'claimableForTier',
    posture: 'advisory (dead by construction)',
    note: 'Filters via tierBlocks(), which compares against verdict strings tierAxes no longer emits post-QF-20260831-419 -- tierBlocks() always returns false. Slated for deletion by SD-FDBK-INFRA-RETIRE-SEAT-TIER-001.',
  },
  {
    file: 'scripts/sd-start.js',
    line: 274,
    symbol: 'enforceTierGate',
    posture: 'advisory (dead by construction)',
    note: 'Its sole gating call is to the now-inert tierBlocks(). Slated for deletion by SD-FDBK-INFRA-RETIRE-SEAT-TIER-001.',
  },
  {
    file: 'scripts/lib/claimable-leaves.mjs',
    line: 57,
    symbol: 'claimableDbFreeReason',
    posture: 'deferred',
    note: "Calls classifyDispatchIneligibility(d) with NO ctx -- tier axis provably inert. In-code comment cites FORECASTER-CLAIMABLE-PREDICATE-001 FR-5 as a deliberate LEAD-approved deferral. This SD is the deferred decision landing (FR-2).",
  },
  {
    file: 'lib/checkin/steps/merged-pool-self-claim.cjs',
    line: 100,
    symbol: '(merged-pool self-claim lane)',
    posture: 'advisory (dead for the tier-rank axis; still feeds live fenced axes)',
    note: 'Reads ctx.tierCtx.worker_tier_rank/.tiering_active into the now-inert tierBlocks(), so the tier-rank axis is dead. Lines :118 (reservations) and :140-144 (fable_window_active) still produce ctx consumed by the live fenced mechanisms -- fenced from deletion by SD-FDBK-INFRA-RETIRE-SEAT-TIER-001.',
  },
  {
    file: 'scripts/worker-checkin.cjs',
    line: 1116,
    symbol: 'recoverStrandedFinal',
    posture: 'advisory (dead by construction)',
    note: 'tierBlocks(sd, tierCtx.worker_tier_rank, tierCtx.tiering_active) call is inert (see tier-claimable.cjs entry). A second call site exists in adoptOrphanInProgress at :1444. Slated for deletion by SD-FDBK-INFRA-RETIRE-SEAT-TIER-001.',
  },
  {
    file: 'lib/fleet/dispatch-suggestions.cjs',
    line: 46,
    symbol: 'candidateFitScore',
    posture: 'non-enforcing (advisory-by-design)',
    note: 'Header comment states ADVISORY ONLY, never assigns. Reads min_tier_rank purely to rank suggestion fit. Recorded so it is not mistaken for a gap.',
  },
  {
    file: 'scripts/assign-fleet-identities.cjs',
    line: 545,
    symbol: '(cron writer)',
    posture: 'writer (not an enforcement surface)',
    note: 'The authoritative cron writer of claude_sessions.metadata.tier_rank -- the write-path FR-4s stamp re-baseline targets. Recorded to distinguish writer from enforcer.',
  },
  {
    file: 'lib/sd-creation/pipeline.js',
    line: 1096,
    symbol: '(mint-time stamp call site)',
    posture: 'writer (not an enforcement surface)',
    note: 'Calls stampPayloadForCreation() (lib/fleet/sd-tier-rank.mjs) at SD creation time to set metadata.min_tier_rank. The write-path FR-5s mint-time advisory-by-default policy targets.',
  },
];

// SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-F — FR-1: the parent-lead/dependency axis. A SEPARATE table
// from KNOWN_SURFACES on purpose (see file header). "enforcing" here means the row actually gates
// dispatch/claim/count on parentLeadPending(Verdict); "transitive" means it gates only by calling
// a function that itself is enforcing (recorded so a reader does not mistake indirection for a gap).
export const PARENT_LEAD_KNOWN_SURFACES = [
  {
    file: 'lib/fleet/claim-eligibility.cjs',
    line: 619,
    symbol: 'evaluateDispatchEligibility',
    posture: 'enforcing',
    note: 'The canonical per-claim dispatch gate (SD-REFILL-00SO4HZY): rejects a candidate with reason=parent_lead_pending when its parent has not yet passed LEAD. parentLeadPending/parentLeadPendingVerdict are themselves DEFINED at :570-586 in this same file -- every other row in this table ultimately calls into one of those two functions.',
  },
  {
    file: 'lib/fleet/belt-depth.cjs',
    line: 131,
    symbol: 'countDispatchableBacklog',
    posture: 'enforcing',
    note: "QF-20260812-281: without this check a draft child of a not-yet-past-LEAD orchestrator parent counted as dispatchable on this (recomputed) side but not on claimable-leaves.mjs's self_reported side, manufacturing a false KPI-3 integrity divergence. Same 'parent_lead_pending' reason string evaluateDispatchEligibility uses, so the ineligible{} breakdown stays consistent across callers.",
  },
  {
    file: 'lib/fleet/belt-census.cjs',
    line: 41,
    symbol: 'SD_ELIGIBILITY_COLUMNS / per-row axis classification',
    posture: 'enforcing',
    note: "Column list at :41 selects parent_sd_id so the per-row loop at :186 (`if (await parentLeadPending(supabase, sd)) axes.push('parent_lead_pending')`) can label it as one of the ineligibility axes surfaced in the belt census breakdown.",
  },
  {
    file: 'lib/checkin/steps/merged-pool-self-claim.cjs',
    line: 264,
    symbol: 'depSatisfied (merged-pool self-claim lane)',
    posture: 'enforcing',
    note: "SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-D FR-1: imports parentLeadPendingVerdict at :264 and applies it at :304 (`!parentLeadPendingVerdict(resolveParent(sd))`) against an in-memory-resolved parent row (parent refs resolve by id OR sd_key, per :258-259's note on claim-eligibility.cjs:583) -- the sync verdict form, not the async DB-querying parentLeadPending, since the parent row is already in hand.",
  },
  {
    file: 'scripts/worker-checkin.cjs',
    line: 1036,
    symbol: 'draft self-claim eligibility path',
    posture: 'enforcing',
    note: 'Two independent call sites gate on parentLeadPending in this file: :1036 (the draft self-claim path -- fail-open per the :1035 comment) and :1449 (adoptOrphanInProgress-adjacent orphan-adopt path, SD-FDBK-INFRA-ORPHAN-ADOPT-RESUME-001). Both reuse the shared async predicate rather than re-deriving the phase check.',
  },
  {
    file: 'scripts/lib/claimable-leaves.mjs',
    line: 145,
    symbol: 'claimableDbFreeReason',
    posture: 'enforcing',
    note: 'The shared dispatchable-leaf predicate reused (never re-derived) by the ranker (coordinator-backlog-rank.mjs) and the capacity forecaster (capacity-inputs.mjs) -- see their transitive rows below.',
  },
  {
    file: 'scripts/lib/capacity-inputs.mjs',
    line: 404,
    symbol: 'forecaster belt/backlog pass',
    posture: 'transitive (enforcing via scripts/lib/claimable-leaves.mjs\'s claimableDbFreeReason)',
    note: 'Line 404 calls claimableDbFreeReason(d), which internally applies parentLeadPending. This file ALSO calls parentLeadPendingVerdict directly and independently at :430 (imported :50) against an in-memory-resolved parent map (:428-430) -- so capacity-inputs.mjs carries both a transitive AND a direct enforcing usage; :404 is cited per this SD\'s PRD, :430 is the more literal sweep-pattern anchor.',
  },
  {
    file: 'scripts/coordinator-backlog-rank.mjs',
    line: 37,
    symbol: '(ranker header comment)',
    posture: 'transitive (enforcing via scripts/lib/claimable-leaves.mjs)',
    note: 'Never calls parentLeadPending/parentLeadPendingVerdict directly -- the header comment at :37 names it as one of the shared predicates the ranker reuses via claimable-leaves.mjs rather than re-implementing. No direct literal hit exists in this file; recorded so it is not mistaken for a missed enforcement site.',
  },
  {
    file: 'scripts/coordinator-self-review.mjs',
    line: 339,
    symbol: 'self-score belt_depth computation',
    posture: 'transitive (enforcing via lib/fleet/belt-depth.cjs\'s countDispatchableBacklog)',
    note: 'Destructures `dispatchable` from countDispatchableBacklog(db) to feed a governance self-score (proactive_sourcing) -- QF-20260725-089 converted this consumer from a raw head-count to the eligibility-gated gauge specifically so this axis (among others) is reflected here.',
  },
  {
    file: 'scripts/adam-quiet-tick.mjs',
    line: 989,
    symbol: 'checkIdleBesideClaimable',
    posture: 'diagnostic-only (not gate-feeding)',
    note: "QF-20260829-588: this is an explicitly RAW-UNCLAIMED draft headcount (`.eq('status','draft')`, no eligibility filter) -- its own in-code comment says so by name specifically so it is not compared against a different, eligibility-gated extent. checkIdleBesideClaimable itself never references parent_sd_id/parentLeadPending; recorded here proactively (PLAN's candidate #1) because a diagnostic gauge that overlaps functionally with the eligibility-gated ones is exactly the shape of gap this workstream exists to catch. Investigated and confirmed NOT a gap: it never feeds a gate or dispatch decision. NOTE: this FILE still appears in the literal sweep via an unrelated call site -- fetchInFlightItems (:1113-1120, a different stall/duration-baseline detector) filters with `.is('parent_sd_id', null)` to select only top-level (non-child) SDs; that is an unrelated population filter, not a parent-lead-pending check, and is out of this SD's investigated scope.",
  },
  {
    file: 'lib/claim/queue-resolver.cjs',
    line: 191,
    symbol: 'resolveLeafWorkItem / findUnclaimedChild (DESCEND path)',
    posture: 'excluded (call-site-gated by a separate, non-canonical predicate)',
    note: "PLAN flagged this UNRESOLVED (PRD FR-2) rather than assume a posture. EXEC investigated: resolveLeafWorkItem/findUnclaimedChild never call parentLeadPending/parentLeadPendingVerdict directly -- but their ONLY production call site, scripts/sd-start.js:704, is guarded immediately above at :696 by hasParentNeedsOwnLeadToPlan (sd-start.js:415-435), a THIRD independent reimplementation of 'is this parent pre-LEAD', keyed on sd_phase_handoffs acceptance rather than current_phase. DECISION: no wiring needed in this file -- the descend path IS gated end-to-end today. Flagging the drift risk instead: hasParentNeedsOwnLeadToPlan and parentLeadPendingVerdict key on different signals and could disagree (e.g. current_phase advances past LEAD before the accepted LEAD-TO-PLAN handoff row lands, or vice versa) -- same duplicate-implementation-drift class as the detectors.cjs row below, not treated as a live gap absent an observed disagreement.",
  },
  {
    file: 'lib/coordinator/detectors.cjs',
    line: 616,
    symbol: 'detectPreLeadParentDeadlock',
    posture: 'advisory (duplicate-implementation drift risk)',
    note: 'Re-implements the pre-LEAD phase check locally (PRE_LEAD_PHASES + literal s.parent_sd_id grouping, :613-636) instead of importing parentLeadPendingVerdict, so the same 3-way drift risk noted on the queue-resolver.cjs row above applies here too. Deliberately read-only/advisory (never mutates) -- auto-advancing a stuck parent was explicitly REJECTED per this detector\'s own header comment. Not a live gap; recorded so the duplication itself does not go unrecorded.',
  },
];

export function sweep(cwd = process.cwd(), pattern = PATTERN) {
  let out;
  try {
    out = execFileSync(
      'git',
      // -e forces pattern interpretation permanently, so a future option-shaped `pattern` value
      // (e.g. one starting with '-O'/'-f') can never be parsed as a git-grep flag instead of a
      // pattern (SECURITY finding on SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-F's parameterization).
      ['grep', '-n', '-E', '-e', pattern, '--', '*.js', '*.cjs', '*.mjs'],
      { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 32 }
    );
  } catch (err) {
    // git grep exits 1 when there are zero matches -- not an error for our purposes.
    if (err.status === 1) return [];
    throw err;
  }
  return out
    .split('\n')
    .filter(Boolean)
    .filter((line) => !line.startsWith('.worktrees/') && !line.includes('node_modules/'))
    .map((line) => {
      const idx = line.indexOf(':');
      const idx2 = line.indexOf(':', idx + 1);
      return { file: line.slice(0, idx), line: Number(line.slice(idx + 1, idx2)), raw: line };
    });
}

function reportAxis(label, hits, knownSurfaces) {
  const knownFiles = new Set(knownSurfaces.map((s) => s.file));
  const unknownFiles = [...new Set(hits.map((h) => h.file))].filter((f) => !knownFiles.has(f));

  console.log(`\n=== ${label} axis ===`);
  console.log(`Sweep found ${hits.length} raw hits across ${new Set(hits.map((h) => h.file)).size} files.`);
  console.log(`\nKnown surfaces (${knownSurfaces.length}):`);
  for (const s of knownSurfaces) {
    console.log(`  [${s.posture}] ${s.file}${s.line ? ':' + s.line : ''} (${s.symbol})`);
  }
  console.log(`\nUnrecognized files with a hit (${unknownFiles.length}) -- review before closing the census:`);
  for (const f of unknownFiles) console.log(`  ${f}`);

  return { total_hits: hits.length, known_surfaces: knownSurfaces, unrecognized_files: unknownFiles };
}

function main() {
  const tierReport = reportAxis('tier-floor', sweep(process.cwd(), PATTERN), KNOWN_SURFACES);
  const parentLeadReport = reportAxis('parent-lead/dependency', sweep(process.cwd(), PARENT_LEAD_PATTERN), PARENT_LEAD_KNOWN_SURFACES);

  const outPath = new URL('../scripts/temp/tier-floor-census-report.json', import.meta.url);
  const report = { ...tierReport, parent_lead_axis: parentLeadReport };
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${outPath.pathname}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
