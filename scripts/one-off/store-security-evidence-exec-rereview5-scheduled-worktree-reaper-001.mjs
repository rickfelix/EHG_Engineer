/**
 * EXEC-phase SECURITY **RE-REVIEW #5** for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001
 * (sd_id 23c2a2d4-89af-4885-b87b-7a5b3c4ded1d), at HEAD 364ef34b82d.
 *
 * The lead asked to have the "it is now closed" claim REFUTED. It is refuted, on a NEW axis.
 *
 * Rounds 1-4 attacked IDENTITY (is this directory our worktree?) and round 4 added INTEGRITY-OF-
 * HISTORY (is its HEAD an ancestor of the base ref?). Both are checks on GIT METADATA. The reaper
 * executes FILES. Nothing in the chain ever compares the two, so a genuine, correctly-linked,
 * exactly-at-base source tree with a tampered WORKING TREE passes every guard and executes.
 *
 * All findings MEASURED with real git 2.50.1 in a scratch repo under the session temp dir, driving
 * the PRODUCTION functions (ensureSourceTreeWorktree + enforceTreeCurrency) through the exact
 * runner shapes used by scripts/fleet/worktree-reaper-tick.cjs:241-250 and :334-351.
 *
 * TR-1/TR-4 honoured: no reaping against the live pool, no allowSelfHeal on the shared root, no
 * `git checkout` in the shared root. The only contact with the shared root was a read-only
 * `git status --porcelain` / `git rev-list --count` (no fetch). Every scratch repo and every
 * forged worktree lived under the session temp dir and was removed.
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = '23c2a2d4-89af-4885-b87b-7a5b3c4ded1d';
const SD_KEY = 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001';
const CODE = 'SECURITY';
const PHASE = 'EXEC';
const HEAD = '364ef34b82d';

const findings = [
  {
    id: 'CI-1 (NEW, BLOCKING)',
    severity: 'critical',
    title:
      'The chain verifies git METADATA and never the FILES it executes — one uncommitted file write into a '
      + 'GENUINE, correctly-linked, exactly-at-base .reaper-source runs attacker code with --execute --stage2 --yes',
    location:
      'lib/fleet/source-tree-refresh.cjs:321-354 (reuse branch: marker, refresh, ancestry — no content assertion); '
      + 'lib/fleet/tree-currency.cjs:141-142 (`behind===0` returns current:true and DISCARDS `dirty`); '
      + 'consumed at scripts/fleet/worktree-reaper-tick.cjs:308 (script resolved from sourceRoot) and :448 (spawned)',
    note:
      'MEASURED end-to-end. Let the module CREATE .reaper-source itself (no forgery, no pre-creation, no env var, '
      + 'no mkdir). Then overwrite <dir>/scripts/worktree-reaper.mjs and commit NOTHING. Re-running the production '
      + 'chain: ensureSourceTreeWorktree -> {created:false, refreshed:true} (fetch AND merge --ff-only both ran and '
      + 'succeeded); isLinkedWorktreeOf CHECK 1/2/3 all pass because the tree really IS our linked worktree; '
      + 'isAtOrBehind passes because HEAD is EXACTLY origin/main; enforceTreeCurrency returns '
      + '{current:true, behind:0, dirty:true} — it COMPUTES dirty at tree-currency.cjs:132 and then ignores it, '
      + 'exactly as its own comment at :271-275 says it must ("assessTreeCurrency returns current:true whenever '
      + 'behind === 0 REGARDLESS of dirty"). Observed output of the executed script: '
      + '"*** ATTACKER CODE RUNNING WITH REAPER PRIVILEGES ***".'
      + ' PERSISTENCE MEASURED SEPARATELY: advanced origin/main with a real commit and re-ran. The refresh '
      + 'fast-forwarded the tree to the new origin/main (cc4084c), `git status --porcelain` still showed '
      + '" M scripts/worktree-reaper.mjs", ancestry still exited 0, currency still said behind:0 — and the plant '
      + 'executed again. The SD\'s own refresh mechanism KEEPS the tree passing every guard while carrying the '
      + 'modification indefinitely. If an incoming commit does touch the planted file the merge fails, refreshed '
      + 'goes false and currency refuses on behind>0 — the plant is not destroyed, it simply waits.',
    consequence:
      'Capability required is ONE FILE WRITE — strictly less than the bare-mkdir hole (S2-R), the .git-FILE plant '
      + '(S2-R2), the GIT_DIR/GIT_WORK_TREE plant (S2-R3) and the commit-on-top attack (S2-R4), every one of which '
      + 'this SD has already closed. .reaper-source/ is gitignored (.gitignore:18-23 as of this branch) so the plant '
      + 'is invisible to `git status` in the root. The live host has WORKTREE_REAPER_EXECUTE=stage2 in .env:96 and '
      + 'WORKTREE_REAPER_ENABLED unset (isEnabled() defaults true), and buildReaperArgs appends --all-pools by '
      + 'default — so the executed payload inherits the privilege to delete every worktree in every registered pool. '
      + 'S2-R4\'s own comment states the principle correctly ("IDENTITY IS NOT INTEGRITY") and then implements a '
      + 'check on COMMITS; the artifact executed is FILES. This is the same finding one level down.',
    recommendation:
      'Assert CONTENT, not history, before returning from the reuse branch. TWO-SIDED PREDICATE MEASURED ACROSS '
      + 'FOUR STATES (see CI-2 for why the obvious one is blind): '
      + '`git -C <dir> status --porcelain --untracked-files=all --ignored=matching`, with an EXPLICIT minimal '
      + 'allowlist of exactly `.reap-protected.json`, must be empty. Measured: pristine+marker -> CLEAN; tracked '
      + 'file modified -> DIRTY; extra untracked file -> DIRTY; gitignored node_modules plant -> DIRTY '
      + '(`!! node_modules/`); back to pristine -> CLEAN again. Give it its own error code alongside '
      + 'SOURCE_TREE_IDENTITY_ERROR / SOURCE_TREE_AHEAD_ERROR and fail SOFT at the caller, same as those. '
      + 'DEFENCE IN DEPTH on the specific artifact: compare `git -C <dir> hash-object scripts/worktree-reaper.mjs` '
      + 'against `git -C <dir> rev-parse HEAD:scripts/worktree-reaper.mjs` — measured to match on a pristine tree '
      + 'and to diverge (3697622d -> 7537e970) on one appended line. '
      + 'NOTE THE ALLOWLIST IS THE HOLE: every entry added to it later re-opens this finding for that path.',
    priority: 'critical',
    blocking: true,
  },
  {
    id: 'CI-2 (NEW, BLOCKING — the trap awaiting the obvious fix for CI-1)',
    severity: 'critical',
    title:
      'The natural fix for CI-1 (`git status --porcelain`, or `ls-files --others --exclude-standard`) is ITSELF '
      + 'blind: a gitignored node_modules plant inside the source tree shadows the parent repo\'s dependency and '
      + 'executes while both commands report the tree clean',
    location:
      'lib/fleet/source-tree-refresh.cjs (the fix site for CI-1); node ESM/CJS resolution walks UP from '
      + '<dir>/scripts/worktree-reaper.mjs, so <dir>/node_modules precedes <repoRoot>/node_modules',
    note:
      'MEASURED. `git check-ignore node_modules` in the real repo answers YES. In a scratch repo configured to '
      + 'match, planted <dir>/node_modules/leftpad/{package.json,index.js} and made the source-tree script import '
      + 'it. Result: the PLANTED copy executed ("*** SHADOWED DEP EXECUTED FROM .reaper-source/node_modules ***"), '
      + 'beating <repoRoot>/node_modules/leftpad. Visibility at that same instant: '
      + '`git status --porcelain` -> only "?? .reap-protected.json"; '
      + '`git ls-files --others --exclude-standard` -> only ".reap-protected.json". The plant was on disk, '
      + 'executing, and INVISIBLE to both. This matters because the source tree is created by `git worktree add` '
      + 'and therefore has NO node_modules of its own — resolution falling through to the parent is load-bearing '
      + 'for the reaper to run at all, and it is exactly what makes the shadow slot writable and empty.',
    consequence:
      'A fix for CI-1 that reaches for the obvious cleanliness command would close the file-modification variant, '
      + 'pass its own tests, and leave a code-execution path open with the SAME one-file-write capability — while '
      + 'the SD reports the class closed. That is the failure mode this SD has now hit five times.',
    recommendation:
      '`--ignored=matching` is the discriminator and it is the reason the CI-1 predicate is specified with that '
      + 'flag rather than a bare --porcelain. Any test for CI-1 must include the gitignored-plant case as a '
      + 'POSITIVE control, or it cannot distinguish the correct fix from the blind one.',
    priority: 'critical',
    blocking: true,
  },
  {
    id: 'FORGE-4 (CONFIRMED OPEN — answers the lead\'s "is there a FOURTH way")',
    severity: 'high',
    title:
      'CHECK 3 asserts a PATH SHAPE, and .git/worktrees/<name> is an attacker-writable directory — a hand-forged '
      + 'entry satisfies checks 1+2+3 and the ancestry check with FIVE file writes and ZERO git commands',
    location: 'lib/fleet/source-tree-refresh.cjs:261-262',
    note:
      'MEASURED twice. (a) Copied a real .git/worktrees/<name> and rewrote its `gitdir`. (b) FROM SCRATCH, no real '
      + 'worktree to copy: mkdir <repoRoot>/.git/worktrees/SCRATCHFORGE containing `commondir` ("../.."), `gitdir` '
      + '(-> <cand>/.git) and `HEAD` ("ref: refs/heads/main"), plus <cand>/.git as a file ("gitdir: '
      + '<repoRoot>/.git/worktrees/SCRATCHFORGE") and the payload. Observed answers: '
      + '--git-common-dir = <repoRoot>/.git (CHECK 1 pass, equals repoRoot\'s), '
      + '--show-toplevel = <cand> (CHECK 2 pass), '
      + '--absolute-git-dir = <repoRoot>/.git/worktrees/SCRATCHFORGE (CHECK 3 pass — it literally starts with '
      + '`<mine>/worktrees/`), merge-base --is-ancestor HEAD origin/main exit 0 (S2-R4 pass), currency '
      + '{current:true, behind:0, branch:"main"}. Payload executed. My first attempt FAILED only because I wrote a '
      + 'POSIX-style path into `gitdir`; that is a path-format mistake, not a missing capability. '
      + 'This was PREDICTED in row 33616946\'s in-flight snapshot ("forged .git/worktrees metadata: still ACCEPTED '
      + '— the documented residual"); it is carried here as an OPEN finding because the lead asked directly and '
      + 'because it is now measured end-to-end rather than reasoned.',
    consequence:
      'CHECK 3 raises the cost of forging linkage from 2 writes to 5. It does not close it. Subsumed by CI-1 — '
      + 'the CI-1 predicate refuses a forged tree too, because a hand-built gitdir has no index matching the '
      + 'planted content — so fixing CI-1 correctly retires this one as well.',
    recommendation:
      'Do not chase a fourth linkage check; the ladder has no top rung as long as the check is over metadata the '
      + 'attacker can write. Fix CI-1 (content) and this closes with it. Optionally cross-check the candidate '
      + 'against `git -C <repoRoot> worktree list --porcelain`, which enumerates what git itself considers '
      + 'registered — cheaper to reason about than a path prefix, though still metadata.',
    priority: 'high',
    blocking: true,
  },
  {
    id: 'SCRUB-1 (NEW)',
    severity: 'high',
    title:
      'scrubGitEnv misses GIT_CONFIG_COUNT / GIT_CONFIG_KEY_n / GIT_CONFIG_VALUE_n — an ARBITRARY COMMAND '
      + 'EXECUTION primitive that survives the scrub and fires on a plain `git status --porcelain`',
    location: 'lib/fleet/source-tree-refresh.cjs:43-46 (GIT_REDIRECT_ENV_KEYS)',
    note:
      'MEASURED. Set GIT_CONFIG_COUNT=1, GIT_CONFIG_KEY_0=core.fsmonitor, GIT_CONFIG_VALUE_0="sh <script> <out>". '
      + 'Passed process.env through the real scrubGitEnv and confirmed the three survive it verbatim '
      + '(AFTER SCRUB, GIT_CONFIG_COUNT = 1 | KEY_0 = core.fsmonitor). Ran the production runner shape '
      + '(spawnSync git status --porcelain with env: scrubGitEnv(process.env)): git exited 0 and the named command '
      + 'RAN (wrote its marker file). `git status --porcelain` is exactly what assessTreeCurrency executes at '
      + 'tree-currency.cjs:132, and the fetch/merge in buildSourceTreeUpdateArgs run under the same env. '
      + 'Also absent from the list and each dangerous in its own way: GIT_CONFIG_GLOBAL, GIT_CONFIG_SYSTEM '
      + '(redirect which config files are read), GIT_SSH_COMMAND and GIT_PROXY_COMMAND (execute on fetch), '
      + 'GIT_EXTERNAL_DIFF, GIT_ATTR_NOSYSTEM, GIT_EXEC_PATH.',
    consequence:
      'The SD adopted "redirection vars in the INHERITED environment" as an in-scope threat when it added '
      + 'GIT_DIR/GIT_WORK_TREE to the scrub (the header at :36-42 says so explicitly). Under that same model the '
      + 'unscrubbed GIT_CONFIG_* is strictly worse than what was scrubbed: repo redirection versus arbitrary local '
      + 'code execution, reachable through the guard itself. The precondition (control of the sweep process\'s env) '
      + 'is stronger than filesystem write, which is why this is HIGH and not CRITICAL — but it makes the scrub '
      + 'incomplete against the threat model it was written for.',
    recommendation:
      'Extend GIT_REDIRECT_ENV_KEYS with GIT_CONFIG_GLOBAL, GIT_CONFIG_SYSTEM, GIT_SSH_COMMAND, GIT_PROXY_COMMAND, '
      + 'GIT_EXTERNAL_DIFF, GIT_ATTR_NOSYSTEM, GIT_EXEC_PATH, and — because GIT_CONFIG_KEY_n/VALUE_n are INDEXED '
      + 'and cannot be enumerated by a fixed list — delete every key matching /^GIT_CONFIG_/ rather than naming '
      + 'them. A fixed-name list is structurally unable to cover this family; that is the bug, not the omission.',
    priority: 'high',
    blocking: true,
  },
  {
    id: 'SCRUB-2 (NEW)',
    severity: 'medium',
    title:
      'The scrub is applied to the GUARD\'s runners but not to the runners that DO THE DESTRUCTION, nor to '
      + 'tree-currency\'s own default runner',
    location:
      'lib/fleet/tree-currency.cjs:55-62 (defaultRunner — execFileSync with no `env`, inherits everything); '
      + 'scripts/fleet/worktree-reaper-tick.cjs:448-453 (spawn of the reaper child, no `env` option); '
      + 'scripts/worktree-reaper.mjs:613-619 (runGit — spawnSync, no `env` option)',
    note:
      'Read, not guessed: none of the three passes an `env`. The reaper tick scrubs the env for its identity probe '
      + 'at worktree-reaper-tick.cjs:245-247 and then spawns the child that performs `git worktree remove` with '
      + 'the ambient environment intact. enforceTreeCurrency is called at :336 WITHOUT a runner in production, so '
      + 'it uses defaultRunner and every git call it makes — including the `git status --porcelain` in SCRUB-1 — '
      + 'runs unscrubbed.',
    consequence:
      'Asymmetric hardening: the check is protected and the action is not. Any redirection var the guard was '
      + 'hardened against still reaches the process that deletes worktrees. This is what makes SCRUB-1 reachable '
      + 'through tree-currency even after source-tree-refresh\'s own runners are fixed.',
    recommendation:
      'Apply the (extended) scrub at every site that invokes git on behalf of the reaper or the spawn path, not '
      + 'only at the identity probe. tree-currency.cjs:55-62 is the highest-value one because it is the default '
      + 'and therefore the one production actually uses.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'OVERRIDE-1 (NEW)',
    severity: 'medium',
    title:
      'Layer 2 of the "two independent mechanisms on a data-loss path" silently disappears whenever '
      + 'FLEET_REAPER_SOURCE_DIR / FLEET_SPAWN_SOURCE_DIR relocates the tree',
    location:
      'lib/worktree-reaper/detectors.js:358-366 (idle guard) and :471-486 (SOURCE_TREE_DIRNAMES / NON_SD_PREFIXES); '
      + 'override read at lib/fleet/source-tree-refresh.cjs:111-115',
    note:
      'Both layer-2 mechanisms key on BASENAME (`SOURCE_TREE_DIRNAMES.includes(path.basename(wt.path))` and '
      + '`NON_SD_PREFIXES.some(p => basename.startsWith(p))`). The override accepts an arbitrary absolute path, '
      + 'whose basename need not be `.reaper-source`/`.spawn-source`. The marker (layer 1) still gets written '
      + 'because markSourceTreeReapProtected writes into the RESOLVED dir — so the two layers are not independent '
      + 'with respect to this variable: one of them is silently unconditional and the other silently vanishes.',
    consequence:
      'On any host that sets the override, the stated invariant ("protection survives the marker being deleted") '
      + 'is false, and the failure is invisible — the tree keeps working right up until the marker is removed and '
      + 'the reaper deletes its own execution source.',
    recommendation:
      'Either resolve the override through the same predicate the detectors use (register the resolved basename), '
      + 'or refuse an override whose basename is not in SOURCE_TREE_DIRNAMES. The second is a two-line change and '
      + 'keeps one representation.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'FS-R1-AVAIL (NEW — availability, currently INERT)',
    severity: 'medium',
    title:
      'FS-R1 is correct in direction but converts a transient git failure into a HARD spawn refusal for '
      + 'worktree-issued spawns, contradicting the same file\'s stated fail-soft policy',
    location: 'lib/fleet/spawn-control.js:618-632 (catch), consumed at :641-658',
    note:
      'ANSWERS THE LEAD\'S QUESTION DIRECTLY: yes, it introduces a new failure mode. The catch now sets '
      + 'currencyApplies=true and currencyDir=repoRoot, so enforceTreeCurrency runs against the SHARED ROOT. '
      + 'Measured on the live root, read-only, no fetch: branch=main, 570 porcelain paths, 83 commits behind '
      + 'origin/main. selfHealable = !dirty && branch===main (tree-currency.cjs:150) is therefore FALSE, so '
      + 'enforceTreeCurrency THROWS TreeStaleError and nothing catches it — the spawn is refused. '
      + 'ensureSourceTreeWorktree throws on: SOURCE_TREE_IDENTITY_ERROR (which isLinkedWorktreeOf also returns for '
      + 'ANY transient git failure — its catch at :265-267 cannot distinguish "not ours" from "git hiccuped"), the '
      + 'NEW SOURCE_TREE_AHEAD_ERROR, and a failing `git worktree add`. '
      + 'CURRENTLY INERT: the whole block is gated on isSpawnSourceTreeEnabled (spawn-control.js:362-367), which '
      + 'returns false when FLEET_SPAWN_SOURCE_TREE is unset, and it is not set in .env. Before FS-R1 a '
      + 'worktree-issued spawn on this path proceeded unchecked; it now hard-fails.',
    consequence:
      'Fail-closed is the right direction and the previous state (unchecked) was worse. But the file argues twice '
      + '(:604-606, :634-637) that "a git hiccup must not be worse than the problem this SD fixes" and fail-softs '
      + 'the unresolvable-repo-root case for exactly that reason, then fail-hards the indistinguishable case one '
      + 'branch above. A default-off flag moves this risk, it does not test it — the day the flag flips, one '
      + 'index.lock contention becomes a fleet-wide spawn outage.',
    recommendation:
      'Keep currencyApplies=true (the correction is right). Reconcile the policy: either fail-soft this branch the '
      + 'way the sibling branch does, or accept the outage deliberately and pin it with a test that drives '
      + 'ensureSpawnSourceWorktree to throw a TRANSIENT error and asserts the spawn is refused — so the behaviour '
      + 'is chosen rather than inherited. Do it before the flag flips, not after.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'NI-R2-DEFER (advisory — the deferral is ACCEPTED, with one correction)',
    severity: 'low',
    title:
      'The deferral is right, but the deferral NOTE points the future gauge at a value that path never loads — '
      + 'it will be built in the wrong place',
    location: 'scripts/stale-session-sweep.cjs:3805-3813; scripts/fleet/worktree-reaper-tick.cjs:287-289',
    note:
      'The lead asked whether deferring the wall-clock gauge is wrong. It is NOT wrong: '
      + 'WORKTREE_REAPER_ENABLED=false was a permanently silent stop before this SD and is not a regression it '
      + 'introduced, and excluding \'disabled\' from a gate that cannot see it is more honest than including it. '
      + 'THE CORRECTION: the note says "(now - state.last_spawn_at) is the control that would see it". tick() '
      + 'returns at worktree-reaper-tick.cjs:288 BEFORE readState() at :291, so on the disabled path last_spawn_at '
      + 'is never loaded and is not in the returned object. A gauge built inside tick() therefore cannot see it '
      + 'either — it has to read .claude/worktree-reaper-state.json from a DIFFERENT consumer (the sweep, or the '
      + 'coordinator). Record that constraint on the completion flag or the deferred item gets implemented in the '
      + 'one place that structurally cannot work.',
    consequence: 'A correctly-deferred item implemented at the wrong site, arriving green and blind.',
    recommendation:
      'Amend the completion flag with the siting constraint. No code change required in this SD.',
    priority: 'low',
    blocking: false,
  },
];

const confirmedSound = [
  {
    id: 'S2-R2 / S2-R3',
    title: 'The .git-FILE plant and the GIT_DIR/GIT_WORK_TREE plant are GENUINELY CLOSED — two-sided',
    note:
      'Re-measured at HEAD ' + HEAD + ' against the production chain. .git-file plant (mkdir + a file named .git '
      + 'containing "gitdir: <repoRoot>/.git") -> BLOCKED_AT_ENSURE, code SOURCE_TREE_NOT_LINKED_WORKTREE. Bare '
      + 'mkdir with ambient GIT_DIR + GIT_WORK_TREE -> BLOCKED_AT_ENSURE, same code. NEGATIVE CONTROL in the same '
      + 'run: a genuine linked worktree -> REACHED_EXECUTION with the legitimate payload, so the refusals are the '
      + 'guard firing and not the harness being broken. CHECK 3 does what it claims.',
  },
  {
    id: 'CHECK 3 prefix arithmetic',
    title: 'Every prefix edge case the lead listed is handled — no false pass and no false refusal',
    note:
      'Driven through the real norm()+startsWith predicate. REFUSE: repoRoot itself (<common>); sibling directory '
      + '<common>/worktreesX/foo (the trailing slash in the literal blocks it); a repo genuinely located under a '
      + 'directory named worktrees (C:/worktrees/repo/.git — the prefix is anchored at <common>, so the coincidence '
      + 'cannot match). PASS: genuine <common>/worktrees/foo; trailing slash on the candidate (norm strips it, so '
      + 'no false refusal); mixed case (norm lowercases both sides, so no case-based bypass AND no case-based '
      + 'refusal). `mine` is the CANDIDATE\'s answer but is constrained to equal `theirs` by CHECK 1 before it is '
      + 'used in CHECK 3, so it is not independently attacker-influenced. The only defeat is FORGE-4.',
  },
  {
    id: 'S2-R4 placement',
    title: 'Scoping the ancestry check to the source tree and NOT to enforceTreeCurrency is the RIGHT call',
    note:
      'Verified by reading the consumer, as the lead asked. enforceTreeCurrency is applied to ordinary worker '
      + 'worktrees, which are legitimately ahead of main by construction (spawn-control.js:564-570 documents the '
      + 'exemption and why). A blanket ancestry rule there would refuse the whole fleet exactly as stated. '
      + 'BYPASS ATTEMPTS, all fail CLOSED and correctly: origin/main absent -> the runner throws on non-zero exit '
      + '-> isAtOrBehind catches -> false -> SOURCE_TREE_AHEAD_ERROR (source-tree-refresh.cjs:276-283); detached '
      + 'HEAD -> is-ancestor still answers, and currency independently refuses with detached_head '
      + '(tree-currency.cjs:128-130). A ref rewritten between check and exec is a real TOCTOU, but an attacker who '
      + 'can do that already has CI-1, which is cheaper and needs no race — the same subsumption the S2-R4 comment '
      + 'claims, and it holds.',
  },
  {
    id: 'NI-R1',
    title: 'The reset move does NOT break legitimate recovery',
    note:
      'Traced through worktree-reaper-tick.cjs. A tree that goes stale and then recovers reaches the spawn at :448, '
      + 'result===\'spawned\', and BOTH counters clear at :473/:477. The one case where a recovered tree does not '
      + 'clear its refusal streak is a wedged pid holding single-flight (:394-406) — and that case is covered, '
      + 'because consecutive_not_invoked climbs there and runReaperStarvationSurfacing checks not-invoked FIRST '
      + '(coordination-events.cjs:747-755) precisely so a frozen refusal streak cannot hide it. The two counters '
      + 'now mean the same thing and neither can be rewound by a tick that checked something and then did nothing.',
  },
  {
    id: 'S1 + S3 + idle route',
    title: 'No regression — self-protection, the idle-route guard and the census-blind alarm are all intact',
    note:
      'detectors.js:358-366 returns {matched:false, reason:"source_tree_protected"} on the idle route, scoped to '
      + 'SOURCE_TREE_DIRNAMES and deliberately not to all of NON_SD_PREFIXES (the reasoning in the comment is '
      + 'correct — blanket-applying it would make qf-/adhoc-/session- worktrees immortal). NON_SD_PREFIXES spreads '
      + 'the same constant. S3\'s pool_unknown branch still alarms with a DISTINCT kind and de-dupes separately '
      + '(coordination-events.cjs:627-636, :676-680). 319 tests across 28 files pass: source-tree-identity, '
      + 'source-tree-identity-realgit, the four worktree-reaper suites, reaper-not-invoked, reaper-starvation, '
      + 'reaper-alert-wire, reaper-gauge-antigaming.',
  },
  {
    id: 'FS-R2',
    title: 'Junction handling via fs.realpathSync.native is correct',
    note:
      'realNorm (source-tree-refresh.cjs:289-296) realpaths with a lexical fallback for the not-yet-created case, '
      + 'and CHECK 2 compares against it rather than path.resolve. The genuine-worktree control passed in every '
      + 'run above, so the fix did not introduce a false refusal on the happy path.',
  },
];

const results = {
  verdict: 'FAIL',
  confidence: 95,
  score: 62,
  status: 'FAIL',
  summary:
    'FAIL (4th consecutive). The claim is REFUTED on a new axis. Rounds 1-4 hardened IDENTITY (whose worktree is '
    + 'this?) and round 4 added ANCESTRY (is its HEAD in the base ref?) — both checks on git METADATA. The reaper '
    + 'executes FILES, and nothing in the chain ever compares the two. MEASURED with real git: overwrite one file '
    + 'in a GENUINE, module-created, correctly-linked, exactly-at-origin/main .reaper-source and commit nothing — '
    + 'CHECK 1/2/3 pass (it really is our worktree), merge --ff-only succeeds (already up to date), '
    + 'merge-base --is-ancestor passes (HEAD == base), enforceTreeCurrency returns current:true because it '
    + 'discards `dirty` at behind===0 — and the attacker payload executes with --execute --stage2 --yes '
    + '--all-pools on a host where .env:96 sets WORKTREE_REAPER_EXECUTE=stage2. Capability: ONE FILE WRITE, less '
    + 'than every attack this SD has already closed. It also SURVIVES a real fast-forward, so the SD\'s own '
    + 'refresh keeps the plant passing every guard indefinitely. A second blocking finding records that the '
    + 'obvious fix is blind too: a gitignored node_modules plant inside the tree shadows the parent\'s dependency '
    + 'and executes while both `git status --porcelain` and `ls-files --others --exclude-standard` report clean — '
    + 'a two-sided predicate that does see it is supplied and measured across four states. Also open: FORGE-4 '
    + '(hand-forged .git/worktrees entry defeats CHECK 3 with 5 file writes and no git commands — the residual '
    + 'predicted in round 4, now measured end-to-end) and SCRUB-1 (GIT_CONFIG_COUNT/KEY/VALUE survive scrubGitEnv '
    + 'and reach arbitrary command execution via core.fsmonitor on a plain `git status --porcelain`). '
    + 'GENUINELY CLOSED and re-verified two-sided: S2-R2, S2-R3, FS-R2, NI-R1, S1, S3, the idle route, and every '
    + 'CHECK 3 prefix edge case. S2-R4\'s placement decision is correct as argued. The NI-R2 deferral is accepted '
    + 'with one siting correction. Score 62 (up from 58: the closures are real and two-sided, but the remaining '
    + 'class is cheaper than everything closed).',
  conditions: [
    'BLOCKING CI-1: assert CONTENT before executing from the source tree — `git -C <dir> status --porcelain '
    + '--untracked-files=all --ignored=matching` empty except an explicit allowlist of exactly '
    + '`.reap-protected.json`; own error code; fail soft at the caller like the identity and ahead refusals.',
    'BLOCKING CI-2: the test for CI-1 MUST include the gitignored `node_modules/` plant as a positive control. '
    + 'Without it the test cannot tell the correct fix from the blind one, and the blind one passes.',
    'BLOCKING SCRUB-1: delete every /^GIT_CONFIG_/ key in scrubGitEnv (a fixed-name list structurally cannot '
    + 'cover the indexed KEY_n/VALUE_n family), and add GIT_SSH_COMMAND, GIT_PROXY_COMMAND, GIT_EXTERNAL_DIFF, '
    + 'GIT_ATTR_NOSYSTEM, GIT_EXEC_PATH.',
    'BLOCKING FORGE-4: closed automatically by a correct CI-1 fix. Verify with the from-scratch forge (5 files, '
    + 'no git commands) as a positive control rather than assuming subsumption.',
    'NON-BLOCKING SCRUB-2 / OVERRIDE-1 / FS-R1-AVAIL / NI-R2-DEFER: fix or record as completion flags with the '
    + 'reasoning above; FS-R1-AVAIL is inert only while FLEET_SPAWN_SOURCE_TREE stays unset.',
  ],
  metadata: {
    review_round: 5,
    reviewed_head: HEAD,
    branch: 'feat/SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001',
    prior_rows: ['33616946 (round 3, FAIL/58 — confirmed correct)', 'round 4 (idle-route + test-vacuity audit)'],
    open_findings: findings.filter((f) => f.blocking).map((f) => f.id),
    method:
      'Real git 2.50.1 in a disposable scratch repo (bare origin + clone + pushed main) under the session temp '
      + 'dir, driving the PRODUCTION functions ensureSourceTreeWorktree and enforceTreeCurrency through the exact '
      + 'runner shapes from worktree-reaper-tick.cjs:241-250 and :334-351, then executing the resolved script the '
      + 'way :308/:448 does. Every attack was run alongside a genuine-worktree negative control in the same '
      + 'session, so a refusal is distinguishable from a broken harness.',
    measurements: {
      'CI-1 uncommitted modification': 'ACCEPTED — {created:false, refreshed:true}, currency {current:true, behind:0, dirty:true}, payload executed',
      'CI-1 survives a real ff-merge': 'ACCEPTED — tree advanced to new origin/main cc4084c, plant intact, executed again',
      'CI-2 gitignored node_modules shadow': 'EXECUTED, and invisible to both `status --porcelain` and `ls-files --others --exclude-standard`',
      'CI-2 candidate predicate (--ignored=matching)': 'two-sided across 4 states: pristine CLEAN / tracked-mod DIRTY / untracked DIRTY / ignored-plant DIRTY / pristine CLEAN again',
      'FORGE-4 copied .git/worktrees entry': 'ACCEPTED — checks 1+2+3 and ancestry all pass, payload executed',
      'FORGE-4 from-scratch forge (5 writes, 0 git commands)': 'ACCEPTED — payload executed',
      'SCRUB-1 GIT_CONFIG_COUNT -> core.fsmonitor': 'survives scrubGitEnv verbatim; command EXECUTED on `git status --porcelain`, git exit 0',
      'CONTROL .git-file plant (S2-R2)': 'REFUSED — SOURCE_TREE_NOT_LINKED_WORKTREE',
      'CONTROL GIT_DIR/GIT_WORK_TREE plant (S2-R3)': 'REFUSED — SOURCE_TREE_NOT_LINKED_WORKTREE',
      'CONTROL genuine linked worktree': 'ACCEPTED, legitimate payload executed (negative control, no happy-path breakage)',
      'CHECK 3 prefix edge cases': 'worktreesX REFUSE, path-coincidence REFUSE, repoRoot REFUSE, trailing-slash PASS, mixed-case PASS',
      'live shared root (read-only)': 'branch=main, 570 porcelain paths, 83 behind origin/main -> selfHealable=false',
      'live host arming': '.env:96 WORKTREE_REAPER_EXECUTE=stage2; WORKTREE_REAPER_ENABLED unset (defaults true); FLEET_SPAWN_SOURCE_TREE unset (spawn block inert)',
      'regression suite': '319 tests / 28 files PASS',
    },
    files_reviewed: [
      'lib/fleet/source-tree-refresh.cjs',
      'lib/fleet/tree-currency.cjs',
      'lib/fleet/spawn-control.js',
      'scripts/fleet/worktree-reaper-tick.cjs',
      'scripts/stale-session-sweep.cjs',
      'lib/coordinator/coordination-events.cjs',
      'lib/worktree-reaper/detectors.js',
      'scripts/worktree-reaper.mjs',
      'tests/unit/fleet/source-tree-identity-realgit.test.js',
    ],
    safety:
      'TR-1/TR-4 honoured. No reaping against the live pool. No allowSelfHeal on the shared root. No `git checkout` '
      + 'in the shared root. Shared-root contact was read-only `git status --porcelain` and `git rev-list --count` '
      + 'against the CACHED origin/main ref (no fetch). All scratch repos, forged .git/worktrees entries and '
      + 'planted worktrees lived under the session temp dir and were removed.',
  },
};

const NL = String.fromCharCode(10);
const HR = '-'.repeat(72);
results.detailed_analysis = [
  'VERDICT: ' + results.verdict + '  |  SCORE: ' + results.score + '/100  |  STATUS: ' + results.status
    + '  |  CONFIDENCE: ' + results.confidence,
  'HEAD REVIEWED: ' + HEAD,
  '',
  'SUMMARY', '=======', results.summary, '',
  'OPEN FINDINGS (severity-ranked, file:line, measured exploit)',
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
  'CONDITIONS TO CLEAR THIS VERDICT',
  '='.repeat(72), '',
  results.conditions.map((c, i) => (i + 1) + '. ' + c).join(NL + NL),
].join(NL);

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: CODE, targetApplication: 'EHG_Engineer', fallback: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(CODE, SD_ID, { name: 'Chief Security Architect' }, results, { sdKey: SD_KEY, phase: PHASE });
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('VERDICT=' + results.verdict + ' CONFIDENCE=' + results.confidence + ' SCORE=' + results.score);
