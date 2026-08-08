/**
 * EXEC-phase SECURITY **RE-REVIEW #7** for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001
 * (sd_id 23c2a2d4-89af-4885-b87b-7a5b3c4ded1d), at COMMITTED HEAD d497c117500.
 *
 * Answers the three questions the lead posed (TOCTOU, marker abuse, --ignored=matching edges),
 * re-verifies the CI-1/CI-2/FORGE-4 closures at the current HEAD, and confirms — for the third
 * independent time, now with a negative control — that SCRUB-2 is NOT closed.
 *
 * TR-1/TR-4 honoured: no reaping against the live pool, no writes to the shared root, scratch
 * repos and forged .git/worktrees entries under the session temp dir only.
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = '23c2a2d4-89af-4885-b87b-7a5b3c4ded1d';
const SD_KEY = 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001';
const CODE = 'SECURITY';
const PHASE = 'EXEC';
const HEAD = 'd497c117500';

const findings = [
  {
    id: 'SCRUB-2 (CARRIED, BLOCKING — measured 3x, now with a negative control)',
    severity: 'high',
    title:
      'The executor was scrubbed; the CURRENCY CHECK was not. enforceTreeCurrency in its exact production shape '
      + 'still reaches arbitrary command execution via GIT_CONFIG_* on the reaper tick',
    location:
      'lib/fleet/tree-currency.cjs:55-62 — defaultRunner calls execFileSync with cwd/timeout/encoding/stdio and '
      + 'NO `env`, inheriting process.env wholesale. Reached from scripts/fleet/worktree-reaper-tick.cjs:333, '
      + 'which injects a runner ONLY when opts.currencyRunner is set — i.e. in tests, never in production. '
      + '`git log -1 -- lib/fleet/tree-currency.cjs` is cb5cf8ae00e, an unrelated QF: this SD has never touched '
      + 'the file.',
    note:
      'THE SCRUB-2 FIX AT 48d9ca92fcc IS REAL BUT COVERS A DIFFERENT DOOR. It scrubs the reaper CHILD spawn '
      + '(worktree-reaper-tick.cjs:454) and routes both source-tree runners through makeScrubbedGitRunner. The '
      + 'currency check is neither: it runs on the SAME directory in the SAME tick, between the content check and '
      + 'the spawn, through defaultRunner. '
      + 'MEASURED AT ' + HEAD + ', TWO-SIDED: with GIT_CONFIG_COUNT=1 / GIT_CONFIG_KEY_0=core.fsmonitor / '
      + 'GIT_CONFIG_VALUE_0="sh <script> <out>" set, enforceTreeCurrency({dir, logger, label, allowSelfHeal:false, '
      + 'env:{}}) returned reason="current" AND the injected command RAN (marker file written). NEGATIVE CONTROL '
      + 'in the same session: identical call with no GIT_CONFIG_* set — same "current" verdict, marker NOT '
      + 'written. So the harness is sound and the positive result is the guard, not the fixture. '
      + 'assessTreeCurrency executes `git status --porcelain` at :132 and `git fetch` at :121 through this runner.',
    consequence:
      'Arbitrary local command execution on the destructive path, under the same preconditions SCRUB-1 required — '
      + 'and SCRUB-1 was treated as blocking. A correction that lands on one access path while the others keep '
      + 'serving the old behaviour is not a closed finding.',
    recommendation:
      'One line: `env: scrubGitEnv(process.env)` on tree-currency.cjs:55-62 defaultRunner (it can require the CJS '
      + 'module directly). Fixing the DEFAULT is what matters — that is what production uses, and it also covers '
      + 'spawn-control.js:642, which passes no runner either. Re-run the two-sided check above: with the injection '
      + 'set the marker must NOT appear, and a clean tree must still assess current.',
    priority: 'high',
    blocking: true,
  },
  {
    id: 'STARVE-1 (NEW — answers "does --ignored=matching have a correctness edge")',
    severity: 'medium',
    title:
      'YES, and it is an availability edge, not a correctness one: ANY legitimately-ignored artifact appearing in '
      + 'the source tree refuses it — which re-creates the exact starvation this SD exists to end',
    location:
      'lib/fleet/source-tree-refresh.cjs assertSourceTreeContentClean (every `!!` entry is an offender unless '
      + 'allowlisted); consumed at scripts/fleet/worktree-reaper-tick.cjs:241-270 (catch -> return null -> '
      + 'fall back to repoRoot) then :333 (currency refuses the stale shared root)',
    note:
      'MEASURED TWO-SIDED in a scratch repo whose .gitignore mirrors production. Clean tree -> OK '
      + '{refreshed:true}. Drop a single `debug.log` (matched by the real repo\'s `*.log`) -> REFUSED '
      + 'SOURCE_TREE_CONTENT_UNVERIFIED. Remove it -> OK again. Same result for `.env` and `.claude/state.json`. '
      + '(An earlier run of mine appeared to refuse a clean tree too; that was my own fixture leaving an empty '
      + '.claude/ directory behind, diagnosed and excluded — not a defect.) '
      + 'REACHABILITY: the real .gitignore carries 263 patterns, including `*.log`, `.env`, `.env.*`, `.cache/`, '
      + '`*.backup`, `*.bak`, `.vscode/`, `node_modules/`, and — most relevant — `.ehg-session.json` and '
      + '`.worktree.json`, which the .gitignore itself documents as "written by sd-start.js / '
      + 'create-quick-fix.js". Any tooling, hook, editor or stray command that touches .reaper-source starves it.',
    consequence:
      'The refusal cascades: content check throws -> resolveReaperSourceRoot returns null -> sourceRoot falls back '
      + 'to repoRoot -> enforceTreeCurrency refuses the chronically-behind shared root -> result '
      + '`refused_stale_tree`. That is precisely the pre-SD steady state the whole SD was built to eliminate, '
      + 'reached through a door the SD itself opened. '
      + 'MITIGATED, and worth saying: the alarm this SD built DOES cover it — consecutive_refusals accumulates and '
      + 'reaper_starvation_alert fires at 6. So it is loud, not silent. That is the difference between this and '
      + 'the original defect, and it is why this is MEDIUM rather than HIGH.',
    recommendation:
      'REMEDIATE INSTEAD OF REFUSING. The source tree is machine-managed, gitignored, on its own branch, and '
      + 'contains nothing any human owns — so "dirty" here is not a signal to stop, it is a signal to rebuild. On '
      + 'SOURCE_TREE_CONTENT_UNVERIFIED, remove and re-create the tree, then re-verify; refuse only if the '
      + 'rebuilt tree is still unclean. Scope the removal strictly to the resolved source-tree dir (and assert it '
      + 'is one, via the existing basename constraint) so this can never become a general delete primitive. That '
      + 'turns an outage into a self-heal and keeps the security property intact — the tree still never executes '
      + 'unverified content.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'TOCTOU-2 (UPGRADED from LOW — correcting my own round-6 understatement)',
    severity: 'medium',
    title:
      'The window between the content check and the spawn is ~250 ms against a LOCAL remote and is dominated by a '
      + 'NETWORK fetch — not "milliseconds" as I characterised it last round',
    location:
      'content check inside ensureSourceTreeWorktree -> scripts/fleet/worktree-reaper-tick.cjs:305 (path join), '
      + ':306 existsSync, :333 enforceTreeCurrency, :374/:419 countActiveWorktrees, :391 isPidAlive, :445 spawn',
    note:
      'MEASURED with hrtime on the real call sequence against a LOCAL bare remote: existsSync 0.1 ms, '
      + 'enforceTreeCurrency 146.4 ms (it performs its OWN `git fetch` at tree-currency.cjs:121), '
      + 'countActiveWorktrees 101.2 ms — TOTAL 247.6 ms. In production the fetch is a network round trip to the '
      + 'real origin and the pool is 28 worktrees rather than 1, so the realistic window is hundreds of '
      + 'milliseconds to seconds; DEFAULT_TIMEOUT_MS allows up to 15 s for the fetch alone. '
      + 'I recorded this as "bounded to milliseconds" in row 8de81e2b. That was an inference from reading the '
      + 'call order without measuring what those calls cost, and it was wrong in the permissive direction.',
    consequence:
      'A local attacker who can write to the source tree does not need to win a microsecond race — they need to '
      + 'land a write inside a multi-hundred-millisecond window that opens on a predictable hourly cadence and is '
      + 'gated on a network operation whose duration they can influence. Still materially harder than CI-1 was '
      + '(which persisted indefinitely and was kept current by the refresh), but not negligible.',
    recommendation:
      'Re-assert immediately before the spawn at worktree-reaper-tick.cjs:445 rather than only inside '
      + 'ensureSourceTreeWorktree — either re-run assertSourceTreeContentClean(sourceRoot, ...) or compare '
      + '`git hash-object scripts/worktree-reaper.mjs` against `git rev-parse HEAD:scripts/worktree-reaper.mjs`. '
      + 'Cost is one extra ~50-100 ms git call on a path that runs hourly, and it shrinks the window to the '
      + 'process-spawn latency. Cheaper and far less invasive than executing from a snapshot.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'IDLE-2-R (CARRIED, unchanged at ' + HEAD + ')',
    severity: 'medium',
    title: 'The predicate is unified; its INPUT is not — hasOrphanSD reads wt.key, isIdle reads the path basename',
    location: 'lib/worktree-reaper/detectors.js:123 feeding :166, versus :371',
    note:
      'Unchanged since row 8de81e2b. Measured: wt={path:"C:/repo/.reaper-source", key:"SD-GONE-999"} -> '
      + 'hasOrphanSD {matched:true, reason:"sdkey_not_in_db"} (REAPABLE on the destructive route) while isIdle '
      + 'returns source_tree_protected. Unreachable through the production caller (worktree-reaper.mjs:1387 sets '
      + 'key=basename), but hasOrphanSD is exported with `key?: string` in its documented signature.',
    consequence: 'A future caller passing a key silently reopens IDLE-2 on the orphan-sd route with no test failing.',
    recommendation: 'One line: test isSourceTreeBasename(path.basename(wt.path || \'\')) in hasOrphanSD.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'IDLE-3-CODE (CARRIED, unchanged at ' + HEAD + ')',
    severity: 'medium',
    title: 'The basename refusal reuses SPAWN_SOURCE_SITING_ERROR, which spawn-control keeps must-stay-fatal',
    location: 'lib/fleet/source-tree-refresh.cjs resolveSourceTreeDir; spawn-control.js:297 supplies the code, :622 re-throws it',
    note:
      'Unchanged since row 8de81e2b. An env-var typo becomes a fleet-wide spawn outage reported as '
      + '"SPAWN_SOURCE_SITED_IN_EXEMPT_PATH" for a naming problem. The new SOURCE_TREE_CONTENT_UNVERIFIED '
      + 'correctly follows the own-code precedent at :312-318; this one does not.',
    consequence: 'Disproportionate blast radius and a misleading error class for a config mistake.',
    recommendation: 'Give it its own code (e.g. SOURCE_TREE_BASENAME_ERROR) so spawn-control degrades.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'MARKER-RESIDUAL (answers "can an allowlisted .reap-protected.json be abused")',
    severity: 'low',
    title: 'No code-execution path exists. Two bounded residuals, neither introduced by this SD',
    location:
      'lib/worktree-reaper/reap-protected-marker.js:58-64 (readReapProtectedMarker) and :79-83 '
      + '(hasReapProtectedMarker); consumed at scripts/worktree-reaper.mjs:1372 and in buildRecord evidence',
    note:
      'I read every read site. readReapProtectedMarker does readFileSync + JSON.parse and returns the object only '
      + 'if it is an object, else null; hasReapProtectedMarker is existsSync ONLY, so it never reads content. '
      + 'Nothing evals, requires, imports, spawns, or shell-interpolates the parsed value — it flows into '
      + 'buildRecord evidence and out through emitJsonLine, which JSON.stringifies it, so there is no injection '
      + 'either. Answer to your question: it cannot be abused for execution. '
      + 'TWO RESIDUALS, both pre-existing: (1) the file is read with an unbounded readFileSync, so an oversized '
      + 'marker is a memory-pressure nuisance in the reaper process — low, and the reaper fails soft; (2) '
      + 'hasReapProtectedMarker is content-independent, so anyone who can write into ANY worktree makes it '
      + 'permanently unreapable by dropping this filename there. That is the opt-out mechanism working as '
      + 'designed, not a defect — but it is worth stating plainly, because the content check now allowlists '
      + 'exactly that filename, so it is simultaneously the one file freely writable into the source tree and the '
      + 'file that confers immortality on any worktree.',
    consequence: 'Nothing today. Both become real the moment the marker gains a consumer beyond display.',
    recommendation:
      'Keep the allowlist at exactly one entry. If the marker ever gains a non-display consumer, validate its '
      + 'parsed shape at the read site and bound the read size.',
    priority: 'low',
    blocking: false,
  },
];

const confirmedSound = [
  {
    id: 'CI-1 / CI-2 / FORGE-4',
    title: 'RE-VERIFIED CLOSED at ' + HEAD + ', with controls green on both sides',
    note:
      'source-tree-refresh.cjs has changed since I last attacked it (last touched by ' + HEAD + ' itself), so I '
      + 're-ran all three rather than carrying the result forward. Sequence in one session: CONTROL clean -> OK '
      + '{created:false, refreshed:true}; CI-1 tracked-file overwrite -> REFUSED SOURCE_TREE_CONTENT_UNVERIFIED; '
      + 'CI-2 gitignored node_modules plant -> REFUSED; FORGE-4 from-scratch forged .git/worktrees entry -> '
      + 'REFUSED; CONTROL recreate + reuse -> OK. The guard refuses the three attacks and still passes the '
      + 'legitimate path, before and after.',
  },
  {
    id: 'SCRUB-1 + the makeScrubbedGitRunner refactor',
    title: 'CONFIRMED — the hoist is correct, there is no shadowing, and nothing broke',
    note:
      'You asked specifically. `scrubGitEnv` and `makeScrubbedGitRunner` are required once at module scope '
      + '(worktree-reaper-tick.cjs:27) and referenced in exactly two places — :454 (child spawn env) — with no '
      + 'local rebinding anywhere, so no shadowing. The lazy require inside resolveReaperSourceRoot no longer '
      + 'destructures scrubGitEnv at all (it takes only ensureSourceTreeWorktree, REAPER_SOURCE_DIRNAME, '
      + 'REAPER_SOURCE_BRANCH), so the ReferenceError you were worried about cannot occur and the lazy require\'s '
      + 'remaining consumers are intact. Routing both runner sites through one factory is the right shape: it '
      + 'removes the "unwire it at both sites with the suite green" failure mode you named. spawn-control.js:603 '
      + 'still scrubs inline with a merged env — different shape, still scrubbed.',
  },
  {
    id: 'FS-R1-AVAIL revert',
    title: 'CONFIRMED CORRECT',
    note:
      'Reverting the currencyDir=repoRoot pin is right, and the stated reasoning is the right reasoning: the '
      + '.worktrees/ exemption is pre-existing policy and tightening it from inside an error handler would make a '
      + 'transient git failure worse than the defect. The fallback now lands on exactly the guarding the spawn '
      + 'would have had without this feature, and it never executes from the unverified directory either way.',
  },
  {
    id: 'NI-R2 deferral',
    title: 'CONFIRMED — the corrected flag now records the constraint that makes it buildable',
    note:
      'The completion flag now says the wall-clock gauge must read the state file from a consumer OTHER than '
      + 'tick(). That is the correct siting: tick() returns at :288 before readState at :291, so last_spawn_at is '
      + 'never loaded on the disabled path and a gauge inside tick() structurally cannot observe it.',
  },
];

const results = {
  verdict: 'FAIL',
  confidence: 96,
  score: 88,
  status: 'FAIL — one HIGH remaining, still one line',
  summary:
    'CI-1, CI-2 and FORGE-4 are RE-VERIFIED CLOSED at ' + HEAD + ' — I re-ran all three rather than carrying the '
    + 'result forward, because source-tree-refresh.cjs changed again, and the controls are green on both sides of '
    + 'each attack. The makeScrubbedGitRunner hoist is correct: no shadowing, and the lazy require no longer '
    + 'destructures scrubGitEnv, so the ReferenceError you were worried about cannot occur. The FS-R1 revert and '
    + 'the corrected NI-R2 flag are both right. '
    + 'THE VERDICT DOES NOT MOVE, FOR THE SAME ONE REASON AS LAST ROUND. SCRUB-2 is not closed. Your fix scrubs '
    + 'the reaper CHILD spawn and both source-tree runners — all real — but enforceTreeCurrency is neither: it '
    + 'runs on the same directory in the same tick through tree-currency.cjs:55-62 defaultRunner, which passes no '
    + '`env`, and the reaper injects no runner in production. Measured a third time at ' + HEAD + ', now WITH A '
    + 'NEGATIVE CONTROL: injection set -> returns "current" and the command RUNS; injection unset -> same '
    + '"current", no command. The harness is sound; the guard is open. `git log -1 -- lib/fleet/tree-currency.cjs` '
    + 'is an unrelated QF, so this SD has never touched the file. One line: `env: scrubGitEnv(process.env)` on the '
    + 'default runner, which also covers spawn-control.js:642. '
    + 'ANSWERING YOUR THREE QUESTIONS. (1) TOCTOU: yes, and I UNDERSTATED it last round — measured 247.6 ms '
    + 'against a LOCAL remote (enforceTreeCurrency 146 ms including its own git fetch, countActiveWorktrees '
    + '101 ms), so production is hundreds of ms to seconds with a 15 s fetch budget. Fix is cheap: re-assert '
    + 'immediately before the spawn at :445, or blob-hash the resolved script. (2) Marker: cannot be abused for '
    + 'execution — I read every read site; JSON.parse into an evidence field, hasReapProtectedMarker is existsSync '
    + 'only, output is JSON.stringified so no injection. Two bounded pre-existing residuals recorded. '
    + '(3) --ignored=matching: yes, there is an edge, and it is the most interesting thing I found this round. '
    + 'ANY legitimately-ignored artifact starves the reaper — measured two-sided, a single `debug.log` (matched by '
    + 'the real `*.log`) flips the tree to SOURCE_TREE_CONTENT_UNVERIFIED, which falls back to repoRoot, which '
    + 'the currency check refuses as stale: the exact pre-SD starvation, reached through a door this SD opened. '
    + 'The real .gitignore has 263 patterns including `.ehg-session.json` and `.worktree.json`, which its own '
    + 'comment says session tooling writes into worktrees. Mitigated in that your own starvation alarm fires at '
    + '6, so it is loud rather than silent — which is why it is MEDIUM. The fix is to REMEDIATE rather than '
    + 'refuse: the source tree is machine-managed and owned by nobody, so rebuild it and re-verify, scoped '
    + 'strictly to the resolved source-tree dir. Score 88 (from 84).',
  conditions: [
    'BLOCKING SCRUB-2: `env: scrubGitEnv(process.env)` on lib/fleet/tree-currency.cjs:55-62 defaultRunner. '
    + 'Two-sided recheck: with GIT_CONFIG_COUNT/core.fsmonitor set the injected command must NOT run, and a clean '
    + 'tree must still assess current.',
    'NON-BLOCKING STARVE-1: on SOURCE_TREE_CONTENT_UNVERIFIED, rebuild the source tree and re-verify rather than '
    + 'refusing outright — scoped strictly to the resolved source-tree dir. Otherwise one stray *.log restores '
    + 'the starvation this SD exists to end.',
    'NON-BLOCKING TOCTOU-2: re-assert content (or blob-hash the script) immediately before the spawn at '
    + 'worktree-reaper-tick.cjs:445. The window is ~250 ms locally and network-bound in production, not the '
    + 'milliseconds I claimed in row 8de81e2b.',
    'NON-BLOCKING, unchanged: IDLE-2-R (one line in hasOrphanSD) and IDLE-3-CODE (own error code). '
    + 'ADVISORY: MARKER-RESIDUAL — keep the allowlist at exactly one entry.',
  ],
  metadata: {
    review_round: 7,
    reviewed_head: HEAD,
    head_history:
      'This review spanned 364ef34b82d -> 571c2a8e39a -> b1e622792f5 -> 339131fcb32 -> 48d9ca92fcc -> ' + HEAD
      + '. Every result recorded here was measured at ' + HEAD + ' unless stated otherwise.',
    prior_rows: ['199b97cf (round 5, FAIL/62)', '8de81e2b (round 6, FAIL/84)'],
    closed_and_reverified: ['CI-1', 'CI-2', 'FORGE-4', 'SCRUB-1', 'makeScrubbedGitRunner hoist', 'FS-R1-AVAIL revert', 'NI-R2 flag'],
    open_blocking: ['SCRUB-2'],
    new_findings: ['STARVE-1', 'TOCTOU-2 (upgraded)', 'MARKER-RESIDUAL (answered, low)'],
    self_correction:
      'TOCTOU was recorded as "bounded to milliseconds" in row 8de81e2b. Measured, the window is 247.6 ms against '
      + 'a LOCAL remote and is dominated by enforceTreeCurrency\'s own git fetch, so production is network-bound. '
      + 'That was an inference from call ORDER without measuring call COST, and it erred permissively. Upgraded '
      + 'LOW -> MEDIUM.',
    method:
      'Real git 2.50.1, scratch repos under the session temp dir whose .gitignore mirrors production, driving the '
      + 'production functions (ensureSourceTreeWorktree via makeScrubbedGitRunner, enforceTreeCurrency with no '
      + 'runner injected — the production shape). Every attack paired with a control in the same session; the '
      + 'SCRUB-2 result additionally paired with a negative control proving the harness does not write the marker '
      + 'on its own. TOCTOU measured with process.hrtime.bigint over the real call sequence.',
    measurements: {
      scrub2_with_injection: 'currency reason="current" AND injected command RAN — OPEN',
      scrub2_negative_control: 'same call, no GIT_CONFIG_* — "current", no command — harness sound',
      ci1_tracked_overwrite: 'REFUSED SOURCE_TREE_CONTENT_UNVERIFIED',
      ci2_gitignored_plant: 'REFUSED SOURCE_TREE_CONTENT_UNVERIFIED',
      forge4_forged_linkage: 'REFUSED SOURCE_TREE_CONTENT_UNVERIFIED',
      control_clean_before_and_after: 'OK {created:false, refreshed:true} both times',
      starve1_debug_log: 'a single *.log in the source tree -> REFUSED; removed -> OK again (two-sided)',
      starve1_env_and_claude: '.env and .claude/state.json both -> REFUSED',
      starve1_reachability: 'real .gitignore has 263 patterns incl. *.log, .env, .env.*, .cache/, *.backup, .vscode/, .ehg-session.json, .worktree.json',
      toctou_window: 'existsSync 0.1ms + enforceTreeCurrency 146.4ms (own git fetch) + countActiveWorktrees 101.2ms = 247.6ms, LOCAL remote',
      marker_read_sites: 'readFileSync + JSON.parse -> evidence field; hasReapProtectedMarker = existsSync only; no eval/require/exec/interpolation',
      scrubgitenv_hoist: 'module scope at tick:27, referenced at :454, no local rebinding, lazy require no longer destructures it',
    },
    files_reviewed: [
      'lib/fleet/tree-currency.cjs',
      'lib/fleet/source-tree-refresh.cjs',
      'lib/fleet/spawn-control.js',
      'lib/worktree-reaper/detectors.js',
      'lib/worktree-reaper/reap-protected-marker.js',
      'scripts/fleet/worktree-reaper-tick.cjs',
      'scripts/worktree-reaper.mjs',
      'tests/unit/fleet/source-tree-identity-realgit.test.js',
    ],
    safety:
      'TR-1/TR-4 honoured. No reaping against the live pool, no allowSelfHeal on the shared root, no writes to '
      + 'and no `git checkout` in the shared root — the only contact was read-only status/rev-list. All scratch '
      + 'repos, forged .git/worktrees entries and planted worktrees lived under the session temp dir and were '
      + 'removed.',
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
