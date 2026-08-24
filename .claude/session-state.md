# Session State — SD-LEO-INFRA-RETRO-PROMOTION-PATH-001

Worktree: C:\Users\rickf\Projects\_EHG\EHG_Engineer\.worktrees\SD-LEO-INFRA-RETRO-PROMOTION-PATH-001
Branch: feat/SD-LEO-INFRA-RETRO-PROMOTION-PATH-001
Worker: fleet session 9a78de7f-f379-460a-8a47-b2e5e5c5618f ("Golf"), coordinator c130ca2c-48aa-4ff3-bf81-3f7f1eeffac8

## Status (2026-08-24) — starting LEAD phase

Title: "RETRO promotion path: clobber-guard refuses HANDOFF->SD_COMPLETION promotion (2/2
recurrence, worked around twice)". sd_type=infrastructure, priority=medium, status=draft.

## Problem (from SD's metadata.plan_content — description column is truncated mid-sentence,
## same pattern as the prior SD this session)

Provenance: review-cycle candidate #7 (retro enhance-path silent-skip, signal 95399d44), held
next-wave, GRADUATED on recurrence — Hotel-2 signal 2026-08-24T01:23:27Z reports the identical
refusal on a SECOND SD (SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001, after
SD-LEO-INFRA-PLAN-LEAD-RETRO-001), both worked around by hand-editing. Coordinator sourcing row
105ed45e, RECUR=PROTECTED framing: a defect recurring after its workaround is being PROTECTED,
not merely unfinished — fix the promotion path, never widen the workaround.

`enhanceRetrospective`'s clobber-guard (`rich_existing_content`,
`lib/sub-agents/retro/db-operations.js`) refuses to promote a non-qualifying HANDOFF-type
retrospective to SD_COMPLETION type. The guard's PURPOSE (protect rich human content from being
clobbered) is correct, but its predicate treats TYPE PROMOTION itself as clobbering even when the
enhancement is additive (content preserved/appended, not replaced) — so every SD whose retro was
first written at handoff time hits a refusal at completion, and the worker hand-edits around it
(2/2 observed so far). The workaround writes outside the canonical enhance flow — exactly what the
guard exists to prevent.

## Scope (one SD, per plan_content)
- FR-1: root the predicate — distinguish CLOBBER (replacing/overwriting existing rich content,
  keep refusing) from PROMOTE (type upgrade HANDOFF->SD_COMPLETION with content
  preserved/appended, allow through the canonical path). Fix lives in the promotion path.
- FR-2: the two specimen SDs' retros re-run through the fixed path (premise verification doubles
  as the fixture) — both must promote cleanly with prior content intact.
- FR-3: regression pair — (a) a genuine clobber attempt (different content, same type) still
  REFUSES; (b) a promotion with preserved content SUCCEEDS; (c) the refusal message, when it
  fires, names which content would be lost (today's refusal reads as a silent skip per 95399d44).

## Out of scope
Retro content/scoring; SD-LEO-INFRA-PLAN-LEAD-RETRO-001's presence-sequencing (separate SD, in
belt).

## Success criteria (as submitted — verify before trusting, per this session's own standing
## discipline; measures are [UNPOPULATED] boilerplate in the DB row, need real authoring at PLAN)
- Zero workaround edits needed on the next SD completion whose retro began as HANDOFF-type.
- Both regression fixtures green; refusal message includes the protected-content identification.

## Interesting note carried from the JUST-COMPLETED SD (FORECASTER-CLAIMABLE-PREDICATE-001)
When I dispatched retro-agent for that SD's completion retrospective, it explicitly said it could
NOT use `generate-comprehensive-retrospective.js` because that script's inputs (sd_phase_handoffs
/ PRD summaries) were too thin to clear the boilerplate bar, and wrote a one-off insert script
instead. Worth checking during LEAD/PLAN investigation whether that's the SAME underlying
clobber-guard/promotion-path defect class this SD targets, or a genuinely separate gap (my retro
was a fresh INSERT, not a promotion of an existing HANDOFF-type row — likely different, but
verify, don't assume).

## Update 1 (2026-08-24) — LEAD-TO-PLAN PASSED (94%), scope substantially corrected

Dispatched Explore (very thorough) FIRST. It found the guard's real location
(scripts/modules/handoff/lib/retro-clobber-guard.js `classifyRetro()`) and confirmed the core
mechanism, but flagged the two NAMED specimen SDs weren't independently file-verifiable (only the
general workaround pattern was, via 2 OTHER SDs' one-off scripts).

Independently re-verified myself (not just trusted the report) by reading
retro-clobber-guard.js in full and lib/sub-agents/retro/db-operations.js:200-330 directly:
confirmed `isSafeToWriteRetro(supabase, sdId)` takes ONLY sdId (never the incoming write content),
and confirmed `enhanceRetrospective`'s merge is additive for arrays but WHOLESALE-REPLACES
description/7 scalar fields/auto_generated — a real nuance beyond what Explore flagged.

Dispatched validation-agent with the fully-informed brief (my own 2 direct findings included).
Result: CONDITIONAL_PASS 92% (evidence 5de79dfb-acf1-46ce-bab5-3cf8b891276d) — and it
SUBSTANTIALLY corrected the SD's own premise, not just confirmed it:
1. **retro_type plays NO role in the actual refusal** — the SD's own framing
   ("HANDOFF->SD_COMPLETION promotion refused") mischaracterizes the mechanism. The real cause:
   classifyRetro()'s `rich_existing_content` branch fires whenever content is auto-generated
   (generated_by IN AUTO_GENERATED_TYPES) AND scores "rich" by CHARACTER LENGTH — conflating
   provenance with length, refusing even though the guard's own charter says it should only
   protect MANUALLY-curated content.
2. **Scale is 1653/1658 (99.7%) of the live HANDOFF population**, not "2/2" — replayed
   classifyRetro() against the real table. Both cited specimens' key_learnings[0] is a
   byte-identical 193-char boilerplate string.
3. **NEW finding (V5), independently re-verified by me directly against code already read**: the
   guard classifies the WRONG ROW on a multi-retro SD. `enhanceRetrospective(supabase, existingId,
   ...)` writes `.eq('id', existingId)` (db-operations.js:332) but the guard is consulted via
   `isSafeToWriteRetro(supabase, sdIdForGuard)` (db-operations.js:224), which re-queries "most
   recent retro row for this sd_id" (retro-clobber-guard.js:130-136) — independent of which row
   existingId actually names. Both specimens carry 3 retro rows each.
4. Recurrence is genuine and UNDERSTATED (>=6 file-verified specimens, not 2); one originally-cited
   specimen script was found to be unrelated (different root cause) and dropped.
5. FR-1 as literally worded ("root the predicate... distinguish CLOBBER from PROMOTE") is
   under-scoped — validation-agent recommended (and I accepted) a narrower, more surgical fix
   (exempt auto-generated content from the richness check entirely, leave manual_retro/
   manual_retro_null_inferred untouched) PLUS 2 more real FRs (row-selection fix, non-lossy merge).

Corrected the SD record via scripts/one-off/retro-promotion-path-001-lead-scope-correction.mjs:
4 FRs now (was 1), scope_reduction_percentage=0 (scope genuinely GREW, not shrank).
`mechanism_verifications` written directly (learned from the prior SD — GATE_MECHANISM_CLAIM_VERIFIER
needs this on the SD record itself, sub_agent_execution_results evidence alone does not satisfy
it) — worked cleanly this time, gate passed 100% on the very first precheck.

`handoff.js precheck LEAD-TO-PLAN`: 91%, one real remediation (missing Explore sub-agent evidence
— I had dispatched Explore but not yet written it to sub_agent_execution_results). Stored via the
canonical writer (evidence dd2fd245-ee20-4c3d-9a57-eb379e836bef). Re-ran: 95%, PASSED.
`handoff.js execute LEAD-TO-PLAN`: PASS, score 94. **SD is now in_progress/PLAN_PRD.**

## Update 3 (2026-08-24) — PRD authored + inserted, PLAN-TO-EXEC PASSED (96%)

Authored full PRD JSON matching the corrected 4-FR scope (Update 1), pre-validated via
`npm run contract:check -- prd <file>` (0 warnings), inserted via the canonical
`add-prd-to-database.js --content @file` pipeline. PRD-SD-LEO-INFRA-RETRO-PROMOTION-PATH-001
created, status=approved, progress=82%, DESIGN/DATABASE/RISK sub-agents PASS (93% orchestration
confidence), STORIES auto-generated 4 user stories with 100% implementation_context coverage
(verified directly via DB query).

`handoff.js precheck PLAN-TO-EXEC`: 91%, one blocker (missing TESTING evidence for PLAN phase —
same pattern as the prior SD, DESIGN/DATABASE/RISK auto-run but TESTING needs a manual dispatch).

Dispatched testing-agent for PLAN-phase evidence (id 39a6a759-7ef9-4295-b610-a41ef230075f,
CONDITIONAL_PASS/92%). Extremely valuable EXEC-critical findings, independently spot-checked one
directly before trusting the rest:
1. **Re-measured the population live: now 5295 total HANDOFF retros (grew from 1658 at LEAD time),
   2000-row sample gives 99.8% refusal (1991/1995 via rich_existing_content)** — confirms and
   slightly exceeds the LEAD measurement. EXEC should re-measure again at fixture-build time, not
   hardcode "99.7%"/"1658" anywhere.
2. **CONFIRMED DIRECTLY BY ME**: `lib/eva/__tests__/retro-clobber-guard.test.js:109-116` is an
   EXISTING GREEN TEST that pins the CURRENT (buggy, about to be fixed) behavior — asserts
   "auto-generated + rich content -> rich_existing_content (skip)". This is effectively TS-1 with
   the WRONG expectation baked in. EXEC MUST invert this test's expected value (to `auto_thin`) as
   PART OF the FR-1 commit, not just add new tests alongside it, or the existing suite goes red.
3. Also flagged (not yet independently verified, but from the same agent that got #2 exactly
   right): the ordering-pin regex test at lines 201-204 ("orders by created_at DESC + LIMIT 1")
   will keep mechanically passing after FR-2 (the substring still exists in the default path) but
   no longer proves the property it's named for once row-selection becomes conditional — review
   during EXEC, likely needs a comment/rename, not necessarily a hard test change.
4. **IMPORTANT implementation-correctness detail for FR-1**: write the guard condition as
   `if (rich && !isAutoGenerated)`, NOT `if (rich && !retro.generated_by)` — the latter would
   silently create a NEW gap for the `generated_by === undefined` shape (currently protected by
   the strict `generated_by === null` check at line 95, which `!retro.generated_by` would
   incorrectly also treat as "falsy -> skip the manual-protection branch").
5. TS-7 (backward-compat proof for the 7 other isSafeToWriteRetro callers) is not implementable
   as originally specified — all 4 existing test suites that touch the guard use `vi.mock()` on
   `isSafeToWriteRetro` itself, making them structurally blind to real behavior changes.
   Recommended reformulation: a recording-fake that captures the actual call shape/args rather
   than a full mock, proving the 7 sites are never called with the new targetRowId param.
6. Existing coverage identified: 3 suites, 47 tests, all green baseline (lib/eva/__tests__/
   retro-clobber-guard.test.js [33], lib/sub-agents/retro/enhance-clobber-guard.test.js [6] —
   already drives the REAL guard through enhanceRetrospective via a fake supabase and asserts on
   the captured payload — good template for TS-4/TS-5 — and db-operations.test.js [2]).
7. TS-6 (live-population replay) should be a generator script under scripts/one-off/ (never
   scanned by the DB-test guard) producing a committed fixture under tests/fixtures/, with the
   actual vitest test importing ONLY node:fs + the pure guard module — zero DB signal at test
   time, matching this session's own established pattern from the prior SD.
8. Harness detail: the existing `fakeSupabase` test helper is filter-blind (`.eq()` is a no-op
   passthrough) — TS-4 (row-selection fix) needs a FIXED fake that actually records/serves per-.eq()
   filtered results, or it would pass against both fixed and unfixed code.
9. state-transitions.js's guard call site is provably a no-op in practice (only reachable in the
   zero-retro branch) per the agent's blast-radius trace — noted for EXEC's regression sweep
   priority, not a new FR.

`handoff.js precheck PLAN-TO-EXEC`: 96%, PASSED (only TESTING evidence was missing).
`handoff.js execute PLAN-TO-EXEC`: PASS, score 96. **SD is now active/EXEC.**

## Update 2 — housekeeping: prior SD's CHANGELOG PR #7494 merged
Opportunistically checked and merged PR #7494 (the CHANGELOG entry for the just-completed
FORECASTER-CLAIMABLE-PREDICATE-001, left pending CI at the end of that SD's tail) — CI cleared,
merged cleanly. Both PRs from that SD (#7492 code, #7494 docs) are now fully merged. Attempted to
remove the now-unneeded .worktrees/SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001-changelog
worktree — got a Windows permission-denied (likely a lingering file handle), left for the reaper,
non-blocking.

## Next steps
1. Commit scripts/one-off/retro-promotion-path-001-lead-scope-correction.mjs + session-state.md.
2. PLAN phase: author a proper PRD from the corrected 4-FR scope above (Update 1) — do NOT build
   the original as-submitted 1-FR "root the predicate" text. Follow CLAUDE_PLAN.md phase
   requirements; use the canonical add-prd-to-database.js --content override pipeline (per the
   prior SD's established, working pattern this session — see FORECASTER-CLAIMABLE-PREDICATE-001's
   own session-state Update 4 if still readable, or lib/artifact-contracts/prd-contract.js for the
   exact field shapes).
3. Run PLAN-TO-EXEC once the PRD is ready.
4. EXEC implementation of FR-1 through FR-4, with the same standing discipline (independently
   verify every sub-agent finding, mutation-test where practical, full regression sweep of every
   consumer of retro-clobber-guard.js and enhanceRetrospective before shipping).

## Notes carried from prior SDs this session
- ENF-15 force-push allowlist does NOT include docs/* branches.
- CHANGELOG.md is a contention hotspot under concurrent fleet sessions — re-merge origin/main
  right before final push on any changelog-only PR.
- git stash is repo-global across worktrees — always target by index (stash@{N}), never bare pop.
- Stale `.git/worktrees/<name>/index.lock` (0 bytes, no live git.exe process) is safe to remove —
  recurred 3x this session, same fix each time.
- GATE_MECHANISM_CLAIM_VERIFIER (LEAD-TO-PLAN) requires `metadata.mechanism_verifications =
  [{verified_by, verified_at: "file:line"}]` on the SD record itself — sub_agent_execution_results
  evidence alone does NOT satisfy it. Only fires when the spine names both a file AND a
  function/call near it.
- CI's "Run Unit Tier (quarantine-aware)" and "coverage" jobs are the longest-running required
  checks (~10-12 min) — a "status check is in progress" merge failure is routine, not a defect;
  ScheduleWakeup + retry, never blind hammer-retry.
- The main EHG_Engineer repo's own working directory (not a worktree) is heavily shared by
  concurrent fleet sessions with lots of uncommitted state — never work there directly; always
  use/create a dedicated worktree.

## Update 4 (2026-08-24) — EXEC implementation done, EXEC-TO-PLAN sub-agent evidence gathered

Implemented FR-1..FR-4 (commit 4bf16ec40f3, then EXEC-phase-finding fixes in 5f2e8844155 +
5beec8b7668):
- FR-1: `classifyRetro()`'s `rich_existing_content` branch now requires `!isAutoGenerated`.
  Inverted the one existing test that pinned the defect (lib/eva/__tests__/
  retro-clobber-guard.test.js:109), added its ambiguous-provenance counterpart.
- FR-2: `isSafeToWriteRetro` gained an additive optional `targetRowId` option;
  `enhanceRetrospective` now passes `existingId` as it. Proven backward-compatible for the 7
  other callers at the SHARED FUNCTION level via a query-shape-recording fake (not by re-mocking
  each caller individually).
- FR-3: `enhanceRetrospective`'s merge is non-lossy for description (3-part join, was dropped
  entirely), the 7 scalar fields (`??` preserve-on-absence, explicit new value still wins), and
  `auto_generated` (derived from existing's own provenance, was unconditionally forced `true`).
- FR-4: regression suite across 2 new + 5 existing test files, plus a committed 150-row snapshot
  (tests/fixtures/retro-handoff-classification-snapshot.json, generator
  scripts/one-off/retro-promotion-path-001-generate-handoff-snapshot.mjs) of real live
  retro_type=HANDOFF rows (5295 total live, re-measured — grew from 1658 at LEAD time) replayed
  against the corrected classifyRetro(): 149/150 now safe, 1 genuinely manual row still refuses,
  0 auto-generated rows refuse.

Dispatched TESTING (EXEC phase, evidence b6b57bd6-bc95-465e-aea1-cb0ece87d468,
CONDITIONAL_PASS/92%) — this one MUTATION-TESTED the changes (reimplemented pre-fix logic from
scratch, replayed both versions over the fixture, tried replacing expressions with hardcoded
values to see which tests still passed) rather than just reading code. Found and I fixed:
- F-5 (drove CONDITIONAL): `preservedAutoGenerated`'s false branch is unreachable under normal
  guard enforcement (truly-manual generated_by always refused pre-merge) and was asserted in a
  comment but never measured — replacing the whole expression with hardcoded `true` left all
  tests green. Added a dry-run-mode test (LEO_RETRO_GUARD_DRY_RUN=1, the one real path where a
  manually-authored row reaches the merge) that genuinely exercises and kills this mutant;
  corrected the overstated code comment.
- F-6: preserve-on-absence scalar test only covered 3 of 7 fields — extended to all 7.
- F-7: a replay-test assertion compared two fields both precomputed by the fixture generator,
  never calling the live classifyRetro() import — would pass against a broken/stubbed import.
  Rewrote to derive its count entirely from a live per-row classifyRetro() call.
Full regression sweep after fixes: 9 files / 91 tests, zero failures.

Dispatched SECURITY (EXEC phase, evidence 319ee551-1902-4016-bedf-c2af09940442,
CONDITIONAL_PASS/92%) — empirically probed the `.eq('id', targetRowId)` query builder against 7
hostile injection strings (confirmed parameterized, not string-concatenated), traced `newRetro`'s
actual origin (RETRO sub-agent's internally-generated analysis, no external/HTTP input path),
confirmed the fixture leaks nothing (0 UUIDs, 0 credential patterns), and confirmed no new
deps/network/fs/secrets. All 5 explicitly-asked questions: PASS. 3 non-blocking findings:
- SEC-06 (fixed, commit 5beec8b7668): the generator script's own comment overclaimed "no SD keys"
  at the content level — key_learnings free text carries 155 distinct SD keys (private repo, all
  already on main elsewhere, zero new disclosure). Corrected the wording.
- SEC-05 (deliberately NOT fixed — SECURITY explicitly warned against over-correcting): reframes
  the blast radius honestly — 149/150 (99.3%) of the live sample flips REFUSED->PERMITTED, and
  `published_sd_completion`'s protection cannot fire on a HANDOFF-type row regardless of
  PUBLISHED/quality_score (it's gated on retro_type==='SD_COMPLETION'), so `rich_existing_content`
  WAS these rows' only real protection — this is exactly FR-1's intended effect, not a defect. The
  narrower residual point: `quality_issues` is still unconditionally reset to `[]` on every
  promotion (not part of this SD's FR-3 scope, which only covered description/scalars/
  auto_generated). SECURITY's explicit guidance: do NOT make published_sd_completion
  retro_type-agnostic to compensate — that would re-block all 149 rows and nullify the SD.
- SEC-09 (deliberately NOT fixed, narrow/low-severity): `preservedAutoGenerated` reads the
  caller-supplied `existing` object rather than the guard's freshly-fetched `existingRetro` — a
  narrow staleness race if the two diverge between fetch and merge. Pre-existing pattern (the
  whole merge function already used `existing` throughout for every other field, not just the
  auto_generated logic this SD added) — not a regression this SD introduced, and still strictly
  safer than the hardcoded `true` it replaced.
- Harness note (not this SD's scope, worth flagging separately): SECURITY's first evidence-store
  attempt silently lost all 10 findings because lib/sub-agent-executor/results-storage.js strips
  a top-level `findings` array by design (anti-snowball) — same failure class as that file's own
  documented QF-20260803-007, recurring on a different field. SECURITY worked around it by
  nesting under `detailed_analysis` instead. Worth a /signal or harness-bug log at some point.

## Pending follow-up (route via capture-completion-flags at post-completion, NOT in this SD's
## scope — do not silently fold into this diff)
- quality_issues is unconditionally reset to `[]` on every promotion in enhanceRetrospective
  (db-operations.js) — outside FR-3's scope (description/7 scalars/auto_generated only), flagged
  by SECURITY (SEC-05) as a residual minor content-loss point now that rich_existing_content no
  longer blanket-protects auto-generated HANDOFF rows. Small, well-scoped follow-up.
- results-storage.js's top-level `findings` array stripping (anti-snowball design) silently
  discarded a sub-agent's full findings payload on first write this session — same failure class
  as its own documented QF-20260803-007 on a different field. Worth a dedicated harness fix so
  future sub-agent evidence writes don't need the manual `detailed_analysis` nesting workaround.
