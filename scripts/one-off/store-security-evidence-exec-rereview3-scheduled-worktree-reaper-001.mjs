/**
 * EXEC-phase SECURITY **RE-REVIEW #3** for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001
 * (sd_id 23c2a2d4-89af-4885-b87b-7a5b3c4ded1d), after 803ed185e3e / a0ea71c4300.
 *
 * Brief was explicitly adversarial: REFUTE the claim that all three conditions are closed; do not
 * confirm by default. Every verdict below is MEASURED — real git 2.50.1 against disposable scratch
 * repositories, the real modules loaded, the real tick() driven over a scratch state file — not
 * inferred from reading the diff.
 *
 * TR-1/TR-4 honoured: no destructive reap against the live pool, allowSelfHeal never true on the
 * shared root, no `git checkout` in the shared root, no mutation of the live repo. The only
 * commands aimed at the live repo were read-only `git rev-parse` probes.
 *
 * `summary`/`findings` are not mapped columns; folded into detailed_analysis (mapped, uncapped).
 * metadata.repo_path/executed_from_cwd via the canonical resolveSubAgentRepo/
 * applySubAgentRepoVerdict pair — no top-level repo_path/local_path columns on this table.
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = '23c2a2d4-89af-4885-b87b-7a5b3c4ded1d';
const SD_KEY = 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001';
const CODE = 'SECURITY';
const PHASE = 'EXEC';

const findings = [
  {
    id: 'S2-R2',
    severity: 'critical',
    title:
      'S2-R IS NOT CLOSED. Both checks are defeated together by ONE planted `.git` FILE containing '
      + '`gitdir: <repoRoot>/.git` — a strictly LOWER capability bar than the `git init` attack check 1 was '
      + 'written against, and the same bar as the bare-mkdir attack check 2 was written against',
    note:
      'lib/fleet/source-tree-refresh.cjs:192-222 (isLinkedWorktreeOf), consumed at :231. The claim under test is '
      + '"check (a) same-repo AND check (b) is-the-worktree-root, neither alone sufficient". Both are satisfied '
      + 'simultaneously by a directory whose only git artifact is a plain text file named `.git` whose content is '
      + '"gitdir: <repoRoot>/.git". Git\'s .git-FILE handling sets the worktree to the directory CONTAINING the .git '
      + 'file, so --show-toplevel answers the candidate directory itself (check b passes), while --git-common-dir '
      + 'answers the pointed-at gitdir, which IS repoRoot\'s (check a passes). '
      + 'MEASURED, real git 2.50.1, disposable scratch repo: '
      + 'probe(dir,--git-common-dir)=".../victim/.git"; probe(repoRoot,--git-common-dir)=".../victim/.git" (equal); '
      + 'probe(dir,--show-toplevel)=".../victim/.reaper-source"; path.resolve(dir)=".../victim/.reaper-source" (equal). '
      + 'Capability required: one mkdir + one ~50-byte file write, no `git init`, no fake remote, no write access '
      + 'inside .git. `.reaper-source/` is gitignored, so the plant is invisible to `git status` — identical stealth '
      + 'to the S2-R plant. The new real-git suite does not express this shape: '
      + 'tests/unit/fleet/source-tree-identity-realgit.test.js covers exactly three cases (plain dir, genuine '
      + 'worktree, foreign repo) and all 23 tests across the four suites PASS over this defect — the same '
      + '"green tests over a defeated guard" the 803ed185e3e commit message says it learned from, recurring one '
      + 'iteration later against a wider but still incomplete pattern set.',
    consequence:
      'MEASURED END TO END in scripts run from the session scratchpad, against a scratch repo built to mirror the '
      + 'host (repoRoot behind origin/main): (1) ensureSourceTreeWorktree ACCEPTED the planted directory and returned '
      + '{created:false, refreshed:true} — it did NOT throw; (2) it wrote its reap-protection marker '
      + '(.reap-protected.json) INTO the attacker directory; (3) the attacker-supplied '
      + '<dir>/scripts/worktree-reaper.mjs survived the refresh intact; (4) the independent downstream '
      + 'enforceTreeCurrency(dir) ALSO PASSED, so the tick would spawn that script — and on this host '
      + 'WORKTREE_REAPER_EXECUTE=stage2 means it is spawned with --execute --stage2 --yes, i.e. filesystem writes '
      + 'across the pool, git worktree removal, and the service-role client. '
      + 'AND, WORSE THAN THE ORIGINAL S2-R AND WITH NO ATTACKER AT ALL: because the planted .git file points at '
      + 'repoRoot\'s OWN gitdir, the reuse `merge --ff-only origin/main` operates on the SHARED ROOT\'s refs. '
      + 'DIRECTLY OBSERVED: repoRoot HEAD moved 315f96ff -> 9452688a (v1 -> v2) while repoRoot\'s working file was '
      + 'left at v1, leaving the shared root reporting a phantom `M f.txt`. That is the uncoordinated shared-root '
      + 'mutation this module\'s own header (:24-26) calls load-bearing to avoid, and it now moves the root\'s actual '
      + 'branch ref rather than only a peer directory\'s. On this host the exploit precondition is CURRENTLY '
      + 'SATISFIED: neither .reaper-source nor .spawn-source exists yet (verified read-only), so the plant window '
      + 'is open right now, not only theoretically.',
    recommendation:
      'The discriminator must be "is this directory REGISTERED as a linked worktree", not "does git answer with our '
      + 'common dir and call this path the toplevel". MEASURED against all five shapes, two-sided: requiring '
      + '`git -C <dir> rev-parse --absolute-git-dir` to start with `<repoRoot common-dir>/worktrees/` REJECTS the '
      + '.git-file plant (answers "<victim>/.git") and the GIT_DIR/GIT_WORK_TREE plant (same), while ACCEPTING the '
      + 'genuine linked worktree (answers "<victim>/.git/worktrees/-reaper-source"). Add that as check (c); keep (a) '
      + 'and (b). Also scrub GIT_DIR/GIT_WORK_TREE/GIT_COMMON_DIR from the runner env for the probe AND for the '
      + 'subsequent fetch/merge. Pin all three attack shapes in the real-git suite, and pin the shared-root HEAD as '
      + 'UNCHANGED across a refused ensureSourceTreeWorktree call — the ref-movement consequence is the one no '
      + 'existing assertion covers.',
    priority: 'critical',
    blocking: true,
  },
  {
    id: 'S2-R3',
    severity: 'high',
    title:
      'A bare directory plus two ambient environment variables (GIT_DIR + GIT_WORK_TREE) defeats both checks — '
      + 'the probe inherits process.env, and env is already the declared untrusted channel for this module',
    note:
      'lib/fleet/source-tree-refresh.cjs:198 — the probe delegates to the caller\'s runner, and both production '
      + 'runners (scripts/fleet/worktree-reaper-tick.cjs:241-245 spawnSync, lib/fleet/spawn-control.js:592-593 '
      + 'execFileSync) inherit process.env wholesale. MEASURED: with GIT_DIR=<repoRoot>/.git and '
      + 'GIT_WORK_TREE=<candidate> set in the ambient environment, a directory created by bare `mkdir` — the exact '
      + 'shape check 2 was added to reject — was ACCEPTED ({created:false, refreshed:true}, marker written, payload '
      + 'intact). The module\'s own threat model already names process.env as untrusted ("the unauthenticated '
      + 'FLEET_REAPER_SOURCE_DIR / FLEET_SPAWN_SOURCE_DIR overrides", :179-181), so this vector is inside the '
      + 'declared boundary, and it needs no file write at all.',
    consequence:
      'Same as S2-R2 once accepted: refresh in the unverified directory, marker written into it, currency check '
      + 'passes, reaper executes from it with stage2 privileges. Lower capability than S2-R2 (no file write), and it '
      + 'additionally redirects the subsequent fetch/merge, since those commands inherit the same env.',
    recommendation:
      'Run every probe and every refresh command with GIT_DIR, GIT_WORK_TREE, GIT_COMMON_DIR, GIT_INDEX_FILE and '
      + 'GIT_OBJECT_DIRECTORY deleted from the child env. This is a one-line env sanitisation at the two runner '
      + 'definitions and is independently valuable regardless of how check (c) is implemented.',
    priority: 'high',
    blocking: true,
  },
  {
    id: 'S2-R4',
    severity: 'medium',
    title:
      'Identity is the wrong control for the stated goal: a GENUINE linked worktree carrying an attacker commit ON '
      + 'TOP of origin/main passes the identity guard, the ff-only refresh AND the currency check — no race required',
    note:
      'MEASURED: `git worktree add -B reaper-source <repoRoot>/.reaper-source origin/main`, then one commit on top '
      + 'replacing scripts/worktree-reaper.mjs. ensureSourceTreeWorktree returned {created:false, refreshed:true}; '
      + 'the attacker file content survived verbatim ("ATTACKER REAPER"); enforceTreeCurrency PASSED (behind===0 — '
      + 'the tree is AHEAD, which no check rejects). Every identity discriminator, including the check (c) proposed '
      + 'in S2-R2, accepts this by construction — it IS a linked worktree of this repo. The `-B` force-reset only '
      + 'runs on the CREATE path; the REUSE path never resets, so an ahead-of-main source tree persists '
      + 'indefinitely, invisible to `git status` in the root (gitignored) and on a machine-managed branch nobody '
      + 'inspects. This also subsumes the TOCTOU question in the brief: the check-then-execute window is real, but '
      + 'this is the same outcome without needing to win a race.',
    consequence:
      'The module\'s stated protection ("the reaper executes from this tree with destructive privileges", :235-236) '
      + 'is not achieved by identity alone. Residual, not a regression — but it means S2-R2/S2-R3 should not be '
      + 'closed by identity checks alone and then declared done.',
    recommendation:
      'Add an ANCESTRY assertion after the refresh and before execution: require the source tree HEAD to be an '
      + 'ancestor-or-equal of the fetched base ref (`git -C <dir> merge-base --is-ancestor HEAD origin/main`), i.e. '
      + 'refuse a tree that is AHEAD, not only one that is behind. Cheap, uses the fetch already performed, and it '
      + 'is the only control that covers a legitimately-registered but content-poisoned tree.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'NI-R1',
    severity: 'medium',
    title:
      'The mixed pattern the brief flagged is REAL but bounded: a non-invoking tick ERASES the refusal counter, '
      + 'permanently silencing the starvation alarm and delaying the not-invoked alarm 6x',
    note:
      'scripts/fleet/worktree-reaper-tick.cjs:347 sets `state.consecutive_refusals = 0` on the currency-PASS path, '
      + 'which sits ABOVE the single-flight check at :380. So any tick that passes currency and then does not run '
      + '(skipped_in_flight from a wedged pid, or spawn_error) still zeroes the refusal streak. MEASURED by driving '
      + 'the real tick() over a scratch state file (thresholds read from the module: starvation=6, notInvoked=6): '
      + 'pattern [stale x5, inflight] repeated — consecutive_refusals traced 1,2,3,4,5,0,1,2,3,4,5,0,... and NEVER '
      + 'reached 6 across 48 due ticks, so reaper_starvation_alert NEVER fired; consecutive_not_invoked advanced '
      + 'only 1 per 6 ticks and first alarmed at due-tick 36 instead of 6. DEFAULT_CADENCE=12 sweeps (~1h/due tick), '
      + 'so that is roughly 36h to first page instead of 6h, with the refusal alarm silent throughout. '
      + 'Controls all behave: all-stale fires starvation at 6; all-missing and all-inflight fire NOT_INVOKED at 6; '
      + 'all-ok stays silent; alternate stale/missing fires at 11 (both counters climb — they do NOT starve each '
      + 'other in that pattern). So the answer to "can a mixed pattern starve BOTH" is: not permanently, but one '
      + 'counter does erase the other and the delay is material.',
    consequence:
      'A wedged reaper pid on a chronically-behind tree — the exact combination this SD exists to address — hides '
      + 'the alarm that was specifically built for it and degrades detection latency 6x. Verified NOT to be a '
      + 'cross-alarm suppression problem: the refusal return (:371-374) omits consecutiveNotInvoked and the '
      + 'not-invoked returns omit consecutiveRefusals, so the two detectors never collide on the same tick and the '
      + 'NOT-INVOKED-first early return in runReaperStarvationSurfacing never suppresses a live starvation match.',
    recommendation:
      'Reset consecutive_refusals on the SAME rule that resets consecutive_not_invoked — only on result===\'spawned\' '
      + '— rather than on the currency check passing. A tick that passes currency but reaps nothing has not ended '
      + 'the outage; today it ends the streak that measures it.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'NI-R2',
    severity: 'low',
    title:
      'Both counters are tick-relative, so every silent-stop class that never reaches a counting branch stays '
      + 'invisible — including WORKTREE_REAPER_ENABLED=false and any cadence misconfiguration',
    note:
      'The brief asked specifically whether excluding skipped_not_due opens a hole. Traced: skipped_not_due '
      + '(worktree-reaper-tick.cjs:292) touches neither counter and is excluded at the call site '
      + '(stale-session-sweep.cjs:3805), and `disabled` (:284) returns before the state file is even read, then '
      + 'PASSES the widened `result !== \'skipped_not_due\'` gate and reaches runReaperStarvationSurfacing with both '
      + 'counters undefined -> no alarm, at any duration. Cadence is not env-configurable (DEFAULT_CADENCE=12, '
      + 'opts.cadence only, and the sole production caller passes none), so the cadence variant is not currently '
      + 'reachable; the ENABLED flag variant is reachable from the environment today. Not a regression introduced by '
      + 'this commit — but it is the residue of the same class the commit set out to close, and the widened gate\'s '
      + 'own comment claims it now covers "every non-invoked outcome except the cadence skip", which is one class '
      + 'wider than what it measures.',
    consequence:
      'Flipping one env var stops all reaping permanently with zero alarms from any of the three detectors.',
    recommendation:
      'Add a WALL-CLOCK gauge alongside the tick counters: alarm when `now - state.last_spawn_at` exceeds N x cadence '
      + 'regardless of why. That single control covers disabled, cadence misconfiguration, the sweep itself not '
      + 'running, and the NI-R1 erasure, none of which any tick-relative counter can see.',
    priority: 'low',
    blocking: false,
  },
  {
    id: 'FS-R1',
    severity: 'low',
    title:
      'The fail-soft is correct for shared-root spawns but is NOT "still guarded" for spawns issued from inside a '
      + 'worktree — there it downgrades from guarded to entirely unchecked',
    note:
      'lib/fleet/spawn-control.js:586 initialises `currencyApplies = !isWorktreeExemptPath(invocation.cwd)`, and '
      + ':611 raises it to true only on the SUCCESS path of ensureSpawnSourceWorktree. The new '
      + 'SOURCE_TREE_NOT_LINKED_WORKTREE code correctly bypasses the must-stay-fatal test at :617 (verified: the '
      + 'thrown error carries code SOURCE_TREE_NOT_LINKED_WORKTREE, measured on every refusing attack case), so the '
      + 'caller logs and continues — but when invocation.cwd is under .worktrees/, currencyApplies is still false and '
      + 'the `if (currencyApplies)` block at :628 is skipped entirely. Read, not run: spawn() was not executed, '
      + 'because doing so launches real fleet workers.',
    consequence:
      'With FLEET_SPAWN_SOURCE_TREE ON, a worktree-issued spawn goes from currency-enforced (against the dedicated '
      + 'tree) to not enforced at all whenever the identity probe refuses — and the probe refuses on any transient '
      + 'git failure too, since isLinkedWorktreeOf collapses "git did not answer" and "not ours" into one false. It '
      + 'never executes from the unverified directory, so this is an assurance downgrade, not a code-execution path, '
      + 'and it is strictly better than the fleet-wide outage the old shared code caused. The claim to correct is '
      + '"degraded but still guarded": true for shared-root spawns, false for worktree-issued ones.',
    recommendation:
      'On the identity-refusal path set currencyApplies = true and currencyDir = the resolved repoRoot, so the '
      + 'fallback lands on a guarded tree in both cases; and separate "git did not answer" from "not ours" in '
      + 'isLinkedWorktreeOf so a transient git failure is not reported as an identity violation.',
    priority: 'low',
    blocking: false,
  },
  {
    id: 'FS-R2',
    severity: 'low',
    title: 'A junction path passed via FLEET_REAPER_SOURCE_DIR is refused, because git returns the realpath and the guard compares against the lexical path',
    note:
      'MEASURED with a real Windows junction (mklink /J) pointing at a genuine linked worktree: --show-toplevel '
      + 'returned the TARGET (".../realtree") while path.resolve() returned the junction (".../junctree"), so '
      + 'source-tree-refresh.cjs:216 mismatched and the call threw SOURCE_TREE_NOT_LINKED_WORKTREE. The same tree '
      + 'accessed by its real path was accepted. Fails CLOSED, so this is availability only — but this fleet uses '
      + 'junctions for worktrees, and a source dir reached through one would refuse on every tick forever while '
      + 'looking like an identity attack in the logs.',
    consequence: 'Permanent silent degradation to the fallback tree on any host where the source dir is reached through a junction or symlink.',
    recommendation: 'Compare fs.realpathSync.native(dir) rather than path.resolve(dir) at :216.',
    priority: 'low',
    blocking: false,
  },
  {
    id: 'S2-R5',
    severity: 'low',
    title: 'Forged .git/worktrees metadata also passes both checks (and would also pass the proposed check (c) and the worktree-list registry)',
    note:
      'MEASURED: hand-written <repoRoot>/.git/worktrees/forged/{gitdir,commondir,HEAD} plus a .git file in the '
      + 'candidate pointing at it -> both shipped checks pass, --absolute-git-dir answers '
      + '"<victim>/.git/worktrees/forged" (so proposed check (c) passes) and `git worktree list --porcelain` lists '
      + 'the directory (so a registry check passes too). Recorded for completeness and to bound the recommendation '
      + 'in S2-R2: check (c) closes S2-R2 and S2-R3, not this. Capability required is write access INSIDE '
      + '<repoRoot>/.git/worktrees/, materially higher than the gitignored .reaper-source/ path, and an attacker at '
      + 'that level can already alter the repo the reaper falls back to.',
    consequence: 'Residual, accepted-risk class; no fix proposed beyond noting that identity checks bottom out here.',
    recommendation: 'None beyond S2-R4 (ancestry) — content assertions, not identity assertions, are what bound this class.',
    priority: 'low',
    blocking: false,
  },
];

const confirmedSound = [
  {
    id: 'S2-medium (distinct error code)',
    title: 'CLOSED — the identity refusal no longer escalates to a fleet-wide spawn outage',
    note:
      'MEASURED on every refusing attack case (bare mkdir, git init, foreign repo, core.worktree plant, junction '
      + 'path): the thrown error carries code "SOURCE_TREE_NOT_LINKED_WORKTREE", not SPAWN_SOURCE_SITING_ERROR. '
      + 'lib/fleet/spawn-control.js:617 rethrows only SPAWN_SOURCE_SITING_ERROR, so the identity refusal now falls '
      + 'into the log-and-continue path. The constant is exported (source-tree-refresh.cjs:271) and defined once. '
      + 'The medium finding as stated is closed; see FS-R1 for the one measured caveat on the fallback\'s guard '
      + 'coverage, which is a separate and smaller point.',
  },
  {
    id: 'NOT-INVOKED (built, not deferred)',
    title: 'SUBSTANTIALLY CLOSED — the three silent-stop classes now alarm, verified two-sided against the real tick()',
    note:
      'MEASURED with the real tick() and the real detectors over a scratch state file: all-missing -> '
      + 'consecutive_not_invoked 1..6, NOT_INVOKED alarm at due-tick 6; all-inflight -> identical; all-ok -> counter '
      + 'stays 0 and nothing alarms (the reset at :459 works, so the alarm is not sticky); the whitelist entry in '
      + 'readState (:63) does persist the field across writes, confirmed by reading the state file back on every '
      + 'tick rather than trusting the return value. No false alarm found on the healthy path. Excluding '
      + 'skipped_not_due does NOT cause a false silence at the shipped cadence (see NI-R2 for the classes it does '
      + 'leave uncovered, which are pre-existing).',
  },
  {
    id: 'S1',
    title: 'NOT REGRESSED — self-protection is intact and is still two independent mechanisms',
    note:
      'lib/worktree-reaper/detectors.js: NON_SD_PREFIXES still spreads SOURCE_TREE_DIRNAMES, so the dedicated trees '
      + 'short-circuit orphan-sd classification independently of the marker. markSourceTreeReapProtected still runs '
      + 'immediately after creation (source-tree-refresh.cjs:262) and is re-asserted on every reuse (:250). '
      + 'MEASURED as a bonus two-sided property: on every REFUSED case the marker was NOT written into the '
      + 'unverified directory (markerWritten:false), i.e. the S2 guard is correctly ordered ahead of the S1 marker '
      + 'write. tests/unit/worktree-reaper/reaper-source-tree.test.js passes.',
  },
  {
    id: 'S3',
    title: 'NOT REGRESSED — the census-blind alarm still fires and still de-dupes independently',
    note:
      'detectReaperStarvation (coordination-events.cjs:623-644) still returns alertKind '
      + '"reaper_census_blind_alert" for pool.used===null above threshold, and emitReaperStarvationAlert still keys '
      + 'its dedup query on the per-kind `payload->>kind`, so the new third kind cannot suppress either of the '
      + 'existing two. VERIFIED the new NOT-INVOKED-first early return in runReaperStarvationSurfacing does not '
      + 'suppress a live starvation match: the two counters are never both present on the same tick outcome '
      + '(refusal returns omit consecutiveNotInvoked; not-invoked returns omit consecutiveRefusals), measured across '
      + 'every trial.',
  },
  {
    id: 'TR-1 / TR-4 / test suite',
    title: 'Constraints honoured; the SD\'s own suites are green over the S2-R2 defect',
    note:
      'allowSelfHeal:false is still unconditional on the reaper currency call (worktree-reaper-tick.cjs, the '
      + '"reaper REFUSES; it never heals" block). No destructive reaping was run; no live worktree was removed; the '
      + 'live repo was touched only by read-only rev-parse. 4 suites / 23 tests PASS — and S2-R2 defeats the guard '
      + 'anyway, which is the reason this row is a FAIL rather than a note.',
  },
];

const results = {
  status: 'completed',
  verdict: 'FAIL',
  confidence: 92,
  score: 58,
  summary:
    'EXEC SECURITY re-review #3, adversarial brief. THE PRIMARY CLAIM IS REFUTED: S2-R is NOT closed. The two-check '
    + 'identity guard is defeated at the DEFAULT path by a single planted `.git` file containing '
    + '"gitdir: <repoRoot>/.git" — measured with real git, both checks pass simultaneously, ensureSourceTreeWorktree '
    + 'returns {created:false, refreshed:true}, writes its reap-protection marker into the attacker directory, leaves '
    + 'the attacker script intact, and the independent downstream enforceTreeCurrency also passes, so the tick would '
    + 'spawn it with --execute --stage2 --yes. The attacker-free consequence is worse than the original S2-R: because '
    + 'the planted .git points at repoRoot\'s own gitdir, the reuse merge --ff-only moved the SHARED ROOT\'s HEAD '
    + '(observed 315f96ff -> 9452688a) while leaving its working tree behind — the uncoordinated shared-root mutation '
    + 'the module header calls load-bearing to avoid, now moving the root\'s actual branch ref. Capability required is '
    + 'one mkdir plus one file write. A second variant needs no file write at all: two ambient env vars '
    + '(GIT_DIR/GIT_WORK_TREE) defeat both checks over a bare mkdir, and env is already this module\'s declared '
    + 'untrusted channel. The plant window is OPEN ON THIS HOST RIGHT NOW — neither .reaper-source nor .spawn-source '
    + 'exists yet. A measured, two-sided discriminator that closes both variants while keeping the genuine worktree '
    + 'accepted is given (--absolute-git-dir under <common-dir>/worktrees/), plus env sanitisation. The other two '
    + 'conditions: the distinct error code IS closed (measured on every refusing case; one caveat — the fail-soft is '
    + 'only "still guarded" for shared-root spawns, not worktree-issued ones, where it drops currency enforcement '
    + 'entirely). The not-invoked alarm IS substantially closed and verified two-sided against the real tick(), with '
    + 'the mixed-pattern question answered by direct measurement: it does not permanently starve both counters, but a '
    + 'non-invoking tick ERASES the refusal counter (tick.cjs:347 sits above the single-flight check), so [stale x5, '
    + 'inflight] silenced reaper_starvation_alert across all 48 due ticks and pushed first detection from due-tick 6 '
    + 'to 36 — ~36h at the shipped cadence. S1 and S3 measured NOT regressed; the S2 guard is correctly ordered ahead '
    + 'of the S1 marker write. 23 of the SD\'s own tests pass over the S2-R2 defect, for the same reason recorded in '
    + 'the 803ed185e3e commit message: the new real-git suite is a positive control over three shapes, not a complete '
    + 'pattern set.',
  recommendations: [
    {
      action:
        'Add check (c) to isLinkedWorktreeOf: require `git -C <dir> rev-parse --absolute-git-dir` to start with '
        + '`<repoRoot --git-common-dir>/worktrees/`. Measured two-sided — rejects the .git-file plant and the '
        + 'GIT_DIR/GIT_WORK_TREE plant, accepts the genuine linked worktree. Keep checks (a) and (b).',
      priority: 'critical',
      blocking: true,
    },
    {
      action:
        'Delete GIT_DIR, GIT_WORK_TREE, GIT_COMMON_DIR, GIT_INDEX_FILE and GIT_OBJECT_DIRECTORY from the child env '
        + 'used for the identity probe AND for the subsequent fetch/merge, at both production runner definitions '
        + '(worktree-reaper-tick.cjs:241, spawn-control.js:592).',
      priority: 'high',
      blocking: true,
    },
    {
      action:
        'Pin, in tests/unit/fleet/source-tree-identity-realgit.test.js: the .git-file plant, the '
        + 'GIT_DIR/GIT_WORK_TREE plant, and — the assertion nothing currently makes — that repoRoot HEAD is UNCHANGED '
        + 'across a refused ensureSourceTreeWorktree call.',
      priority: 'high',
      blocking: true,
    },
    {
      action:
        'Assert ANCESTRY, not only identity and behind-ness: refuse a source tree whose HEAD is not an '
        + 'ancestor-or-equal of the fetched base ref, so a legitimately-registered tree carrying a commit AHEAD of '
        + 'origin/main cannot be executed from.',
      priority: 'medium',
      blocking: false,
    },
    {
      action:
        'Reset consecutive_refusals only on result===\'spawned\', matching consecutive_not_invoked, instead of on the '
        + 'currency check passing (worktree-reaper-tick.cjs:347) — a tick that passes currency and then does not run '
        + 'currently ends the streak that measures the outage.',
      priority: 'medium',
      blocking: false,
    },
    {
      action:
        'Add a wall-clock gauge on `now - state.last_spawn_at`; it is the only control that can see the classes no '
        + 'tick counter reaches (WORKTREE_REAPER_ENABLED=false, cadence misconfiguration, the sweep not running).',
      priority: 'low',
      blocking: false,
    },
    {
      action:
        'On the identity-refusal path in spawn-control.js, set currencyApplies=true with currencyDir=repoRoot so the '
        + 'fallback is guarded for worktree-issued spawns too; and distinguish "git did not answer" from "not ours" '
        + 'in isLinkedWorktreeOf so a transient git failure is not reported as an identity violation.',
      priority: 'low',
      blocking: false,
    },
    { action: 'Compare fs.realpathSync.native(dir) rather than path.resolve(dir) at source-tree-refresh.cjs:216 so a junction/symlink path is not a permanent refusal.', priority: 'low', blocking: false },
  ],
  justification:
    'FAIL, on the same standard as rounds 1 and 2. S2-R2 is not a chain of inferences: it was reproduced end to end '
    + 'with real git in disposable scratch repositories, at a capability bar no higher than the mkdir attack this '
    + 'round was written to close, and it carries an attacker-free second consequence — the shared root\'s HEAD '
    + 'moving under its own working tree — that was directly observed. The subsystem is destructive, the host is '
    + 'configured to exercise the path (WORKTREE_REAPER_EXECUTE=stage2), and the precondition is satisfied on this '
    + 'host today because neither dedicated tree exists yet. As in round 2, the fix ships with a green suite that '
    + 'cannot see the defect; merging would retire the finding while leaving the hole, and the next reviewer would '
    + 'have 23 passing assertions telling them it was closed. The two non-blocking conditions were built rather than '
    + 'deferred and both are genuinely better than before — the distinct error code is closed, and the not-invoked '
    + 'alarm works two-sided against the real tick() — so they are stated as closed plainly, with their measured '
    + 'residuals recorded rather than folded into the verdict.',
  metadata: {
    review_round: 3,
    supersedes_row: '9c8dc482',
    attack_mode: true,
    reviewed_head: 'a0ea71c4300',
    reviewed_commits: ['803ed185e3e', 'a0ea71c4300'],
    destructive_commands_run_against_live_pool: false,
    self_heal_enabled_on_shared_root: false,
    git_checkout_in_shared_root: false,
    live_repo_mutated: false,
    prior_findings_status: {
      'S2-R (blocking)': 'NOT_CLOSED',
      'S2 medium (error code)': 'CLOSED',
      'NOT-INVOKED medium': 'CLOSED_WITH_RESIDUALS',
      S1: 'NOT_REGRESSED',
      S3: 'NOT_REGRESSED',
    },
    new_findings: ['S2-R2', 'S2-R3', 'S2-R4', 'S2-R5', 'NI-R1', 'NI-R2', 'FS-R1', 'FS-R2'],
    measurements: {
      git_version: '2.50.1.windows.1',
      attack_matrix: {
        'bare mkdir': 'REFUSED (SOURCE_TREE_NOT_LINKED_WORKTREE) — the S2-R fix works for this shape',
        'git init own repo': 'REFUSED',
        'foreign repo clone': 'REFUSED',
        'separate gitdir copy + core.worktree': 'REFUSED',
        'junction path to a genuine worktree': 'REFUSED (false negative, availability only)',
        '.git FILE -> repoRoot/.git': 'ACCEPTED — {created:false, refreshed:true}, marker written, payload intact',
        'ambient GIT_DIR + GIT_WORK_TREE over bare mkdir': 'ACCEPTED — same',
        'forged .git/worktrees/<name> metadata': 'ACCEPTED — higher capability bar (write inside .git)',
        'genuine linked worktree AHEAD of origin/main': 'ACCEPTED, ff-only no-op, enforceTreeCurrency PASSED',
        'CONTROL genuine linked worktree': 'ACCEPTED (no happy-path breakage)',
      },
      probes_for_the_git_file_plant: {
        'common-dir(dir)': '<scratch>/victim/.git',
        'common-dir(repoRoot)': '<scratch>/victim/.git',
        'show-toplevel(dir)': '<scratch>/victim/.reaper-source',
        'path.resolve(dir)': '<scratch>/victim/.reaper-source',
        result: 'check 1 AND check 2 both pass',
      },
      proposed_discriminator_two_sided: {
        'absolute-git-dir under <common>/worktrees/': {
          '.git-file plant': false,
          'GIT_DIR/GIT_WORK_TREE plant': false,
          'genuine linked worktree': true,
          'forged worktrees entry': true,
          'repoRoot itself': false,
        },
      },
      shared_root_mutation_by_the_accepted_plant: 'repoRoot HEAD 315f96ff -> 9452688a while working file stayed v1; status showed phantom "M f.txt"',
      counter_thresholds: { starvation: 6, not_invoked: 6, default_cadence_sweeps: 12 },
      counter_trials_first_alarm_due_tick: {
        'all-stale': '6 (reaper_starvation_alert)',
        'all-missing': '6 (NOT_INVOKED)',
        'all-inflight': '6 (NOT_INVOKED)',
        'all-ok': 'none in 4 (correct — reset works, alarm not sticky)',
        'alternate stale/missing': '11 (both counters climb; no mutual starvation)',
        'stale x5 then inflight': '36 (NOT_INVOKED); starvation NEVER fired in 48 due ticks — refusal counter zeroed every 6th tick',
        'inflight x5 then stale': '7 (NOT_INVOKED)',
        'alternate stale/inflight': '12 (NOT_INVOKED); starvation never fired',
        'stale x5 then missing': '7 (reaper_starvation_alert)',
      },
      sd_own_test_suites: '4 files / 23 tests PASS — green over S2-R2',
      live_host_state: 'neither .reaper-source nor .spawn-source exists (read-only check) — plant window currently open',
    },
    files_reviewed: [
      'lib/fleet/source-tree-refresh.cjs',
      'lib/fleet/spawn-control.js',
      'lib/fleet/tree-currency.cjs',
      'scripts/fleet/worktree-reaper-tick.cjs',
      'scripts/stale-session-sweep.cjs',
      'lib/coordinator/coordination-events.cjs',
      'lib/worktree-reaper/detectors.js',
      'tests/unit/fleet/source-tree-identity-realgit.test.js',
      'tests/unit/fleet/source-tree-identity.test.js',
      'tests/unit/coordinator/reaper-not-invoked.test.js',
      'tests/unit/worktree-reaper/reaper-source-tree.test.js',
    ],
  },
};

const NL = String.fromCharCode(10);
const HR = '-'.repeat(72);
results.detailed_analysis = [
  'SUMMARY', '=======', results.summary, '',
  'OPEN FINDINGS (severity-ranked, file:line citations, measured exploits)',
  '='.repeat(72), '',
  findings.map((f) => (
    '[' + String(f.severity).toUpperCase() + '] ' + f.id + ' - ' + f.title + NL +
    'FINDING: ' + f.note + NL +
    'CONSEQUENCE: ' + f.consequence + NL +
    'RECOMMENDATION: ' + f.recommendation
  )).join(NL + NL + HR + NL + NL),
  NL + HR, '',
  'CLAIMS ATTACKED AND CONFIRMED CLOSED / SOUND',
  '='.repeat(72), '',
  confirmedSound.map((c) => '[CONFIRMED] ' + c.id + ' - ' + c.title + NL + c.note).join(NL + NL + HR + NL + NL),
].join(NL);

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: CODE, targetApplication: 'EHG_Engineer', fallback: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(CODE, SD_ID, { name: 'Chief Security Architect' }, results, { sdKey: SD_KEY, phase: PHASE });
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
console.log('VERDICT=' + results.verdict + ' CONFIDENCE=' + results.confidence + ' SCORE=' + results.score);
