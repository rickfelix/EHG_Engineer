#!/usr/bin/env node
/**
 * SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002 — VALIDATION at the LEAD-TO-PLAN gate.
 *
 * LEAD-phase pre-approval pass: scope coherence, technical feasibility against the CURRENT
 * state of lib/coordinator/quiet-tick.cjs, duplicate/infrastructure check, and verification
 * that the option-(b) risk acceptance is durably captured.
 *
 * Every claim below was measured, not inherited:
 *   - lib/coordinator/quiet-tick.cjs read in full (246 lines, FR-7 predicate at :219)
 *   - session_coordination row 2dd84a5a fetched live (EXISTS, read_at + acknowledged_at set)
 *   - authoritative FR-1..FR-5 read from the PARENT PRD (PRD-e6db824d), because this SD's own
 *     metadata.functional_requirements is fabricated (see VAL-1)
 *   - FR-1's clobber path proven by EXECUTING discoverStandardLoops(), not by reading it
 *   - baseline suite RUN (50/50 pass), not inspected
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD = 'SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 93,
  execution_time_ms: 0,
  critical_issues: [],
  warnings: [
    {
      id: 'VAL-1',
      severity: 'HIGH',
      issue: "This SD's own metadata.functional_requirements is FABRICATED — PLAN must not derive the PRD from it",
      evidence:
        "strategic_directives_v2.metadata.functional_requirements for this SD is a single-element array: [{id:'FR-5', title:\", blocked pending parked-seat directive-wake preemption) --yes Coordinator loaded-and-quiet wake band widening (\"}]. That title is a mangled substring of the SD's own scope field, not a requirement. FR-1..FR-4 are absent entirely. The scope field itself is 'Coordinator loaded-and-quiet wake band widening (FR-1..FR-5, blocked pending parked-seat directive-wake preemption) --yes' — a leaked `--yes` CLI flag, which is the same authoring defect that produced the mangled FR title. The AUTHORITATIVE FR-1..FR-5 exist only on the parent SD's PRD (product_requirements_v2 PRD-e6db824d-e5e2-4f77-9e22-052f64f98db2, sd_id = parent SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-001), where all seven FRs carry full descriptions and acceptance criteria.",
      location: 'strategic_directives_v2.metadata.functional_requirements / .scope (SD 7d23f04f-d468-41a2-be35-388def3a6025)',
      recommendation:
        "PLAN must source FR-1..FR-5 verbatim from PRD-e6db824d (parent), NOT from this SD's metadata. Recommend also overwriting metadata.functional_requirements with the real five and stripping the '--yes' from scope, so the next reader is not handed the fabrication. Non-blocking for LEAD-TO-PLAN only because the authoritative source exists and is named here.",
    },
    {
      id: 'VAL-2',
      severity: 'HIGH',
      issue: "FR-1's target registry row currently READS AS FIXED but the fix is a DB-only edit that the next seed run reverts — the gap is now masked",
      evidence:
        "periodic_process_registry.standard_loop:inbox live state: expected_interval_seconds=900, grace_multiplier=3, updated_at=2026-09-01T21:26:53Z, with liveness_source_ref.cadence_note recording a coordinator f2bf6022 edit at 21:30Z. 900x3=2700s comfortably exceeds the 660s band max, so the row reads as ALREADY compliant with FR-1's acceptance criterion. It is not. I executed discoverStandardLoops(process.cwd()) from lib/periodic-liveness/enumerate-processes.mjs: it returns standard_loop:inbox with cron '*/2 * * * *' and expected_interval_seconds=120 — derived from scripts/coordinator-startup-check.mjs:161, which still carries cron: '*/2 * * * *'. parseStandardLoops() does NOT honour the entry's `folded: true` flag (no filter on it anywhere in the function), and scripts/seed-periodic-process-registry.mjs:192 upserts `expected_interval_seconds: proc.expected_interval_seconds` with `currently_expected_active: true` unconditionally onConflict process_key. So the next seed run rewrites 900 -> 120, taking the effective overdue threshold to 360s, which is BELOW the 660s band max and reproduces exactly the false-OVERDUE condition FR-1 exists to prevent.",
      location:
        'scripts/coordinator-startup-check.mjs:161 (cron) / lib/periodic-liveness/enumerate-processes.mjs:109-136 (parseStandardLoops) / scripts/seed-periodic-process-registry.mjs:192,203 (unconditional upsert)',
      recommendation:
        "FR-1 remains REQUIRED and its priority should be raised, not lowered, by the interim DB edit — an instrument that reads green while the derivation still says 120s is worse than one that reads red. PLAN's FR-1 acceptance criterion (inherited verbatim from the parent PRD) already demands the right thing: edit STANDARD_LOOPS, re-run the seeder, and paste the read-back AFTER the re-seed. Enforce that ordering explicitly; a read-back taken now would pass and prove nothing.",
    },
    {
      id: 'VAL-3',
      severity: 'MEDIUM',
      issue: "risk_acceptance_b's rationale argues from the WORKER seat class while the band being widened is the COORDINATOR's own cadence",
      evidence:
        "metadata.risk_acceptance_b.rationale reads: 'Parked workers already sit on a 1200s idle cadence and a 180s grace tick, so the [540,660] band is strictly less exposure than today; coordinator-side hard-wake (WAKE-ON-DIRECTIVE-001) remains the delivery guarantee for coordinator directives.' But FR-3 (parent PRD) wires the predicate into scripts/coordinator-quiet-tick.mjs main() only — the seat whose park lengthens is the COORDINATOR's. Verified: decideCadence is called at scripts/coordinator-quiet-tick.mjs:478 and scripts/adam-quiet-tick.mjs; no worker-seat caller exists. Second, the sentence's own second clause re-asserts what the blocking finding refuted: the hard-wake branch in decideCadence (quiet-tick.cjs:68-75) is evaluated at DECISION time and sets the NEXT park; it cannot preempt an already-armed ScheduleWakeup. With a 660s park the worst-case coordinator-directive latency is ~660s + tick, versus ~270s under today's ACTIVE band — an increase, not a guarantee. IMPORTANT: this does NOT void the acceptance. The magnitude the coordinator accepted ('full-band undelivered-directive exposure up to 660s') is the correct number and does cover this exposure; only the seat class named in the rationale is imprecise.",
      location: 'strategic_directives_v2.metadata.risk_acceptance_b.rationale',
      recommendation:
        "PLAN should restate the accepted exposure in the PRD as 'up to ~660s of undelivered-directive latency on the COORDINATOR seat, because no preemption path exists for an armed ScheduleWakeup', citing session_coordination 2dd84a5a. The decision stands; the restatement is precisely the 'ship with the exposure restated honestly' half of amendment_2's own gate. Do not silently carry the worker-seat framing into the PRD.",
    },
    {
      id: 'VAL-4',
      severity: 'MEDIUM',
      issue: 'success_criteria are three boilerplate rows with "[UNPOPULATED]" measures — this SD has no measurable scope of record',
      evidence:
        'strategic_directives_v2.success_criteria = [{criterion:"All implementation items from scope are complete", measure:"[UNPOPULATED]"}, {criterion:"Code passes lint and type checks", measure:"[UNPOPULATED]"}, {criterion:"PR reviewed and approved", measure:"[UNPOPULATED]"}]. None of the five FRs is represented. FR-5 in particular is a two-sided LIVE measurement (a loaded-and-quiet tick stamping nextWakeSeconds in [540,660] AND an open-unclaimed-row tick stamping [180,270], both pasted verbatim with timestamps) that no boilerplate criterion can stand in for.',
      location: 'strategic_directives_v2.success_criteria',
      recommendation:
        "Populate success_criteria from the parent PRD's FR-level acceptance criteria during PLAN, with FR-5's two live stamps as explicit, separately-measurable rows. Non-blocking at LEAD-TO-PLAN; blocking for PLAN-TO-EXEC.",
    },
    {
      id: 'VAL-5',
      severity: 'LOW',
      issue: "Parent FR-7's third acceptance criterion is recorded as met but is NOT met: computeLoadedAndQuiet() has zero callers",
      evidence:
        "PRD-e6db824d FR-7 AC-3 states 'coordinator-quiet-tick.mjs main() calls computeLoadedAndQuiet() immediately before decideCadence() (satisfying FR-3's ARM-time-freshness requirement) and passes its result as the loadedAndQuiet input', and -001 is status=completed. Grep across lib/, scripts/ and tests/ finds computeLoadedAndQuiet at exactly three sites: its definition (lib/coordinator/quiet-tick.cjs:219), its export (:234), and its unit tests (tests/unit/coordinator/quiet-tick.test.js:10,32). scripts/coordinator-quiet-tick.mjs imports only { decideCadence, detectSalientDelta, runCoresFailSoft } at line 38. The call site was never added. This is CONSISTENT with -001's actual shipped intent (the retrospective describes FR-7 as deliberately 'inert while unwired'), so it is not a regression — but the AC as written reads as satisfied and is not.",
      location: 'scripts/coordinator-quiet-tick.mjs:38 (import list) vs PRD-e6db824d FR-7 AC-3',
      recommendation:
        "-002's FR-3 must absorb the call-site work explicitly rather than assuming FR-7 left a half-wired seam behind. Estimate FR-3 as full wiring (import + gatherCapacityInputs() fresh read + predicate call + new decideCadence input), not as a one-line hookup.",
    },
    {
      id: 'VAL-6',
      severity: 'LOW',
      issue: 'scripts/adam-quiet-tick.mjs is the second decideCadence caller and its scope posture is unstated',
      evidence:
        "grep -rln decideCadence over lib/ scripts/ tests/ returns two production callers: scripts/coordinator-quiet-tick.mjs and scripts/adam-quiet-tick.mjs. Parent FR-3 names only the coordinator caller. Parent FR-2 AC-4 requires decideCadence with loadedAndQuiet omitted to be byte-identical to today, so Adam's seat is provably unaffected by default — but 'unaffected by omission' is a different statement from 'deliberately out of scope', and only the former is currently written down.",
      location: 'scripts/adam-quiet-tick.mjs',
      recommendation:
        "State in the PRD that Adam's seat is OUT of scope for -002 and relies on FR-2's omitted-input backward-compatibility guarantee. One sentence; prevents a later reader treating the asymmetry as an oversight.",
    },
  ],
  recommendations: [
    'PROCEED to LEAD-TO-PLAN. The scope (FR-1..FR-5) is coherent, technically feasible against the current codebase, carries no duplicate implementation, and the option-(b) risk acceptance is durably and verifiably captured.',
    'RISK ACCEPTANCE VERIFIED INDEPENDENTLY (the item this pass was specifically asked to confirm): session_coordination row 2dd84a5a-94db-401f-834c-f85d738dadb0 EXISTS and was fetched live. sender_session=f2bf6022-42c1-44f4-a491-b36fd9f854c9 (sender_type=orchestrator), target_session=e6347b41-3673-4082-9c0b-35207a599068, message_type=COACHING, subject="RISK ACCEPTED (b): proceed SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002 past LEAD", created_at=2026-09-01T21:05:37.273565+00:00, read_at=2026-09-01T21:24:06.599Z, acknowledged_at=2026-09-01T21:24:15.799Z. Its body text matches metadata.risk_acceptance_b.decision/rationale substantively. This is a real, read AND acknowledged row, not a metadata assertion pointing at a phantom id.',
    'THE LEAD GATE IS CLEARED ON ITS OWN TERMS. The gate was disjunctive — (a) build preemption OR (b) explicit acceptance. (b) is recorded, and metadata.needs_coordinator_review has been flipped to false (was set 2026-08-30T17:53:53Z). Preemption (a) is correctly NOT in this SD; parent FR-6 stays with the parent as a closed, predicted-FAIL measurement.',
    'DUPLICATE CHECK PASS. No competing SD or QF exists: a scan of strategic_directives_v2 for QUIET/CADENCE/WAKE keys and quick_fixes for wake-band/loaded-and-quiet/decideCadence/standard_loop:inbox titles returned this SD, its completed parent, and unrelated completed neighbours only. The [540,660] band exists nowhere in shipped code (grep for LOADED_AND_QUIET/loadedAndQuiet in lib/ scripts/ tests/ hits only the FR-7 docstring and one-off PRD-authoring scripts).',
    'REUSE-OVER-REBUILD ALREADY CORRECTLY DECIDED. Parent FR-2 explicitly rejects reusing the existing desiredActiveS lever, with a stated reason (desiredActiveS yields a 45s span anchored to a caller-supplied ceiling; LOADED_AND_QUIET needs an independent 120s span anchored at a fixed 540 floor that must never collapse into the ACTIVE range). That is the right call and is already documented — PLAN should carry the rationale forward rather than re-litigating it.',
    'FEASIBILITY PASS — every anchor the parent PRD cites was re-verified against the current tree. lib/coordinator/quiet-tick.cjs is 246 lines; decideCadence (:65-98) is pure with exactly the three branches the PRD describes (hard-wake :68, quiescent :76, active :82) plus the never-300 guard at :96. Inserting a fourth branch at precedence hard-wake > quiescent > loaded-and-quiet > active is a localised change to a pure function. computeLoadedAndQuiet (:219-230) is exported (:234) and fail-CLOSED by construction (isZero requires typeof number, so an omitted count reads unknown, never clear) — the correct polarity for widening a wake band.',
    'FR-3 ANCHORS CONFIRMED. scripts/coordinator-quiet-tick.mjs calls decideCadence at :478 and already computes undeliveredEscalation/unactionedDirective at :421-425, so predicate input (d) is reusable exactly as the PRD says. scripts/lib/capacity-inputs.mjs returns idleNow, claimableCount, openQfCount, claimableWithVerifyQfCount (:457-458) and rawUnclaimed (:466) — all four counts computeLoadedAndQuiet needs. gatherCapacityInputs is confirmed NOT currently called anywhere in coordinator-quiet-tick.mjs, matching the PRD claim, so FR-3 adds a genuinely fresh ARM-time read rather than reusing a tick-start-stale value.',
    'BASELINE MEASURED, NOT ASSUMED: npx vitest run tests/unit/coordinator/quiet-tick.test.js => 50/50 passing, 1 file, 277ms. FR-2 AC-4 ("byte-identical when loadedAndQuiet is omitted") therefore has a real, currently-green baseline to be measured against, and FR-4 asks for a hashed golden matrix on top of it.',
    'BACKLOG GATE MEASURED BEFORE BEING APPLIED: this SD has 0 sd_backlog_map rows. I checked whether that is actually anomalous before treating it as a blocker — the 12 most recent active/completed SD-LEO-INFRA-* SDs all have 0 backlog rows, and the parent -001 shipped to COMPLETED with 0. Zero backlog is normative for this SD class, so the generic ">=1 backlog item" gate is NOT applied here. Recording the measurement rather than silently skipping the check.',
    'ORDERING CONSTRAINT FOR PLAN: FR-1 must land BEFORE or WITH FR-2/FR-3, never after. The parent PRD already frames FR-1 as a prerequisite ("this fix only matters as a prerequisite for the band widening"), and VAL-2 shows the registry will revert to a 360s threshold on the next seed — shipping the band first would arm a configuration that produces false OVERDUE flags the moment anyone re-seeds.',
    'Net: CONDITIONAL_PASS. No critical issues. VAL-1, VAL-2 and VAL-3 are conditions PLAN must discharge inside the PRD (source FRs from the parent PRD; keep FR-1 required and ordered first; restate the exposure as coordinator-seat). VAL-4 is blocking for PLAN-TO-EXEC, not for LEAD-TO-PLAN. VAL-5 and VAL-6 are scoping precision.',
  ],
  detailed_analysis: [
    'VALIDATION at the LEAD-TO-PLAN gate for SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002 (id 7d23f04f-d468-41a2-be35-388def3a6025, status=draft, current_phase=LEAD, priority=medium).',
    '',
    'MANDATE. Three questions were asked: is the FR-1..FR-5 scope coherent; is it technically feasible against the CURRENT state of lib/coordinator/quiet-tick.cjs; and is the option-(b) risk acceptance properly captured. All three answer yes, with four conditions carried into PLAN.',
    '',
    'METHOD AND INSTRUMENT DIVERSITY. lib/coordinator/quiet-tick.cjs was read in full rather than grepped. The risk-acceptance row was fetched from session_coordination directly rather than trusted from the SD metadata that cites it. The authoritative FR text was read from the PARENT PRD after this SD\'s own metadata.functional_requirements was found to be fabricated. FR-1\'s durability claim was tested by EXECUTING discoverStandardLoops() and printing the derived interval, not by reading the parser and reasoning about it. The baseline test suite was RUN. The backlog gate was measured against 12 sibling SDs before being applied or waived.',
    '',
    'SCOPE COHERENCE: PASS, with one authoring defect. The five FRs form a correct dependency chain: FR-1 (make the standard_loop:inbox registry interval durable so a 660s band cannot trip a false OVERDUE) is a prerequisite for FR-2 (add the fourth LOADED_AND_QUIET branch to the pure decideCadence, yielding [540,660] phase-offset by partyOffsetS) and FR-3 (compute the predicate from a fresh gatherCapacityInputs() read in coordinator-quiet-tick.mjs main() immediately before the decideCadence call, satisfying ARM-time freshness); FR-4 is the regression/golden-hash test layer; FR-5 is the two-sided live proof. FR-6 (the parked-seat preemption measurement) is correctly ABSENT — it belongs to the parent and is closed there. FR-7 (the predicate function) is already shipped. The chain is complete and non-overlapping. The defect is that none of this is legible from the SD row itself (VAL-1).',
    '',
    'TECHNICAL FEASIBILITY AGAINST CURRENT CODE: PASS. quiet-tick.cjs today is 246 lines. decideCadence (:65-98) is contractually pure and structurally ready for the insertion: three branches (hard-wake :68 on hasUnactionedDirective||hasUndeliveredChairmanEscalation -> [15,45]; quiescent :76 -> <=900 via MAX_QUIESCENT_PARK_S; active :82 -> [180,270] or the QF-20260830-071 desiredActiveS widening) followed by the never-300 guard at :96. The new band sits at 540-660, which is above ACTIVE_MAX_S (270) and below MAX_QUIESCENT_PARK_S (900), so it slots between the existing bands without collapsing into either and cannot collide with PROMPT_CACHE_TTL_S (300) by construction. computeLoadedAndQuiet (:219-230) is already exported and fail-closed: its isZero helper requires `typeof v === "number" && v === 0`, so an omitted or undefined count reads as unknown rather than clear — the safe polarity, since the failure mode being guarded is a telemetry gap silently WIDENING the wake band. Estimated shape: ~15 lines in quiet-tick.cjs, ~10 lines in coordinator-quiet-tick.mjs, plus tests. Well inside a single small PR per FR.',
    '',
    'RISK ACCEPTANCE: PROPERLY CAPTURED (verified live, not inherited). metadata.risk_acceptance_b carries decision, rationale, accepted_by (coordinator f2bf6022-42c1-44f4-a491-b36fd9f854c9), accepted_at (2026-09-01T21:05:37.273565+00:00), acked_at, acked_by_session, and session_coordination_row_id. I resolved that row id against the live table rather than accepting the citation: it EXISTS, subject "RISK ACCEPTED (b): proceed SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002 past LEAD", created_at matches accepted_at exactly, read_at=21:24:06.599Z and acknowledged_at=21:24:15.799Z are both set, and the body text substantively matches the metadata decision and rationale. metadata.needs_coordinator_review is false. The disjunctive gate ("(a) build preemption OR (b) explicit acceptance") is therefore satisfied on branch (b), and preemption is correctly not assigned here.',
    '',
    'WHERE THE ACCEPTANCE IS IMPRECISE (VAL-3, and the finding most worth carrying forward). The accepted MAGNITUDE is right: "full-band undelivered-directive exposure up to 660s" is exactly the exposure the band creates, so the decision covers the real risk. But the rationale names the wrong seat class and, in its second clause, leans on the very assumption amendment_2 refuted. FR-3 wires the predicate into the COORDINATOR tick; there is no worker-seat caller of decideCadence at all. And "coordinator-side hard-wake remains the delivery guarantee" is true only for a directive that arrives before the tick evaluates — the hard-wake branch chooses the NEXT park length, it does not preempt one already armed, which is precisely the structural gap (no preemption path for an armed ScheduleWakeup; a parked seat runs no tools so no PostToolUse hook observes the INSERT). Worst-case coordinator-directive latency therefore rises from ~270s to ~660s+tick. PLAN should restate this plainly in the PRD; amendment_2\'s own gate demanded the exposure be "restated honestly" as the price of shipping, and restating it in the worker-seat framing would not discharge that.',
    '',
    'THE HIGHEST-VALUE FINDING (VAL-2): FR-1 IS MASKED, NOT DONE. The live periodic_process_registry row for standard_loop:inbox now reads expected_interval_seconds=900 with grace_multiplier=3 — 2700s, well clear of the 660s band max — edited at 2026-09-01T21:26:53Z with a coordinator note recorded in liveness_source_ref.cadence_note. Read alone, that row says FR-1 is already satisfied. It is not, and the check that would catch it is one the parent PRD anticipated. I executed discoverStandardLoops(process.cwd()): standard_loop:inbox derives from scripts/coordinator-startup-check.mjs:161, whose cron is still \'*/2 * * * *\', giving expected_interval_seconds=120. parseStandardLoops (enumerate-processes.mjs:109-136) reads only key/cron/label/prompt/script — it does not consult the entry\'s `folded: true` flag, so folding the loop into the quiet tick did not remove it from derivation. seed-periodic-process-registry.mjs:192 then upserts that derived 120 with currently_expected_active:true, onConflict process_key. The next seed run reverts 900 to 120, taking the effective threshold to 360s, below the 660s band. The DB-only edit made the instrument read green while the derivation still says 120 — which makes FR-1 more important, not less, and makes the ORDER of its acceptance criterion (re-seed FIRST, then paste the read-back) load-bearing rather than ceremonial.',
    '',
    'DUPLICATE / EXISTING-INFRASTRUCTURE CHECK: CLEAN. No competing SD or QF exists (scan of strategic_directives_v2 on QUIET/CADENCE/WAKE keys plus title match on "wake band"; quick_fixes title scan on wake band / loaded-and-quiet / decideCadence / standard_loop:inbox). computeLoadedAndQuiet is defined exactly once. The [540,660] band appears in no shipped code path — only in the FR-7 docstring at quiet-tick.cjs:189-205 (which explicitly documents the function as NOT YET WIRED and names this SD as the follow-up) and in the one-off PRD-authoring scripts under scripts/one-off/. There is no half-built parallel implementation to collide with. Separately, the reuse-vs-rebuild question was already asked and answered correctly in parent FR-2: desiredActiveS was considered and rejected for a stated structural reason, which is the outcome this sub-agent exists to force.',
    '',
    'ADJACENT WORK CHECKED FOR INTERACTION. SD-LEO-INFRA-ARMED-WAKEUP-NEVER-001 (completed) covers armed wakeups never firing at all — a seat-side freeze class, distinct from the no-preemption gap, and it does not close (a). SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001 (completed) is the source of the existing hard-wake branch this SD must preserve; parent FR-2 AC-2 already pins that (loadedAndQuiet:true + hasUnactionedDirective:true must still yield 15-45s). Neither creates a conflict.',
    '',
    'CONDITIONS ON THIS PASS. (1) PLAN sources FR-1..FR-5 from PRD-e6db824d, not from this SD\'s fabricated metadata. (2) FR-1 stays required and is ordered before or with FR-2/FR-3, with its read-back taken AFTER a re-seed. (3) The PRD restates the accepted exposure as coordinator-seat, up to ~660s, citing session_coordination 2dd84a5a. (4) success_criteria are populated from real FR acceptance criteria before PLAN-TO-EXEC. None of the four blocks the LEAD-TO-PLAN transition.',
  ].join('\n'),
  metadata: {
    gate: 'GATE_1_LEAD_PRE_APPROVAL',
    sd_uuid: '7d23f04f-d468-41a2-be35-388def3a6025',
    frs_in_scope: ['FR-1', 'FR-2', 'FR-3', 'FR-4', 'FR-5'],
    frs_explicitly_excluded: ['FR-6 (parked-seat preemption — not assigned to this SD)', 'FR-7 (shipped in -001, PR #7792)'],
    authoritative_fr_source: 'PRD-e6db824d-e5e2-4f77-9e22-052f64f98db2 (parent SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-001)',
    risk_acceptance_verified: {
      session_coordination_row_id: '2dd84a5a-94db-401f-834c-f85d738dadb0',
      row_exists: true,
      sender_session: 'f2bf6022-42c1-44f4-a491-b36fd9f854c9',
      sender_type: 'orchestrator',
      target_session: 'e6347b41-3673-4082-9c0b-35207a599068',
      created_at: '2026-09-01T21:05:37.273565+00:00',
      read_at: '2026-09-01T21:24:06.599+00:00',
      acknowledged_at: '2026-09-01T21:24:15.799+00:00',
      body_matches_metadata_decision: true,
      needs_coordinator_review: false,
    },
    duplicate_check: { competing_sds: 0, competing_qfs: 0, band_implementations_found: 0, predicate_definitions_found: 1 },
    backlog_items: 0,
    backlog_gate_applied: false,
    backlog_gate_waiver_basis: '12/12 most recent active+completed SD-LEO-INFRA-* SDs carry 0 sd_backlog_map rows, including the parent -001 which reached COMPLETED; zero backlog is normative for this SD class',
    baseline_tests: { suite: 'tests/unit/coordinator/quiet-tick.test.js', passed: 50, failed: 0, files: 1 },
    independent_instruments_used: [
      'full read of lib/coordinator/quiet-tick.cjs (246 lines) rather than targeted grep',
      'live session_coordination fetch by row id (verified the cited acceptance row rather than trusting the SD metadata citation)',
      'EXECUTION of discoverStandardLoops(cwd) from lib/periodic-liveness/enumerate-processes.mjs — proved the 120s derivation empirically instead of reasoning from the parser source',
      'live periodic_process_registry read for standard_loop:inbox and standard_loop:quiet-tick',
      'parent PRD functional_requirements read from product_requirements_v2 (the SD-row FR metadata was fabricated and unusable)',
      'vitest execution of the baseline quiet-tick suite (50/50)',
      'sd_backlog_map counts across 12 sibling SD-LEO-INFRA-* SDs to test the backlog gate before applying it',
    ],
    fr1_masking_finding: {
      db_row_reads: { expected_interval_seconds: 900, grace_multiplier: 3, effective_threshold_s: 2700, updated_at: '2026-09-01T21:26:53.426+00:00' },
      source_derives: { file: 'scripts/coordinator-startup-check.mjs:161', cron: '*/2 * * * *', expected_interval_seconds: 120, effective_threshold_s: 360 },
      clobber_path: 'scripts/seed-periodic-process-registry.mjs:192 unconditional upsert onConflict process_key',
      folded_flag_honoured_by_parser: false,
      band_max_s: 660,
      conclusion: 'DB-only edit reverts on next seed; 360s < 660s reproduces the false-OVERDUE condition FR-1 exists to prevent',
    },
    prior_evidence_reviewed: ['d5e8a6ac (TESTING, -001 PLAN)', '4a45c5b2 (VALIDATION, -001 PLAN_VERIFICATION)'],
  },
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD,
    { name: 'Principal Systems Analyst', code: 'VALIDATION' },
    results,
    { phase: 'LEAD-TO-PLAN', sdKey: SD },
  );
  console.log(
    'STORED ID:', stored?.id,
    '| verdict:', stored?.verdict,
    '| phase:', stored?.phase,
    '| confidence:', stored?.confidence,
    '| repo_path:', stored?.metadata?.repo_path,
  );
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
