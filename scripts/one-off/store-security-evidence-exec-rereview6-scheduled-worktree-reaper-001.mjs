/**
 * EXEC-phase SECURITY **RE-REVIEW #6** for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001
 * (sd_id 23c2a2d4-89af-4885-b87b-7a5b3c4ded1d), at COMMITTED HEAD b1e622792f5.
 *
 * Spawned against 364ef34b82d; re-targeted to 571c2a8e39a on request, and HEAD moved again to
 * b1e622792f5 mid-measurement. b1e622792f5 is TEST-ONLY (`git diff 571c2a8e39a..b1e622792f5 --
 * lib/ scripts/fleet/` is EMPTY), so every production measurement below is valid for both.
 *
 * SCOPE OF THIS VERDICT: the COMMITTED tree at b1e622792f5. The lead began editing
 * lib/fleet/source-tree-refresh.cjs during this review (an in-flight CI-1/CI-2/SCRUB-1 fix); that
 * work is UNCOMMITTED, is NOT what this verdict is rendered against, and is recorded separately
 * under metadata.in_flight_snapshot.
 *
 * TR-1/TR-4 honoured. Mutations were applied to file-level backups and restored BY COPY (never
 * `git checkout`), and the restore was verified to preserve the lead's concurrent uncommitted
 * edits rather than clobber them. No reaping against the live pool. Scratch repos in the temp dir.
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = '23c2a2d4-89af-4885-b87b-7a5b3c4ded1d';
const SD_KEY = 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001';
const CODE = 'SECURITY';
const PHASE = 'EXEC';
const HEAD = 'b1e622792f5';

const findings = [
  {
    id: 'CI-1 (CARRIED, BLOCKING)',
    severity: 'critical',
    title: 'Content integrity is still unverified at the committed HEAD — re-measured, not inferred',
    location: 'lib/fleet/source-tree-refresh.cjs:321-354; lib/fleet/tree-currency.cjs:141-142',
    note:
      'RE-MEASURED against a clean checkout of ' + HEAD + ' (confirmed `git diff --stat lib/` = 0 lines before '
      + 'running). Let the module create .reaper-source, overwrote <dir>/scripts/worktree-reaper.mjs, committed '
      + 'nothing: {refreshed:true}, currency {current:true, behind:0, dirty:true}, and the payload executed '
      + '("*** CI-1 STILL OPEN AT 571c2a8e39a ***"). `git diff 364ef34b82d..' + HEAD + ' -- lib/fleet/tree-currency.cjs` '
      + 'is empty and the reuse branch of ensureSourceTreeWorktree is unchanged.',
    consequence: 'Unchanged from row 199b97cf. One file write, executed with --execute --stage2 --yes --all-pools.',
    recommendation: 'As row 199b97cf. An in-flight fix implementing exactly this was observed uncommitted (see metadata.in_flight_snapshot).',
    priority: 'critical',
    blocking: true,
  },
  {
    id: 'CI-2 / FORGE-4 / SCRUB-1 (CARRIED, BLOCKING)',
    severity: 'critical',
    title: 'The other three blocking findings are untouched at the committed HEAD',
    location: 'lib/fleet/source-tree-refresh.cjs:43-46 (scrub list), :261-262 (CHECK 3)',
    note:
      'The 571c2a8e39a commit changed resolveSourceTreeDir (IDLE-3) and detectors.js (IDLE-2) only; ' + HEAD
      + ' is test-only. GIT_REDIRECT_ENV_KEYS is byte-identical, so GIT_CONFIG_COUNT/KEY_n/VALUE_n still survive '
      + 'the scrub and still reach command execution via core.fsmonitor on `git status --porcelain`. CHECK 3 is '
      + 'byte-identical, so the hand-forged .git/worktrees/<name> entry still passes. Neither was re-attacked this '
      + 'round because the code did not move; the round-5 measurements stand.',
    consequence: 'See row 199b97cf.',
    recommendation: 'See row 199b97cf conditions 2-4.',
    priority: 'critical',
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
      'MEASURED across a 12-shape matrix. Eleven shapes agree. The twelfth does not: for wt = '
      + '{path: "C:/repo/.reaper-source", key: "SD-GONE-999"}, hasOrphanSD returns {matched:true, '
      + 'reason:"sdkey_not_in_db"} — i.e. REAPABLE via the orphan-sd route, the very route the S1 comment '
      + 'identifies as the one that sends source trees to stage2_remove — while isIdle returns {matched:false, '
      + 'reason:"source_tree_protected"}. One directory, two answers: the exact IDLE-2 class, re-entered through '
      + 'the predicate\'s argument instead of the predicate\'s body. '
      + 'NOT REACHABLE THROUGH THE PRODUCTION CALLER: scripts/worktree-reaper.mjs:1387 sets `key: basename` where '
      + 'basename is path.basename(wt.path), so today both routes receive the same string. But hasOrphanSD is '
      + 'EXPORTED and its JSDoc signature is `{ path: string, key?: string }` — an optional caller-supplied key is '
      + 'documented API. The commit message\'s claim "both routes now agree on every name tested" is therefore '
      + 'true by CALLER CONVENTION, not by construction, which is the same shape as the claim IDLE-2 retracted '
      + '("the two lists cannot drift" — the lists could not; the predicates already had).',
    consequence:
      'Any future caller of hasOrphanSD that passes a key — the signature invites exactly this — silently '
      + 'reopens IDLE-2 on the destructive route, with no test failing, because every existing test drives the '
      + 'production convention.',
    recommendation:
      'One line: in hasOrphanSD test `isSourceTreeBasename(path.basename(wt.path || \'\'))` rather than '
      + 'basenameKey. That is also the semantically correct input — the protection is about WHERE the tree is, '
      + 'while wt.key is a claim about WHICH SD it belongs to, and the path is the authority for the former. '
      + 'Leave basenameKey as-is for the sd_key candidate resolution above it, which is what it is for.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'IDLE-3-CODE (NEW)',
    severity: 'medium',
    title:
      'The new basename refusal reuses SPAWN_SOURCE_SITING_ERROR — re-committing the exact error-code conflation '
      + 'this module fixed 200 lines earlier, and escalating a config typo to a fleet-wide spawn outage',
    location:
      'lib/fleet/source-tree-refresh.cjs:126-135 (`if (code) err.code = code`), reached with '
      + 'code=SPAWN_SOURCE_SITING_ERROR from lib/fleet/spawn-control.js:297, consumed at spawn-control.js:622',
    note:
      'resolveSourceTreeDir stamps the NAMING error with the caller-supplied `code`, which on the spawn path is '
      + 'SPAWN_SOURCE_SITING_ERROR. spawn-control.js:622 treats that code as its ONE must-stay-fatal class and '
      + 're-throws, so a misnamed FLEET_SPAWN_SOURCE_DIR takes down every spawn — and the operator is told '
      + '"SPAWN_SOURCE_SITED_IN_EXEMPT_PATH" for a problem that has nothing to do with siting. '
      + 'The module already learned this: source-tree-refresh.cjs:312-318 gives the identity refusal its OWN code '
      + 'with the comment "ITS OWN CODE, deliberately NOT the caller\'s siting code ... reusing it would turn an '
      + 'identity refusal into a FLEET-WIDE SPAWN OUTAGE". The same reasoning applies verbatim here and was not '
      + 'applied. (The reaper path is unaffected: worktree-reaper-tick.cjs passes no `code`, so `if (code)` leaves '
      + 'the error code-less and resolveReaperSourceRoot fails soft to repoRoot.)',
    consequence:
      'A one-character typo in an env var is a fleet-wide spawn outage reported under a misleading code. The '
      + 'hazard the constraint guards against is data-loss on the REAPER side; refusing every SPAWN is not '
      + 'proportionate to it, and the misnamed tree is still perfectly safe to spawn FROM.',
    recommendation:
      'Give it its own code (e.g. SOURCE_TREE_BASENAME_ERROR) so spawn-control falls soft to the spawning tree — '
      + 'the same degradation the identity refusal already gets, for the same reason.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'IDLE-3-ORDER (NEW, answers the lead\'s precedence question)',
    severity: 'low',
    title: 'The ordering is correct but currently unobservable — both errors carry the SAME code, so no consumer can tell them apart',
    location: 'lib/fleet/source-tree-refresh.cjs:126-136',
    note:
      'You asked whether you inverted a precedence that matters. You did NOT invert it — siting is checked first '
      + 'and a path that is both mis-sited and misnamed reports the mis-siting, which is what you intended. But '
      + 'the precedence is invisible: both throws stamp the SAME caller-supplied `code`, so every programmatic '
      + 'consumer (spawn-control.js:622 is the only one) sees one indistinguishable class and only the human-read '
      + 'message differs. The ordering you reasoned carefully about currently buys message text and nothing else.',
    consequence: 'A deliberate design decision that no code path can act on — it will read as load-bearing to the next editor and is not.',
    recommendation: 'Fixing IDLE-3-CODE makes the ordering genuinely meaningful; until then, say so in the comment rather than implying consumers distinguish them.',
    priority: 'low',
    blocking: false,
  },
];

const confirmedSound = [
  {
    id: 'IDLE-2 (path shapes)',
    title: 'CONFIRMED CLOSED for every name shape — 12-case matrix, both routes measured',
    note:
      'Drove hasOrphanSD and isIdle over the same fixture and compared source_tree_protected on both. AGREE on: '
      + 'exact .reaper-source; exact .spawn-source; trailing separator ("/.reaper-source/"); trailing backslash; '
      + 'mixed slashes ("/sub\\.reaper-source"); a relocated override path; and wt.key === "". AGREE-and-not-'
      + 'protected on: UPPER case (.REAPER-SOURCE), Mixed case (.Reaper-Source), the suffixed .reaper-source-2 '
      + '(the original IDLE-2 case, now fixed), and the no-dot "reaper-source". path.basename normalises all six '
      + 'separator variants I tried, so there is no separator or trailing-slash bypass. The only disagreement '
      + 'found is IDLE-2-R above, which is about the ARGUMENT, not the name shape.',
  },
  {
    id: 'IDLE-3 (the constraint itself, and the trade)',
    title: 'CONFIRMED SOUND, and I agree with the trade you chose over teaching the detectors to read the env',
    note:
      'THE TRADE IS RIGHT, and for a stronger reason than the one stated: a destructive classifier that reads '
      + 'FLEET_*_SOURCE_DIR would give DIFFERENT answers depending on which shell invoked the reaper — a reaper '
      + 'run from a cron/service environment without the var would classify a live source tree as unprotected and '
      + 'delete it, while a manual run would not. That is a worse failure than the one being fixed and it is '
      + 'environment-dependent, i.e. unreproducible. Constraining the basename keeps the classifier\'s input pure. '
      + 'THE CONSTRAINT HOLDS: path.basename normalises trailing "/", trailing "\\", "//", mixed separators and '
      + '".." segments — measured six variants, all resolving to ".reaper-source", so none of them smuggles a '
      + 'different name past the equality check. '
      + 'CASE ATTACK CLOSED BY CONSTRUCTION: I measured that `git worktree list --porcelain` echoes the casing AS '
      + 'GIVEN to `worktree add` (registered "./SUB/.Reaper-Source" and git reported ".Reaper-Source"), so a '
      + 'case-sensitive isSourceTreeBasename could in principle miss a tree. It cannot here, because the string '
      + 'that reaches `worktree add` is the same string resolveSourceTreeDir just constrained to equal the '
      + 'literal. Default path and override path both end in exactly ".reaper-source".',
  },
  {
    id: 'TEST-1',
    title: 'CONFIRMED FIXED, and no other test in this SD has a production-data-dependent case count',
    note:
      'MEASURED BY MUTATION, not by grep — a grep for one statement form is not a test for the property, and my '
      + 'first pass (an awk scan for it() lexically inside a loop over an imported symbol) found nothing, which '
      + 'proves only that the scan was narrow. Three mutations over the SD\'s 31 suites / 348 tests, each verified '
      + 'to have actually applied (changed:1) so a silently-non-matching mutation could not read as green: '
      + '(a) SOURCE_TREE_DIRNAMES = [] -> 348 total, 7 RED; '
      + '(b) GIT_REDIRECT_ENV_KEYS = [] -> 348 total, 2 RED; '
      + '(c) isSourceTreeBasename forced false -> 348 total, 6 RED. '
      + 'In all three the COUNT is preserved and cases turn red rather than vanishing — the property TEST-1 was '
      + 'about. Note (b) was the thinnest at 2, and ' + HEAD + ' independently caught and fixed that very case '
      + '(the scrub-list loop in source-tree-identity-realgit.test.js) before I reported it; after that commit the '
      + 'same mutation turns 4 red. I found no remaining instance.',
  },
  {
    id: 'Regression check',
    title: 'No regression from the IDLE-2/IDLE-3 refactor',
    note:
      'NON_SD_PREFIXES no longer spreads SOURCE_TREE_DIRNAMES and keeps prefixes only; hasOrphanSD gained an '
      + 'explicit source-tree branch returning source_tree_protected ahead of the prefix test. 348 tests / 31 '
      + 'files pass at 571c2a8e39a (350/352 at ' + HEAD + ', the 2 failures being the lead\'s in-flight edit — see '
      + 'metadata.in_flight_snapshot, not a defect at HEAD). The idle route still refuses to blanket-apply '
      + 'NON_SD_PREFIXES, so qf-/adhoc-/session- worktrees stay reapable when idle.',
  },
];

const results = {
  verdict: 'FAIL',
  confidence: 95,
  score: 64,
  status: 'FAIL',
  summary:
    'FAIL at committed HEAD ' + HEAD + ' (5th). The three NEW fixes are good and I could not break two of them: '
    + 'IDLE-2 is closed for every name shape I could construct (12-case matrix over both routes — trailing '
    + 'separators, backslashes, mixed slashes, case variants, suffixed and no-dot names all agree), IDLE-3\'s '
    + 'basename constraint holds against every separator/normalisation variant and against the Windows '
    + 'case-sensitivity attack (measured: `git worktree list` echoes the casing as given, but the string reaching '
    + '`worktree add` is the one you just constrained), and TEST-1 is fixed — verified by MUTATION rather than '
    + 'grep: three mutations of the production constants each keep the count at 348 and turn 7/2/6 tests red, and '
    + 'I found no remaining test whose case count depends on production data. I also agree with the IDLE-3 trade, '
    + 'for a stronger reason than you gave: a classifier reading the env would answer differently depending on '
    + 'which shell launched the reaper, so a service-context run would delete a tree a manual run protects. '
    + 'BUT THE VERDICT DOES NOT MOVE, because the four blocking findings from row 199b97cf are untouched in the '
    + 'committed tree and I re-measured CI-1 against a verified-clean checkout of ' + HEAD + ' rather than '
    + 'inferring it from the diff: one file write into the module-created tree still reaches execution '
    + '({refreshed:true}, {current:true, behind:0, dirty:true}). tree-currency.cjs has 0 changed lines since '
    + '364ef34b82d; the scrub list and CHECK 3 are byte-identical. '
    + 'THREE NEW FINDINGS, none blocking. IDLE-2-R: you unified the predicate but not its INPUT — hasOrphanSD '
    + 'reads `wt.key || basename` while isIdle reads `basename`, and with wt.key supplied the two routes '
    + 'disagree again on the destructive route (measured). Not reachable via the production caller, but the '
    + 'exported signature documents `key?`, so the "both routes agree" claim holds by caller convention, not by '
    + 'construction — the same shape as the claim IDLE-2 retracted. IDLE-3-CODE: the naming refusal reuses '
    + 'SPAWN_SOURCE_SITING_ERROR, which spawn-control treats as must-stay-fatal, so an env typo is a fleet-wide '
    + 'spawn outage reported under a code that names the wrong problem — re-committing the conflation this file '
    + 'fixed at :312-318. IDLE-3-ORDER answers your precedence question: you did not invert it, but both throws '
    + 'carry the same code, so no consumer can observe the ordering you chose. '
    + 'Score 64 (from 62): real closures, unmoved blockers.',
  conditions: [
    'BLOCKING: the four conditions from row 199b97cf are unchanged and unmet in the committed tree (CI-1 content '
    + 'assertion, CI-2 gitignored-plant positive control, SCRUB-1 /^GIT_CONFIG_/ prefix deletion, FORGE-4 via CI-1).',
    'NON-BLOCKING IDLE-2-R: one line — test isSourceTreeBasename(path.basename(wt.path || \'\')) in hasOrphanSD so '
    + 'the two routes agree by construction rather than by what the caller happens to pass.',
    'NON-BLOCKING IDLE-3-CODE: give the basename refusal its own error code so spawn-control degrades instead of '
    + 'refusing the fleet, matching the precedent at source-tree-refresh.cjs:312-318.',
    'ADVISORY IDLE-3-ORDER: the precedence is correct but unobservable while both throws share a code.',
  ],
  metadata: {
    review_round: 6,
    reviewed_head: HEAD,
    head_history: 'spawned at 364ef34b82d; re-targeted to 571c2a8e39a; HEAD moved to ' + HEAD + ' mid-review',
    head_equivalence:
      '`git diff 571c2a8e39a..' + HEAD + ' -- lib/ scripts/fleet/` is EMPTY — ' + HEAD + ' is test-only, so every '
      + 'production measurement is valid for both commits.',
    prior_rows: ['199b97cf (round 5, FAIL/62 — four blocking findings, all still open)'],
    open_blocking: ['CI-1', 'CI-2', 'FORGE-4', 'SCRUB-1'],
    new_findings: ['IDLE-2-R', 'IDLE-3-CODE', 'IDLE-3-ORDER'],
    method:
      'Two instruments. (1) A 12-shape matrix driving hasOrphanSD and isIdle over identical fixtures and '
      + 'comparing source_tree_protected on both routes. (2) A MUTATION battery over the SD\'s 31 suites, each '
      + 'mutation verified applied (changed:1) before the run, restored by file copy. CI-1 was re-attacked with '
      + 'real git against a verified-clean checkout rather than inferred from the diff.',
    measurements: {
      'CI-1 at clean ' + HEAD: 'REACHED_EXECUTION — {refreshed:true}, {current:true, behind:0, dirty:true}, payload ran',
      'tree-currency.cjs since 364ef34b82d': '0 lines changed',
      'IDLE-2 12-shape matrix': '11/12 agree; the disagreement is wt.key-driven (IDLE-2-R), not shape-driven',
      'IDLE-2-R disagreement': 'wt.key="SD-GONE-999" on /.reaper-source -> orphan REAPS (sdkey_not_in_db), idle PROTECTS',
      'path.basename normalisation': '6 variants (trailing /, trailing \\, //, mixed, .., plain) all -> ".reaper-source"',
      'git worktree list casing': 'echoes the casing AS GIVEN to `worktree add` — but the given string is the constrained one',
      'MUT-A SOURCE_TREE_DIRNAMES=[]': '348 total, 7 RED (count preserved)',
      'MUT-B GIT_REDIRECT_ENV_KEYS=[]': '348 total, 2 RED at 571c2a8e39a; 4 RED after ' + HEAD + '\'s own fix',
      'MUT-C isSourceTreeBasename=false': '348 total, 6 RED (count preserved)',
      'baseline': '348 passed / 31 files at 571c2a8e39a',
    },
    in_flight_snapshot: {
      disclaimer:
        'NOT PART OF THIS VERDICT. lib/fleet/source-tree-refresh.cjs was being edited by the lead DURING this '
        + 'review; the content below is uncommitted and may have changed. Measured because it is cheap and '
        + 'useful, not reviewed as a deliverable.',
      observed:
        'An in-flight fix for CI-1/CI-2/SCRUB-1: adds SOURCE_TREE_DIRTY_ERROR (own code, fails soft), '
        + 'assertSourceTreeContentClean using `status --porcelain --untracked-files=all --ignored=matching` with a '
        + 'lazily-resolved allowlist of the marker filename, called LAST in the reuse branch (correct — the '
        + 'refresh legitimately mutates the working tree); and extends the scrub with GIT_SSH_COMMAND, '
        + 'GIT_PROXY_COMMAND, GIT_EXTERNAL_DIFF, GIT_EXEC_PATH, GIT_ATTR_NOSYSTEM, GIT_CONFIG_GLOBAL/SYSTEM/'
        + 'NOSYSTEM plus a GIT_REDIRECT_ENV_PREFIXES = [/^GIT_CONFIG_/] prefix matcher.',
      assessment_of_the_in_flight_work:
        'The flags, the distinct error code, the placement and the prefix matcher all match the round-5 '
        + 'recommendations. Offender parsing looked sound on inspection: exact Set membership (so '
        + '".reap-protected.json.evil" and a directory ".reap-protected.json/" both remain offenders), and the '
        + 'quoted-path and rename ("R  old -> new") forms fail CLOSED rather than being allowlisted. '
        + 'TWO THINGS TO WATCH, offered as review input rather than findings: (a) the allowlisted marker file is '
        + 'itself content-unverified, so it must never become something that is imported or executed — the '
        + 'allowlist IS the residual hole; (b) a TOCTOU window remains between the content check and the spawn at '
        + 'worktree-reaper-tick.cjs:448, bounded to milliseconds versus the indefinite persistence CI-1 has today, '
        + 'and only fully closable by executing from a verified snapshot.',
      test_state:
        '2 failures at the time of measurement, both in tests/unit/fleet/spawn-source-ensure.test.js, both '
        + '"expected vi.fn() to be called 7 times, but got 8" — an un-updated runner call-count assertion caused '
        + 'by the new git call. Attributed to the IN-FLIGHT edit, not to ' + HEAD + ': the same suite list is '
        + '348/348 green at 571c2a8e39a and lib/ is byte-identical between the two commits.',
    },
    files_reviewed: [
      'lib/worktree-reaper/detectors.js',
      'lib/fleet/source-tree-refresh.cjs',
      'lib/fleet/spawn-control.js',
      'lib/fleet/tree-currency.cjs',
      'scripts/worktree-reaper.mjs',
      'scripts/fleet/worktree-reaper-tick.cjs',
      'tests/unit/fleet/source-tree-identity-realgit.test.js',
      'tests/unit/worktree-reaper/source-tree-idle-route.test.js',
    ],
    safety:
      'TR-1/TR-4 honoured. Mutations applied to file-level backups and restored BY COPY, never `git checkout`; the '
      + 'restore was explicitly verified to have PRESERVED the lead\'s concurrent uncommitted edit rather than '
      + 'clobbering it. No reaping against the live pool, no allowSelfHeal on the shared root, no writes to the '
      + 'shared root. All scratch repos under the session temp dir.',
  },
};

const NL = String.fromCharCode(10);
const HR = '-'.repeat(72);
results.detailed_analysis = [
  'VERDICT: ' + results.verdict + '  |  SCORE: ' + results.score + '/100  |  STATUS: ' + results.status
    + '  |  CONFIDENCE: ' + results.confidence,
  'COMMITTED HEAD REVIEWED: ' + HEAD + ' (test-only vs 571c2a8e39a; production measurements valid for both)',
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
