#!/usr/bin/env node
/**
 * Write VALIDATION (Principal Systems Analyst) PLAN-phase verdict for
 * SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001.
 *
 * PLAN-PHASE VERIFICATION of the EXEC-TO-PLAN handoff (accepted, score 93). Independently
 * re-derived every finding from the code, the live DB, and my own test executions rather than
 * taking EXEC's or the EXEC-phase TESTING/SECURITY sub-agents' prior evidence on trust — where my
 * conclusions agree with theirs (they do, on FR-3), that agreement is stated as independent
 * corroboration, not inheritance.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/
 * results-storage.js storeSubAgentResults) per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'b165653a-5857-4678-beb6-193ade75478f';
const SD_KEY = 'SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001';

const findings = [
  {
    id: 'V1-fr1-fr7-helper-and-reachability-VERIFIED',
    severity: 'INFO',
    summary: 'Read lib/fleet/best-effort-release.mjs clearAndReopenQf myself: clears claiming_session_id AND reverts status in one UPDATE, reuses the four-predicate guard (status=in_progress, claiming_session_id IS NULL or =expectedHolder, pr_url IS NULL, commit_sha IS NULL) verbatim from the pre-existing CLAIM_BOUNDARY_PROBE compensating write at scripts/stale-session-sweep.cjs:237-239 (same .filter(eq) spelling, preserved deliberately so a future move cannot slide the TR-1 test anchor). Independently RAN the SD-owned + protected test suite myself (not trusting the prior EXEC/TESTING report): tests/unit/fleet/qf-clear-and-reopen.test.js\'s "FR-7 REACHABILITY" case feeds the mutated row to the REAL isAutoStartableQF (scripts/worker-checkin.cjs:578) before (false) and after (true) -- the exact PAT-TEST-STUBBED-WRITER-UNVERIFIED-001-resistant design the PRD demanded, using an in-memory fake that evaluates predicates and only mutates on genuine match (so a helper issuing the right UPDATE against a non-matching predicate would still show changed:false, not a false pass). All paired allow/refuse cases present (merged PR, commit, live claimant, terminal-completed) plus a predicateCount pin (=5) so a dropped guard column cannot silently pass. VERIFIED, not merely reviewed.',
  },
  {
    id: 'V2-fr4-both-gauges-VERIFIED',
    severity: 'INFO',
    summary: 'Diffed lib/coordinator/coordination-events.cjs myself: BOTH call sites now route through the single lib/coordinator/qf-supply-predicate.cjs::applyClaimableQfFilter -- the PRIMARY head-count at line ~193-194 feeding bundle.unclaimedItems (the one the SD row itself warns is not named in casual descriptions of this bug, and the one FR-4\'s AC explicitly calls out as "leaves the main gauge lying" if skipped), and the pagination gauge at ~496. One shared predicate module means a future half-fix (correcting only one call site) is a one-line diff instead of two independent inline query edits drifting apart. Ran tests/unit/coordinator/qf-supply-gauge-agreement.test.js myself: 8/8 pass, including "the STRANDED row is the case that used to disagree" (TS-5\'s literal requirement -- pre-fix disagreement must be representable or the test cannot fail) and "DIRECTION: the gauge narrowed to open -- a chokepoint was NOT widened" (guards against the wrong-direction fix that would have broken the non-critical pull-order guarantee).',
  },
  {
    id: 'V3-fr3-orchestrator84-ADJUDICATED-independently-CONFIRMS-PRD-TEXT-DEFECT',
    severity: 'LOW',
    summary: 'Adjudication requested by the coordinator. I traced buildMergedReconcileUpdate myself (scripts/modules/complete-quick-fix/orchestrator.js:61-95), independent of EXEC\'s and TESTING\'s own write-ups: the `!scopeAcceptedBy` branch (its only call site, orchestrator.js:217-219, always passing probeWitness.prUrl -- a real, non-null, self-derived merge-witness URL) unconditionally returns {status:\'in_progress\', pr_url:prUrl, commit_sha:mergeSha, ..., claiming_session_id:null} as ONE object. Three independent reasons this cannot be routed through the FR-1 helper: (1) FR-1\'s reused-verbatim four-predicate guard requires pr_url IS NULL -- a row from this call site can structurally never satisfy it, so calling the helper here (instead of the direct payload write) makes the claim-clear a guard-refused no-op, regressing QF-20260711-176 ("an unheld QF must not pin worktree reaping" -- the row\'s comment at line ~100 exists for exactly this reason). (2) Even setting the guard aside, the helper\'s action on a match is to set status=\'open\'; this site deliberately wants status=\'in_progress\' preserved (QF-20260725-691: a merge-witnessed row awaiting scope attestation is intentionally non-terminal, not a fresh open QF a second worker should pick up over already-landed code). (3) I independently confirmed via `isAutoStartableQF` (scripts/worker-checkin.cjs:580, `if (qf.pr_url || qf.commit_sha) return false`) and all four other chokepoint queries (all of which also carry `.is(\'pr_url\',null).is(\'commit_sha\',null)` in addition to status=\'open\') that a row from this site is invisible to every chokepoint BECAUSE of pr_url, independent of status -- so routing it through the helper would not even achieve the reachability goal it purports to serve. I also ran a targeted repo grep myself for a bare `claiming_session_id` clear scoped to quick_fixes-touching files outside the helper: the ONLY hit outside the four PRD-enumerated terminal sites (orchestrator.js:103, :699; stale-session-sweep.cjs:1083; lib/sd-creation/source-adapters/qf.js:104 -- all confirmed genuinely terminal by reading each) is orchestrator.js:84 itself. RULING: FR-3\'s literal acceptance criterion ("a grep for a bare claiming_session_id clear on quick_fixes outside the helper returns zero hits") is UNSATISFIABLE AS WRITTEN for this specific site, and the shipped exclusion of orchestrator.js:84 from FR-3\'s routing is CORRECT, not an implementation gap. This independently corroborates (not merely repeats) both EXEC\'s commit message (ed0fda01bc1) and the TESTING sub-agent\'s own re-verified finding (downgraded HIGH->LOW in its second-pass verdict) -- three independent traces of the same call path converging on the same conclusion. Recommend PLAN correct the PRD text (retire the orchestrator.js:84 reference from FR-3\'s enumerated sites, or add an explicit documented exception).',
  },
  {
    id: 'V4-fr2-not-applied-INDEPENDENTLY-RECONFIRMED',
    severity: 'MEDIUM',
    summary: 'Re-ran `node scripts/one-off/verify-release-sd-qf-branch.mjs` myself against the live DB just now: ALL 5 CHECKS FAIL (status reverts to open / guard status=in_progress / guard pr_url IS NULL / guard commit_sha IS NULL / holder CAS) -- confirms database/migrations/20260727_release_sd_qf_reopen.sql is staged but NOT applied to the live function. Read the migration file myself: it correctly ships the guarded CASE-based status revert (in_progress AND pr_url IS NULL AND commit_sha IS NULL -> open, else unchanged) TOGETHER WITH the holder CAS (AND claiming_session_id = p_session_id), bringing the QF branch to parity with the pre-existing SD branch immediately below it -- exactly as FR-2 and the SD\'s own risk register require ("either alone is unsafe"). Confirmed NO `-- @approved-by:` header on the migration -- correctly not self-stamped; this is chairman-gated DDL and the worker was right to refuse.',
  },
  {
    id: 'V5-release-sd-callsite-exposure-INDEPENDENT-COUNT',
    severity: 'MEDIUM',
    summary: 'Grepped the repo myself for every `.rpc(\'release_sd\'` invocation (not trusting the SECURITY sub-agent\'s "17" figure without re-deriving it): 16 real production call sites (excluding 2 comment-only mentions in lib/fleet/best-effort-release.mjs and scripts/sd-start.js, and 1 test-file reference). Of these, exactly ONE (lib/fleet/best-effort-release.mjs:71, bestEffortReleaseSd\'s own implementation) is the JS wrapper; its only caller with QF-specific stranding protection is stale-session-sweep.cjs\'s CLAIM_BOUNDARY_PROBE path (lines 217-239), which carries its OWN PRE-EXISTING compensating status-revert write (predating this SD -- this is literally the "compensating write [that] exists on ONE leg of ONE script" the PRD\'s own design analysis references) and remains correct and untouched by this diff. The other ~15 direct callers (lib/claim-guard.mjs x2, lib/commands/claim-command.js, lib/session-manager.mjs, scripts/hooks/reclaim-sd-after-compaction.cjs x2, scripts/hooks/session-state-sync.cjs, scripts/modules/claim-health/self-heal.js, scripts/modules/complete-quick-fix/orchestrator.js:713, scripts/modules/handoff/claim-swapper.js, scripts/modules/handoff/executors/lead-final-approval/helpers.js, scripts/modules/sd-next/claim-analysis.js, scripts/sd-start.js x3) call the RAW RPC directly with no JS-side compensating write, and remain fully exposed to the unfixed QF-branch bug (clear-without-revert, no CAS) until FR-2 ships. This independently corroborates the SECURITY sub-agent\'s S13 finding via my own separate count.',
  },
  {
    id: 'V6-no-auto-heal-path-for-other-callers-NEW-FINDING',
    severity: 'MEDIUM',
    summary: 'Traced WHY clearStaleQfClaims cannot backstop the ~15 un-migrated callers (a mechanistic detail I do not see spelled out in the prior EXEC/SECURITY/TESTING evidence, so recording it here even though it corroborates their same S13 conclusion): its own claimedQfs query (scripts/stale-session-sweep.cjs:1096-1102) requires `.not(\'claiming_session_id\',\'is\',null)` -- it ONLY operates on rows a session STILL holds. A row already stranded by one of the ~15 un-migrated release_sd callers has claiming_session_id ALREADY NULL (that is precisely the stranded shape), so it falls outside this query and is NEVER visited by this sweep pass. clearAndReopenQf\'s own "repair" mode (expectedHolder omitted, tested in tests/unit/fleet/qf-clear-and-reopen.test.js under "FR-3: the sweep shape") is implemented and unit-tested but has ZERO production call sites (confirmed by my own grep for clearAndReopenQf( across the repo -- only qf-supply-predicate.cjs\'s doc-comment mentions it, best-effort-release.mjs defines it, and stale-session-sweep.cjs calls it only in the HELD-claim shape with expectedHolder set). CONSEQUENCE: even once this branch merges, rows stranded via the other ~15 paths will remain permanently un-repaired until either FR-2 ships or someone wires the repair-mode call into a periodic pass -- there is currently no such pass in production.',
  },
  {
    id: 'V7-branch-not-yet-merged-to-main-CONTEXT',
    severity: 'INFO',
    summary: 'Confirmed via `git merge-base --is-ancestor HEAD origin/main` (returns false) and `git show origin/main:lib/coordinator/qf-supply-predicate.cjs` (file does not exist on main) that NONE of this SD\'s code (FR-1/FR-3/FR-4/FR-5/FR-6) is live in production yet -- normal timing for a PLAN-phase verification (code typically merges around LEAD-FINAL-APPROVAL), not a defect, but material context for reading the live-population measurement below: today\'s quick_fixes behavior is governed entirely by pre-fix code.',
  },
  {
    id: 'V8-live-stranded-population-measured-as-a-NUMBER',
    severity: 'INFO',
    summary: 'Queried quick_fixes live myself, per the coordinator\'s explicit request to state this as a number rather than an absence of failures. STRANDED signature (status=in_progress AND claiming_session_id IS NULL AND pr_url IS NULL AND commit_sha IS NULL): 0 rows at time of measurement. Total in_progress population: 8 rows -- 7 carry pr_url or commit_sha (the merge-witnessed carve-out FR-4\'s own predicate module documents as deliberately NOT stranded) and 1 is actively, legitimately claimed (non-null claiming_session_id). IMPORTANT CAVEAT, witnessed first-hand: between two of my own queries roughly a minute apart, QF-20260726-175 moved FROM the stranded bucket INTO the merge-witnessed bucket (its PR merged live, in production, mid-investigation) -- direct, first-hand confirmation of the SD\'s own warning that this population turns over in minutes and that a single point-in-time zero cannot be read as proof a fix works. Doubly so here, since (per V7) the fix is not even deployed yet -- this 0 reflects the natural, momentary state of the PRE-fix population, not a validated post-fix outcome. The population figures in the PRD (7 stranded / 6 critical, measured 2026-07-26 22:50) and mine (0 stranded, measured now) are BOTH correct for their respective moments; neither is a stable baseline given the turnover rate the SD itself documents.',
  },
  {
    id: 'V9-prohibitions-independently-verified-including-a-quarantine-anomaly',
    severity: 'LOW',
    summary: 'Repo/application filter prohibition: grepped the full diff myself for target_application/repo_path/local_path/applications -- zero hits in actual code (the only textual hits are inside the SECURITY/TESTING sub-agents\' OWN evidence strings quoting their findings). Non-critical pull-order prohibition: the PRD\'s own named test, tests/unit/worker-checkin-critical-qf-priority-jump.test.js, is currently listed in tests/quarantine-manifest.json (quarantined 2026-07-08, reason "hardcoded fixture date rots") and is therefore EXCLUDED from the normal vitest run -- running it in isolation returns "No test files found". This SD\'s diff never touches that file or its subject code (git diff --stat confirms zero overlap with critical-qf-jump.cjs / worker-checkin.cjs), so the quarantine is pre-existing and unrelated to this SD. However, the test file\'s own in-file comment (QF-20260707-793) shows it now anchors on `Date.now()` rather than a hardcoded calendar date -- suggesting the quarantined defect may already be fixed and the manifest entry is stale (a harness-hygiene matter outside this SD\'s scope, flagged as a non-blocking observation). Because the literal top-level AC names this exact file, I did not accept "it is excluded" as sufficient: I wrote a standalone script (bypassing vitest\'s quarantine exclude entirely) that imports resolveCheckin/isCriticalQfJumpEligible directly from this worktree\'s scripts/worker-checkin.cjs and replicates all 9 of the test file\'s assertions with plain node:assert. Result: 9/9 PASS, confirming the non-critical pull-order guarantee is genuinely intact on this branch right now, independent of the quarantine bookkeeping.',
  },
];

const warnings = [
  'FR-2\'s literal acceptance criterion ("Migration is applied and verified against the live function definition") is NOT met -- confirmed by my own re-run of verify-release-sd-qf-branch.mjs (5/5 FAIL). This is chairman-gated DDL that no worker may self-apply or self-stamp, and it is the single reason the top-level AC #1 ("the 7 currently-stranded QFs become reachable") is not yet fully, durably delivered: ~15 of 16 release_sd RPC call sites remain exposed to the unfixed QF branch until this migration ships, and (per V6) no production pass currently auto-heals a row stranded via those paths.',
  'This branch is not yet merged to origin/main (V7), so none of the code being validated is live in production. The live-population number in V8 (0 stranded, right now) is a pre-fix-code snapshot, not evidence the fix works -- it should not be read as a validated "after" measurement.',
  'FR-3\'s PRD text (product_requirements_v2 functional_requirements[2]) still literally names complete-quick-fix/orchestrator.js:84 as a site that must route through the FR-1 helper, and still asserts a "zero bare-clear grep hits" AC that the current (correct) implementation does not satisfy. This is a PRD-text defect (V3), not a code defect, but it should be corrected so a future reader does not misread the shipped exclusion as an open gap.',
  'tests/unit/worker-checkin-critical-qf-priority-jump.test.js -- the test the top-level AC names for the pull-order prohibition -- is currently excluded from the unit suite by tests/quarantine-manifest.json for a reason (V9) that appears to already be fixed in the file itself. This is pre-existing and unrelated to this SD, but it means the literal AC text ("...test stays green") cannot currently be demonstrated by the normal CI run; I substituted a direct out-of-band re-verification (9/9 pass) instead.',
];

const recommendations = [
  'Apply database/migrations/20260727_release_sd_qf_reopen.sql once chairman sign-off is obtained, then re-run scripts/one-off/verify-release-sd-qf-branch.mjs to confirm all 5 checks pass against the LIVE function, and merge this branch to main so the JS-side fixes (FR-1/FR-3/FR-4/FR-5/FR-6) actually deploy. Until both happen, treat the incident\'s root cause as open for ~15 of 16 release paths (V5) with no auto-heal (V6).',
  'PLAN: correct FR-3\'s acceptance_criteria/description text to remove complete-quick-fix/orchestrator.js:84 from the enumerated "stranding" sites (or add an explicit documented exception referencing commit ed0fda01bc1 and this ruling), so the PRD and the shipped, correct code agree.',
  'Low-priority follow-on: wire clearAndReopenQf\'s "repair" mode (expectedHolder omitted) into a periodic pass so rows stranded via the ~15 un-migrated release_sd callers get auto-healed even before FR-2 ships -- the code path exists and is tested but has zero production callers today (V6).',
  'Low-priority hygiene (carried from SECURITY\'s S7, independently reviewed and concurred non-blocking): collapse an explicit empty-string expectedHolder to the safe IS-NULL branch in clearAndReopenQf.',
  'Out-of-scope-for-this-SD, flagged in passing: tests/quarantine-manifest.json\'s entry for tests/unit/worker-checkin-critical-qf-priority-jump.test.js appears stale (the file was already updated to use Date.now() rather than a hardcoded date per its own QF-20260707-793 comment) -- worth a harness-hygiene look separately from this SD.',
];

const conditions = [
  {
    action: 'Apply database/migrations/20260727_release_sd_qf_reopen.sql once chairman-approved, and re-run scripts/one-off/verify-release-sd-qf-branch.mjs to confirm the live function passes all 5 checks, before this SD is treated as fully closed at LEAD-FINAL-APPROVAL.',
    priority: 'high',
    blocking: false,
  },
  {
    action: 'Merge this branch to main so the JS-side fixes (FR-1/FR-3/FR-4/FR-5/FR-6) actually deploy -- confirmed not yet merged (V7).',
    priority: 'high',
    blocking: false,
  },
  {
    action: 'PLAN to correct FR-3\'s acceptance_criteria/description text (remove or footnote complete-quick-fix/orchestrator.js:84 as an enumerated stranding site) so the PRD matches the shipped, correct implementation (V3).',
    priority: 'medium',
    blocking: false,
  },
  {
    action: 'Track wiring clearAndReopenQf\'s repair mode (expectedHolder omitted) into a periodic pass as explicit follow-on work, since nothing in production calls it that way today (V6).',
    priority: 'low',
    blocking: false,
  },
];

const summary = 'CONDITIONAL_PASS. PLAN-phase verification of the accepted EXEC-TO-PLAN handoff (score 93), independently re-derived from the code, the live DB, and my own test executions rather than taken on trust. Every functional requirement I could verify at the code level is genuinely correct and well-tested: FR-1\'s clear+revert helper reuses the four-predicate guard verbatim and is proven via paired allow/refuse cases plus a REACHABILITY assertion against the real isAutoStartableQF (FR-7); FR-4 aligns BOTH supply gauges (not just one) through a single shared predicate module, with a test that pins the fix direction; FR-5/FR-6\'s skip-and-continue plus durable delivered/attempted ratio-with-alarm match the SD\'s own named reference implementation and are independently exercised by my own test runs (106 assertions across the SD-owned and protected test surface, 0 failures -- including a standalone out-of-band re-verification of the one PRD-named test currently sitting in an unrelated, pre-existing quarantine entry). Both prohibitions hold: no repo/application filter was added (grepped myself, zero hits), and the non-critical pull-order guarantee is intact (verified directly against production code, bypassing the quarantine mechanism). On the FR-3-vs-FR-1 adjudication requested: I independently traced buildMergedReconcileUpdate\'s only call site and confirm, on my own reading of the guard, the chokepoints, and a targeted grep, that FR-3\'s literal "route orchestrator.js:84 through the helper" instruction is unsatisfiable as written -- that row structurally can never pass FR-1\'s own pr_url-IS-NULL predicate, and forcing it through the helper would either no-op the claim-clear (regressing QF-20260711-176) or misrepresent a merge-witnessed, scope-pending row as a fresh open QF. This is a PRD-text defect, not an implementation gap, and I recommend PLAN correct the text rather than treat it as unresolved. The substantive, top-level-AC-relevant gap is FR-2: the RPC migration is correct and file-tested but NOT applied to the live database (re-confirmed myself, 5/5 FAIL) and this branch is not yet merged to main -- so, measured honestly, the top-level acceptance criterion "the 7 currently-stranded QFs become reachable" is NOT yet a delivered, durable fact: it is a mechanism that is built, tested, and will hold for the specific incident pathway (dead-session claim sweep) and a bonus conflict-eviction mirror fix once merged, but ~15 of 16 release_sd RPC call sites remain exposed to the unfixed root cause until the chairman-gated migration ships, and I found (independently, going beyond the prior SECURITY/TESTING evidence) that no production pass currently auto-heals a row stranded via those other paths -- the repair mode exists and is tested but is called by nothing today. Measured live, right now: 0 rows match the stranded four-predicate signature (8 total in_progress: 7 merge-witnessed carve-out, 1 legitimately claimed) -- but this is a pre-fix-code snapshot of a population I personally watched turn over within my own investigation window, not evidence of a working fix. Given all code is sound and well-tested, both prohibitions hold, and the one substantive gap is an explicit, transparently-tracked, chairman-gated external dependency rather than a workmanship defect, CONDITIONAL_PASS is the verdict the evidence supports -- conditional on the FR-2 migration being applied and this branch being merged before LEAD-FINAL-APPROVAL treats this SD as fully closed, and on PLAN correcting FR-3\'s PRD text.';

const justification = [
  'CONDITIONAL_PASS — SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 PLAN-phase verification against the PRD, following the accepted EXEC-TO-PLAN handoff (score 93).',
  '',
  'METHOD: independently re-derived every finding rather than trusting EXEC\'s summary or the EXEC-phase TESTING/SECURITY sub-agent verdicts already on file. Read the PRD directly from product_requirements_v2. Reviewed the full diff (git diff $(merge-base) HEAD, 14 files). Read the changed production code myself (best-effort-release.mjs, qf-supply-predicate.cjs, coordination-events.cjs, stale-session-sweep.cjs, coordinator-idle-qf-hint.mjs, orchestrator.js, the migration .sql). Ran the SD-owned and protected test files myself. Queried the live database myself for the stranded-row population and the release_sd call-site count. Re-ran the migration verification script myself. Wrote and ran a standalone out-of-band script to re-verify the one test the quarantine mechanism currently excludes.',
  '',
  '1. FR-1/FR-3/FR-7 (helper + routing + reachability): VERIFIED. clearAndReopenQf correctly implements clear+revert atomically, reuses the exact four-predicate guard from the pre-existing compensating write, and is proven against the REAL isAutoStartableQF predicate (not a call-shape stub) — before/after, avoiding PAT-TEST-STUBBED-WRITER-UNVERIFIED-001. Two of the three FR-3-named sites are correctly routed (clearStaleQfClaims and its thin wrapper, which delegate to the same function, so this is really one site). An EXEC-authored bonus fix (the conflict-resolution eviction "mirror of stranding" case) extends coverage beyond the PRD\'s literal enumeration, correctly.',
  '',
  '2. FR-3-vs-FR-1 ADJUDICATION (requested): orchestrator.js:84\'s only call site always writes a real, non-null pr_url in the SAME object as claiming_session_id:null (merge-witness-without-scope-acceptance). FR-1\'s guard requires pr_url IS NULL to treat a row as reopen-eligible. A row from this site can never satisfy that predicate — not an implementation choice, a structural fact I verified by reading both the call site and the guard. Independently confirmed via all five chokepoint queries (each also independently excludes pr_url-set rows) that this row is invisible to every chokepoint FOR A DIFFERENT REASON than status, meaning routing it through the helper would not even achieve reachability. And confirmed via a targeted repo grep that this is the ONLY non-terminal, non-helper claim-clear left on quick_fixes. RULING: FR-3\'s literal AC is unsatisfiable-as-written for this site; the shipped exclusion is correct; this is a PRD-text defect, matching (independently, via my own trace) both EXEC\'s commit rationale and TESTING\'s own downgraded (HIGH->LOW) re-verification.',
  '',
  '3. FR-4 (gauge alignment): VERIFIED. Both call sites in coordination-events.cjs (the primary head-count AND the pagination gauge) route through one shared predicate module — read the diff myself to confirm this, since the PRD explicitly warns that fixing only one "leaves the main gauge lying." Test suite pins both the STRANDED-disagreement case and the fix DIRECTION (narrow the gauge, never widen a chokepoint).',
  '',
  '4. FR-5/FR-6 (skip-and-continue, ratio+alarm): VERIFIED by reading deliverHints and emitDeliveryAlarm myself, and by running the full idle-qf-hint-delivery test suite (21 assertions covering the middle-of-list failure, the 1-of-10-vs-9-of-10 distinction, the alarm fire/silent/minSample-floor cases, the durable dedup\'d emit, and the resolved-{error}-counts-as-undelivered fix).',
  '',
  '5. FR-2 (root RPC fix): the migration itself is correct (read it myself — guarded CASE-based status revert together with holder CAS, parity with the SD branch) and passes its own file-level tests, but is NOT applied to the live database. I independently re-ran scripts/one-off/verify-release-sd-qf-branch.mjs myself: 5/5 FAIL. No `@approved-by:` self-stamp present — correctly withheld, chairman-gated DDL.',
  '',
  '6. TOP-LEVEL AC ASSESSMENT (requested): measured the stranded population live myself as a NUMBER: 0 rows currently match the four-predicate stranded signature; 8 total in_progress (7 merge-witnessed carve-out, 1 legitimately claimed). I personally watched one row (QF-20260726-175) move from stranded into the merge-witnessed bucket between two of my own queries roughly a minute apart — direct, first-hand confirmation that this population turns over on the timescale the SD itself warns about, and that a point-in-time zero is not proof of anything. Compounding that: this branch is NOT merged to main (confirmed via git merge-base --is-ancestor), so today\'s live behavior is entirely governed by pre-fix code — the 0 I measured is a snapshot of the OLD code\'s natural population state, not a validated post-fix result. AC #2 (no pr_url/commit_sha row reopened), AC #3 (one undeliverable addressee doesn\'t block others), and AC #4 (delivered/attempted ratio + alarm) are all fully met at the code level, independently verified. AC #5 (prohibitions) holds — including a genuinely new independent check: I discovered the PRD\'s own named pull-order test is sitting in an unrelated, pre-existing quarantine entry (dated 2026-07-08, unrelated to this SD\'s diff), so I wrote a standalone script bypassing that exclusion to re-run its exact assertions directly against production code: 9/9 pass. AC #1 (the 7 stranded QFs become reachable) is the one NOT yet fully, durably true: the specific incident pathway is fixed, but I traced (independently of SECURITY\'s prior S13 finding) that ~15 of 16 release_sd RPC call sites remain on the raw, unpatched function, and further found that no production pass today would auto-heal a row stranded via any of those other paths even after this branch merges (clearStaleQfClaims\'s own claimedQfs query structurally cannot see an already-null-claimant row). This is the single substantive, honest gap, and it is chairman-gated, not a workmanship defect.',
  '',
  'RATIONALE FOR CONDITIONAL_PASS (not a clean PASS, not WARNING): every piece of shipped code is correct, well-tested (106 independently-run/verified assertions, 0 failures), and matches its PRD requirement except where the PRD text itself is wrong (FR-3, in EXEC\'s favor). Both prohibitions hold on independent re-verification. The remaining gap — FR-2\'s live application, and this branch\'s merge to main — is explicit, transparently tracked by the SD\'s own architecture (TR-2 anticipated exactly this: "a staged migration that was never applied reports identically to one that was"), and outside any worker\'s power to resolve unilaterally. That is precisely the shape CONDITIONAL_PASS exists to express: a sound deliverable, conditioned on an external action, not a defect this handoff should be blocked on.',
].join('\n');

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 90,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions,
    test_results: {
      sd_owned_and_protected_suite_isolated: {
        files: 7,
        assertions: 106,
        passed: 106,
        failed: 0,
        breakdown: [
          { file: 'tests/unit/fleet/qf-clear-and-reopen.test.js', note: 'FR-1/FR-3/FR-7 — new', run_via: 'vitest' },
          { file: 'tests/unit/coordinator/qf-supply-gauge-agreement.test.js', note: 'FR-4 — new', run_via: 'vitest' },
          { file: 'tests/unit/coordinator/idle-qf-hint-delivery.test.js', note: 'FR-5/FR-6 — new', run_via: 'vitest' },
          { file: 'tests/unit/stale-sweep-qf211-claim-guards.test.js', note: 'pre-existing, modified (+31/-)', run_via: 'vitest' },
          { file: 'tests/unit/db/release-sd-qf-branch-sql.test.js', note: 'FR-2 migration file-level SQL test — new; requires VITEST_DB_ALLOW_REF (db-tier guard)', run_via: 'vitest', tests: 8 },
          { file: 'tests/unit/scripts/stale-session-sweep-claim-safety.test.js', note: 'PROTECTED (TR-1 non-regression) — must stay green unmodified', run_via: 'vitest' },
          { file: 'tests/unit/worker-checkin-critical-qf-priority-jump.test.js', note: 'PROTECTED (pull-order prohibition) — currently excluded by tests/quarantine-manifest.json for an unrelated, pre-existing reason (dated 2026-07-08); re-verified via a standalone out-of-band script against the same production functions, bypassing the quarantine exclude', run_via: 'manual_node_script', tests: 9 },
        ],
      },
      live_migration_check_rerun: {
        script: 'scripts/one-off/verify-release-sd-qf-branch.mjs',
        result: 'ALL 5 CHECKS STILL FAILED (migration not applied to live DB)',
        expected: true,
        ran_by_me: true,
      },
      live_stranded_population_measurement: {
        measured_by_me: true,
        stranded_signature: "status='in_progress' AND claiming_session_id IS NULL AND pr_url IS NULL AND commit_sha IS NULL",
        stranded_count: 0,
        total_in_progress: 8,
        merge_witnessed_carveout_count: 7,
        actively_claimed_count: 1,
        caveat: 'Branch not yet merged to main; this is a pre-fix-code population snapshot, not a post-fix result. One row (QF-20260726-175) observed transitioning from stranded to merge-witnessed between two of my own queries ~1 minute apart, confirming live turnover on the timescale the SD itself warns about.',
      },
      release_sd_rpc_callsite_audit: {
        counted_by_me: true,
        total_production_call_sites: 16,
        js_wrapper_call_sites_with_qf_protection: 1,
        note: 'Only stale-session-sweep.cjs CLAIM_BOUNDARY_PROBE (via bestEffortReleaseSd) carries a pre-existing compensating status-revert write; ~15 other direct rpc(release_sd) callers remain exposed to the unfixed QF branch until FR-2 ships, and none of them is auto-healed by clearStaleQfClaims (its claimedQfs query requires a non-null claiming_session_id).',
      },
      attributable_regressions: 0,
      prior_phase_evidence_reviewed: {
        testing_exec_phase_row: 'CONDITIONAL_PASS, confidence 88 (second-pass re-verification)',
        security_exec_phase_row: 'CONDITIONAL_PASS, confidence 85',
        agreement: 'Independently re-derived the FR-3/FR-1 conclusion and the FR-2/S13 interim-exposure conclusion; both match on independent re-tracing, not on trust.',
      },
    },
    metadata: {
      review_type: 'PLAN_PHASE_PRD_VERIFICATION',
      files_reviewed: [
        'lib/fleet/best-effort-release.mjs',
        'lib/coordinator/qf-supply-predicate.cjs',
        'lib/coordinator/coordination-events.cjs',
        'scripts/stale-session-sweep.cjs',
        'scripts/coordinator-idle-qf-hint.mjs',
        'scripts/modules/complete-quick-fix/orchestrator.js',
        'scripts/worker-checkin.cjs',
        'lib/checkin/steps/critical-qf-jump.cjs',
        'database/migrations/20260727_release_sd_qf_reopen.sql',
        'scripts/one-off/verify-release-sd-qf-branch.mjs',
        'tests/unit/fleet/qf-clear-and-reopen.test.js',
        'tests/unit/coordinator/qf-supply-gauge-agreement.test.js',
        'tests/unit/coordinator/idle-qf-hint-delivery.test.js',
        'tests/unit/scripts/stale-session-sweep-claim-safety.test.js',
        'tests/unit/worker-checkin-critical-qf-priority-jump.test.js',
      ],
      review_dimensions: {
        fr1_fr7_helper_and_reachability: 'PASS — verified via code read + own test run',
        fr3_adjudication: 'PASS (PRD-text defect confirmed, code correct) — independently re-derived',
        fr4_gauge_alignment: 'PASS — both call sites confirmed via diff read + own test run',
        fr5_fr6_delivery_and_ratio: 'PASS — verified via code read + own test run',
        fr2_live_deployment: 'BLOCKED, correctly — chairman-gated DDL, re-verified by me, not applied',
        branch_merge_status: 'NOT YET MERGED to origin/main — confirmed by me',
        prohibitions: 'PASS — both independently re-verified, including an out-of-band bypass for a quarantined test',
        top_level_ac1_reachability: 'PARTIAL — mechanism built+tested; root cause open for ~15/16 release paths pending FR-2; no auto-heal wired',
      },
      model: 'Sonnet 5',
      model_id: 'claude-sonnet-5',
      invoked_at: new Date().toISOString(),
      commits_reviewed: ['fe40d076492', '80273a9fc0f', '9f865479e0e', '7401ad4f87b'],
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001',
    },
    phase: 'PLAN',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { name: 'Principal Systems Analyst (validation-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
