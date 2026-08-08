/**
 * EXEC-phase TESTING RE-REVIEW for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001
 * (row 23c2a2d4-89af-4885-b87b-7a5b3c4ded1d), at HEAD 619640cb83a.
 *
 * Supersedes row 78628870 (CONDITIONAL_PASS 70). Brief was to REFUTE, not confirm.
 * Every claim below was measured by executed mutation, not read off a diff.
 * `summary`/`findings` are not mapped columns; folded into detailed_analysis.
 * metadata.repo_path/executed_from_cwd via the canonical resolveSubAgentRepo/
 * applySubAgentRepoVerdict pair (no top-level repo_path/local_path columns).
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = '23c2a2d4-89af-4885-b87b-7a5b3c4ded1d';
const SD_KEY = 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001';
const CODE = 'TESTING';
const PHASE = 'EXEC';

/** Every mutation actually executed. `killed` lists the tests that went red. */
const mutations = [
  { id: 'M1', target: 'lib/fleet/source-tree-refresh.cjs:isLinkedWorktreeOf', change: 'return true (S2 guard fully disabled)',
    killed: ['source-tree-identity: REFUSES a self-consistent FAKE repo', 'source-tree-identity: REFUSES a directory git cannot identify', 'source-tree-identity: the refusal names the consequence'],
    survived: ['positive control (REUSES a genuine linked worktree)', 'create path'],
    verdict: 'CLAIM CONFIRMED — exactly the 3 refusal tests fail, exactly as the commit message states.' },
  { id: 'M2', target: 'lib/fleet/source-tree-refresh.cjs:isLinkedWorktreeOf catch', change: 'catch { return true } — FAIL-OPEN on an unverifiable directory',
    killed: ['source-tree-identity: REFUSES a directory git cannot identify at all — fails CLOSED'],
    survived: ['the other 4'],
    verdict: 'The fail-closed test has a UNIQUE killer. It does NOT collapse into the fake-repo test.' },
  { id: 'M3', target: 'lib/fleet/source-tree-refresh.cjs:isLinkedWorktreeOf', change: 'return true instead of mine===theirs — the too-weak "is it a git repo at all" check',
    killed: ['source-tree-identity: REFUSES a self-consistent FAKE repo', 'source-tree-identity: the refusal names the consequence'],
    survived: ['REFUSES a directory git cannot identify', 'positive control', 'create path'],
    verdict: 'The fake-repo test has a UNIQUE killer, DISJOINT from M2 s. Answers the brief directly: the two refusal tests are independently discriminating and do NOT collapse into one assertion. M2 kills only #3; M3 kills only #2.' },
  { id: 'M4', target: 'lib/fleet/source-tree-refresh.cjs:ensureSourceTreeWorktree', change: 'drop the exists(dir) && short-circuit so the create path is probed too',
    killed: ['source-tree-identity: a NEW tree is still created normally'],
    survived: ['the other 4'],
    verdict: 'The negative arm has a UNIQUE killer and genuinely varies the ABSENCE axis, not the identity axis. It is not an inherited restatement of the positive control.' },
  { id: 'M5', target: 'lib/fleet/source-tree-refresh.cjs:isLinkedWorktreeOf', change: 'return false unconditionally — refuse EVERYTHING',
    killed: ['source-tree-identity: REUSES a genuine linked worktree (positive control)'],
    survived: ['the other 4'],
    verdict: 'The positive control has a unique killer. All 5 identity tests are non-redundant: each has at least one mutation that kills it alone.' },
  { id: 'M6', target: 'lib/fleet/source-tree-refresh.cjs:ensureSourceTreeWorktree', change: 'run fetch + merge --ff-only in the unverified dir BEFORE the probe (duplicating the ops)',
    killed: ['spawn-source-ensure:122 REFRESHES on reuse (call COUNT assertion only)'],
    survived: ['all 5 identity tests'],
    verdict: 'Caught only INCIDENTALLY, by a call-count assertion reacting to duplicate calls — not by any ordering assertion. Motivated M6b.' },
  { id: 'M6b', target: 'lib/fleet/source-tree-refresh.cjs:ensureSourceTreeWorktree', change: 'COUNT-NEUTRAL: probe MOVED to after fetch + merge --ff-only already ran in the unverified directory (2 refresh + 2 probes, identical total)',
    killed: [],
    survived: ['ALL 3432 tests across tests/unit/fleet/, tests/unit/worktree-reaper/, tests/unit/governance/ — 252 files passed, 0 failed'],
    verdict: 'GAP G1. The refusal still fires, so all 5 identity tests stay green — but it fires AFTER git already executed inside the attacker-controlled directory, which is the entire S2 attack. Ordering is unpinned.' },
  { id: 'M7', target: 'scripts/fleet/worktree-reaper-tick.cjs', change: 'census moved back BELOW the early return (the pre-QF-794 state)',
    killed: ['TS-3 (refusal-watchdog-split.test.js:85)', 'tick.test.js:405 emits a BACKLOG line on a refusal', 'tick.test.js:447 a FAILED worktree count reports "unknown"'],
    survived: ['TS-9', 'TS-9b'],
    verdict: 'COVERAGE-MAP CLAIM CONFIRMED. TS-3 genuinely DOES detect the census moving back below the early return. (Two pre-existing tick.test.js tests detect it too — overlap, not vacuity.)' },
  { id: 'M8', target: 'scripts/fleet/worktree-reaper-tick.cjs', change: 'FR-1b built LITERALLY — --stage0 --execute escalation HOISTED above the refusal return',
    killed: ['TS-9b (refusal-watchdog-split.test.js:139)', 'tick.test.js:329 canonical root fallback (incidental)'],
    survived: ['TS-3', 'TS-9'],
    verdict: 'BOTH HALVES OF THE COVERAGE-MAP CLAIM CONFIRMED. TS-9b DOES detect the escalation hoist, and TS-3/TS-9 DO pass unchanged under it — exactly as the corrected comment now says. Minor over-claim: the map says TS-9b is "the ONLY test that does"; tick.test.js:329 also goes red, though incidentally rather than by design.' },
  { id: 'M9', target: 'lib/rogue/quota-copy.js (added) + tick constant renamed', change: 'THE SWAP — rogue definition added AND the sanctioned tick copy renamed away, so the COUNT stays at 2',
    killed: ['TS-11 MAX_WORKTREE_COUNT is defined only in its two sanctioned homes'],
    survived: [],
    verdict: 'CLAIM CONFIRMED. The swap regression I identified in the prior review IS caught now. Under the old defs.length <= 2 bound this configuration scores exactly 2 and would have passed.' },
  { id: 'M10', target: 'scripts/fleet/worktree-reaper-tick.cjs', change: 'legitimate CONSOLIDATION to ONE definition (tick copy removed, canonical retained)',
    killed: [],
    survived: ['TS-11 — 5 passed'],
    verdict: 'CLAIM CONFIRMED. The membership form does not punish a future consolidation. The stated design goal holds.' },
  { id: 'M11', target: 'lib/worktree-quota.js + tick', change: 'ZERO definitions — both constants renamed away',
    killed: ['TS-11'],
    survived: [],
    verdict: 'The anchor assertion bites. "Zero definitions" cannot sail through the membership loop.' },
  { id: 'M12', target: 'lib/coordinator/coordination-events.cjs:emitReaperStarvationAlert', change: 'const kind = hardcoded "reaper_starvation_alert" — the emitter IGNORES opts.kind, collapsing both conditions onto ONE dedup key',
    killed: [],
    survived: ['ALL 748 tests in tests/unit/coordinator/ — 62 files passed, 0 failed'],
    verdict: 'GAP G2a. An open starvation alert would silence a census-blind alert (and vice versa) — the precise failure S3 was filed to prevent — with the suite fully green.' },
  { id: 'M13', target: 'lib/coordinator/coordination-events.cjs:runReaperStarvationSurfacing', change: 'THE WIRE CUT — stop passing kind: res.alertKind through to the emitter',
    killed: [],
    survived: ['ALL 748 tests in tests/unit/coordinator/ — 62 files passed, 0 failed'],
    verdict: 'GAP G2b. Same hole from the other side: the value produced by detect never has to ARRIVE at the emitter.' },
  { id: 'M14', target: 'lib/coordinator/coordination-events.cjs:detectReaperStarvation', change: 'revert pool_unknown to matched:false (the S3 fix undone)',
    killed: ['reaper-starvation:61 an UNKNOWN pool DOES alarm', 'reaper-starvation:72 the two alarm kinds are distinct'],
    survived: ['the other 746'],
    verdict: 'CLAIM CONFIRMED — exactly the 2 census-blind tests fail. (First attempt at this mutation was INVALID: a literal \\n produced a module that would not load, giving 6 "failed" FILES and 0 failed assertions. Re-run properly from a heredoc. Recording it because a mutation that breaks module load is indistinguishable from a mutation nothing catches.)' },
  { id: 'M15', target: 'lib/fleet/source-tree-refresh.cjs', change: 'remove the reuse-path markSourceTreeReapProtected re-assert',
    killed: ['source-tree-self-protection:77 LAYER 1 — protection SELF-HEALS'],
    survived: [],
    verdict: 'FIXTURE-UPDATE CLAIM CONFIRMED for this file. Answering the probe as a genuine linked worktree did NOT neuter what the test originally proved — the self-heal assertion still bites.' },
  { id: 'M16', target: 'lib/fleet/source-tree-refresh.cjs', change: 'a failed refresh RETHROWS instead of fail-soft',
    killed: ['spawn-source-ensure:130 a FAILED refresh does not throw'],
    survived: [],
    verdict: 'FIXTURE-UPDATE CLAIM CONFIRMED. Making the probe succeed while the refresh fails preserved the original property exactly; the test still detects a rethrow.' },
  { id: 'M17', target: 'lib/fleet/source-tree-refresh.cjs:buildSourceTreeUpdateArgs', change: 'drop the merge --ff-only leg — fetch only, so the tree never advances',
    killed: ['spawn-source-ensure:49 fetches then fast-forwards', 'spawn-source-ensure:61 introduces NO reset/clean/stash', 'spawn-source-ensure:115 REUSES without RE-CREATING', 'spawn-source-ensure:122 REFRESHES on reuse', 'spawn-source-flag-on-seam:151 REFRESHES BEFORE the guard reads it (the ORDER test)', 'reaper-source-tree:83 TS-1b the source tree is REFRESHED on reuse'],
    survived: [],
    verdict: 'FIXTURE-UPDATE CLAIM CONFIRMED across the remaining three files. 6 tests in 3 files bite. In particular the not-logging-the-probe choice in spawn-source-flag-on-seam did NOT blind its ORDER assertion, and the count assertion at :122 is backstopped by a CONTENT assertion at :115.' },
];

const gaps = [
  {
    id: 'G1',
    severity: 'high',
    kind: 'coverage gap in a new security fix (NOT a live defect — shipped code is correct)',
    title: 'The S2 identity probe s POSITION relative to the destructive git ops is pinned by nothing. Moving it after fetch + merge --ff-only passes all 3432 tests.',
    location: 'lib/fleet/source-tree-refresh.cjs:209-222 (guard) vs :223-229 (reuse/refresh block); tests/unit/fleet/source-tree-identity.test.js:52-119',
    note:
      'MEASURED (M6b): I moved the isLinkedWorktreeOf call from before the reuse block to inside it, AFTER `for (const args of buildSourceTreeUpdateArgs(dir, baseRef)) runner(args)` had already run. The refusal still throws, with the same message, so all five identity tests stay green — and the total runner call count is unchanged at 4 (2 refresh + 2 probes), so the count assertion at spawn-source-ensure.test.js:122 does not bite either. Result: 252 files passed, 3432 tests passed, 0 failed, across tests/unit/fleet/, tests/unit/worktree-reaper/ and tests/unit/governance/. '
      + 'Why this matters more than an ordinary ordering nit: the S2 threat model, as written in the file s own header, is that `git -C <dir> fetch` and `merge --ff-only` execute using THAT DIRECTORY S OWN git config. Under the mutant those two commands run in full inside the attacker-controlled directory before the refusal fires. The refusal becomes a post-mortem. Every one of the five tests asserts a VERDICT (throws / does not throw); not one asserts that no runner call was made against the untrusted dir before the verdict was reached. '
      + 'This is the same shape the SD is otherwise about — a guard whose observable effect is present while the property it exists to enforce is absent.',
    recommendation:
      'Add one assertion to the two refusal cases: capture the runner argv sequence and assert that the ONLY calls made against the candidate dir before the throw are the rev-parse probes — i.e. expect(calls.filter(c => !isIdentityProbe(c))).toHaveLength(0). That single assertion kills M6b and costs three lines. It belongs in source-tree-identity.test.js, next to the tests that already own this contract.',
  },
  {
    id: 'G2',
    severity: 'high',
    kind: 'coverage gap in a new security fix (NOT a live defect — shipped code is correct)',
    title: 'The S3 "distinct kind so neither can suppress the other" property is asserted only on detectReaperStarvation s RETURN VALUE. The emitter s dedup key and the surfacing pass-through are untested; cutting either passes all 748 coordinator tests.',
    location: 'lib/coordinator/coordination-events.cjs:651-653 (emitter kind resolution), :715 (surfacing pass-through); tests/unit/coordinator/reaper-starvation.test.js:68-74',
    note:
      'MEASURED, two independent mutations, each surviving the entire coordinator suite (62 files, 748 tests, 0 failures): '
      + '(M12) hardcoding `const kind = "reaper_starvation_alert"` in emitReaperStarvationAlert, so the `.eq("payload->>kind", kind)` dedup query collapses both conditions onto one key; and '
      + '(M13) removing `kind: res.alertKind` from the opts runReaperStarvationSurfacing passes to the emitter, so the value detect computes never arrives. '
      + 'Under either mutant, an open unacknowledged starvation alert suppresses a census-blind alert for up to 24h — which is exactly the outcome the S3 fix and the emitter s own comment ("Sharing one kind would let an open starvation alert suppress a census-blind alert... the second condition would go unreported") were written to prevent. '
      + 'The test at reaper-starvation.test.js:68, named "the two alarm kinds are distinct, so neither can suppress the other", proves only the first clause. The second clause — the one in the name that carries the operational consequence — is not exercised anywhere: grep confirms emitReaperStarvationAlert and runReaperStarvationSurfacing have NO test-file references at all, in any suite. '
      + 'Two green ends, unverified wire: detect produces distinct kinds, the emitter would honour a kind if given one, and nothing asserts the kind travels between them.',
    recommendation:
      'Add one test that drives runReaperStarvationSurfacing (or emitReaperStarvationAlert directly) with a stub supabase capturing the dedup query, and assert the queried payload->>kind equals reaper_census_blind_alert for an unknown pool and reaper_starvation_alert for a starving one. Asserting the value that ARRIVES at the dedup query — not the value detect returns — is what kills both M12 and M13. The stub only needs .from().select().eq().is().gt().limit() to record its arguments.',
  },
  {
    id: 'G3',
    severity: 'low',
    kind: 'documentation accuracy',
    title: 'The coverage map s parenthetical "(the ONLY test that does)" on TS-9b is very slightly over-stated.',
    location: 'tests/unit/worktree-reaper/refusal-watchdog-split.test.js:27',
    note:
      'MEASURED (M8): under the escalation hoist, tick.test.js:329 ("the canonical root fallback is used when no repoRoot is injected") also goes red, because the hoisted block calls spawnDetachedReaper on the refusal path. So TS-9b is the only test that DELIBERATELY covers escalation placement, but not literally the only test that fails on the hoist. '
      + 'Raised only because this file s whole purpose is naming precisely what each test can detect, and the map is otherwise exactly right — including its self-refuting claim that TS-3 and TS-9 are blind to this mutation, which I confirmed.',
    recommendation:
      'Optional. If touched, soften to "the only test that covers escalation placement BY DESIGN" — tick.test.js:329 catches it incidentally.',
  },
];

const confirmed = [
  { id: 'V1', title: 'TS-9 relabelling is HONEST — verified by executing the mutation the old comment described',
    note: 'M8 hoisted the --stage0 --execute escalation above the refusal return, exactly as the retracted caveat described. TS-3 and TS-9 passed UNCHANGED; only TS-9b failed. The corrected comment (:92-105) is accurate, including its explanation (countActiveWorktrees reports zero worktrees in a tmp fixture, so watchdog.triggered is false and the branch is unreachable). The retraction was warranted and is now correctly recorded.' },
  { id: 'V2', title: 'The coverage map is ACCURATE on both positive claims',
    note: 'M7 proves TS-3 detects the census moving back below the early return (real discriminating power, as claimed). M8 proves TS-9b detects the escalation hoist (real discriminating power, as claimed). The map s negative claim — that TS-3 and TS-9 are blind to the hoist — is also confirmed. I could not falsify any part of it beyond the G3 nit.' },
  { id: 'V3', title: 'TS-11 strengthening is REAL — the swap I flagged in the prior review is now caught',
    note: 'M9 (rogue added + sanctioned copy renamed away, count still 2) fails TS-11; the old defs.length <= 2 bound scores exactly 2 on that configuration and would have admitted it. M10 confirms a legitimate consolidation to one definition still passes, so the stated design goal is met and not merely asserted. M11 confirms the anchor stops "zero definitions" passing. All three behaviours executed, not reasoned about.' },
  { id: 'V4', title: 'The 5 new identity tests are mutually non-redundant — every one has a UNIQUE killer',
    note: 'M5 kills only the positive control; M3 kills only the fake-repo test (+ the message test); M2 kills only the fail-closed test; M4 kills only the create-path test. Directly answering the brief: "REFUSES a directory git cannot identify" and "REFUSES a fake repo" do NOT collapse — M2 separates them in one direction and M3 in the other. The negative arm varies ABSENCE (exists:false), a genuinely different axis from identity, and M4 proves it is load-bearing rather than inherited.' },
  { id: 'V5', title: 'The 5 fixture updates are CONTRACT updates, not silencing — checked hard, as instructed, and the claim holds',
    note: 'Each updated file was mutation-probed for the property it owned BEFORE the fixture change. M15: source-tree-self-protection still detects a removed marker re-assert. M16: spawn-source-ensure still detects a rethrow on failed refresh. M17: dropping merge --ff-only reddens 6 tests across spawn-source-ensure (4), spawn-source-flag-on-seam (1, the ORDER test) and reaper-source-tree (1, TS-1b). Specifically checked the two riskiest choices: (a) mocks answering the probe as a genuine linked worktree did NOT neuter anything — every original property still bites; (b) deliberately NOT logging the probe in spawn-source-flag-on-seam did not blind its ORDER assertion. The count assertion at spawn-source-ensure:122 is backstopped by the CONTENT assertion at :115, so the 2 -> 4 count change did not weaken it into a bare number.' },
  { id: 'V6', title: 'No exclude-list trap — all 8 touched test files actually EXECUTE',
    note: 'Verified positively via `npx vitest list --project unit --filesOnly`: all 8 resolve in the unit project (source-tree-identity, reaper-starvation, spawn-source-ensure, spawn-source-flag-on-seam, reaper-gauge-antigaming, reaper-source-tree, refusal-watchdog-split, source-tree-self-protection). Cross-checked tests/quarantine-manifest.json (162 entries) — none of the 8 is quarantined. Note the new file sits in tests/unit/fleet/, which is not swept by SHARED_EXCLUDE. Independently corroborated by every mutation above producing a named failure in the expected file, which is proof of execution rather than of mere collection.' },
  { id: 'V7', title: 'Suite health',
    note: 'npx vitest run --project unit over tests/unit/worktree-reaper/ tests/unit/coordinator/ tests/unit/fleet/ tests/unit/governance/: 314 files passed, 1 skipped; 4180 tests passed, 12 skipped, 0 failed, 30s. Matches the commit message s "4180 tests pass" exactly. Scoped per the brief (a bare tests/unit/ run times out). Working tree confirmed clean at 619640cb83a after every mutation was reverted (git status empty, verified after each).' },
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 82,
  summary:
    'EXEC TESTING re-review at 619640cb83a, superseding row 78628870 (CONDITIONAL_PASS 70). Brief was to refute. I could not: every claim put to me is TRUE, and I verified each by executing a mutation rather than reading the diff. '
    + 'The TS-9 relabelling is honest — I hoisted the escalation exactly as the retracted comment described and TS-3/TS-9 passed unchanged while only TS-9b failed, so the coverage map is accurate on both its positive claims and its negative one. '
    + 'TS-11 genuinely now catches the swap I flagged (rogue added + sanctioned copy renamed, count still 2 — the old <=2 bound would have admitted it), while a legitimate consolidation to one definition still passes and "zero definitions" is blocked by the anchor. '
    + 'All five new identity tests have a unique killer, so none is redundant; the two refusal tests specifically do NOT collapse (fail-open kills only the unidentifiable case, the too-weak any-git-repo check kills only the fake-repo case); and the negative arm varies absence rather than inheriting the identity axis. '
    + 'The five fixture updates are contract updates and not silencing — I mutation-probed each file for the property it owned before the change and all still bite. All eight touched files execute in the unit project; none is quarantined. 4180 tests pass. '
    + 'CONDITIONAL rather than PASS for two NEW gaps I found, both in the security fixes added by d3cf95f8e85, both coverage-only (the shipped code is correct in each case). G1: the S2 identity probe s POSITION is pinned by nothing — moving it to after fetch and merge --ff-only have already run inside the untrusted directory passes all 3432 tests, because every test asserts the verdict and none asserts that git did not already execute there. That ordering IS the S2 threat model. '
    + 'G2: the S3 "distinct kind so neither can suppress the other" property is asserted only on detectReaperStarvation s return value; hardcoding the emitter s dedup key, or cutting the kind pass-through in runReaperStarvationSurfacing, each passes all 748 coordinator tests — and grep confirms the emitter and the surfacing function have no test references at all. Two green ends, unverified wire, on the exact remediation the test s own name claims to protect. '
    + 'Both are cheap to close (one assertion each) and neither blocks EXEC-TO-PLAN on correctness grounds; they are named as conditions because this SD s subject matter is guards that cannot fire, and each new guard shipped without a test that would notice it being disarmed.',
  findings: [...gaps, ...confirmed],
  conditions: [
    { action: 'G1 — In tests/unit/fleet/source-tree-identity.test.js, assert in the two refusal cases that NO non-probe git call is made against the candidate directory before the throw (capture argv, expect zero fetch/merge calls). Kills the count-neutral reorder mutation M6b, which today passes all 3432 tests while defeating the entire S2 threat model.', priority: 'high', blocking: false },
    { action: 'G2 — Add a test driving runReaperStarvationSurfacing (or emitReaperStarvationAlert) with a stub supabase that records the dedup query, asserting payload->>kind is reaper_census_blind_alert for an unknown pool and reaper_starvation_alert for a starving one. Kills M12 and M13, both of which today pass all 748 coordinator tests while letting one alarm kind silence the other.', priority: 'high', blocking: false },
    { action: 'G3 (optional) — Soften refusal-watchdog-split.test.js:27 from "the ONLY test that does" to "the only test that covers escalation placement by design": tick.test.js:329 also reddens under the hoist, incidentally.', priority: 'low', blocking: false },
  ],
  justification:
    'CONDITIONAL_PASS 82, up from 70. Every item raised in the prior review was closed and independently re-verified by executed mutation, not by inspection: the vacuous TS-3 concern is resolved (TS-3 has real discriminating power against the census regression, proven by M7), the TS-9 mislabelling is retracted accurately (proven by M8, which reproduces exactly the pass/fail split the corrected comment predicts), and the TS-11 swap hole is genuinely closed without breaking the consolidation allowance (M9/M10/M11). The fixture updates survive hard scrutiny — I probed each file for its pre-existing property and all still bite, so the "contract update, not silencing" claim is measured rather than asserted. '
    + 'Withheld from full PASS because the two security fixes added in this cycle each ship with tests that cannot detect the fix being disarmed in its load-bearing dimension. G1 and G2 are not stylistic: in both cases I executed a mutation that preserves every existing assertion while removing the actual protection, and the entire relevant suite stayed green. That is the precise defect class this SD exists to eliminate, occurring one layer up in the SD s own new tests. Both are three-line fixes and neither indicates a defect in shipped behaviour, so they are non-blocking conditions rather than a FAIL.',
  metadata: {
    review_mode: 'refutation',
    supersedes_row: 78628870,
    prior_verdict: 'CONDITIONAL_PASS 70',
    head_reviewed: '619640cb83ab9bcb7571f74c0091ae1f0fe91eaf',
    branch: 'feat/SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001',
    mutations_executed: mutations.length,
    mutations_that_found_a_gap: ['M6b', 'M12', 'M13'],
    invalid_mutations_detected_and_redone: ['M14 (first attempt produced a non-loading module: 6 failed FILES, 0 failed assertions — re-run from a heredoc)'],
    claims_put_to_me: {
      'coverage map accurate (TS-3 detects census regression)': 'CONFIRMED via M7',
      'coverage map accurate (TS-9b detects escalation hoist)': 'CONFIRMED via M8',
      'TS-3/TS-9 blind to the escalation hoist': 'CONFIRMED via M8',
      'TS-11 catches the swap': 'CONFIRMED via M9',
      'TS-11 still allows consolidation to one': 'CONFIRMED via M10',
      '5 identity tests fail when the guard is disabled': 'CONFIRMED via M1 (exactly 3 refusal tests, as stated)',
      'negative arm varies a different axis': 'CONFIRMED via M4',
      'the two refusal tests do not collapse': 'CONFIRMED via M2 and M3 (disjoint unique killers)',
      'fixture updates are contract updates not silencing': 'CONFIRMED via M15, M16, M17',
      'no new test file is excluded from the vitest run': 'CONFIRMED via vitest list --filesOnly + quarantine-manifest cross-check',
    },
    suite_run: { command: 'npx vitest run --project unit tests/unit/worktree-reaper/ tests/unit/coordinator/ tests/unit/fleet/ tests/unit/governance/', files: '314 passed, 1 skipped', tests: '4180 passed, 12 skipped, 0 failed', duration_s: 30 },
    working_tree_clean_after_all_mutations: true,
    files_reviewed: [
      'tests/unit/fleet/source-tree-identity.test.js',
      'tests/unit/coordinator/reaper-starvation.test.js',
      'tests/unit/fleet/spawn-source-ensure.test.js',
      'tests/unit/fleet/spawn-source-flag-on-seam.test.js',
      'tests/unit/worktree-reaper/reaper-source-tree.test.js',
      'tests/unit/worktree-reaper/source-tree-self-protection.test.js',
      'tests/unit/worktree-reaper/refusal-watchdog-split.test.js',
      'tests/unit/governance/reaper-gauge-antigaming.test.js',
      'lib/fleet/source-tree-refresh.cjs',
      'lib/coordinator/coordination-events.cjs',
      'scripts/fleet/worktree-reaper-tick.cjs',
      'vitest.config.js',
      'tests/quarantine-manifest.json',
    ],
  },
};

const NL = String.fromCharCode(10);
const HR = '-'.repeat(72);
results.detailed_analysis = [
  'SUMMARY', '=======', results.summary, '',
  'MUTATIONS EXECUTED (every claim below was measured, not inspected)',
  '='.repeat(72), '',
  mutations.map((m) => (
    m.id + ' — ' + m.target + NL +
    'CHANGE: ' + m.change + NL +
    'KILLED: ' + (m.killed.length ? m.killed.join('; ') : 'NOTHING — no test detected this') + NL +
    'SURVIVED: ' + m.survived.join('; ') + NL +
    'VERDICT: ' + m.verdict
  )).join(NL + NL + HR + NL + NL),
  NL + HR, '',
  'GAPS FOUND (weak/unpinned — file:line and the exact regression each fails to detect)',
  '='.repeat(72), '',
  gaps.map((g) => (
    '[' + String(g.severity).toUpperCase() + '] ' + g.id + ' — ' + g.title + NL +
    'KIND: ' + g.kind + NL +
    'LOCATION: ' + g.location + NL +
    'FINDING: ' + g.note + NL +
    'RECOMMENDATION: ' + g.recommendation
  )).join(NL + NL + HR + NL + NL),
  NL + HR, '',
  'CLAIMS PUT TO ME, AND WHETHER I COULD REFUTE THEM',
  '='.repeat(72), '',
  confirmed.map((c) => '[CONFIRMED] ' + c.id + ' — ' + c.title + NL + c.note).join(NL + NL + HR + NL + NL),
].join(NL);

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: CODE, targetApplication: 'EHG_Engineer', fallback: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(CODE, SD_ID, { name: 'QA Engineering Director' }, results, { sdKey: SD_KEY, phase: PHASE });
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
console.log('VERDICT=' + results.verdict + ' CONFIDENCE=' + results.confidence);
