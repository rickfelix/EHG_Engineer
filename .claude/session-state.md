# Session State — SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001

Worktree: C:\Users\rickf\Projects\_EHG\EHG_Engineer\.worktrees\SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001
Branch: feat/SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001
Worker: fleet session 9a78de7f-f379-460a-8a47-b2e5e5c5618f ("Golf"), coordinator c130ca2c-48aa-4ff3-bf81-3f7f1eeffac8

## Status (2026-08-24) — starting LEAD phase

Title: "Forecaster claimable-predicate unification". sd_type=infrastructure, priority=medium.

## Problem (from SD record)
The predictive belt-low forecaster computes its deficit from a predicate that disagrees
with its own claimable-now list:
- Arithmetic inconsistency observed twice same-day: "Belt=2 claimable vs demand 6 ->
  short by 5" and "Belt=3 vs 6 -> short by 4".
- A W6-held SD (SD-LEO-FEAT-EVA-VENTURE-IDEATION-001) counted as claimable for ~3h
  after its dependency-hold was queue-encoded.
- Each wrong count spends an Adam sourcing cycle and can trigger padding mints.

## Scope (one SD, well-bounded)
- FR-1: single claimable-predicate function, one source — forecaster deficit
  arithmetic, claimable-now list, and belt/sd:next claimability logic all read the
  SAME predicate (dependency-resolved AND not human-gated AND tier-eligible AND not
  held); delete local re-derivations.
- FR-2: deficit formula published in the forecaster's own output (claimable N, demand
  M = idle + freeing-soon, short = max(0, M-N)) so a reader can audit the arithmetic in
  the message itself.
- FR-3: regression fixtures — a dependency-held SD never appears claimable; printed
  shortfall always equals the formula over the printed set.

## Out of scope
Demand-side estimation (idle/freeing-soon heuristics); ranking.

## Success criteria
- Zero forecaster messages where short != demand - claimable over the displayed list
  (fixture-enforced).
- Held-SD fixture excluded from claimable in the same tick its hold lands.

## Update 1 (2026-08-24) — VALIDATION corrected the scope, verified against real code

validation-agent (evidence row c3e0e895-526f-4c2f-9082-f52ab780bf02, CONDITIONAL_PASS,
conf 88) found: no duplicate SD (proceed), but the SD-as-submitted's premise is only
half accurate and FR-2 is arithmetically wrong. Independently verified the 3 most
consequential claims directly against the code before accepting them:

1. CONFIRMED: FR-2 says "short = max(0, M-N)" but the shipped formula
   (lib/drive-loop/belt-verdict.js:56-58) is
   `deficit = (demandSoon + buffer) - beltDepth`, with `BELT_BUFFER = 1`
   (scripts/lib/capacity-inputs.mjs:86) — a genuinely different formula (extra +1 term,
   no max(0,...) clamp — negative deficit is a valid SURPLUS reading per the verdict
   ladder). Publishing FR-2's stated formula would flip real DEFICIT rows to 0,
   confirmed against 803/803 live belt_capacity_verdicts rows by the validator.
2. CONFIRMED: the ONE real forecaster-side re-derivation (scripts/lib/capacity-inputs.mjs
   :333-368) is a DELIBERATE, documented divergence, not a bug — comment at :352-354
   explicitly says the forecaster drops bare-shell (vs. computeClaimableLeaves which
   only demotes it) so the forecaster count is a SAFE subset of the real leaf set
   ("Under-count is the SAFE deficit direction"). FR-1's literal "delete local
   re-derivations" would destroy this deliberate safety property if executed naively.
3. CONFIRMED: scripts/lib/claimable-leaves.mjs:57 calls
   `classifyDispatchIneligibility(d)` with NO second arg, while
   lib/fleet/claim-eligibility.cjs:419 defines `classifyDispatchIneligibility(sdRow, ctx)`
   — any ctx-dependent axis (e.g. tier-eligibility) can never fire from this call site.
   Whether the fleet-wide belt should be tier-FILTERED (not just tier-DISPLAYED) is a
   genuine architectural decision, not a mechanical unification detail.

**Corrected problem framing**: claim (a) "arithmetic inconsistent" is FALSE as
literally stated (math is exact) — the REAL defect is an EXTENT mismatch: the
Adam-facing header counts SD+QF combined while "Claimable now:" only lists SD keys, so
the printed numbers visually disagree even though both are individually correct. Claim
(b) (stale claimable window on a "held" SD) is TRUE and WORSE than stated — the cited
"hold" mechanism (metadata.scheduling_constraint) has ZERO code readers anywhere, so
it was never really a "dependency hold" being missed; the SD is still counted
claimable ~2 DAYS later, not ~3h.

**Re-scoped FRs for PLAN** (do not build the original literal FR text):
- FR-1 (corrected): add a genuinely NEW "held" axis to classifyDispatchIneligibility
  reading metadata.scheduling_constraint (currently zero readers → safe, every
  consumer of the shared predicate inherits the fix for free). Do NOT touch the
  documented bare-shell divergence in capacity-inputs.mjs — that's deliberate.
- FR-2 (corrected): (a) fix the formula text/publication to the REAL formula
  (demandSoon + BELT_BUFFER - beltDepth, buffer named explicitly, no incorrect
  max(0,...) clamp) so a reader can audit the real arithmetic; (b) fix the EXTENT
  mismatch by making the Adam-facing message print the same SD+QF breakdown the
  console line already computes (coordinator-capacity-forecast.mjs:129 has this logic
  already — reuse it at the Adam-facing line, not just console).
- FR-3 (corrected): regression fixtures asserting (i) the belt_capacity_verdicts
  formula invariant (proven testable, 803/803 today), (ii) a scheduling_constraint-held
  SD is excluded from claimable in the same tick the hold lands (via the new axis),
  (iii) the printed header extent always matches the printed claimable-now list extent.
- Tier-axis question (item 5 in the report): explicitly OUT OF SCOPE for this SD —
  matches the ORIGINAL SD's own "out of scope: ranking" boundary. Whether the belt
  should be tier-FILTERED fleet-wide is a separate architectural decision with
  fleet-wide blast radius; deferred to its own SD/chairman ruling, not folded in here.
- SD hygiene note for PLAN: strategic_directives_v2.description is truncated
  mid-sentence; the authoritative problem text lives in metadata.plan_content.
  success_criteria/key_changes are unpopulated/boilerplate — PLAN must author real
  ones from the corrected scope above, not trust the current DB fields.

## Update 2 (2026-08-24) — SD record corrected, LEAD-TO-PLAN precheck run

Wrote scripts/one-off/forecaster-claimable-predicate-001-lead-scope-correction.mjs
(isMainModule guard pattern) and ran it: SD's description/success_criteria/
key_changes/scope_reduction_percentage(45%)/metadata.lead_scope_correction updated to
the corrected scope from Update 1. NOT yet committed (a pre-commit gate blocks commits
until LEAD-TO-PLAN passes on a draft SD — expected, will commit after the handoff).

`handoff.js precheck LEAD-TO-PLAN` ran: 87% overall, 2 real remediations:
1. GATE_SUBAGENT_EVIDENCE: missing Explore sub-agent evidence (I only ran
   validation-agent, skipped the CLAUDE_LEAD.md "Explore Before Validation" step).
2. GATE_MECHANISM_CLAIM_VERIFIER: the corrected description's mechanism claims (about
   belt-verdict.js, claim-eligibility.cjs, capacity-inputs.mjs, claimable-leaves.mjs)
   need a NAMED VERIFIER, not just prose — my own personal code-reading isn't captured
   as evidence.

Dispatched an Explore agent (name "explore-forecaster-lead",
agent_id explore-forecaster-lead@session-a92c28af) with an ADVERSARIAL brief asking it
to independently confirm-or-refute the 4 specific mechanism claims (quoting exact
file:line), covering both gaps at once. Once it reports: write its findings to
sub_agent_execution_results for sub_agent_code=Explore, phase=LEAD (via the canonical
store-sub-agent-repo-evidence.js or resolve-repo.js helpers per CLAUDE.md rule 11 —
NEVER hand-type repo_path columns), then re-run the precheck.

## Next steps
1. Check whether explore-forecaster-lead has replied. Independently spot-check its
   findings (this session's standing discipline) before writing evidence.
2. Write its findings to sub_agent_execution_results (canonical writer, sd_id, phase=LEAD,
   sub_agent_code=Explore).
3. Re-run `node scripts/handoff.js precheck LEAD-TO-PLAN SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001`.
   If clean, execute the handoff.
4. Commit scripts/one-off/forecaster-claimable-predicate-001-lead-scope-correction.mjs
   + session-state.md (blocked until LEAD-TO-PLAN passes).
5. PLAN phase: author a proper PRD from the corrected FR-1/FR-2/FR-3 scope in Update 1.

## Update 3 (2026-08-24) — LEAD-TO-PLAN PASSED (95%)

explore-forecaster-lead confirmed all 4 mechanism claims (CONFIRMED, zero refutations).
Independently spot-checked claim 4 directly against
scripts/coordinator-capacity-forecast.mjs (lines 129, 398-403, 448-450) before trusting
it. Wrote its findings to sub_agent_execution_results (evidence id
7ca7bb41-0230-4cd0-ad42-d2b7b036b64a, sub_agent_code=Explore, phase=LEAD) via the
canonical store-sub-agent-repo-evidence.js writer.

GATE_MECHANISM_CLAIM_VERIFIER still failed after that (0%) — root-caused by reading
its actual source (scripts/modules/handoff/executors/lead-to-plan/gates/
mechanism-claim-verifier.js): it does NOT look at sub_agent_execution_results at all —
it specifically wants `metadata.mechanism_verifications = [{verified_by, verified_at:
"file.js:LINE"}]` on the SD record itself (or an inline "verified at X by Y" phrase in
the spine text). Wrote 4 mechanism_verifications entries citing the Explore evidence
id + LEAD's own independent confirmation, each with the real file:line.

`handoff.js precheck LEAD-TO-PLAN`: 95%, PASSED. `handoff.js execute LEAD-TO-PLAN`:
PASS, score 95. **SD is now in_progress/PLAN_PRD.**

## Revised next steps
1. Commit scripts/one-off/forecaster-claimable-predicate-001-lead-scope-correction.mjs
   + session-state.md (the LEAD-phase draft-status commit gate no longer applies).
2. PLAN phase: author a proper PRD from the corrected FR-1/FR-2/FR-3 scope (Update 1)
   — do NOT build the original as-submitted literal FR text.
3. Follow CLAUDE_PLAN.md phase requirements (read it before authoring the PRD).
4. Run PLAN-TO-EXEC once the PRD is ready.

## Update 4 (2026-08-24) — PRD authored + inserted via canonical pipeline, PLAN-TO-EXEC precheck

Read scripts/prd/prd-creator.js's createPRDWithValidatedContent + scripts/add-prd-to-database.js's
`--content @file.json` override path (SD-FDBK-INFRA-ADD-PRD-DATABASE-001 — exactly built for
inline-Claude-Code PRD authoring: skips LLM generation, still runs grounding + quality gates +
DESIGN/DATABASE/RISK sub-agents + STORIES). Authored a full PRD JSON from the corrected FR-1..FR-5
scope (Update 1/3), matching lib/artifact-contracts/prd-contract.js's FieldSpec shapes exactly
(functional_requirements itemKeys id/title/description/priority/acceptance_criteria,
integration_operationalization exact 5-key object, etc). Pre-validated with
`npm run contract:check -- prd <file>` (0 warnings) before running the real pipeline. Ran
`node scripts/add-prd-to-database.js SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001 "..." --content @<file>`:
PRD-SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001 created, status=approved, progress=82%,
DESIGN/DATABASE/RISK sub-agents PASS (93% orchestration confidence), STORIES auto-generated 5 user
stories with 100% implementation_context coverage (verified directly via DB query, not trusted from
console output alone).

`handoff.js precheck PLAN-TO-EXEC`: 89%, single real blocker: GATE_SUBAGENT_EVIDENCE missing
TESTING evidence for this phase (DESIGN/DATABASE/RISK auto-ran inside the PRD pipeline; TESTING
does not — needs a separate Task-tool dispatch per CLAUDE.md rule 2).

Dispatched testing-agent (agentId ac754addb21d833a3) with the corrected FR-1..FR-5 scope. It stored
evidence (id 5d737643-109f-4da1-96d5-25842264bdbf, phase=PLAN, sub_agent_code=TESTING,
verdict=CONDITIONAL_PASS, confidence=88) and surfaced two EXEC-critical corrections, BOTH
independently verified directly against live code before trusting:

1. **FR-2's target site doesn't exist as originally described.** coordinator-capacity-forecast.mjs
   publishes NO deficit-formula text anywhere today (verified: header comment only says
   "Verdict — SURPLUS/TIGHT/DEFICIT"; GAUGE line :249 and deficitFingerprint() :414 both print
   `Math.max(0, deficit)` — legitimate, separate clamps, not the "incorrect clamp" my PRD's
   acceptance criteria described). FR-2 is really "ADD explanatory formula text naming demandSoon /
   BELT_BUFFER / beltDepth explicitly" (e.g. at the GAUGE line or reachAdam message), not "fix
   existing wrong text". EXEC: do not go looking for wrong formula text to correct — there isn't
   any; add new text instead, and don't touch the two legitimate Math.max(0,...) clamps at :249/:414.
2. **FR-1 will break an already-green test on contact unless handled in the same commit.**
   lib/fleet/claim-eligibility.cjs:856 derives `INELIGIBILITY_AXIS_NAMES` from `fn.name` over the
   frozen INELIGIBILITY_AXES array (deliberate self-documenting-roster pattern — verified). 
   tests/unit/fleet/released-mid-phase-two-sided-control.test.js:88 fails any axis with no
   AXIS_FIXTURES entry (verified). EXEC MUST: (a) declare the new held-axis as a NAMED function
   (an inline arrow has empty fn.name and gets silently dropped by `.filter(Boolean)` — it would
   silently escape this exact coverage test rather than fail it), (b) add a matching AXIS_FIXTURES
   entry in released-mid-phase-two-sided-control.test.js in the SAME commit.

Also useful from the TESTING report (not independently re-verified, but from the same agent that
got the two items above right): existing coverage is tests/unit/capacity-inputs.test.js +
tests/unit/capacity-forecaster-belt-extent.test.js; recommended new test file
tests/unit/fleet/claim-eligibility-scheduling-constraint-held.test.js for TS-1/TS-2; recommends a
COMMITTED SNAPSHOT fixture (not a live DB replay) for the formula-invariant test — reasoning: a live
replay is self-invalidating (a regressed formula writes rows that satisfy itself); belt_capacity_verdicts
rows lack idleNow so the DEFICIT-URGENT branch can't be re-derived from stored rows, partition tests
on the arithmetic identity only; existing bare-shell test is
tests/unit/capacity-forecaster-belt-extent.test.js:109; reachAdam() is unexported + does I/O so TS-5
needs a new exported pure `formatBeltHeaderLine(...)` (matches the file's own established
extraction pattern for formatClaimableNow/deficitFingerprint/shouldPingAdam); captured a GREEN
baseline (87 tests / 6 files) across the affected suites before any change.

## Update 5 (2026-08-24) — EXEC phase complete, EXEC-TO-PLAN PASSED (87%)

Implemented FR-1 through FR-5 (commit 1d33af3e2aa):
- FR-1: `schedulingConstraintHeld` axis + `isSchedulingConstraintActive` helper in
  lib/fleet/claim-eligibility.cjs, added to INELIGIBILITY_AXES (between notBeforeHold and
  oneWayDoor) and CLAIM_WRITE_FENCE_AXES. Live specimen shape confirmed by direct DB query
  (SD-LEO-FEAT-EVA-VENTURE-IDEATION-001: `{note, source}` free-form prose, no structured
  resolution field) — presence-only check, fail-CLOSED on any non-empty/malformed shape
  (mirrors isLeadBlockerActive precedent).
- FR-2: `formatDeficitFormula()` new pure exported fn + console line naming
  demandSoon/BELT_BUFFER/beltDepth explicitly — this is a NEW line, not a correction (verified
  directly: no formula text existed anywhere in the file before).
- FR-3: `formatBeltExtent()` new pure exported fn, wired into reachAdam() via a new
  `openQfCount` param at its call site, so the Adam header states the same SD+QF breakdown the
  console BELT line (:129) already computes.
- FR-4: new test file tests/unit/fleet/claim-eligibility-scheduling-constraint-held.test.js
  (TS-1/TS-2/TS-3) + tests/fixtures/belt-capacity-verdicts-snapshot.json (40 real rows, committed
  snapshot not live replay) + belt-verdict.test.js TS-4 tests + capacity-forecast-saturation-ack
  formatBeltExtent/formatDeficitFormula tests.
- FR-5: capacity-inputs.mjs and claimable-leaves.mjs's classifyDispatchIneligibility(d) call site
  left untouched (verified: absent from commit's file list); added a code comment (not just PRD
  text) at claimable-leaves.mjs:57 documenting the deliberate tier-filtering deferral.

Mandatory AXIS_FIXTURES entry added to released-mid-phase-two-sided-control.test.js in the SAME
commit (a new INELIGIBILITY_AXES member silently escapes that roster-coverage test otherwise —
confirmed by PLAN-phase TESTING evidence). Fixed a real regression this triggered: an
over-specified static full-membership `.toEqual([...])` pin on CLAIM_WRITE_FENCE_AXES in
exec-boundary-hold-claim-eligibility.test.js (updated, not weakened — same anti-pattern the OTHER
test file's own docstring warns against).

Full consumer sweep: tests/unit/fleet/ (167 files/2113 tests) + every direct/indirect importer of
claim-eligibility.cjs or coordinator-capacity-forecast.mjs (~30 more files/358 tests) — all green,
zero regressions beyond the one static-pin fix above.

Dispatched TESTING (EXEC phase, evidence d096ee6b-f1e8-4288-8b1a-d618e85572da,
CONDITIONAL_PASS/88%) — independently re-verified its 4 real findings myself before acting:
- F6 (fixture said 40 rows, was actually 39) — CONFIRMED via direct count, rebuilt fixture
  programmatically from the original 40-row fetch (not hand-transcribed again).
- F7 (TS-5/extent test asserted a tautology — both sides reduced to the same local expression,
  never touching production beltDepth) — CONFIRMED by reading the test; rewrote it to derive
  beltDepth from the REAL computeBeltVerdict().
- F8 (FR-1 AC-3 said malformed values → "not-held", shipped code is fail-closed → "held") —
  CONFIRMED the divergence exists; judged the CODE correct (matches isLeadBlockerActive
  precedent, safer direction for a hold axis with zero prior shape data) and corrected the PRD
  AC text instead of the code.
- F9 (sibling emitMaskedStallEscalation() has the identical header-vs-list mismatch, outside
  FR-3's literal reachAdam()-only scope) — deliberately NOT fixed here, flagged as a follow-up
  finding for completion-flags routing (avoid silent scope growth).
Also implemented F10 (extracted formatDeficitFormula for testability) and F11 (added the FR-5
code comment) as cheap, clearly-justified wins. Corrected PRD via
scripts/one-off/forecaster-claimable-predicate-001-exec-prd-correction.mjs (FR-1 AC-3, FR-2 AC-3
+ description). Committed all fixes (b2a736f58b5). Re-ran the full regression sweep after: 172
files / 2184 tests, zero failures.

Dispatched SECURITY (EXEC phase, evidence db6deddc-263b-4286-bc49-ada9c2ed5778, PASS/96%) —
empirically fuzz-tested isSchedulingConstraintActive against 21 hostile shapes (no eval/dynamic
require, no coercion path), verified all 8 CLAIM_WRITE_FENCE_AXES production call sites use the
required all-match form (Set addition is monotonic-refusal-only, no fail-open), confirmed fixture
contains only 4 numeric fields (no PII/session/SD-key leakage), confirmed no new deps/egress/file
writes/secrets. Flagged one pre-existing, untouched, non-blocking informational note (SEC-7:
reachAdam already interpolates sd_key/callsign/session_id into its body — predates this SD).

`handoff.js precheck EXEC-TO-PLAN`: 87%, PASSED (only TESTING+SECURITY evidence was missing,
both now satisfied). `handoff.js execute EXEC-TO-PLAN`: PASS, score 87. **SD is now
active/PLAN_VERIFICATION (VERIFY phase).**

## Update 6 (2026-08-24) — PLAN-TO-LEAD PASSED (95%), PR #7492 shipped, awaiting CI merge

Dispatched RETRO sub-agent (SD_COMPLETION, id 7ad9d80a-2de1-4844-89bc-0cebdf17ee86, verified
against the actual gate logic by the sub-agent itself — validateSDCompletionReadiness() passed,
blended 82%, AI judge scored specificity/applicability 9/10) — resolved the only real
PLAN-TO-LEAD blocker (RETROSPECTIVE_QUALITY_GATE). `handoff.js precheck/execute PLAN-TO-LEAD`:
95%, PASSED. **SD is now pending_approval/LEAD_FINAL.**

Ran /ship: pushed branch, created PR #7492
(https://github.com/rickfelix/EHG_Engineer/pull/7492). Risk score 0.86 -> DEEP tier (multi-agent
adversarial required). Dispatched a general-purpose agent with the "read the full diff yourself,
don't trust any truncated prompt" brief (known review-gate limitation documented in this session's
carried notes). Result: PASS, one INFO-level docstring-accuracy nit (isSchedulingConstraintActive's
comment overclaimed "mirrors isLeadBlockerActive exactly" — it deliberately doesn't, for the
empty-object case). Fixed and pushed (commit b3c674d8c13). Logged findings to
ship_review_findings, resolved repo once to .claude-work/ship-repo-resolved.json.

Ran the hardened auto-merge sequence (lib/ship/auto-merge.mjs): failed with
`GraphQL: Required status check "Run Unit Tier (quarantine-aware)" is in progress.` — verified via
`gh pr checks 7492` directly: this and several other required checks (Gate 0-3, coverage,
module-boundaries) are genuinely still `pending`, not failed. This is the known
in-progress-not-failed pattern from this session's carried notes — correct response is
ScheduleWakeup + retry, never blind hammer-retry. Scheduling a wakeup to retry the merge.

## Pending follow-up (route via capture-completion-flags at post-completion, NOT in this SD's
## scope — do not silently fold into this diff)
- F9: scripts/coordinator-capacity-forecast.mjs's emitMaskedStallEscalation() (~line 355-357)
  has the same header(combined beltDepth)-vs-claimable-now-list(SD keys only) extent mismatch
  that FR-3 fixed in reachAdam(), but FR-3's scope names reachAdam() specifically. Tiny fix
  (~5 LOC, thread openQfCount through its call site at ~line 255, reuse formatBeltExtent). Good
  Tier-1 QF candidate.

## Next steps (revised, Update 6)
1. Retry the hardened auto-merge for PR #7492 once CI's required checks clear (`gh pr checks 7492`
   to confirm, then re-run the lib/ship/auto-merge.mjs sequence from Update 6).
2. LEAD-FINAL-APPROVAL, then full post-completion tail (/document, /heal, /learn,
   capture-completion-flags — MUST include the F9 follow-up finding above as an incidental
   finding, per CLAUDE.md's completion-flags reflective interrogation).
3. /checkin for the next SD (same-turn next-claim discipline).

## Notes carried from prior SD (VENTURE-SCAFFOLD-CODE-001, completed this session)
- ENF-15 force-push allowlist does NOT include docs/* branches — relevant if this SD
  also needs a post-merge CHANGELOG PR later.
- This repo has many concurrent fleet sessions; expect CHANGELOG.md merge conflicts on
  any changelog PR, re-merge origin/main right before final push.
- git stash is repo-global across worktrees — always target by index (stash@{N}), never
  bare pop, when multiple stashes may exist.
