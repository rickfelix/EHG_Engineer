/**
 * EXEC-phase SECURITY **RE-REVIEW #5** for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001
 * (sd_id 23c2a2d4-89af-4885-b87b-7a5b3c4ded1d), at HEAD 571c2a8e39a.
 *
 * Independent second verdict, requested alongside exec-security-rerun4. Filed under a distinct
 * script name so it cannot collide with that reviewer's row.
 *
 * Module under test confirmed at HEAD before measuring: git hash-object of
 * lib/fleet/source-tree-refresh.cjs == git rev-parse HEAD:<same>. All four production files
 * verified byte-identical to HEAD again after the mutation battery.
 *
 * TR-1/TR-4 honoured: no destructive reaping, allowSelfHeal never true on the shared root, no
 * mutation of the live repo (mutations were applied to file backups and restored by copy).
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = '23c2a2d4-89af-4885-b87b-7a5b3c4ded1d';
const SD_KEY = 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001';
const CODE = 'SECURITY';
const PHASE = 'EXEC';

const findings = [
  {
    id: 'R5-3',
    severity: 'critical',
    title:
      'IDENTITY, ANCESTRY AND CURRENCY ALL VERIFY THE COMMIT — THE REAPER EXECUTES THE FILE. One '
      + 'uncommitted write into the source tree defeats the entire chain, at a strictly LOWER '
      + 'capability bar than every attack closed so far',
    note:
      'lib/fleet/source-tree-refresh.cjs:346-380 (the reuse branch) and scripts/fleet/worktree-reaper-tick.cjs, '
      + 'which resolves reaperScript out of that directory and spawns it. Checks 1-3 answer "is this directory a '
      + 'linked worktree of this repo"; isAtOrBehind answers "is HEAD an ancestor of origin/main"; '
      + 'enforceTreeCurrency answers "how far BEHIND is it". Not one of them looks at the CONTENT of the file that '
      + 'is about to be executed. MEASURED with real git in a scratch repo: a GENUINE linked worktree, HEAD exactly '
      + 'equal to origin/main (verified by rev-parse comparison), with scripts/worktree-reaper.mjs overwritten on '
      + 'disk and left UNCOMMITTED -> ensureSourceTreeWorktree returned {created:false, refreshed:true}, '
      + 'enforceTreeCurrency PASSED, and the file that would be executed still read '
      + '"// ATTACKER CODE, uncommitted, HEAD still == origin/main". Repeated as an UNTRACKED added module '
      + '(scripts/evil-helper.mjs, nothing modified): also accepted, also current. '
      + 'WHY NOTHING CATCHES IT: `merge --ff-only origin/main` is a NO-OP when the tree is already at origin/main, '
      + 'so it never has to touch the working file and never refuses; `-B` force-resets only on the CREATE path, '
      + 'never on reuse; and the tree is gitignored so `git status` in the root never shows it.',
    consequence:
      'Arbitrary code execution as the reaper, with --execute --stage2 --yes on this host: filesystem writes across '
      + 'the worktree pool, git worktree removal, and the service-role Supabase client. Capability required is ONE '
      + 'file write inside <repoRoot>/.reaper-source/ — no .git file, no environment control, no git command, no '
      + 'commit. That is strictly less than S2-R (mkdir + plant), S2-R2 (.git file), S2-R3 (env) or S2-R4 (a real '
      + 'commit), all of which are now closed. The S2-R4 commit message states "identity is not integrity"; the fix '
      + 'substituted COMMIT integrity for FILE integrity, and the artifact executed is a file.',
    recommendation:
      'Assert the working tree is clean with respect to HEAD before returning a source tree the caller will execute '
      + 'from: `git -C <dir> diff --quiet HEAD` plus `git -C <dir> status --porcelain --untracked-files=all` empty. '
      + 'IMPLEMENTATION NOTE THAT WILL BITE: markSourceTreeReapProtected writes .reap-protected.json INTO the tree, '
      + 'so the tree is permanently dirty by this module\'s own hand — the measured status was '
      + '"?? .reap-protected.json". A naive clean check therefore refuses every tree forever. Either exclude that '
      + 'one path explicitly, add it to the tree\'s .git/info/exclude at creation, or move the marker outside the '
      + 'tree. Throw a THIRD distinct code (e.g. SOURCE_TREE_DIRTY) so an operator can tell tampering from staleness, '
      + 'and fail soft at the caller like the other two.',
    priority: 'critical',
    blocking: true,
  },
  {
    id: 'R5-1',
    severity: 'critical',
    title:
      'scrubGitEnv is a DENYLIST over an open-ended namespace and misses every code-execution variable. '
      + 'MEASURED ARBITRARY CODE EXECUTION THROUGH THE SCRUB',
    note:
      'lib/fleet/source-tree-refresh.cjs:43-53. GIT_REDIRECT_ENV_KEYS covers eight variables, all of which '
      + 'REDIRECT which repository git operates on — which is exactly what the doc comment says it is for. The '
      + 'variables that make git EXECUTE A PROGRAM are absent. MEASURED, real git 2.50.1: of a probe set, these '
      + 'SURVIVE scrubGitEnv unchanged — GIT_CONFIG_COUNT, GIT_CONFIG_KEY_0, GIT_CONFIG_VALUE_0, GIT_CONFIG_GLOBAL, '
      + 'GIT_CONFIG_SYSTEM, GIT_CONFIG_NOSYSTEM, GIT_EXEC_PATH, GIT_SSH_COMMAND, GIT_EXTERNAL_DIFF, '
      + 'GIT_PROXY_COMMAND, GIT_ASKPASS, GIT_TEMPLATE_DIR, GIT_ATTR_NOSYSTEM. '
      + 'END TO END: with GIT_CONFIG_COUNT=1 / GIT_CONFIG_KEY_0=core.hooksPath / GIT_CONFIG_VALUE_0=<attacker dir> '
      + 'passed THROUGH scrubGitEnv, `git config --get core.hooksPath` still returned the attacker directory, and '
      + 'driving the real ensureSourceTreeWorktree with that scrubbed env caused the refresh\'s merge to fire the '
      + 'attacker\'s post-merge hook — sentinel file written, verified present. Code execution happens DURING the '
      + 'refresh, before identity, ancestry or currency have any bearing.',
    consequence:
      'Arbitrary code execution in the sweep process. REACHABILITY, stated honestly: an attacker who controls the '
      + 'process launch environment could also set NODE_OPTIONS and win without touching git, so this is not a new '
      + 'boundary in that scenario. It IS a new boundary for a lower-privileged one: .env is gitignored (verified '
      + 'via git check-ignore) and dotenvx injects it into process.env at RUNTIME — the "injected env from .env" '
      + 'banner prints on every node invocation in this repo. NODE_OPTIONS is consumed by node before that '
      + 'injection happens and is therefore NOT exploitable from .env, while GIT_CONFIG_* is. So a writable .env '
      + 'reaches code execution through git config but not through node options, which is precisely the gap the '
      + 'scrub was added to cover and does not.',
    recommendation:
      'Invert to an ALLOWLIST. Build the child env from an explicit set (PATH, SystemRoot, COMSPEC, USERPROFILE/HOME, '
      + 'TEMP/TMP, LANG, plus any GIT_* the code itself sets) rather than subtracting from process.env — a denylist '
      + 'over a namespace git keeps extending is structurally unable to stay complete, and GIT_CONFIG_COUNT was '
      + 'itself added in git 2.31. Additionally set GIT_CONFIG_NOSYSTEM=1 and point GIT_CONFIG_GLOBAL at a '
      + 'nonexistent path for these invocations, so system and global config cannot inject hooks either.',
    priority: 'critical',
    blocking: true,
  },
  {
    id: 'R5-4',
    severity: 'medium',
    title:
      'ANSWERING THE LEAD\'S THIRD QUESTION: the scrub is pinned as a FUNCTION but never as a WIRE. Unwiring it at '
      + 'either production runner leaves all 61 tests green',
    note:
      'MUTATION-MEASURED across all seven source-tree suites (61 tests at baseline). '
      + 'M-D, gutting GIT_REDIRECT_ENV_KEYS itself: 2 tests fail — the function IS pinned. '
      + 'M-E, replacing `env: scrubGitEnv(process.env)` with `env: process.env` at '
      + 'scripts/fleet/worktree-reaper-tick.cjs:246: 61 passed, 0 failed. '
      + 'M-F, the same unwiring at lib/fleet/spawn-control.js:596: 61 passed, 0 failed. '
      + 'So the defence can be disconnected from BOTH call sites, the entire suite stays green, and the only test '
      + 'that could notice asserts a pure function in isolation. Two green endpoints do not prove they are '
      + 'connected — and this is the same shape as this SD\'s founding defect, a gauge that was correctly computed '
      + 'and never consumed.',
    consequence:
      'A refactor that drops the scrub at either runner ships silently. Given R5-1, the scrub also needs to change '
      + 'shape, and there is currently no test that would notice if the replacement were wired in wrongly.',
    recommendation:
      'Assert the WIRE, not the ends: drive ensureSourceTreeWorktree (or the tick) with a poisoned ambient env and '
      + 'assert the OBSERVED EFFECT is absent — e.g. set GIT_DIR to a decoy and assert the probe still resolves the '
      + 'real repo, or set core.hooksPath via GIT_CONFIG_* and assert the hook did NOT fire. That assertion fails '
      + 'for M-D, M-E and M-F alike, which is the property the current tests lack.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'R5-2',
    severity: 'medium',
    title: 'Forged .git/worktrees/<name> metadata still passes all three checks — the predicted residual, unchanged',
    note:
      'MEASURED at this HEAD: hand-written <repoRoot>/.git/worktrees/forged/{gitdir,commondir,HEAD} plus a .git '
      + 'file in the candidate -> ACCEPTED, {created:false, refreshed:true}, attacker script intact. Check 3 cannot '
      + 'separate this because the forged gitdir genuinely IS under <common>/worktrees/. Boundary cases around '
      + 'check 3 DO hold: a repo legitimately located under a directory named "worktrees" is refused, and forged '
      + 'metadata placed under .git/worktreesX/ is refused (the trailing slash in the startsWith prefix does its '
      + 'job). Capability is write access inside <repoRoot>/.git/worktrees/, higher than the gitignored source '
      + 'path — but note R5-3 reaches the same outcome for far less, so this residual is no longer the cheapest '
      + 'path to the same consequence.',
    consequence: 'Accepted-risk residual, now dominated by R5-3.',
    recommendation: 'No further identity work. The content assertion in R5-3 is what bounds this class; identity checks bottom out here.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'R5-5',
    severity: 'low',
    title: 'spawn-control.js:596 spreads caller options AFTER env, so any caller passing `env` silently defeats the scrub',
    note:
      '`execFileSync(\'git\', args, { encoding, stdio, env: scrubGitEnv_(process.env), ...o })` — `...o` is spread '
      + 'LAST, so an `o.env` overrides the scrubbed value. No current caller passes env (the only call site passes '
      + '{ cwd: repoRoot }), so this is latent rather than live. It is the same object-spread ordering defect '
      + 'recorded in this codebase as PAT-PROVENANCE-SPOOF-VIA-SPREAD-ORDER-001, whose proven fix is to spread the '
      + 'caller-supplied object FIRST and set canonical fields after it.',
    consequence: 'A future caller that legitimately needs to pass env would silently unscrub the invocation.',
    recommendation: 'Spread `...o` first, then set `env:` explicitly after it.',
    priority: 'low',
    blocking: false,
  },
];

const confirmedSound = [
  {
    id: 'CHECK 3 (S2-R2 / S2-R3)',
    title: 'CLOSED, and the startsWith boundary holds under the specific attacks the lead asked me to try',
    note:
      'MEASURED at this HEAD: the `.git` FILE plant -> REFUSED (SOURCE_TREE_NOT_LINKED_WORKTREE); bare mkdir + '
      + 'ambient GIT_DIR/GIT_WORK_TREE -> REFUSED; bare mkdir -> refused; git init -> refused; foreign repo -> '
      + 'refused; separate gitdir with core.worktree -> refused; genuine linked worktree -> ACCEPTED. On the '
      + 'boundary questions specifically: a repo whose own path contains a segment named "worktrees" is still '
      + 'refused for a .git-file plant (the comparison is anchored at <common>, not anywhere in the path), and '
      + 'forged metadata under .git/worktreesX/ is refused because the prefix includes the trailing slash. `mine` '
      + 'is not independently attacker-influenceable: check 1 has already required it to equal repoRoot\'s own '
      + 'common dir. Junction paths are now ACCEPTED (FS-R2 closed) — measured with a real mklink /J.',
  },
  {
    id: 'ANCESTRY (S2-R4)',
    title: 'CLOSED for the commit-level attack, and it fails CLOSED on an unresolvable base ref',
    note:
      'MEASURED: genuine worktree with a commit AHEAD of origin/main -> REFUSED with SOURCE_TREE_AHEAD_OF_BASE; '
      + 'detached HEAD at an AHEAD commit -> REFUSED; baseRef that does not resolve (origin/nope) -> REFUSED, i.e. '
      + 'fails closed rather than open; clean tree exactly at origin/main -> ACCEPTED and currency PASSED (positive '
      + 'control intact); detached exactly AT origin/main -> accepted here, which is correct at this layer since '
      + 'enforceTreeCurrency independently rejects detached_head. The scoping decision — ancestry on source trees '
      + 'only, never in enforceTreeCurrency where worker worktrees are legitimately ahead — is right. R5-3 is not a '
      + 'defect in this check; it is the axis this check does not measure.',
  },
  {
    id: 'NI-R1',
    title: 'CLOSED — resetting both counters only on result===\'spawned\' removed the measured 6x detection delay',
    note:
      'Re-ran the same harness that produced the finding, driving the real tick(). [stale x5, inflight]: first '
      + 'alarm now at due-tick 7 (was 36, with reaper_starvation_alert never firing at all across 48 ticks). Every '
      + 'mixed pattern now alarms within 11 due ticks. Controls unchanged and correct: all-stale 6, all-missing 6, '
      + 'all-inflight 6, all-ok silent.',
  },
  {
    id: 'TEST-1 (the vanishing-case class)',
    title: 'CLOSED, mutation-verified independently — the count now HOLDS and the suite REDDENS',
    note:
      'M-A, setting SOURCE_TREE_DIRNAMES to []: the seven-suite run stayed at 61 tests and turned 7 RED. Before '
      + 'the fix the equivalent mutation shrank the suite instead of failing it. Grepped every suite for loops fed '
      + 'by imported production values as well: the remaining loops are over hardcoded literals, and the one loop '
      + 'over imported constants (source-tree-self-protection.test.js:98, over the two dirname scalars) has a fixed '
      + 'case count of 2 regardless of their values, so it is not in this class. M-B (check 3 neutralised) and M-C '
      + '(ancestry removed) each turned 2 tests red, so those guards are pinned too.',
  },
  {
    id: 'TR-1 / TR-4 / repo hygiene',
    title: 'Constraints honoured and every mutated file verified restored',
    note:
      'No destructive reaping, no allowSelfHeal on the shared root, no live-repo mutation. All attack repositories '
      + 'were built under os.tmpdir(). After the mutation battery, git hash-object was compared against '
      + 'git rev-parse HEAD:<path> for source-tree-refresh.cjs, detectors.js, worktree-reaper-tick.cjs and '
      + 'spawn-control.js — all four identical to HEAD.',
  },
];

const results = {
  status: 'completed',
  verdict: 'FAIL',
  confidence: 94,
  score: 68,
  summary:
    'EXEC SECURITY re-review #5 at HEAD 571c2a8e39a, independent second verdict. Everything carried forward from '
    + 'rounds 3 and 4 is genuinely closed and was re-measured rather than assumed: check 3 refuses the .git-file '
    + 'plant and the GIT_DIR/GIT_WORK_TREE plant while accepting a real worktree, and its startsWith boundary holds '
    + 'against a repo located under a directory named "worktrees" and against forged metadata under '
    + '.git/worktreesX/; ancestry refuses ahead and detached-ahead trees, fails CLOSED on an unresolvable base ref, '
    + 'and keeps the positive control green; junctions are accepted again; the NI-R1 counter coupling is gone '
    + '(the pattern that took 36 due ticks now alarms at 7); and the vanishing-test-case class is fixed, verified '
    + 'independently by mutation — emptying SOURCE_TREE_DIRNAMES now HOLDS the suite at 61 tests and turns 7 red '
    + 'instead of shrinking it. TWO NEW BLOCKING FINDINGS, both measured end to end. (1) R5-3: identity, ancestry '
    + 'and currency all verify the COMMIT, and the reaper executes the FILE. A genuine linked worktree with HEAD '
    + 'exactly at origin/main but scripts/worktree-reaper.mjs overwritten and left UNCOMMITTED was accepted '
    + '({refreshed:true}), passed enforceTreeCurrency, and retained the attacker content that would be executed; '
    + 'an untracked added module behaves the same. merge --ff-only is a no-op at origin/main so it never touches '
    + 'the file, and -B resets only on create. Capability: one file write — strictly less than every attack closed '
    + 'so far. (2) R5-1: scrubGitEnv is a denylist covering only repository-REDIRECTION variables; every '
    + 'code-execution variable survives it, and passing GIT_CONFIG_COUNT/KEY_0/VALUE_0 through the scrub to inject '
    + 'core.hooksPath made the refresh fire an attacker post-merge hook — sentinel written, arbitrary code executed '
    + 'before any check applies. Reachable from a writable .env, which dotenvx injects at runtime and from which '
    + 'NODE_OPTIONS would NOT be exploitable, so this is a real boundary and not merely a restatement of "the '
    + 'attacker owns the process". Plus R5-4, answering the lead\'s third question directly: the scrub is pinned as '
    + 'a function but never as a wire — unwiring it at either production runner leaves all 61 tests green.',
  recommendations: [
    { action: 'Assert working-tree CONTENT integrity before returning a source tree for execution: `git -C <dir> diff --quiet HEAD` and an empty `status --porcelain --untracked-files=all`, excluding the .reap-protected.json this module itself writes (which otherwise makes every tree permanently dirty). New distinct code SOURCE_TREE_DIRTY, failing soft at the caller like the other two.', priority: 'critical', blocking: true },
    { action: 'Replace scrubGitEnv\'s denylist with an ALLOWLIST-built child env, and set GIT_CONFIG_NOSYSTEM=1 plus a nonexistent GIT_CONFIG_GLOBAL for these invocations. The current list misses GIT_CONFIG_COUNT/KEY/VALUE, GIT_EXEC_PATH, GIT_SSH_COMMAND, GIT_EXTERNAL_DIFF, GIT_PROXY_COMMAND, GIT_ASKPASS and GIT_TEMPLATE_DIR, and a denylist over a namespace git keeps extending cannot stay complete.', priority: 'critical', blocking: true },
    { action: 'Test the WIRE: drive ensureSourceTreeWorktree with a poisoned ambient env and assert the observed effect is absent (the decoy GIT_DIR is not honoured / the injected hook does not fire). That assertion fails for M-D, M-E and M-F; today only M-D is caught.', priority: 'medium', blocking: false },
    { action: 'Spread `...o` BEFORE `env:` at lib/fleet/spawn-control.js:596 so a caller-supplied env cannot silently defeat the scrub.', priority: 'low', blocking: false },
  ],
  justification:
    'FAIL on two independently measured blocking findings, both of which reach arbitrary code execution as the '
    + 'reaper on a host configured with WORKTREE_REAPER_EXECUTE=stage2. R5-3 is the more serious of the two because '
    + 'its capability requirement is the lowest of anything found in this review chain — a single file write, no '
    + 'git, no env, no commit — and because it is not a gap in any individual check but a category error shared by '
    + 'all of them: every layer added so far verifies the commit graph, and the artifact that runs is a file on '
    + 'disk. R5-1 is a denylist that is complete against the class its comment names and absent against the class '
    + 'that matters. Everything else in this SD is now in good shape and is recorded as closed plainly: four '
    + 'previously blocking or medium findings were re-measured at this HEAD and hold, the test-vacuity fix works '
    + 'under independent mutation, and the boundary cases the lead specifically asked me to probe around check 3 '
    + 'all came back clean.',
  metadata: {
    review_round: 5,
    reviewer_note: 'independent second verdict; exec-security-rerun4 also reviewing 571c2a8e39a',
    supersedes_row: '2406d46c-9cd1-4ba0-8f41-b7eeba845c78',
    attack_mode: true,
    reviewed_head: '571c2a8e39a',
    reviewed_commits: ['3412d65700d', '9057c171b3e', '364ef34b82d', '571c2a8e39a'],
    module_blob_verified_at_head: '3b1f341bc6ba4ca929b3b0b11faa51384c9eccd9',
    new_findings: ['R5-3', 'R5-1', 'R5-4', 'R5-2', 'R5-5'],
    closed_and_reverified: ['S2-R2', 'S2-R3', 'S2-R4', 'FS-R2', 'NI-R1', 'IDLE-2', 'IDLE-3', 'TEST-1', 'TEST-2'],
    destructive_commands_run_against_live_pool: false,
    self_heal_enabled_on_shared_root: false,
    live_repo_mutated: false,
    files_restored_verified: ['lib/fleet/source-tree-refresh.cjs', 'lib/worktree-reaper/detectors.js', 'scripts/fleet/worktree-reaper-tick.cjs', 'lib/fleet/spawn-control.js'],
    measurements: {
      git_version: '2.50.1.windows.1',
      check3_attacks: {
        '.git FILE plant': 'REFUSED',
        'ambient GIT_DIR/GIT_WORK_TREE': 'REFUSED',
        'repo located under a dir named worktrees, .git-file plant': 'REFUSED',
        'forged metadata under .git/worktreesX/': 'REFUSED (trailing slash anchors the prefix)',
        'forged metadata under the REAL .git/worktrees/': 'ACCEPTED — residual R5-2',
        'junction path to a genuine worktree': 'ACCEPTED (FS-R2 closed)',
        'CONTROL genuine linked worktree': 'ACCEPTED',
      },
      env_scrub: {
        scrub_list: 'GIT_DIR, GIT_WORK_TREE, GIT_COMMON_DIR, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY, GIT_ALTERNATE_OBJECT_DIRECTORIES, GIT_CEILING_DIRECTORIES, GIT_NAMESPACE',
        survives_the_scrub: 'GIT_CONFIG_COUNT, GIT_CONFIG_KEY_0, GIT_CONFIG_VALUE_0, GIT_CONFIG_GLOBAL, GIT_CONFIG_SYSTEM, GIT_CONFIG_NOSYSTEM, GIT_EXEC_PATH, GIT_SSH_COMMAND, GIT_EXTERNAL_DIFF, GIT_PROXY_COMMAND, GIT_ASKPASS, GIT_TEMPLATE_DIR, GIT_ATTR_NOSYSTEM',
        injected_config_visible_after_scrub: 'core.hooksPath = <attacker dir>',
        code_execution: 'post-merge hook FIRED during the refresh; sentinel file written; verified present',
        reachability: '.env is gitignored (git check-ignore confirmed) and dotenvx injects it into process.env at runtime; NODE_OPTIONS is consumed before that injection so it is NOT exploitable from .env, GIT_CONFIG_* is',
      },
      ancestry: {
        'genuine worktree AHEAD': 'REFUSED SOURCE_TREE_AHEAD_OF_BASE',
        'detached at an AHEAD commit': 'REFUSED',
        'detached exactly AT origin/main': 'accepted here; enforceTreeCurrency independently rejects detached_head',
        'baseRef origin/nope (unresolvable)': 'REFUSED — fails closed',
        'CONTROL clean at origin/main': 'ACCEPTED, currency PASSED',
      },
      r5_3_content_attack: {
        'HEAD == origin/main': true,
        'status in tree': 'M scripts/worktree-reaper.mjs, ?? .reap-protected.json',
        ensureSourceTreeWorktree: '{created:false, refreshed:true}',
        enforceTreeCurrency: 'PASSED',
        'file that would be executed': 'attacker content, verbatim',
        'untracked-module variant': 'also accepted, also current',
      },
      test_mutations_61_baseline: {
        'M-A empty SOURCE_TREE_DIRNAMES': '61 tests, 7 FAILED — count holds, suite reddens (TEST-1 fix verified)',
        'M-B check 3 neutralised': '61 tests, 2 FAILED',
        'M-C ancestry removed': '61 tests, 2 FAILED',
        'M-D scrub key list gutted': '61 tests, 2 FAILED',
        'M-E scrub UNWIRED at worktree-reaper-tick.cjs:246': '61 tests, 0 FAILED — NOT CAUGHT',
        'M-F scrub UNWIRED at spawn-control.js:596': '61 tests, 0 FAILED — NOT CAUGHT',
      },
      ni_r1_reverified: '[stale x5, inflight] first alarm due-tick 7 (was 36 with starvation never firing); all controls unchanged',
    },
    files_reviewed: [
      'lib/fleet/source-tree-refresh.cjs',
      'lib/fleet/spawn-control.js',
      'lib/fleet/tree-currency.cjs',
      'lib/worktree-reaper/detectors.js',
      'scripts/fleet/worktree-reaper-tick.cjs',
      'tests/unit/fleet/source-tree-identity-realgit.test.js',
      'tests/unit/fleet/source-tree-identity.test.js',
      'tests/unit/fleet/spawn-source-ensure.test.js',
      'tests/unit/coordinator/reaper-not-invoked.test.js',
      'tests/unit/worktree-reaper/source-tree-idle-route.test.js',
      'tests/unit/worktree-reaper/source-tree-self-protection.test.js',
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
console.log('VERDICT=' + results.verdict + ' CONFIDENCE=' + results.confidence + ' SCORE=' + results.score);
