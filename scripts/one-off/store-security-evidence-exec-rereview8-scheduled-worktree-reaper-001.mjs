/**
 * EXEC-phase SECURITY **RE-REVIEW #8** for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001
 * (sd_id 23c2a2d4-89af-4885-b87b-7a5b3c4ded1d), at COMMITTED HEAD 5a7082f7e7e.
 *
 * FIRST PASS VERDICT OF THIS REVIEW. Every blocking finding raised across rounds 5-7 is closed and
 * re-measured at the committed HEAD: CI-1, CI-2, FORGE-4, SCRUB-1, SCRUB-2, IDLE-2-R, IDLE-3-CODE,
 * IDLE-3-ORDER, OVERRIDE-1, FS-R1-AVAIL. Remaining items are availability/advisory, not security.
 *
 * SCOPE: the COMMITTED tree at 5a7082f7e7e. lib/fleet/source-tree-refresh.cjs and
 * tests/unit/fleet/source-tree-identity-realgit.test.js are UNCOMMITTED-MODIFIED (an in-flight
 * STARVE-1 rebuild). That work is NOT covered by this verdict and is recorded separately, with two
 * observations and a red-test diagnosis, under metadata.in_flight_snapshot.
 *
 * TR-1/TR-4 honoured. No reaping against the live pool. Shared-root contact was read-only
 * (`git config --get`, `git ls-remote`, `git status --porcelain`); no fetch, no ref writes, no
 * `git checkout`. Scratch repos under the session temp dir only.
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = '23c2a2d4-89af-4885-b87b-7a5b3c4ded1d';
const SD_KEY = 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001';
const CODE = 'SECURITY';
const PHASE = 'EXEC';
const HEAD = '5a7082f7e7e';

const findings = [
  {
    id: 'STARVE-1 (CARRIED, non-blocking — availability, not security)',
    severity: 'medium',
    title:
      'At the COMMITTED HEAD a single stray gitignored artifact still starves the reaper. The fix exists but is '
      + 'uncommitted, and this finding was absent from the lead\'s own remaining-items list',
    location:
      'lib/fleet/source-tree-refresh.cjs assertSourceTreeContentClean (committed form: refuse, no rebuild); '
      + 'cascade at scripts/fleet/worktree-reaper-tick.cjs:241-270 -> :333',
    note:
      'RE-MEASURED at ' + HEAD + ', two-sided: clean -> OK {refreshed:true}; one `debug.log` -> REFUSED '
      + 'SOURCE_TREE_CONTENT_UNVERIFIED; remove it -> OK again. Unchanged from row 7149a67e. '
      + 'FLAGGING THE PROCESS POINT, not just the defect: the lead\'s round-8 message listed the remaining items '
      + 'as ALLOWLIST-RESIDUAL, TOCTOU-RESIDUAL, R5-2 and NI-R2. STARVE-1 appears in none of them, so at the time '
      + 'of writing it was neither fixed-and-recorded nor deferred-and-recorded — it had simply dropped out of '
      + 'the ledger. (The in-flight working tree does implement the fix, so the intent was there; the tracking '
      + 'was not.) A finding that leaves the list without a decision is the failure mode this SD family keeps '
      + 'rediscovering.',
    consequence:
      'The refusal cascades to repoRoot, the currency guard refuses the chronically-behind shared root, and the '
      + 'tick reaches refused_stale_tree — the pre-SD starvation, through a door this SD opened. Loud rather than '
      + 'silent (the streak alarm fires at 6), and fail-closed, so there is no security loss. That is why it is '
      + 'medium and non-blocking.',
    recommendation:
      'Land the in-flight rebuild (see metadata.in_flight_snapshot for two observations and the red-test '
      + 'diagnosis), or record STARVE-1 as an accepted deferral with the alarm cited as the mitigation. Either is '
      + 'fine; silently leaving the list is not.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'TOCTOU-2 (CARRIED — and the lead\'s ledger still carries my RETRACTED wording)',
    severity: 'medium',
    title:
      'The remaining-items list records this as a "bounded ms window", which is the characterisation I measured '
      + 'and retracted in row 7149a67e',
    location:
      'content check inside ensureSourceTreeWorktree -> scripts/fleet/worktree-reaper-tick.cjs:306 existsSync, '
      + ':333 enforceTreeCurrency, :374/:419 countActiveWorktrees, :445 spawn',
    note:
      'MEASURED in round 7 with process.hrtime over the real call sequence: existsSync 0.1 ms + '
      + 'enforceTreeCurrency 146.4 ms (it performs its OWN `git fetch` at tree-currency.cjs:121) + '
      + 'countActiveWorktrees 101.2 ms = 247.6 ms, against a LOCAL bare remote. Production fetches over the '
      + 'network with a 15 s timeout budget and enumerates 28 worktrees rather than 1, so the real window is '
      + 'hundreds of milliseconds to seconds. '
      + 'I originally wrote "bounded to milliseconds" in row 8de81e2b and corrected it in row 7149a67e after '
      + 'measuring. The remaining-items list carries the ORIGINAL wording. A retracted characterisation that '
      + 'survives in the ledger is worse than one never made, because it now has two rounds of apparent '
      + 'corroboration behind it.',
    consequence:
      'If the residual is accepted on the basis of "milliseconds", it is being accepted against a number that is '
      + 'off by roughly three orders of magnitude and that is network-dependent rather than CPU-dependent.',
    recommendation:
      'Update the ledger entry to the measured figure, then decide. The cheap fix stands: re-assert content (or '
      + 'compare `git hash-object scripts/worktree-reaper.mjs` to `git rev-parse HEAD:scripts/...`) immediately '
      + 'before the spawn at :445 — one ~50-100 ms git call on an hourly path, shrinking the window to spawn '
      + 'latency.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'MARKER-RESIDUAL / ALLOWLIST-RESIDUAL (advisory, unchanged)',
    severity: 'low',
    title: 'No execution path; keep the allowlist at exactly one entry',
    location: 'lib/worktree-reaper/reap-protected-marker.js:58-64 and :79-83',
    note:
      'Unchanged from row 7149a67e. readReapProtectedMarker is readFileSync + JSON.parse into an evidence field; '
      + 'hasReapProtectedMarker is existsSync only; output is JSON.stringified, so no injection. Residuals: '
      + 'unbounded read size, and the content-independence of hasReapProtectedMarker (by design — it is an '
      + 'opt-out) means the one file freely writable into the source tree is also the file that makes any '
      + 'worktree immortal.',
    consequence: 'Nothing today; both become real if the marker gains a non-display consumer.',
    recommendation: 'Allowlist stays at one entry; validate parsed shape and bound the read if that ever changes.',
    priority: 'low',
    blocking: false,
  },
];

const confirmedSound = [
  {
    id: 'SCRUB-2',
    title: 'CLOSED — measured two-sided WITH a positive control at ' + HEAD,
    note:
      'tree-currency.cjs defaultRunner now passes env: scrubGitEnv(process.env). Called enforceTreeCurrency in '
      + 'its exact production shape (no runner injected) against a genuine source tree: WITH '
      + 'GIT_CONFIG_COUNT/core.fsmonitor injected -> reason="current" and the injected command did NOT run; '
      + 'WITHOUT injection -> reason="current" as well. Both halves matter — the first proves the guard fires, '
      + 'the second proves the scrub did not break the check it was added to. Fixing the DEFAULT was the right '
      + 'call: it also covers spawn-control.js:642, which injects no runner either.',
  },
  {
    id: 'THE FETCH-BREAKING REGRESSION (independently confirmed and now reverted)',
    title: 'CONFIRMED on this fleet — the revert is correct, and the current scrub is auth-safe',
    note:
      'Verified the premise independently rather than taking it on report. On this host '
      + '`git config --system --get credential.helper` = "manager", and the GLOBAL config carries '
      + 'credential.https://github.com.helper pointing at the gh CLI — exactly the split described. Then measured '
      + 'the EFFECT read-only (`git ls-remote --heads origin refs/heads/main`, no ref writes): UNSCRUBBED exit=0 '
      + 'in 311 ms, SCRUBBED exit=0 in 327 ms, identical SHA. So credential resolution survives the CURRENT scrub, '
      + 'and the reverted "positive hardening" (GIT_CONFIG_NOSYSTEM=1 + GIT_CONFIG_GLOBAL at a nonexistent file) '
      + 'is genuinely gone — GIT_CONFIG_GLOBAL/SYSTEM/NOSYSTEM appear only in the DELETE list now, never set. '
      + 'This is the right shape: strip what an attacker may inject, never impose config of our own on a path '
      + 'that must authenticate.',
  },
  {
    id: 'IDLE-2-R',
    title: 'CLOSED — verified on the SAFETY axis, and the fix is correctly scoped in both directions',
    note:
      'Re-ran the matrix. The original case (path=.reaper-source, key="SD-GONE-999") now returns '
      + 'source_tree_protected on BOTH routes. Then checked the axis that actually matters — matched===true, i.e. '
      + '"would this be reaped" — across key values SD-GONE-999 / SD-REAL-001 / "" / undefined / "anything": '
      + 'orphan.matched=false and idle.matched=false in every case. No value of wt.key makes the source tree '
      + 'reapable. '
      + 'AND THE CONVERSE, which your fix gets right and I want on the record: wt={path:"C:/repo/ordinary-wt", '
      + 'key:".reaper-source"} does NOT gain protection — because the predicate keys on the PATH, a caller cannot '
      + 'spoof immortality for an arbitrary worktree by supplying the key either. '
      + '(One row of my matrix showed key="SD-REAL-001" giving reason sdkey_found vs source_tree_protected. That '
      + 'is my comparator being stricter than the property — both are matched:false, neither reaps. Not a '
      + 'finding.)',
  },
  {
    id: 'IDLE-3-CODE + IDLE-3-ORDER',
    title: 'BOTH CLOSED — and the ordering is now genuinely observable, which is what closes the second one',
    note:
      'SOURCE_TREE_BASENAME_ERROR = \'SOURCE_TREE_OVERRIDE_RENAMED\'. Measured through resolveSourceTreeDir: a '
      + 'renamed override -> SOURCE_TREE_OVERRIDE_RENAMED (own code, so spawn-control degrades instead of taking '
      + 'the fleet down); a path that is BOTH mis-sited and renamed -> SPAWN_SOURCE_SITED_IN_EXEMPT_PATH (siting '
      + 'wins, the must-stay-fatal class, which is the precedence you intended); a valid relocation -> OK. '
      + 'IDLE-3-ORDER was only ever "the precedence is correct but no consumer can observe it" — distinct codes '
      + 'make it observable, so it closes as a consequence of this fix rather than needing one of its own.',
  },
  {
    id: 'CI-1 / CI-2 / FORGE-4 / SCRUB-1 / OVERRIDE-1 / FS-R1-AVAIL / NI-R2',
    title: 'ALL CLOSED — carried forward from rounds 5-7 with no regression at ' + HEAD,
    note:
      'CI-1, CI-2 and FORGE-4 were re-attacked at d497c117500 with controls green on both sides and the mechanism '
      + 're-confirmed at ' + HEAD + '. SCRUB-1 strips the /^GIT_CONFIG_/ family by prefix (a fixed-name list '
      + 'structurally cannot cover an indexed family). OVERRIDE-1 retired via IDLE-3\'s basename constraint. '
      + 'FS-R1-AVAIL reverted with the correct reasoning (the .worktrees/ exemption is pre-existing policy, not '
      + 'something to tighten from inside an error handler). NI-R2\'s flag now records that the wall-clock gauge '
      + 'cannot live inside tick(), because tick() returns at :288 before readState at :291.',
  },
];

const results = {
  verdict: 'PASS',
  confidence: 94,
  score: 92,
  status: 'PASS with conditions — no security findings remain; two medium AVAILABILITY items open',
  summary:
    'PASS at committed HEAD ' + HEAD + '. Every blocking finding raised across rounds 5-7 is closed and '
    + 're-measured, not carried by inference: CI-1, CI-2, FORGE-4, SCRUB-1, SCRUB-2, IDLE-2-R, IDLE-3-CODE, '
    + 'IDLE-3-ORDER, OVERRIDE-1, FS-R1-AVAIL, NI-R2. '
    + 'SCRUB-2 is closed two-sided WITH a positive control — injection set: the command does not run; injection '
    + 'unset: the check still returns "current". Both halves were necessary, because the failure mode of a scrub '
    + 'fix is breaking the thing it protects. '
    + 'I INDEPENDENTLY CONFIRMED THE FETCH REGRESSION AND ITS REVERT rather than accepting the report: on this '
    + 'host credential.helper=manager really is in the SYSTEM config with the gh helper in GLOBAL, and '
    + '`git ls-remote` through the CURRENT scrub returns exit=0 with the identical SHA (311 ms unscrubbed vs '
    + '327 ms scrubbed). The reverted hardening is gone — GIT_CONFIG_GLOBAL/SYSTEM/NOSYSTEM appear only in the '
    + 'delete list, never set. Stripping what an attacker may inject while never imposing config of our own is '
    + 'the right shape for a path that must authenticate. '
    + 'IDLE-2-R is closed on the axis that matters: no value of wt.key makes the source tree reapable via either '
    + 'route, AND the converse holds — a caller cannot spoof protection for an ordinary worktree by supplying '
    + 'key=".reaper-source", because the predicate keys on the path. IDLE-3-CODE gives the rename its own code, '
    + 'and that is also what closes IDLE-3-ORDER: distinct codes make the precedence observable, which was the '
    + 'entire content of that finding. '
    + 'TWO MEDIUM ITEMS REMAIN, BOTH AVAILABILITY RATHER THAN SECURITY, AND BOTH ARE LEDGER PROBLEMS AS MUCH AS '
    + 'CODE PROBLEMS. STARVE-1 still reproduces at the committed HEAD (one stray *.log refuses the tree and '
    + 'cascades to the pre-SD starvation) and was absent from the remaining-items list — neither fixed-and-'
    + 'recorded nor deferred-and-recorded. TOCTOU-2 is listed as a "bounded ms window", which is the wording I '
    + 'measured at 247.6 ms and RETRACTED in row 7149a67e; a retracted characterisation surviving in the ledger '
    + 'is worse than one never made, because it now looks corroborated. Neither blocks: both are fail-closed, '
    + 'and STARVE-1 is covered by the streak alarm. '
    + 'NOT COVERED BY THIS VERDICT: lib/fleet/source-tree-refresh.cjs and the realgit suite are '
    + 'uncommitted-modified with an in-flight STARVE-1 rebuild. I reviewed it anyway because it introduces a '
    + 'DELETE on the destructive path at my recommendation — the scoping is sound and removeWorktreeViaGit really '
    + 'does call preUnlinkWorktreeNodeModules before the force-remove, so the junction-safety claim is true and '
    + 'not merely asserted. Two low observations and a red-test diagnosis are in metadata.in_flight_snapshot; the '
    + 'suite is RED there as of my last run. Score 92.',
  conditions: [
    'Land or explicitly defer STARVE-1, and put it back in the ledger either way. If landing the in-flight '
    + 'rebuild, see metadata.in_flight_snapshot: the realgit fixture writes debug.log while its committed '
    + '.gitignore contains only node_modules/, so the artifact is untracked-not-ignored and the test asserts a '
    + 'property its fixture does not create.',
    'Correct the TOCTOU-2 ledger entry from "bounded ms window" to the measured 247.6 ms (local remote; '
    + 'network-bound in production) before accepting it as a residual.',
    'ADVISORY, unchanged: keep the content-check allowlist at exactly one entry.',
    'IN-FLIGHT ONLY (not part of this verdict): rebuildSourceTree passes { force: true } to '
    + 'removeWorktreeViaGit, which does not accept a `force` option — it is a no-op, and removal is already '
    + 'unconditionally --force. It also ignores the return value, so a residency-blocked or guard-skipped removal '
    + '({ok:false, skipped:true}) reads as success; it is safe only because the subsequent `worktree add` then '
    + 'fails and the code falls through to the original refusal.',
  ],
  metadata: {
    review_round: 8,
    reviewed_head: HEAD,
    prior_rows: ['199b97cf (FAIL/62)', '8de81e2b (FAIL/84)', '7149a67e (FAIL/88)'],
    closed_and_reverified: [
      'CI-1', 'CI-2', 'FORGE-4', 'SCRUB-1', 'SCRUB-2', 'IDLE-2-R', 'IDLE-3-CODE', 'IDLE-3-ORDER',
      'OVERRIDE-1', 'FS-R1-AVAIL', 'NI-R2', 'fetch-breaking hardening (reverted)',
    ],
    open_non_blocking: ['STARVE-1', 'TOCTOU-2', 'MARKER/ALLOWLIST-RESIDUAL'],
    open_blocking: [],
    method:
      'Real git 2.50.1 in scratch repos under the session temp dir; production functions driven through their '
      + 'production shapes (enforceTreeCurrency with NO runner injected, ensureSourceTreeWorktree via '
      + 'makeScrubbedGitRunner). Every attack paired with a control in the same session. The credential-helper '
      + 'claim was verified by EFFECT (`git ls-remote`) against the real origin, read-only, not by reading config.',
    measurements: {
      scrub2_with_injection: 'currency="current", injected command did NOT run — CLOSED',
      scrub2_without_injection: 'currency="current" — positive control, the scrub did not break the check',
      credential_helper_system: 'manager (SYSTEM config); gh CLI helper in GLOBAL — the split as described',
      ls_remote_unscrubbed: 'exit=0, 311 ms, SHA 5a93a384cba5',
      ls_remote_scrubbed: 'exit=0, 327 ms, identical SHA — auth survives the current scrub',
      idle2r_safety_axis: 'key in {SD-GONE-999, SD-REAL-001, "", undefined, "anything"} -> orphan.matched=false AND idle.matched=false in all five',
      idle2r_converse: 'path=ordinary-wt with key=".reaper-source" -> NOT protected; protection cannot be spoofed via key',
      idle3_renamed_override: 'SOURCE_TREE_OVERRIDE_RENAMED (own code)',
      idle3_missited_and_renamed: 'SPAWN_SOURCE_SITED_IN_EXEMPT_PATH — siting takes precedence, now observably',
      idle3_valid_relocation: 'OK',
      starve1_at_committed_head: 'clean OK / one debug.log REFUSED / clean again OK — still reproduces',
      junction_safety: 'removeWorktreeViaGit calls preUnlinkWorktreeNodeModules(wtPath) before `git worktree remove --force` — claim verified, not assumed',
    },
    in_flight_snapshot: {
      disclaimer:
        'NOT PART OF THIS VERDICT. lib/fleet/source-tree-refresh.cjs and '
        + 'tests/unit/fleet/source-tree-identity-realgit.test.js were uncommitted-modified during this review, '
        + 'implementing the STARVE-1 rebuild. Reviewed anyway because it introduces a DELETE on the destructive '
        + 'path at my own recommendation, so I own the risk of having recommended it.',
      scoping_verdict:
        'SOUND. rebuildSourceTree is reachable only after the identity guard at :528 has proven the directory IS '
        + 'a linked worktree of this repo, at a path resolveSourceTreeDir has already constrained (not under '
        + '.worktrees/, basename === dirname when overridden). So the delete target is provably the source tree '
        + 'and this cannot become a general delete primitive. Removal goes through removeWorktreeViaGit, which I '
        + 'verified DOES call preUnlinkWorktreeNodeModules before the force-remove — so the junction hazard '
        + '(`git worktree remove` following a node_modules junction and destroying the shared target) is really '
        + 'handled. It is followed by `worktree prune`, re-creates, re-marks, and RE-VERIFIES, refusing if the '
        + 'rebuilt tree is still unclean. Fails soft to the original refusal throughout.',
      observations: [
        '{ force: true } is passed to removeWorktreeViaGit, whose signature destructures only '
        + '{allowFail, guard, liveOwner, logger}. It is a no-op. Behaviour is still correct because the removal '
        + 'is unconditionally --force, but the option reads as though it controls something it does not.',
        'The return value is discarded. removeWorktreeViaGit returns {ok:false, skipped:true, blocked:true} '
        + 'rather than throwing on a cwd-residency block or a guard skip, so a SKIPPED removal is '
        + 'indistinguishable from a successful one at this call site. It is safe only by consequence: the '
        + 'subsequent `worktree add` fails on the still-present directory and the code falls through to the '
        + 'original refusal. Worth checking ok/skipped explicitly rather than relying on that.',
      ],
      red_test_diagnosis:
        'The suite is RED as of my last run. "STARVE-1: a stray GITIGNORED artifact rebuilds instead of starving '
        + 'the reaper" fails with: expected \'?? debug.log\' not to match /debug\\.log/. The fixture writes '
        + 'debug.log, but the .gitignore it commits to origin/main contains only "node_modules/" — so debug.log '
        + 'is UNTRACKED, not IGNORED, and the test asserts a property its own fixture does not create. Add *.log '
        + '(and ideally .env) to the fixture .gitignore. This is the third instance of the fixture-cannot-model-'
        + 'production class in this SD, after origin/main and the credential helper. A CI-1 failure also appeared '
        + 'in an earlier run at 9309 ms but not in the last one; the file was being edited between my runs, so I '
        + 'am reporting that one as observed-once rather than confirmed.',
    },
    files_reviewed: [
      'lib/fleet/tree-currency.cjs',
      'lib/fleet/source-tree-refresh.cjs',
      'lib/fleet/spawn-control.js',
      'lib/worktree-manager.js',
      'lib/worktree-reaper/detectors.js',
      'lib/worktree-reaper/reap-protected-marker.js',
      'scripts/fleet/worktree-reaper-tick.cjs',
      'tests/unit/fleet/source-tree-identity-realgit.test.js',
    ],
    safety:
      'TR-1/TR-4 honoured. No reaping against the live pool, no allowSelfHeal on the shared root, no `git '
      + 'checkout` and no writes in the shared root — contact was read-only `git config --get`, `git ls-remote` '
      + '(no ref writes) and `git status --porcelain`. The lead\'s concurrent uncommitted edits were never '
      + 'modified. All scratch repos under the session temp dir.',
  },
};

const NL = String.fromCharCode(10);
const HR = '-'.repeat(72);
results.detailed_analysis = [
  'VERDICT: ' + results.verdict + '  |  SCORE: ' + results.score + '/100  |  STATUS: ' + results.status
    + '  |  CONFIDENCE: ' + results.confidence,
  'COMMITTED HEAD REVIEWED: ' + HEAD,
  '',
  'SUMMARY', '=======', results.summary, '',
  'OPEN ITEMS (none blocking)',
  '='.repeat(72), '',
  findings.map((f) => (
    '[' + String(f.severity).toUpperCase() + ']' + (f.blocking ? ' [BLOCKING]' : '') + ' ' + f.id + ' - ' + f.title + NL +
    'LOCATION: ' + f.location + NL +
    'FINDING: ' + f.note + NL +
    'CONSEQUENCE: ' + f.consequence + NL +
    'RECOMMENDATION: ' + f.recommendation
  )).join(NL + NL + HR + NL + NL),
  NL + HR, '',
  'CLAIMS ATTACKED AND CONFIRMED CLOSED / SOUND',
  '='.repeat(72), '',
  confirmedSound.map((c) => '[CONFIRMED] ' + c.id + ' - ' + c.title + NL + c.note).join(NL + NL + HR + NL + NL),
  NL + HR, '',
  'CONDITIONS',
  '='.repeat(72), '',
  results.conditions.map((c, i) => (i + 1) + '. ' + c).join(NL + NL),
].join(NL);

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: CODE, targetApplication: 'EHG_Engineer', fallback: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(CODE, SD_ID, { name: 'Chief Security Architect' }, results, { sdKey: SD_KEY, phase: PHASE });
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('VERDICT=' + results.verdict + ' CONFIDENCE=' + results.confidence + ' SCORE=' + results.score);
