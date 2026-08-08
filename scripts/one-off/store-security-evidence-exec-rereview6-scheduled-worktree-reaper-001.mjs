/**
 * EXEC-phase SECURITY **RE-REVIEW #6** for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001
 * (sd_id 23c2a2d4-89af-4885-b87b-7a5b3c4ded1d), at COMMITTED HEAD 339131fcb32.
 *
 * HEAD moved FOUR times during this review (364ef34b82d -> 571c2a8e39a -> b1e622792f5 ->
 * 339131fcb32). Everything below is re-measured against 339131fcb32; nothing is carried by
 * inference from an earlier commit.
 *
 * ALL FOUR blocking findings from row 199b97cf (CI-1, CI-2, FORGE-4, SCRUB-1) are CLOSED, measured
 * two-sided with real git and with a positive control in the same session. ONE new HIGH remains,
 * and it is the same primitive SCRUB-1 was, reachable through a door the fix did not cover.
 *
 * TR-1/TR-4 honoured. Mutations restored BY COPY (never `git checkout`), verified to have preserved
 * the lead's concurrent uncommitted edits. No reaping against the live pool, no writes to the
 * shared root. All scratch repos under the session temp dir.
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = '23c2a2d4-89af-4885-b87b-7a5b3c4ded1d';
const SD_KEY = 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001';
const CODE = 'SECURITY';
const PHASE = 'EXEC';
const HEAD = '339131fcb32';

const findings = [
  {
    id: 'SCRUB-2 (RE-RATED UPWARD — I under-rated this in row 199b97cf, and the correction is measured)',
    severity: 'high',
    title:
      'The SCRUB-1 fix landed on ONE door. enforceTreeCurrency — the production call shape, no runner injected — '
      + 'still reaches ARBITRARY COMMAND EXECUTION via GIT_CONFIG_* on the reaper\'s own currency check',
    location:
      'lib/fleet/tree-currency.cjs:55-62 (defaultRunner: execFileSync with cwd/timeout/encoding/stdio and NO `env`, '
      + 'so it inherits process.env wholesale); reached from scripts/fleet/worktree-reaper-tick.cjs:336-351, which '
      + 'passes a runner ONLY when opts.currencyRunner is set — i.e. in tests, never in production',
    note:
      'MEASURED at ' + HEAD + '. Called enforceTreeCurrency with the exact production shape '
      + '({dir, logger, label, allowSelfHeal:false, env:{}} and NO runner) against a genuine source tree, with '
      + 'GIT_CONFIG_COUNT=1 / GIT_CONFIG_KEY_0=core.fsmonitor / GIT_CONFIG_VALUE_0="sh <script> <out>" in the '
      + 'environment. Result: enforceTreeCurrency returned reason="current" AND the injected command RAN '
      + '(marker file written). assessTreeCurrency executes `git status --porcelain` at tree-currency.cjs:132 and '
      + '`git fetch` at :121 through this same unscrubbed runner. '
      + 'I RATED THIS MEDIUM AND NON-BLOCKING IN ROW 199b97cf. That was wrong, and wrong because I reasoned about '
      + 'it from the code instead of measuring it — the same failure mode this SD keeps catching. It is not a '
      + 'lesser sibling of SCRUB-1; it is SCRUB-1, still open, one module over.',
    consequence:
      'scrubGitEnv now correctly strips /^GIT_CONFIG_/ and seven command-execution vars, and both source-tree '
      + 'runners use it — but the currency check runs on the SAME directory in the SAME tick immediately '
      + 'afterwards, unscrubbed. A correction that lands on one access path while the others keep serving the old '
      + 'behaviour is not a closed finding. The reaper tick is the destructive path, and this is arbitrary local '
      + 'command execution on it.',
    recommendation:
      'One line: give tree-currency.cjs:55-62 `env: scrubGitEnv(process.env)` (it can require the CJS module '
      + 'directly), or thread the already-scrubbed runner from the two call sites. Prefer the former — the '
      + 'defaultRunner is what production actually uses, so fixing the default fixes every caller including '
      + 'spawn-control.js:642. Then re-run the measurement above: it is two-sided (the marker file is written or '
      + 'it is not) and takes seconds.',
    priority: 'high',
    blocking: true,
  },
  {
    id: 'IDLE-2-R (NEW)',
    severity: 'medium',
    title:
      'IDLE-2 unified the PREDICATE but not its INPUT — the two routes still disagree for the same directory when '
      + 'wt.key is supplied, which the exported signature explicitly invites',
    location:
      'lib/worktree-reaper/detectors.js:123 (`const basenameKey = wt.key || path.basename(wt.path || \'\')`) '
      + 'feeding :166; versus :371 (`isSourceTreeBasename(path.basename(wt.path))`)',
    note:
      'MEASURED across a 12-shape matrix driving both routes over identical fixtures. Eleven shapes agree. The '
      + 'twelfth does not: for wt = {path:"C:/repo/.reaper-source", key:"SD-GONE-999"}, hasOrphanSD returns '
      + '{matched:true, reason:"sdkey_not_in_db"} — REAPABLE via the orphan-sd route, the very route the S1 '
      + 'comment names as the one that sends source trees to stage2_remove — while isIdle returns {matched:false, '
      + 'reason:"source_tree_protected"}. One directory, two answers: the IDLE-2 class re-entered through the '
      + 'predicate\'s ARGUMENT rather than its body. '
      + 'NOT REACHABLE THROUGH THE PRODUCTION CALLER: scripts/worktree-reaper.mjs:1387 sets `key: basename` where '
      + 'basename is path.basename(wt.path), so both routes receive the same string today. But hasOrphanSD is '
      + 'EXPORTED and its JSDoc signature is `{ path: string, key?: string }` — a caller-supplied key is '
      + 'documented API. The claim "both routes now agree on every name tested" is therefore true by CALLER '
      + 'CONVENTION, not by construction — the same shape as the claim IDLE-2 itself retracted ("the two lists '
      + 'cannot drift": the lists could not, the predicates already had).',
    consequence:
      'Any future caller of hasOrphanSD that passes a key — which the signature invites — silently reopens IDLE-2 '
      + 'on the destructive route, with no test failing, because every existing test drives the production '
      + 'convention.',
    recommendation:
      'One line: in hasOrphanSD test `isSourceTreeBasename(path.basename(wt.path || \'\'))` rather than '
      + 'basenameKey. That is also the semantically correct input — the protection is about WHERE the tree is, '
      + 'while wt.key is a claim about WHICH SD it belongs to. Leave basenameKey for the sd_key candidate '
      + 'resolution above it, which is what it is for.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'IDLE-3-CODE (NEW)',
    severity: 'medium',
    title:
      'The new basename refusal reuses SPAWN_SOURCE_SITING_ERROR — re-committing the error-code conflation this '
      + 'file fixed 200 lines earlier, and escalating a config typo to a fleet-wide spawn outage',
    location:
      'lib/fleet/source-tree-refresh.cjs resolveSourceTreeDir (`if (code) err.code = code` on the basename throw), '
      + 'reached with code=SPAWN_SOURCE_SITING_ERROR from lib/fleet/spawn-control.js:297, consumed at '
      + 'spawn-control.js:622',
    note:
      'The naming error is stamped with the caller-supplied `code`, which on the spawn path is '
      + 'SPAWN_SOURCE_SITING_ERROR. spawn-control.js:622 treats that code as its ONE must-stay-fatal class and '
      + 're-throws, so a misnamed FLEET_SPAWN_SOURCE_DIR refuses every spawn — and the operator is told '
      + '"SPAWN_SOURCE_SITED_IN_EXEMPT_PATH" for a problem that has nothing to do with siting. The module already '
      + 'learned exactly this at source-tree-refresh.cjs:312-318, where the identity refusal was deliberately '
      + 'given its OWN code with the comment "reusing it would turn an identity refusal into a FLEET-WIDE SPAWN '
      + 'OUTAGE". Note the new SOURCE_TREE_CONTENT_UNVERIFIED correctly follows that precedent; this one does '
      + 'not. (The reaper path is unaffected — worktree-reaper-tick.cjs passes no `code`, so the error is '
      + 'code-less and resolveReaperSourceRoot fails soft to repoRoot.)',
    consequence:
      'A one-character env-var typo becomes a fleet-wide spawn outage reported under a code naming the wrong '
      + 'problem. The hazard the constraint guards is data-loss on the REAPER side; a misnamed tree is still '
      + 'perfectly safe to spawn FROM, so refusing every spawn is not proportionate.',
    recommendation:
      'Give it its own code (e.g. SOURCE_TREE_BASENAME_ERROR) so spawn-control degrades to the spawning tree — '
      + 'the same treatment the identity and content refusals already get, for the same reason.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'IDLE-3-ORDER (NEW — answers the lead\'s precedence question)',
    severity: 'low',
    title: 'The ordering is correct but currently unobservable — both throws carry the SAME code, so no consumer can tell them apart',
    location: 'lib/fleet/source-tree-refresh.cjs resolveSourceTreeDir',
    note:
      'You asked whether you inverted a precedence that matters. You did NOT — siting is checked first, so a path '
      + 'that is both mis-sited and misnamed reports the mis-siting, which is what you intended. But the '
      + 'precedence is invisible: both throws stamp the same caller-supplied `code`, and spawn-control.js:622 is '
      + 'the only programmatic consumer, so it sees one indistinguishable class. Only the human-readable message '
      + 'differs. The ordering you reasoned about buys message text and nothing else.',
    consequence: 'A deliberate decision no code path can act on — it will read as load-bearing to the next editor and is not.',
    recommendation: 'Fixing IDLE-3-CODE makes the ordering genuinely meaningful; until then say so in the comment rather than implying consumers distinguish them.',
    priority: 'low',
    blocking: false,
  },
  {
    id: 'ALLOWLIST-RESIDUAL (advisory)',
    severity: 'low',
    title: 'The one allowlisted path is content-unverified by construction — it is the residual hole and must stay inert',
    location: 'lib/fleet/source-tree-refresh.cjs sourceTreeAllowedPaths / assertSourceTreeContentClean',
    note:
      'The content check allowlists exactly `.reap-protected.json`, and that file\'s CONTENTS are never checked '
      + '(the module writes it itself, so it must be allowed). I probed the boundary and it holds: a file named '
      + '`.reap-protected.json.evil` is REFUSED, and a DIRECTORY named `.reap-protected.json` containing a payload '
      + 'is REFUSED — exact Set membership, not a prefix or substring test. The residual is therefore bounded to '
      + 'the marker file itself.',
    consequence:
      'Nothing today: the marker is JSON read for evidence/reason display. It becomes a hole the moment anything '
      + 'imports, executes, or shell-interpolates its contents, and it would then be the one file the content '
      + 'guard is contractually unable to see.',
    recommendation:
      'Keep the allowlist at exactly one entry and treat every future addition as re-opening CI-1 for that path. '
      + 'If the marker ever gains a consumer beyond display, validate its parsed shape at the read site.',
    priority: 'low',
    blocking: false,
  },
  {
    id: 'TOCTOU-RESIDUAL (advisory)',
    severity: 'low',
    title: 'A bounded write window remains between the content check and the spawn',
    location: 'lib/fleet/source-tree-refresh.cjs (check) -> scripts/fleet/worktree-reaper-tick.cjs:308 (existsSync) -> :448 (spawn)',
    note:
      'The content assertion runs inside ensureSourceTreeWorktree; enforceTreeCurrency, the script-exists probe '
      + 'and the single-flight check all run afterwards, then the child is spawned. A write landing in that window '
      + 'executes unverified.',
    consequence:
      'Materially smaller than what CI-1 was: milliseconds of race requiring precise timing, versus a plant that '
      + 'persisted indefinitely and was actively kept current by the refresh. Recording it so it is not '
      + 'rediscovered as a new finding.',
    recommendation:
      'Accept and record as a completion flag. Fully closing it needs execution from a verified snapshot (e.g. '
      + '`git checkout-index` into a fresh dir, or blob-hashing the resolved script immediately before spawn), '
      + 'which is a larger change than this SD should absorb.',
    priority: 'low',
    blocking: false,
  },
];

const confirmedSound = [
  {
    id: 'CI-1',
    title: 'CLOSED — measured two-sided at ' + HEAD,
    note:
      'Overwrote a TRACKED file in the module-created tree and committed nothing: REFUSED with '
      + 'SOURCE_TREE_CONTENT_UNVERIFIED, BLOCKED_AT_ENSURE. The exploit that reached execution at 364ef34b82d, '
      + 'b1e622792f5 and every commit before them no longer does.',
  },
  {
    id: 'CI-2',
    title: 'CLOSED — the fix is not blind, and this is the case that proves it',
    note:
      'Planted <dir>/node_modules/leftpad/{package.json,index.js} — GITIGNORED, and therefore invisible to plain '
      + '`git status --porcelain` and to `ls-files --others --exclude-standard`, which is what made the obvious '
      + 'fix blind. REFUSED with SOURCE_TREE_CONTENT_UNVERIFIED. `--untracked-files=all --ignored=matching` is '
      + 'doing the work it was specified to do.',
  },
  {
    id: 'FORGE-4',
    title: 'CLOSED via CI-1, exactly as predicted — no fourth linkage check was needed',
    note:
      'Rebuilt the from-scratch hand-forged .git/worktrees/SCRATCHFORGE entry (5 file writes, zero git commands). '
      + 'Confirmed checks 1/2/3 STILL pass at ' + HEAD + ' — `rev-parse --absolute-git-dir` answers '
      + '<repoRoot>/.git/worktrees/SCRATCHFORGE, which startsWith `<mine>/worktrees/`. The content check refuses '
      + 'it anyway (SOURCE_TREE_CONTENT_UNVERIFIED), because a forged gitdir\'s payload is untracked content. The '
      + 'reasoning that this retires without a fourth metadata check is correct and now measured, not assumed.',
  },
  {
    id: 'SCRUB-1',
    title: 'CLOSED in the source-tree runners — the prefix matcher is the right shape',
    note:
      'With GIT_CONFIG_COUNT / GIT_CONFIG_KEY_0 / GIT_CONFIG_VALUE_0 / GIT_SSH_COMMAND / GIT_EXTERNAL_DIFF / '
      + 'GIT_CONFIG_GLOBAL all set, scrubGitEnv now removes every one of them ("none survived") and the '
      + 'core.fsmonitor command does NOT run through that runner. PATH survives, so it does not over-scrub. The '
      + '/^GIT_CONFIG_/ PREFIX matcher is the correct construction — a fixed-name list structurally cannot cover '
      + 'the indexed KEY_n/VALUE_n family. See SCRUB-2 for the door this does not cover.',
  },
  {
    id: 'POSITIVE CONTROL',
    title: 'The guard does not refuse everything — the genuine path still works, twice',
    note:
      'Load-bearing, because a guard that refuses every input passes every attack test above. A genuine '
      + 'module-created tree: created, then on a second pass REUSED with {refreshed:true}, content check PASSED, '
      + 'currency current, and the legitimate script executed. Re-verified again after all four attacks. No '
      + 'self-inflicted outage, and the reap-protection marker the module writes itself does not trip its own '
      + 'content check.',
  },
  {
    id: 'IDLE-2 (path shapes)',
    title: 'CONFIRMED CLOSED for every name shape — 12-case matrix over both routes',
    note:
      'AGREE-and-protected: exact .reaper-source; exact .spawn-source; trailing separator; trailing backslash; '
      + 'mixed slashes ("/sub\\.reaper-source"); a relocated override path; wt.key === "". AGREE-and-not-'
      + 'protected: UPPER case, Mixed case, the suffixed .reaper-source-2 (the original IDLE-2 case, now fixed), '
      + 'and the no-dot "reaper-source". path.basename normalises all six separator variants I tried, so there is '
      + 'no separator or trailing-slash bypass. The only disagreement is IDLE-2-R, about the ARGUMENT not the shape.',
  },
  {
    id: 'IDLE-3 (constraint + the trade)',
    title: 'CONFIRMED SOUND, and I agree with the trade — for a stronger reason than the one given',
    note:
      'THE TRADE IS RIGHT: a destructive classifier reading FLEET_*_SOURCE_DIR would answer DIFFERENTLY depending '
      + 'on which shell invoked the reaper — a cron/service run without the var would classify a live source tree '
      + 'as unprotected and delete it, while a manual run would not. Environment-dependent and unreproducible; '
      + 'worse than the bug being fixed. Constraining the basename keeps the classifier\'s input pure. '
      + 'THE CONSTRAINT HOLDS: measured six path variants (trailing /, trailing \\, //, mixed separators, .. '
      + 'segments, plain) all resolving to ".reaper-source", so none smuggles a different name past the equality '
      + 'check. CASE ATTACK CLOSED BY CONSTRUCTION: I measured that `git worktree list --porcelain` echoes the '
      + 'casing AS GIVEN to `worktree add` (registered "./SUB/.Reaper-Source", git reported ".Reaper-Source"), so '
      + 'a case-sensitive isSourceTreeBasename could in principle miss a tree — it cannot here, because the '
      + 'string reaching `worktree add` is the one resolveSourceTreeDir just constrained. '
      + 'This also retires OVERRIDE-1 from row 199b97cf: layer 2\'s literal is now true by construction.',
  },
  {
    id: 'TEST-1',
    title: 'CONFIRMED FIXED — and no other test in this SD has a production-data-dependent case count',
    note:
      'MEASURED BY MUTATION, not grep: my first pass was an awk scan for it() lexically inside a loop over an '
      + 'imported symbol and it found nothing, which proves only that the scan was narrow. Three mutations over '
      + 'the SD\'s 31 suites / 348 tests, each verified to have ACTUALLY APPLIED (changed:1) so a silently-'
      + 'non-matching mutation could not read as green: (a) SOURCE_TREE_DIRNAMES=[] -> 348 total, 7 RED; '
      + '(b) GIT_REDIRECT_ENV_KEYS=[] -> 348 total, 2 RED; (c) isSourceTreeBasename forced false -> 348 total, '
      + '6 RED. In all three the COUNT is preserved and cases turn red rather than vanishing — exactly the '
      + 'property TEST-1 is about. Case (b) was the thinnest at 2, and b1e622792f5 independently caught and fixed '
      + 'that very instance (the scrub-list loop in source-tree-identity-realgit.test.js) before I reported it; '
      + 'after that commit the same mutation turns 4 red. I found no remaining instance.',
  },
];

const results = {
  verdict: 'FAIL',
  confidence: 96,
  score: 84,
  status: 'FAIL — one HIGH remaining, one line to fix',
  summary:
    'ALL FOUR blocking findings from row 199b97cf are CLOSED at ' + HEAD + ', measured two-sided with real git and '
    + 'with a positive control in the same session: CI-1 (uncommitted tracked-file overwrite) REFUSED with '
    + 'SOURCE_TREE_CONTENT_UNVERIFIED; CI-2 (the gitignored node_modules plant that defeats the obvious fix) '
    + 'REFUSED; FORGE-4 REFUSED via the content check with checks 1/2/3 confirmed still passing, so it retired '
    + 'without a fourth linkage check exactly as predicted; SCRUB-1 fully stripped by the new /^GIT_CONFIG_/ '
    + 'prefix matcher with PATH preserved. The genuine tree is still created, reused, refreshed and executed — '
    + 'the guard does not refuse everything, which is the control that makes the four refusals mean something. '
    + 'The allowlist boundary holds (`.reap-protected.json.evil` and a DIRECTORY of that name are both refused). '
    + 'The three fixes I was asked to attack also hold: IDLE-2 agrees across a 12-shape matrix, IDLE-3\'s '
    + 'constraint survives every separator/normalisation variant and the Windows casing attack (closed by '
    + 'construction, since the constrained string is the one that reaches `worktree add`), and TEST-1 is verified '
    + 'by mutation rather than grep — three mutations, count preserved at 348, 7/2/6 red, no remaining '
    + 'production-data-dependent case count anywhere in the SD. IDLE-3 also retires OVERRIDE-1. '
    + 'VERDICT IS STILL FAIL FOR ONE REASON, AND IT IS A CORRECTION OF MY OWN UNDER-RATING. SCRUB-2, which I '
    + 'called MEDIUM and non-blocking in row 199b97cf because I reasoned about it instead of measuring it, is the '
    + 'SAME primitive as SCRUB-1 and is still open: tree-currency.cjs:55-62 defaultRunner passes no `env`, and '
    + 'the reaper injects no runner in production, so I called enforceTreeCurrency in its exact production shape '
    + 'with GIT_CONFIG_COUNT/core.fsmonitor set and the injected command RAN while the function returned '
    + 'reason="current". scrubGitEnv is now correct and both source-tree runners use it, but the currency check '
    + 'runs on the same directory in the same tick, unscrubbed — a correction that landed on one access path '
    + 'while the others keep serving. That is arbitrary local command execution on the destructive path. It is '
    + 'one `env: scrubGitEnv(process.env)` on the default runner, and fixing the default fixes spawn-control too. '
    + 'Everything else remaining is medium or advisory: IDLE-2-R (predicate unified, input not — measured '
    + 'disagreement when wt.key is supplied; unreachable via the production caller but the exported signature '
    + 'invites it), IDLE-3-CODE (the basename refusal reuses SPAWN_SOURCE_SITING_ERROR, which spawn-control keeps '
    + 'fatal, so an env typo is a fleet-wide outage under a misleading code — the new SOURCE_TREE_CONTENT_'
    + 'UNVERIFIED follows the right precedent, this one does not), IDLE-3-ORDER, and two recorded residuals. '
    + 'Score 84 (from 62).',
  conditions: [
    'BLOCKING SCRUB-2: add `env: scrubGitEnv(process.env)` to lib/fleet/tree-currency.cjs:55-62 defaultRunner (or '
    + 'thread the scrubbed runner from both call sites — prefer fixing the default, since that is what production '
    + 'uses). Re-run the two-sided measurement: with GIT_CONFIG_COUNT/core.fsmonitor set, the marker file must '
    + 'NOT be written, and a clean tree must still assess current.',
    'NON-BLOCKING IDLE-2-R: test isSourceTreeBasename(path.basename(wt.path || \'\')) in hasOrphanSD so the two '
    + 'routes agree by construction rather than by what the caller happens to pass.',
    'NON-BLOCKING IDLE-3-CODE: give the basename refusal its own error code so spawn-control degrades instead of '
    + 'refusing the fleet, matching the precedent the content refusal already follows.',
    'ADVISORY: IDLE-3-ORDER (precedence correct but unobservable while both throws share a code); '
    + 'ALLOWLIST-RESIDUAL (keep it at one entry); TOCTOU-RESIDUAL (record as a completion flag). '
    + 'Still open and unchanged from row 199b97cf: FS-R1-AVAIL (an in-flight revert was observed uncommitted) and '
    + 'the NI-R2 deferral siting correction.',
  ],
  metadata: {
    review_round: 6,
    reviewed_head: HEAD,
    head_history:
      'spawned at 364ef34b82d; re-targeted to 571c2a8e39a; HEAD moved to b1e622792f5 and then to ' + HEAD
      + ' mid-review. All results below are measured at ' + HEAD + ', not carried forward by inference.',
    prior_rows: ['199b97cf (round 5, FAIL/62) — its four blocking findings are now CLOSED'],
    closed_this_round: ['CI-1', 'CI-2', 'FORGE-4', 'SCRUB-1', 'OVERRIDE-1 (via IDLE-3)'],
    open_blocking: ['SCRUB-2'],
    new_findings: ['IDLE-2-R', 'IDLE-3-CODE', 'IDLE-3-ORDER', 'ALLOWLIST-RESIDUAL', 'TOCTOU-RESIDUAL'],
    self_correction:
      'SCRUB-2 was rated MEDIUM/non-blocking in row 199b97cf on the basis of reading the code. Measured at '
      + HEAD + ' it is arbitrary command execution reachable from the production reaper tick — the same primitive '
      + 'as SCRUB-1. The severity moved because a measurement replaced an inference, not because the bar moved.',
    method:
      'Real git 2.50.1 in disposable scratch repos (bare origin + clone + pushed main) under the session temp '
      + 'dir, driving the PRODUCTION functions ensureSourceTreeWorktree and enforceTreeCurrency through the exact '
      + 'runner shapes from worktree-reaper-tick.cjs:241-250 and :336-351, then executing the resolved script the '
      + 'way :308/:448 does. Every attack ran alongside a genuine-worktree positive control in the same session. '
      + 'Detector work used a 12-shape matrix over both routes; test-vacuity work used a verified-applied mutation '
      + 'battery rather than a grep.',
    measurements: {
      'CI-1 tracked-file overwrite': 'REFUSED — SOURCE_TREE_CONTENT_UNVERIFIED (was: executed)',
      'CI-2 gitignored node_modules plant': 'REFUSED — SOURCE_TREE_CONTENT_UNVERIFIED (was: executed, invisible to status)',
      'FORGE-4 from-scratch forged worktree entry': 'checks 1/2/3 still PASS; REFUSED by the content check',
      'SCRUB-1 GIT_CONFIG_* + 5 exec vars through scrubGitEnv': 'all removed, command did NOT run, PATH preserved',
      'SCRUB-2 GIT_CONFIG_* through enforceTreeCurrency (production shape, no runner)': 'COMMAND RAN; returned reason="current" — STILL OPEN',
      'allowlist boundary .reap-protected.json.evil': 'REFUSED',
      'allowlist boundary DIRECTORY named .reap-protected.json': 'REFUSED',
      'POSITIVE CONTROL genuine tree (create, then reuse)': 'created; reused {refreshed:true}; content PASSED; legitimate script executed',
      'IDLE-2 12-shape matrix': '11/12 agree; the one disagreement is wt.key-driven (IDLE-2-R), not shape-driven',
      'IDLE-2-R disagreement': 'wt.key="SD-GONE-999" on /.reaper-source -> orphan REAPS (sdkey_not_in_db), idle PROTECTS',
      'path.basename normalisation': '6 variants (trailing /, trailing \\, //, mixed, .., plain) all -> ".reaper-source"',
      'git worktree list casing': 'echoes the casing AS GIVEN to `worktree add` — but the given string is the constrained one',
      'MUT-A SOURCE_TREE_DIRNAMES=[]': '348 total, 7 RED (count preserved)',
      'MUT-B GIT_REDIRECT_ENV_KEYS=[]': '348 total, 2 RED at 571c2a8e39a; 4 RED after b1e622792f5 own fix',
      'MUT-C isSourceTreeBasename=false': '348 total, 6 RED (count preserved)',
    },
    in_flight_snapshot: {
      disclaimer:
        'NOT PART OF THIS VERDICT. lib/fleet/spawn-control.js and scripts/fleet/worktree-reaper-tick.cjs were '
        + 'UNCOMMITTED-MODIFIED by the lead during this review. Recorded because it changes what is worth doing '
        + 'next, not because it was reviewed.',
      observed:
        'worktree-reaper-tick.cjs: scrubGitEnv hoisted to module scope and applied as `env: scrubGitEnv('
        + 'process.env)` on the reaper CHILD spawn — the SCRUB-2 half covering the process that performs the '
        + 'deletions. spawn-control.js: the FS-R1 currencyDir=repoRoot pin is being REVERTED, with the reasoning '
        + 'that pinning it was an availability landmine and that .worktrees/ exemption is pre-existing policy this '
        + 'SD should not tighten from inside an error handler. Both look right. NEITHER covers the finding above: '
        + 'tree-currency.cjs is untouched in the working tree, and it is the module the measurement fires through.',
    },
    files_reviewed: [
      'lib/fleet/source-tree-refresh.cjs',
      'lib/fleet/tree-currency.cjs',
      'lib/fleet/spawn-control.js',
      'lib/worktree-reaper/detectors.js',
      'scripts/fleet/worktree-reaper-tick.cjs',
      'scripts/worktree-reaper.mjs',
      'tests/unit/fleet/source-tree-identity-realgit.test.js',
      'tests/unit/fleet/spawn-source-ensure.test.js',
      'tests/unit/worktree-reaper/source-tree-idle-route.test.js',
    ],
    safety:
      'TR-1/TR-4 honoured. Mutations applied to file-level backups and restored BY COPY, never `git checkout`; the '
      + 'restore was explicitly verified to have PRESERVED the lead\'s concurrent uncommitted edits rather than '
      + 'clobbering them. No reaping against the live pool, no allowSelfHeal on the shared root, no writes to the '
      + 'shared root. All scratch repos and forged .git/worktrees entries under the session temp dir.',
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
  'FINDINGS (severity-ranked, file:line, measured)',
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
