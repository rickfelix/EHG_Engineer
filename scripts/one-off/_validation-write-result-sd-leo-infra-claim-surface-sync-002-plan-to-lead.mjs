#!/usr/bin/env node
/**
 * One-off: Write VALIDATION sub-agent VERIFY / PLAN-TO-LEAD verdict for
 * SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002.
 *
 * Post-EXEC validation that the SHIPPED implementation satisfies PRD FR-1..FR-4 and
 * closes the SECURITY fail-open finding raised at EXEC-TO-PLAN. Every central claim was
 * re-measured with an INDEPENDENT instrument (own AST scan of the corpus + direct runtime
 * behavioral probe of bestEffortReleaseSd), not merely by re-running the author's suite.
 *
 * Uses the canonical repo-evidence + storage pattern per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '3b7fe486-2597-4e42-a5ce-c68c7d2e3395';
const SD_KEY = 'SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002';

const findings = [
  {
    id: 'F1-security-finding-closed-verified-by-independent-runtime-probe',
    severity: 'INFO',
    summary: 'THE SECURITY FAIL-OPEN FINDING IS GENUINELY CLOSED — VERIFIED BY MY OWN RUNTIME PROBE, NOT BY READING THE DIFF OR RE-RUNNING THE AUTHOR\'S SUITE. lib/fleet/best-effort-release.mjs:55 now computes `expectedSdKeyProvided = !!opts && Object.prototype.hasOwnProperty.call(opts, "expectedSdKey")`, separating "the caller passed the option" from "the caller passed it but it is falsy"; :56-59 returns {released:false, error:"invalid_expected_sd_key", skipped:"invalid_expected_sd_key"} in the latter case BEFORE any RPC. I built a standalone harness with a counting fake client and drove ten shapes through the real module. RESULT TABLE (name / released / skipped / rpcCalled): expectedSdKey:"" -> false / invalid_expected_sd_key / 0; expectedSdKey:null -> false / invalid_expected_sd_key / 0; expectedSdKey:undefined (key explicitly present) -> false / invalid_expected_sd_key / 0; expectedSdKey:0 -> false / invalid_expected_sd_key / 0. In ALL FOUR falsy shapes rpcCalled===0 — the unscoped legacy RPC is never reached, so the QF-20260726-593 defect cannot be reproduced through a falsy sdKey handed in by an upstream bug. The original shape (`if (expectedSdKey)`) would have fallen through to the unscoped call in every one of those four rows.'
  },
  {
    id: 'F2-legacy-unscoped-contract-preserved-byte-for-byte',
    severity: 'INFO',
    summary: 'THE DOCUMENTED "OMITTING expectedSdKey PRESERVES LEGACY UNSCOPED BEHAVIOR" CONTRACT SURVIVES THE FIX — the specific regression risk this fix could plausibly have introduced. Same runtime probe, same module: opts OMITTED ENTIRELY (4-arg call) -> released:true, skipped:null, rpcCalled:1; opts={} -> released:true, rpcCalled:1; opts=null -> released:true, rpcCalled:1. So the hasOwnProperty discriminator fires ONLY when the caller actually spelled the key, and the `!!opts &&` prefix correctly treats a null opts as "not provided" rather than throwing. The module header comment at :29-30 ("Omitting expectedSdKey preserves today\'s unscoped behavior byte-for-byte for callers not yet migrated") is therefore an ACCURATE description of measured behavior, not unverified prose. Scoped behavior also re-confirmed: match -> released:true/rpcCalled:1; mismatch -> skipped:sd_mismatch/rpcCalled:0; session holds nothing -> skipped:sd_mismatch/rpcCalled:0; client without .from + scoping requested -> {released:false, error:"scope_unverifiable", skipped:"scope_unverifiable"}/rpcCalled:0.'
  },
  {
    id: 'F3-fr1-satisfied-all-four-acceptance-criteria',
    severity: 'INFO',
    summary: 'FR-1 SATISFIED (4/4 AC). Read scripts/modules/handoff/executors/lead-final-approval/helpers.js:399-469 fresh. AC-1: the raw `supabase.rpc("release_sd", {...})` call AND the inline `if (session.sd_key === claimId)` guard are BOTH gone, replaced by a single `bestEffortReleaseSd(supabase, session.session_id, "completed", console.log, {expectedSdKey: claimId})` at :446-448 — confirmed independently by my AST scan, which reports 0 raw-call hits in this file (it was 1 before). AC-2: tests/unit/stale-claim-release-on-completion.test.js:69 "QF-20260726-593 guard: does NOT release when claude_sessions live-holds a DIFFERENT SD than the one completing". AC-3: TWO tests, not one — :102 "heartbeat-stop is unconditional — fires even when the release is skipped (sd_mismatch)" and :133 "...even when the release RPC errors"; the code at :458-465 now sits OUTSIDE any release-outcome branch, keyed only on its pre-existing `heartbeatStatus.sessionId === session.session_id` match. AC-4: :111 "a scope_unverifiable outcome (transient read error) is logged loudly, not silently swallowed". All 8 tests in this file pass.'
  },
  {
    id: 'F4-fr2-satisfied-with-one-literal-ac-deviation-measured-inert',
    severity: 'WARNING',
    summary: 'FR-2 SATISFIED IN SUBSTANCE, WITH ONE LITERAL AC-2 DEVIATION THAT I MEASURED RATHER THAN WAVED THROUGH. AC-1 and AC-3 are clean: scripts/modules/handoff/claim-swapper.js:100-124 contains no raw rpc and no duplicate pre-check (AST scan: 0 hits, was 1), and the heldSdKey null-vs-non-null distinction is preserved verbatim at :107-114 ("holds nothing" vs "holds ${result.heldSdKey}"), covered by two dedicated tests. AC-2 says the existing claim-swapper.test.js suite must pass "unmodified" — IT WAS MODIFIED. `git diff origin/main` shows exactly one changed assertion (+4 comment lines): the "session row not found" case flipped from `expect(result.reason).toMatch(/not found/)` to `/holds nothing/`, because bestEffortReleaseSd collapses "no session row" and "row exists holding no SD" into heldSdKey===null. WHY THIS IS NOT A FAIL: I enumerated every importer of this releaseClaim. `grep -rnw releaseClaim` across scripts/ and lib/ returns ZERO production importers of scripts/modules/handoff/claim-swapper.js\'s releaseClaim — the only import is its own test at claim-swapper.test.js:19. (Every other releaseClaim hit is a DIFFERENT function: lib/commands/claim-command.js\'s own releaseClaim, coordinator-cold-recovery.cjs\'s local one, fleet-kill/graceful-kill\'s injected dep, releaseClaimBothSurfaces, releaseClaimsByHolder/ForFiles.) The {success:boolean, reason:string} SHAPE and the success:false value for that case are both preserved; only the human-readable reason TEXT changed, and no consumer observes it. The deviation is real but inert.'
  },
  {
    id: 'F5-fr3-satisfied-dead-branch-closed-with-precedence-order-tested',
    severity: 'INFO',
    summary: 'FR-3 SATISFIED (2/2 AC). lib/fleet/best-effort-release.mjs:102-106 adds `if (res && res.data && res.data.success === false)`, returning released:false with `res.data.message || res.data.error || "release_sd_reported_failure"`. AC-1 is covered by FOUR tests, not one — tests/unit/fleet/best-effort-release.test.js:60 (returns released:false on explicit success:false), :67 (PREFERS data.message over data.error, mirroring claim-swapper swapClaim\'s precedent), :75 (falls back to data.error when no message), :81 (does NOT misfire on a normal success response). That last one matters: it is the falsifier for the obvious implementation bug (treating absent `success` as false), and it passes. AC-2: all pre-existing bestEffortReleaseSd tests still pass — the file grew from 6 to 10 tests with no existing assertion altered (git diff shows +31 lines, 0 deletions).'
  },
  {
    id: 'F6-fr4-satisfied-count-anchors-reproduced-exactly-by-independent-ast-scan',
    severity: 'INFO',
    summary: 'FR-4 SATISFIED (4/4 AC), AND THE ALLOWLIST COUNTS ARE NOT TAKEN ON TRUST. Rather than accept the lint\'s own self-report, I wrote a separate scanner using the same ESLint rule but my own walk/config, and diffed its per-file counts against the committed allowlist. EXACT MATCH on all nine files: reclaim-sd-after-compaction.cjs found=2/expected=2; session-state-sync.cjs 1/1; claim-health/self-heal.js 1/1; complete-quick-fix/orchestrator.js 1/1; sd-next/claim-analysis.js 1/1; sd-start.js 3/3; lib/claim-guard.mjs 2/2; lib/commands/claim-command.js 1/1; lib/session-manager.mjs 1/1 — 13 sites in 9 files, byte-identical to the driver\'s "13 call site(s) in 9 file(s) governed by allowlist". AC-1/AC-2: `node scripts/lint/require-release-sd-wrapper-lint.mjs` exits 0 with "0 ungoverned violations across 4853 file(s) scanned"; the fixture-based failure path is proven by 14 passing tests including "a call site with NO allowlist entry is an ungoverned violation" and "observed count EXCEEDING expected is a violation -- the count-anchor actually anchors". AC-3 (no comment-only false positives) is satisfied A FORTIORI: the PRD cited 3 comment-only files, but my scan found 26 files whose TEXT contains "release_sd" against only 10 with a real AST hit — so 16 files are mention-only (incl. BaseExecutor.js, multi-session-claim-gate.js, resolve-sd-workdir.js, amend-sd.js, release-claim-both-surfaces.mjs) and NONE is flagged. AC-4: lib/fleet/best-effort-release.mjs has 1 genuine AST hit yet is absent from the allowlist — confirming it is excluded by STRUCTURAL_EXEMPT_FILES (:49), not silently grandfathered.'
  },
  {
    id: 'F7-hardened-sites-genuinely-left-raw-call-status-not-allowlisted-away',
    severity: 'INFO',
    summary: 'THE STRONGEST SINGLE PIECE OF EVIDENCE THAT FR-1/FR-2 ARE REAL FIXES RATHER THAN LINT-APPEASEMENT. A cheap way to make this lint pass would have been to add allowlist entries for the two target files. I checked for exactly that. Both hardened sites report astHits=0 AND inAllowlist=false: scripts/modules/handoff/claim-swapper.js (was 1 raw call at :122) and scripts/modules/handoff/executors/lead-final-approval/helpers.js (was 1 raw call at :441). They dropped out of raw-call status because the calls were genuinely removed, exactly as FR-4\'s closing sentence requires ("the two call sites hardened by FR-1/FR-2 are removed from raw-call status and therefore drop out of the count"). Neither file appears in require-release-sd-wrapper-allowlist.json at all.'
  },
  {
    id: 'F8-residual-class-gap-lint-cannot-see-wrapper-called-without-scoping',
    severity: 'WARNING',
    summary: 'RESIDUAL GAP IN THE SAME DEFECT CLASS — OUT OF THIS SD\'S SCOPE, BUT IT SHOULD BE NAMED NOW RATHER THAN REDISCOVERED. The FR-4 lint enforces "route through the wrapper"; it does NOT enforce "route through the wrapper WITH expectedSdKey". A call that reaches bestEffortReleaseSd with no scoping is invisible to it by construction, because there is no raw .rpc to detect. I enumerated all 10 production wrapper call sites. Eight pass expectedSdKey (sd-start.js x3, claim-swapper.js, helpers.js, spawn-control.js:1048, release-request.cjs:91, and fleet-kill conditionally). TWO remain unscoped: (1) scripts/stale-session-sweep.cjs:224 CLAIM_BOUNDARY_PROBE passes only 3 args plus a log fn and no opts at all — fully unscoped; (2) scripts/fleet-kill.mjs:113-114 passes `sdKey ? { expectedSdKey: sdKey } : {}`, a ternary that DELIBERATELY degrades to unscoped when sdKey is falsy. Note the irony of (2): that ternary is the same fail-open shape SECURITY flagged inside the wrapper, now expressed at the call site. With the new fail-closed semantics, passing `{expectedSdKey: sdKey}` unconditionally would make fleet-kill refuse rather than release-blind on a falsy sdKey. Neither is in scope for FR-1/FR-2 (which named only the two highest-risk sites) and neither blocks this SD, but both belong in the documented follow-on alongside the 13 grandfathered raw sites.'
  },
  {
    id: 'F9-eslint-rule-narrowness-is-self-documented-and-currently-empty',
    severity: 'INFO',
    summary: 'THE DETECTOR\'S BLIND SPOTS ARE DECLARED IN ITS OWN HEADER AND ARE CURRENTLY UNPOPULATED — checked rather than assumed. eslint-rules/require-release-sd-wrapper.js:18-23 states it ignores computed member access (`obj["rpc"](...)`) and non-literal first arguments (`obj.rpc(fnName, ...)`), attempting no data-flow analysis, matching the repo\'s established checker style (require-main-guard-in-one-off.js). I confirmed the corpus contains zero such evasion shapes today: my independent AST scan found 10 files with hits and the union of {AST-flagged} and {allowlisted} is exactly consistent, with no file mentioning release_sd in a non-comment, non-detected position. The rule is correctly comment-immune by construction (Literal first-arg match on a CallExpression), which is why the 16 mention-only files produce zero noise. This is an accepted, documented limitation, not an undisclosed hole.'
  },
  {
    id: 'F10-lint-driver-unguarded-main-matches-precedent-and-is-inert-here',
    severity: 'INFO',
    summary: 'A SHAPE THAT LOOKS LIKE A DEFECT BUT IS NOT — CHECKED AGAINST THE PRECEDENT BEFORE FLAGGING IT. scripts/lint/require-release-sd-wrapper-lint.mjs exports loadAllowlist and evaluateHits while calling `main()` unconditionally at :215, so any module that IMPORTED it would trigger a full corpus scan and a process.exit. Two reasons this is inert: (1) it is structurally identical to the sibling precedent the PRD told EXEC to model — scripts/lint/require-main-guard-in-one-off-lint.mjs also ends in a bare `main();` with no isMainModule guard, so deviating would have been the anomaly; (2) tests/unit/lint/require-release-sd-wrapper-lint.test.js never imports the module — all 14 tests drive it via execFileSync as a real subprocess, which is the more honest instrument anyway (it exercises the actual CLI contract including exit codes and the --allowlist flag). The two named exports are currently unimported anywhere in the repo. Worth noting only so a future importer is not surprised.'
  },
  {
    id: 'F11-ci-workflow-honors-the-32-day-blindness-constraint',
    severity: 'INFO',
    summary: 'CI WIRING IS CORRECT ON THE ONE DIMENSION THAT HAS ALREADY COST THIS REPO 32 DAYS OF SILENT CI BLINDNESS. .github/workflows/require-release-sd-wrapper-lint.yml:24-34 lists SIX separate path-filter entries — scripts/**/*.mjs, scripts/**/*.cjs, scripts/**/*.js, lib/**/*.mjs, lib/**/*.cjs, lib/**/*.js — one per extension, with no brace alternation anywhere, plus self-triggering entries for the rule, the driver, the allowlist and the workflow file itself. The hard constraint is restated as a comment at :17-20 so a future editor cannot collapse them without reading why. No continue-on-error, so the job genuinely blocks. Runs `npm ci` then `node scripts/lint/require-release-sd-wrapper-lint.mjs` on ubuntu-latest/node 20. package.json also gains `"lint:release-sd-wrapper"` at :127, keeping it runnable locally alongside its sibling controls.'
  },
  {
    id: 'F12-full-suite-and-static-analysis-green-on-my-own-run',
    severity: 'INFO',
    summary: 'ALL THREE COMMANDED CHECKS RUN BY ME IN THIS WORKTREE, GREEN. (1) `npx vitest run` over the six specified files: 6 test files passed, 64/64 tests passed, 16.40s. IMPORTANT READING NOTE for anyone reviewing that output: it contains three alarming Node stack traces ("Allowlist entry \'scripts/target.mjs\' must have a non-empty reason string", "...non-negative integer expected count", "...must be an object with {reason, expected}"). These are EXPECTED subprocess stderr from the three NEGATIVE tests at require-release-sd-wrapper-lint.test.js:173/188/203, which assert the allowlist loader throws loud on malformed entries; they are not failures and the suite summary confirms 0 failed. (2) `node scripts/lint/require-release-sd-wrapper-lint.mjs` -> exit 0, "0 ungoverned violations across 4853 file(s) scanned (scripts/**, lib/**); 13 call site(s) in 9 file(s) governed by allowlist." (3) `npx eslint lib/fleet/best-effort-release.mjs scripts/modules/handoff/claim-swapper.js scripts/modules/handoff/executors/lead-final-approval/helpers.js` -> exit 0, no output. Change footprint vs origin/main: 14 files, +929/-80.'
  }
];

const warnings = [
  'FR-2 AC-2 is literally deviated-from: the pre-existing scripts/modules/handoff/claim-swapper.test.js WAS modified (one assertion, /not found/ -> /holds nothing/), whereas AC-2 requires the existing suite to pass "unmodified". Measured as inert — claim-swapper\'s releaseClaim has ZERO production importers (only its own test), and the {success, reason} shape plus the success:false value are preserved; only the human-readable reason text changed, justified by bestEffortReleaseSd collapsing "no session row" and "holds no SD" into heldSdKey===null. Recommend LEAD accept explicitly rather than let the deviation pass unremarked.',
  'RESIDUAL SAME-CLASS GAP (out of scope, non-blocking): the FR-4 lint detects raw .rpc("release_sd") but is blind by construction to a wrapper call made WITHOUT expectedSdKey. Two production sites remain unscoped: scripts/stale-session-sweep.cjs:224 (no opts) and scripts/fleet-kill.mjs:113-114 (ternary that degrades to unscoped on a falsy sdKey — the same fail-open shape SECURITY flagged inside the wrapper, now at a call site). Route to the documented follow-on.',
  'The eslint rule cannot see computed member access (obj["rpc"](...)) or a non-literal first argument. Declared in its own header, consistent with the repo\'s checker style, and verified to have zero instances in the corpus today — but a future evasion of that shape would be invisible to this control.',
  'scripts/lint/require-release-sd-wrapper-lint.mjs calls main() unconditionally while exporting loadAllowlist/evaluateHits, so a future importer would trigger a corpus scan plus process.exit. Inert today (tests drive it via execFileSync; exports are unimported) and structurally identical to the sibling precedent it was told to model.',
  'The vitest output for this SD contains three expected Node stack traces from the negative allowlist-loader tests. Do not read them as failures — the run is 64/64 passed. Anyone re-running these tests at LEAD should be told this in advance.'
];

const recommendations = [
  'LEAD: accept the FR-2 AC-2 deviation explicitly (one reason-string assertion amended in the pre-existing suite, zero production consumers of the affected function) rather than treating the suite as unmodified.',
  'Follow-on SD/QF: extend the control from "must route through the wrapper" to "must route through the wrapper WITH expectedSdKey", and retrofit the two remaining unscoped wrapper call sites (stale-session-sweep.cjs:224, fleet-kill.mjs:113). fleet-kill\'s `sdKey ? {expectedSdKey: sdKey} : {}` ternary is now strictly worse than passing the option unconditionally, since the wrapper fails closed on a falsy value.',
  'Follow-on: the 13 grandfathered raw call sites across 9 files are now count-anchored and self-ratcheting (migrating a site lowers the observed count and passes silently). Retire the allowlist entries incrementally; the entry disappears at zero.',
  'Optional hygiene: add an isMainModule guard to scripts/lint/require-release-sd-wrapper-lint.mjs so its named exports become safely importable, and consider the same for the sibling precedent — or drop the two unused exports.',
  'Preserve the "expected stderr" note about the three negative allowlist-loader tests in the PLAN-TO-LEAD handoff so the traces are not misread as failures downstream.'
];

const summary = 'VERIFY / PLAN-TO-LEAD VALIDATION PASS (confidence 93) for SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002. All four PRD functional requirements are satisfied by the shipped code, and the SECURITY fail-open finding raised at EXEC-TO-PLAN is genuinely closed. I re-measured the central claims with INDEPENDENT instruments rather than re-running the author\'s suite alone. (a) SECURITY FIX — I drove the real lib/fleet/best-effort-release.mjs through a standalone harness with a counting fake client. All four falsy expectedSdKey shapes ("", null, explicit undefined, 0) return skipped:"invalid_expected_sd_key" with rpcCalled===0, so a falsy sdKey from an upstream bug can no longer fall through to the UNSCOPED legacy RPC — the exact QF-20260726-593 reproduction the original `if (expectedSdKey)` truthy check permitted. The hasOwnProperty discriminator at :55 is what makes this work. Critically, the documented legacy contract SURVIVES: opts omitted entirely, opts={} and opts=null all still release unscoped (released:true, rpcCalled:1), so callers that never migrated are byte-for-byte unaffected. Scoped paths re-confirmed too (match releases; mismatch, holds-nothing, and missing-.from all fail closed with rpcCalled:0). (b) FR-1 4/4 AC: the raw rpc AND the inline session.sd_key===claimId guard are both gone from helpers.js, replaced by one bestEffortReleaseSd({expectedSdKey: claimId}) call; the heartbeat-stop is now outside every release-outcome branch and is covered by TWO unconditionality tests (sd_mismatch and rpc-error), with scope_unverifiable logged loudly. (c) FR-2 3/3 AC in substance, with ONE literal deviation I measured rather than glossed: the pre-existing claim-swapper.test.js was modified (one assertion, /not found/ -> /holds nothing/) although AC-2 says "unmodified". I enumerated every importer — claim-swapper\'s releaseClaim has ZERO production consumers (only its own test; every other releaseClaim in the repo is a different function), and the {success, reason} shape and success:false value are preserved, so the reason-text change is observable by nobody. Non-blocking, but LEAD should accept it explicitly. (d) FR-3 2/2 AC: the success:false branch is closed with message-over-error precedence, and four tests include the falsifier for the obvious bug (does not misfire on a normal success response). (e) FR-4 4/4 AC: I ran my OWN AST scan with a separate walk and config, and its per-file counts match the committed allowlist EXACTLY on all nine files (2,1,1,1,1,3,2,1,1 = 13), identical to the driver\'s self-report — the counts are not taken on trust. AC-3 is satisfied a fortiori: 26 files mention "release_sd" in text but only 10 have a real AST hit, so 16 mention-only files produce zero false positives versus the 3 the PRD anticipated. best-effort-release.mjs has a genuine hit yet is absent from the allowlist, confirming the structural exemption. THE STRONGEST EVIDENCE THE FIXES ARE REAL: both hardened files report astHits=0 AND inAllowlist=false — they left raw-call status because the calls were removed, not because they were allowlisted away. CI wiring honors the one dimension that previously cost 32 days of silent blindness (six path filters, one per extension, no brace alternation, no continue-on-error). ALL THREE COMMANDED CHECKS GREEN ON MY RUN: vitest 64/64 passed across 6 files; lint exit 0 ("0 ungoverned violations across 4853 files"); eslint exit 0 on all three source files. READING NOTE carried forward: the vitest output contains three expected Node stack traces from the negative allowlist-loader tests — not failures. TWO NON-BLOCKING ITEMS ROUTED TO FOLLOW-ON: (1) the FR-2 AC-2 deviation above; (2) a residual same-class gap — the lint enforces "route through the wrapper" but is blind by construction to a wrapper call made WITHOUT expectedSdKey, and two production sites remain unscoped (stale-session-sweep.cjs:224 with no opts, and fleet-kill.mjs:113 whose `sdKey ? {expectedSdKey} : {}` ternary is the same fail-open shape SECURITY flagged, now expressed at a call site and now strictly worse than passing the option unconditionally). Nothing blocks PLAN-TO-LEAD.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 93,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      prd_id: 'PRD-SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002',
      rca_ref: 'a7d374f4b77ae2a1b',
      defect_qf_ref: 'QF-20260726-593',
      validation_mode: 'retrospective_post_exec',
      instrument_diversity: {
        note: 'Central claims re-measured with instruments INDEPENDENT of the author-written vitest suite, per the adversarial-verification rule.',
        instrument_1: 'Standalone runtime harness driving the real bestEffortReleaseSd with a counting fake client across 10 opts shapes (measures rpcCalled, not just return value).',
        instrument_2: 'Independent AST scan using the same ESLint rule but a separate walk/config, cross-checked per-file against the committed allowlist counts.',
        instrument_3: 'git diff origin/main + grep -rnw importer enumeration to test the blast radius of the AC-2 test modification.'
      },
      security_finding_closure: {
        status: 'CLOSED',
        original_defect: 'guard used `if (expectedSdKey)` (truthy VALUE check), so a falsy sdKey/claimId from a caller silently skipped the scope check and fell through to the UNSCOPED legacy RPC — reproducing QF-20260726-593.',
        fix_location: 'lib/fleet/best-effort-release.mjs:55-60',
        fix_mechanism: 'expectedSdKeyProvided = !!opts && Object.prototype.hasOwnProperty.call(opts, "expectedSdKey"); provided-but-falsy returns {released:false, error:"invalid_expected_sd_key", skipped:"invalid_expected_sd_key"} before any RPC.',
        runtime_probe_results: {
          'expectedSdKey: ""': { released: false, skipped: 'invalid_expected_sd_key', rpcCalled: 0 },
          'expectedSdKey: null': { released: false, skipped: 'invalid_expected_sd_key', rpcCalled: 0 },
          'expectedSdKey: undefined (key present)': { released: false, skipped: 'invalid_expected_sd_key', rpcCalled: 0 },
          'expectedSdKey: 0': { released: false, skipped: 'invalid_expected_sd_key', rpcCalled: 0 },
          'opts omitted entirely (4-arg call)': { released: true, skipped: null, rpcCalled: 1 },
          'opts = {}': { released: true, skipped: null, rpcCalled: 1 },
          'opts = null': { released: true, skipped: null, rpcCalled: 1 },
          'scoped match': { released: true, skipped: null, rpcCalled: 1 },
          'scoped mismatch': { released: false, skipped: 'sd_mismatch', rpcCalled: 0 },
          'session holds nothing': { released: false, skipped: 'sd_mismatch', rpcCalled: 0 },
          'no .from + scoping requested': { released: false, skipped: 'scope_unverifiable', rpcCalled: 0 }
        },
        legacy_contract_preserved: true,
        legacy_contract_evidence: 'omitted / {} / null opts all still reach the unscoped RPC (rpcCalled:1), so the module header claim at :29-30 is measured behavior, not unverified prose.'
      },
      fr_verdicts: {
        'FR-1': { verdict: 'SATISFIED', ac_met: '4/4', evidence: 'helpers.js:446-448 single bestEffortReleaseSd({expectedSdKey: claimId}); inline guard + raw rpc removed (AST scan: 0 hits, was 1 at :441); heartbeat-stop unconditional at :458-465; 8/8 tests pass incl. two AC-3 unconditionality tests and an AC-4 loud-log test.' },
        'FR-2': { verdict: 'SATISFIED_WITH_DEVIATION', ac_met: '3/3 substantive, AC-2 literally deviated', evidence: 'claim-swapper.js:100-124 routes through the wrapper (AST scan: 0 hits, was 1 at :122); heldSdKey null-vs-non-null preserved at :107-114; 7 new tests + 15 existing pass. DEVIATION: one pre-existing assertion amended (/not found/ -> /holds nothing/) though AC-2 requires "unmodified". Blast radius measured as zero — releaseClaim has no production importers.' },
        'FR-3': { verdict: 'SATISFIED', ac_met: '2/2', evidence: 'best-effort-release.mjs:102-106 closes the success:false branch with message-over-error precedence; 4 tests incl. the no-misfire falsifier; pre-existing tests unmodified (+31/-0).' },
        'FR-4': { verdict: 'SATISFIED', ac_met: '4/4', evidence: 'lint exit 0, 0 ungoverned violations / 4853 files / 13 governed sites in 9 files — per-file counts reproduced EXACTLY by an independent AST scan. 16 mention-only files produce zero false positives (PRD anticipated 3). best-effort-release.mjs structurally exempt (has a hit, not allowlisted). 14/14 lint tests pass.' }
      },
      hardened_sites_left_raw_call_status: {
        note: 'Checked specifically for the cheap alternative (allowlisting the two target files instead of fixing them). Neither appears in the allowlist.',
        'scripts/modules/handoff/claim-swapper.js': { astHits: 0, inAllowlist: false, was: '1 raw call at :122' },
        'scripts/modules/handoff/executors/lead-final-approval/helpers.js': { astHits: 0, inAllowlist: false, was: '1 raw call at :441' }
      },
      allowlist_count_verification: {
        method: 'independent AST scan with separate walk/config, per-file counts diffed against committed allowlist',
        result: 'EXACT MATCH on all 9 files',
        counts: {
          'scripts/hooks/reclaim-sd-after-compaction.cjs': { found: 2, expected: 2 },
          'scripts/hooks/session-state-sync.cjs': { found: 1, expected: 1 },
          'scripts/modules/claim-health/self-heal.js': { found: 1, expected: 1 },
          'scripts/modules/complete-quick-fix/orchestrator.js': { found: 1, expected: 1 },
          'scripts/modules/sd-next/claim-analysis.js': { found: 1, expected: 1 },
          'scripts/sd-start.js': { found: 3, expected: 3 },
          'lib/claim-guard.mjs': { found: 2, expected: 2 },
          'lib/commands/claim-command.js': { found: 1, expected: 1 },
          'lib/session-manager.mjs': { found: 1, expected: 1 }
        },
        total_governed: 13,
        structurally_exempt: 'lib/fleet/best-effort-release.mjs (1 real hit, absent from allowlist)',
        text_mentions: 26,
        real_ast_hits: 10,
        mention_only_no_false_positives: 16
      },
      residual_gap: {
        severity: 'OUT_OF_SCOPE_ADVISORY',
        class: 'lint enforces "route through the wrapper" but is blind by construction to a wrapper call made WITHOUT expectedSdKey (no raw .rpc to detect)',
        wrapper_call_sites_total: 10,
        scoped: ['scripts/sd-start.js:1404', 'scripts/sd-start.js:1443', 'scripts/sd-start.js:1455', 'scripts/modules/handoff/claim-swapper.js:101', 'scripts/modules/handoff/executors/lead-final-approval/helpers.js:446', 'lib/fleet/spawn-control.js:1048', 'lib/checkin/steps/release-request.cjs:91'],
        unscoped: [
          { site: 'scripts/stale-session-sweep.cjs:224', shape: 'CLAIM_BOUNDARY_PROBE — 3 args + log fn, no opts at all' },
          { site: 'scripts/fleet-kill.mjs:113-114', shape: 'ternary `sdKey ? { expectedSdKey: sdKey } : {}` — deliberately degrades to unscoped on a falsy sdKey; the same fail-open shape SECURITY flagged inside the wrapper, now at a call site. Now strictly worse than passing the option unconditionally, since the wrapper fails closed on falsy.' }
        ],
        blocks_this_sd: false
      },
      commanded_checks: {
        vitest: { command: 'npx vitest run <6 files>', files_passed: 6, tests_passed: 64, tests_failed: 0, duration: '16.40s' },
        vitest_reading_note: 'Output contains 3 expected Node stack traces from the negative allowlist-loader tests (require-release-sd-wrapper-lint.test.js:173/188/203). These assert the loader throws loud on malformed entries. NOT failures.',
        lint: { command: 'node scripts/lint/require-release-sd-wrapper-lint.mjs', exit: 0, output: '0 ungoverned violations across 4853 file(s) scanned (scripts/**, lib/**); 13 call site(s) in 9 file(s) governed by allowlist.' },
        eslint: { command: 'npx eslint lib/fleet/best-effort-release.mjs scripts/modules/handoff/claim-swapper.js scripts/modules/handoff/executors/lead-final-approval/helpers.js', exit: 0, output: 'clean, no findings' }
      },
      change_footprint: { files: 14, insertions: 929, deletions: 80, vs: 'origin/main' },
      ci_workflow: {
        file: '.github/workflows/require-release-sd-wrapper-lint.yml',
        path_filters: 6,
        one_entry_per_extension: true,
        brace_alternation_present: false,
        continue_on_error: false,
        constraint_ref: 'documented 32-day CI blindness on the sibling ismainmodule-classguard-lint.yml, restated as a comment at :17-20',
        npm_script: 'lint:release-sd-wrapper (package.json:127)'
      }
    },
    phase: 'PLAN-TO-LEAD',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { name: 'Principal Systems Analyst (validation-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN-TO-LEAD' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.metadata?.phase || 'PLAN-TO-LEAD');
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
