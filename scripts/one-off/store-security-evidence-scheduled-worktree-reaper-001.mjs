/**
 * EXEC-phase SECURITY evidence for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001
 * (row 23c2a2d4-89af-4885-b87b-7a5b3c4ded1d).
 *
 * Adversarial review of a destructive subsystem (the worktree reaper now executes from a
 * dedicated self-refreshing source tree, .reaper-source / .spawn-source). Attacking the
 * changes, not confirming them. `summary`/`findings` are not mapped columns; folded into
 * detailed_analysis (mapped, uncapped). metadata.repo_path/executed_from_cwd via the
 * canonical resolveSubAgentRepo/applySubAgentRepoVerdict pair, per the standing contract
 * (no top-level repo_path/local_path columns on this table). No destructive command was
 * run against the live pool during this review — read-only git/fs inspection only.
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = '23c2a2d4-89af-4885-b87b-7a5b3c4ded1d';
const SD_KEY = 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001';
const CODE = 'SECURITY';
const PHASE = 'EXEC';

const findings = [
  {
    id: 'S1',
    severity: 'critical',
    title: 'The dedicated source trees this SD creates (.reaper-source / .spawn-source) are NOT excluded from the reaper\'s own orphan/stage2 classification, and are protected only by a coincidental 30-minute residency window',
    note:
      'listActiveWorktrees(repoRoot) (lib/worktree-quota.js:150) enumerates ALL git-registered worktrees, filtering only the main repo root — it has no location or basename filter, so .reaper-source and .spawn-source (created via `git worktree add` directly under repoRoot, per source-tree-refresh.cjs) ARE enumerated by the reaper\'s own main loop (scripts/worktree-reaper.mjs:1293/1354). Neither is protected by any existing guard: isCursorWorktree (no), hasReapProtectedMarker (no marker is ever written for these trees), active-claim map (nobody "claims" an infra tree), or NON_SD_PREFIXES (lib/worktree-reaper/detectors.js:454 = [\'concurrent-auto-\', \'_archive\', \'qf-\', \'adhoc-\', \'session-\'] — does not include reaper-source or spawn-source). Traced hasOrphanSD (detectors.js:111-197) end to end for basename=".reaper-source": branchKey is null (branch "reaper-source" does not match feat|qf|fix|chore|hotfix), declaredKey is null (no .worktree.json), basenameKey=".reaper-source" is not in sdMap/qfMap, the multi-worktree-suffix fallback does not match, isKnownNonSdPrefix is false, and (with a non-empty sdMap/qfMap, the normal operating condition) the function returns matched:true reason:"sdkey_not_in_db" -> classifyWorktree pushes category "orphan-sd" -> stageForCategories returns stage=2, verdict="stage2_remove" (worktree-reaper.mjs:792-802). (Verified the shipped-stale/stage1 path does NOT also fire: isPatchEquivalentToMain would find the branch fully absorbed into origin/main since it is force-reset via `-B` and ff-merged, but decideShippedStaleAction (worktree-reaper.mjs:474-508) resolves merged_pr_count=0 for a branch literally named "reaper-source" that never has a PR, and returns advisory:true/protect:false, which classifyWorktree routes to `reasons[\'shipped-stale-advisory\']` WITHOUT pushing the "shipped-stale" category — so stage1 is not independently triggered by this path.) The only thing standing between orphan-sd/stage2_remove and actual deletion is decideRemoval\'s residency demand (lib/worktree-reaper/removal-decision.js): claimGuard resolves work_key_unresolvable for a basename no session/SD/QF ever references, which converts the veto into "residency must affirmatively clear" — and treeResidencyBlocksRemoval (lib/worktree-reaper/residency-guard.js:203) blocks only while the tree\'s HEAD-commit-time or directory-mtime is within DEFAULT_RESIDENCY_WINDOW_MIN=30 minutes (env-overridable via WORKTREE_RESIDENCY_WINDOW_MIN). Because .reaper-source is fast-forwarded to origin/main on (at most) an hourly tick, and because a reap can only ever RUN from a .reaper-source that the SAME tick just proved current (enforceTreeCurrency gates the spawn), the tree\'s HEAD timestamp happens to be recent MOST of the time this SD\'s own SD-mainline documents ("26 commits landed on origin/main in two hours, 111 in a day") — but that is a coincidence of commit cadence on main, not a designed protection. The window is exceeded by: any lull in main\'s commit activity longer than 30 minutes (nights, weekends, low-traffic periods — which is exactly when the daily-scheduled CI job and slow hours of the fleet host run), or a stretch where the dedicated tree\'s own refresh degrades (ensureSourceTreeWorktree fail-softs a failed fetch/merge, per its own header comment, which means HEAD stops advancing and mtime stops updating while consecutive_refusals climbs — the SAME condition this SD\'s starvation alarm (FR-4) is built to detect). MEASURED ON THIS HOST: .env already sets WORKTREE_REAPER_EXECUTE=stage2 (grep confirmed), which is exactly the mode that (a) requires no interactive --yes prompt (worktree-reaper-tick.cjs:buildReaperArgs pushes --stage2 --yes unconditionally in stage2 mode) and (b) is the precise condition under which the stage2 removeList is populated and processed (scripts/worktree-reaper.mjs:1486-1496). This SD\'s entire premise is fixing the currency-refusal starvation that has been preventing the reaper from running at all — the direct, foreseeable consequence of the fix working is that a reaper which finally reaps successfully again will, on the first tick where the residency window happens to be exceeded, classify and attempt to remove its own execution source (or the spawn-source tree a separate subsystem depends on). Neither the diff\'s own tests (tests/unit/worktree-reaper/reaper-source-tree.test.js: TS-1/TS-1b/TS-2/TS-12 — all about currency/refresh mechanics, none about classification) nor tests/unit/governance/reaper-gauge-antigaming.test.js cover this at all. This is "safety by coincidence" surviving the exact SD written to fix the underlying starvation it depends on.',
    consequence:
      'If .reaper-source is removed while stale (which is also the exact moment a reap CANNOT be running from it, since the currency gate would have refused first) it self-heals on the next successful tick via `git worktree add` — transient, though a stale git-worktree admin entry left behind by an interrupted removeWorktreeViaGit could make the next `git worktree add -B reaper-source <dir>` fail with "already exists", requiring a manual `git worktree prune`. Worse: if .spawn-source (used by spawn-control.js only when FLEET_SPAWN_SOURCE_TREE is explicitly enabled — confirmed NOT currently set on this host, so currently dormant) is reaped between infrequent spawns, the next fleet spawn attempt is disrupted at exactly the moment an operator is trying to bring up a session. Either way this is an unattended, avoidable, self-inflicted deletion inside a subsystem this review was explicitly asked to treat as a data-loss surface.',
    recommendation:
      'Before merge: give these two dedicated trees an explicit, non-coincidental exclusion from reaper classification — either (a) write a .reap-protected marker (lib/worktree-reaper/reap-protected-marker.js:writeReapProtectedMarker, already used for the QF-20260725-821 opt-out convention) into the tree at creation time inside ensureSourceTreeWorktree, checked at scripts/worktree-reaper.mjs:1372 and :899 before any classification runs, or (b) add the literal basenames/branch names (.reaper-source/reaper-source, .spawn-source/spawn-source) to NON_SD_PREFIXES (lib/worktree-reaper/detectors.js:454) so hasOrphanSD short-circuits with non_sd_prefix. Add a regression test asserting a fixture worktree named .reaper-source with a non-DB-matching branch is classified verdict=keep, not stage2_remove — the class of test tests/unit/worktree-reaper/reaper-source-tree.test.js does not currently contain.',
  },
  {
    id: 'S2',
    severity: 'high',
    title: 'ensureSourceTreeWorktree\'s reuse branch trusts filesystem existence as proof of repo identity — no verification that a pre-existing directory is actually a linked worktree of THIS repo',
    note:
      'lib/fleet/source-tree-refresh.cjs:ensureSourceTreeWorktree only ever calls `exists(dir)` (fs.existsSync) to decide between the CREATE path (`git worktree add -B <branch> <dir> <baseRef>`, run with cwd:repoRoot — safe, always operates on the real repo\'s own git regardless of where <dir> points) and the REUSE path (`git -C <dir> fetch -- origin main` then `git -C <dir> merge --ff-only origin/main`, both run with cwd:<dir>, i.e. using DIR\'S OWN git config/remotes, not repoRoot\'s). Nothing checks that a pre-existing <dir> is a genuine `git worktree add`-linked tree of this repository (e.g. `git -C <dir> rev-parse --git-common-dir` resolving to the same common gitdir as repoRoot, or `git -C <dir> remote get-url origin` matching a known-good URL). assertSourceTreeNotExempt only rejects paths whose STRING contains "/.worktrees/" — a purely textual check unrelated to git identity. Consequence: anyone (or any broken automation) with plain filesystem write access who can create a directory at the resolved path BEFORE the legitimate worktree exists there — the default `<repoRoot>/.reaper-source`, or literally anywhere via the unauthenticated env overrides FLEET_REAPER_SOURCE_DIR / FLEET_SPAWN_SOURCE_DIR (read straight off process.env with no allowlist, source-tree-refresh.cjs:78-82) — can `git init` a standalone repo there, add their OWN "origin" remote, commit an arbitrary scripts/worktree-reaper.mjs, and arrange their local HEAD to equal their own fetched origin/main (fully within their control, since it is their own repo). ensureSourceTreeWorktree\'s fetch+merge would then succeed (refreshed:true, no error), enforceTreeCurrency\'s SEPARATE independent re-check (assessTreeCurrency, lib/fleet/tree-currency.cjs) would ALSO pass (it performs the identical fetch/compare inside the same attacker-controlled directory, using the same locally-scoped "origin"), and the tick would spawn the attacker\'s scripts/worktree-reaper.mjs with the same privileges the real reaper has: filesystem writes across the pool, git worktree removal, and the Supabase service-role client for the destructive path. An EMPTY pre-created directory is caught later by `fs.existsSync(reaperScript)` (script_missing, safe) — the exploit specifically requires the attacker to populate a self-consistent fake repo, not merely create a bare directory. Precondition is local filesystem write access to the host or control of the env value, not a remote/network vector, and (on a machine that never loses/corrupts the real .reaper-source) the vulnerable window is effectively first-run / env-override-only, since exists(dir) is true forever afterward for the legitimate tree.',
    consequence:
      'Full code-identity compromise of a subsystem the SD was written specifically to make trustworthy — the exact "code executed is NOT origin/main" failure class this SD exists to close, reintroduced by a different, unauthenticated route (directory pre-creation / env override) rather than the stale-tree route the SD fixes.',
    recommendation:
      'Before trusting an EXISTING directory in the reuse branch, verify it is actually a git-worktree of THIS repo — e.g. assert `git -C <dir> rev-parse --path-format=absolute --git-common-dir` resolves to the same common gitdir `git -C <repoRoot> rev-parse --path-format=absolute --git-common-dir` returns, throwing (not fail-soft) on mismatch, the same way assertSourceTreeNotExempt already throws rather than degrading. This closes the gap for both the default path and the FLEET_REAPER_SOURCE_DIR/FLEET_SPAWN_SOURCE_DIR overrides without weakening either override\'s legitimate use.',
  },
  {
    id: 'S3',
    severity: 'medium',
    title: '"Unknown pool does not alarm" has no verified alternate alarm for the case it excludes (git itself broken), so the design goal (don\'t misattribute a pool problem to a reaper problem) is only half-delivered',
    note:
      'detectReaperStarvation (lib/coordinator/coordination-events.cjs:616-628) is right to distinguish "pool is genuinely empty, nothing to starve" from "pool is unreadable" — alarming the former would be noise. But the stated justification for excluding pool_unknown ("the census failing is already reported by its own path") does not hold up: the ONLY thing that happens on a census failure is a `logger()` call inside worktree-reaper-tick.cjs\'s refusal branch (line 352-354), which by default is console.log piped through stale-session-sweep.cjs\'s own stdout — the same unmonitored text stream, not a session_coordination row, not a paged alert, not anything a "drain" can be built against. If countActiveWorktrees (`git worktree list --porcelain`, the census) and the currency check\'s own git calls fail for the same underlying reason on the same host (git binary broken, corrupted repo, disk/permission fault — plausible since both invoke the same git CLI against the same repoRoot), the reaper enters a state where consecutive_refusals climbs without bound AND pool.used stays permanently null, so detectReaperStarvation returns matched:false/reason:pool_unknown FOREVER, no matter how large the streak grows. This is exactly the "a value read only by a log line looks exactly like a guard" shape: the design intent (avoid crying wolf on an empty pool) is sound, but the specific claim used to justify it (an independent report exists) was not verified as part of this SD and, as far as this review could find, does not exist.',
    consequence:
      'A total, silent failure of the reaping subsystem on a host where git itself is unhealthy produces zero alarms from this mechanism — the worst-case failure mode is the one left uncovered, while the benign case (quiet pool) is correctly handled.',
    recommendation:
      'Either (a) also alarm on pool_unknown, using a DISTINCT payload.kind (e.g. reaper_census_unavailable) so operators can still tell "pool problem" from "reaper/git problem" apart — satisfying the original non-misattribution goal without leaving a blind spot — or (b) if a genuine independent census-failure alert already exists elsewhere, cite it explicitly in the code comment (with file:line) so a future reader is not relying on an unverified claim the way this review had to check by hand.',
  },
];

const confirmedSound = [
  {
    id: 'C1',
    title: 'TR-1 — allowSelfHeal:false on the reaper\'s currency call: CONFIRMED, unconditional',
    note: 'worktree-reaper-tick.cjs:330 passes allowSelfHeal:false to enforceTreeCurrency on every call, for BOTH the dedicated-tree path and the repoRoot-fallback path (there is no branch that varies this). Grepped the whole tree for `allowSelfHeal` — the only `true` is tree-currency.cjs\'s own default parameter, consumed elsewhere by the pre-existing, out-of-scope spawn path (lib/fleet/spawn-control.js, SD-LEO-INFRA-SPAWN-ROOT-CURRENCY-INVARIANT-001/SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 — unmodified by this SD beyond a delegation refactor). No `git pull` is ever attempted against the shared root by the reaper\'s own code path.',
  },
  {
    id: 'C2',
    title: 'Fallback safety — CONFIRMED: a mis-sited tree fails hard, a git hiccup fails soft, and the fallback never widens what gets deleted',
    note: 'resolveSourceTreeDir/assertSourceTreeNotExempt throws (not fail-soft) when the resolved dir sits under .worktrees/, for BOTH the default path and the env-override path (resolveSourceTreeDir always routes through the same assert). A failed create/refresh (network blip, transient git error) fails SOFT to repoRoot via resolveReaperSourceRoot\'s try/catch, but the SAME enforceTreeCurrency({dir: sourceRoot, allowSelfHeal:false}) call runs regardless of whether sourceRoot is the dedicated tree or repoRoot — so the fallback lands on the identical guarded, refuse-only path, never on an unguarded one. Confirmed no route reaches ensureSourceTreeWorktree without first passing through resolveSourceTreeDir (it is called as the first statement inside the function).',
  },
  {
    id: 'C3',
    title: 'TR-2 — junction-safe chokepoint: unaffected, no new removal path introduced',
    note: 'This SD\'s diff does not touch scripts/worktree-reaper.mjs\'s removal logic or lib/worktree-manager.js. The existing removeWorktree wrapper (worktree-reaper.mjs:1010) still calls removeWorktreeViaGit (lib/worktree-manager.js), which still pre-unlinks the node_modules junction before delegating to git. No new deletion path was added by this SD\'s changed files.',
  },
  {
    id: 'C4',
    title: 'Reaper-starvation alert (session_coordination row) — CONFIRMED: no injection, dedup correctly bounded',
    note: 'emitReaperStarvationAlert (coordination-events.cjs:631-673) interpolates only numeric evidence (consecutive_refusals, pool_used, pool_cap — all Number.isFinite-gated upstream) into subject/body; the row is written via the supabase-js client (parameterized), not string-built SQL, so there is no injection surface regardless. The dedup query (message_type=INFO, payload->>kind=reaper_starvation_alert, acknowledged_at IS NULL, expires_at > now) correctly bounds the alert to at most one open, unexpired, unacknowledged row of this kind at a time — it cannot be spammed by repeated ticks, only re-opened after 24h expiry or acknowledgement.',
  },
  {
    id: 'C5',
    title: 'CI log-parsing guard — CONFIRMED fail-closed on unrecognized shape, and not spoofable by ordinary worktree content',
    note: '.github/workflows/worktree-reaper-cadence.yml:71-84: an unparseable "Worktrees scanned:" line exits 1 with an explicit "guard is blind" message (not a silent pass) and a scanned count of exactly 0 also exits 1. Traced the only producer of that line (scripts/worktree-reaper.mjs:1345, `Worktrees scanned: ${allWorktrees.length}`) — it is an integer array length, printed before any per-worktree row, with nothing attacker-influenced printed earlier in the log that could pre-empt it via `head -1`; the --all-pools fan-out prints one such line per child but that mode is not used by this workflow\'s npm scripts.',
  },
  {
    id: 'C6',
    title: 'Deliberate decision — drain-inventory NO_CONSUMER left failing for worktree-reaper-refusals: CONFIRMED SOUND, and well defended',
    note: 'The real reason (per gauge-registry.js:390-397\'s own comment, not the shorter framing in the review prompt) is that the gauge\'s source is a git-ignored local JSON artifact with no DB-queryable closing path — drain-inventory.mjs\'s OBSERVED-verdict reader has no branch for source.kind===\'artifact\' at all, so adding cosmetic consumer/closingPath strings would move the verdict from NO_CONSUMER (honest: nobody drains it) to UNAVAILABLE (misleading: looks wired, still proves nothing) without adding any real reader. tests/unit/governance/reaper-gauge-antigaming.test.js:TS-10 pins exactly this with a fixture (not the real descriptor, correctly avoiding self-mutation) across three cases: both-strings-added still fails (UNAVAILABLE != PASS), a one-string partial edit merely relabels one failing verdict as another, and the shipped descriptor itself is asserted to still have neither field. This is exactly the antigaming coverage a "just add a consumer string" shortcut needs, and it exists. The REAL production consumer (runReaperStarvationSurfacing) is independently wired into scripts/stale-session-sweep.cjs:3800-3824 on every tick outcome — verified by reading the call site directly, not inferred from a comment.',
  },
];

const results = {
  verdict: 'FAIL',
  confidence: 82,
  summary:
    'Security/data-loss review of SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001 (a destructive subsystem: the worktree reaper deletes worktrees, now executing from a dedicated self-refreshing source tree). FAIL, one CRITICAL finding: the dedicated source trees this SD creates (.reaper-source / .spawn-source) are not excluded from the reaper\'s own classification logic and will be marked orphan-sd -> stage2_remove by ordinary operation of the same reaper they support, protected today only by a coincidental 30-minute tree-residency window tied to how frequently origin/main happens to receive commits — not a deliberate guard. This host\'s own .env already sets WORKTREE_REAPER_EXECUTE=stage2, the exact mode that would act on this the moment the starvation this SD fixes clears. Second, HIGH-severity: ensureSourceTreeWorktree\'s reuse branch trusts filesystem existence as proof that an existing directory is a legitimate worktree of this repo, with no check that it shares this repo\'s common gitdir or "origin" remote — a directory pre-created (locally, or via the unauthenticated FLEET_REAPER_SOURCE_DIR/FLEET_SPAWN_SOURCE_DIR env overrides) with a self-consistent fake git history would pass both the reuse-refresh and the independent currency re-check, letting attacker-controlled code run with the reaper\'s destructive privileges. Third, MEDIUM: the "unknown pool does not alarm" design decision is justified by an independent report of census failure that this review could not find — the only thing that happens on a census failure is the same unmonitored console.log the starvation alarm itself was built to replace, leaving the worst-case scenario (git itself broken on the host) with zero alarms from either mechanism. Everything else checked out: TR-1 (allowSelfHeal:false on every reaper currency call, unconditionally), the fallback-to-repoRoot path (always lands on the guarded, refuse-only path, never a widened one), TR-2 (no new removal path, junction-safe chokepoint untouched), the starvation alert\'s DB write (no injection, correctly de-duped and bounded), the CI log-parsing guard (fails closed on an unrecognized shape, not spoofable by ordinary log content), and the drain-inventory NO_CONSUMER decision (well-reasoned and defended by a dedicated antigaming test, with the real production consumer independently confirmed wired into stale-session-sweep.cjs). Recommend blocking merge on S1 (add an explicit exclusion — a .reap-protected marker or a NON_SD_PREFIXES entry — for the dedicated trees, with a regression test) before this reaches a host where reaping actually resumes.',
  findings: [...findings, ...confirmedSound],
  conditions: [
    { action: 'Exclude .reaper-source/.spawn-source (and their reaper-source/spawn-source branch names) from reaper orphan/stage classification — via a .reap-protected marker written at creation time in ensureSourceTreeWorktree, or a NON_SD_PREFIXES entry in lib/worktree-reaper/detectors.js — and add a regression test pinning verdict=keep for a fixture worktree named .reaper-source with no matching DB key.', priority: 'critical', blocking: true },
    { action: 'Verify, before trusting an EXISTING directory in ensureSourceTreeWorktree\'s reuse branch, that it shares this repo\'s common gitdir (git rev-parse --git-common-dir) rather than relying on filesystem existence alone — applies to both the default path and the FLEET_REAPER_SOURCE_DIR/FLEET_SPAWN_SOURCE_DIR overrides.', priority: 'high', blocking: true },
    { action: 'Either alarm on pool_unknown with a distinct payload.kind (reaper_census_unavailable), or cite (file:line) the independent report this SD\'s comment claims already exists for a persistent git-census failure.', priority: 'medium', blocking: false },
  ],
  justification:
    'FAIL rather than CONDITIONAL_PASS: S1 is not a speculative attack-chain, it is the ordinary, non-adversarial behavior of code already shipped in this diff, on a host already configured (WORKTREE_REAPER_EXECUTE=stage2) to exercise the exact removal path that would act on it, gated only by a residency window that depends on commit-cadence coincidence rather than a designed exclusion. That is a self-inflicted data-loss defect in a subsystem this review was explicitly asked to treat as a data-loss surface, not a correctness one, and it directly undermines the SD\'s own premise (fixing reaper starvation) by making a successfully-un-starved reaper a hazard to its own execution source.',
  metadata: {
    attack_mode: true,
    destructive_commands_run_against_live_pool: false,
    findings_reviewed: ['S1', 'S2', 'S3'],
    decisions_confirmed_sound: ['C1 (TR-1)', 'C2 (fallback safety)', 'C3 (TR-2)', 'C4 (alarm injection/dedup)', 'C5 (CI guard fail-closed)', 'C6 (drain-inventory NO_CONSUMER)'],
    host_measured_config: { WORKTREE_REAPER_EXECUTE: 'stage2 (confirmed present in .env at review time)', FLEET_SPAWN_SOURCE_TREE: 'unset (spawn-source path currently dormant)', dedicated_trees_present_on_disk_at_review_time: false },
    files_reviewed: [
      'lib/fleet/source-tree-refresh.cjs',
      'scripts/fleet/worktree-reaper-tick.cjs',
      'lib/fleet/spawn-control.js',
      'lib/fleet/tree-currency.cjs',
      'lib/coordinator/coordination-events.cjs',
      'scripts/stale-session-sweep.cjs',
      '.github/workflows/worktree-reaper-cadence.yml',
      'scripts/worktree-reaper.mjs',
      'lib/worktree-reaper/detectors.js',
      'lib/worktree-reaper/residency-guard.js',
      'lib/worktree-reaper/removal-decision.js',
      'lib/worktree-quota.js',
      'lib/governance/gauge-registry.js',
      'lib/governance/drain-inventory.js',
      'tests/unit/worktree-reaper/reaper-source-tree.test.js',
      'tests/unit/governance/reaper-gauge-antigaming.test.js',
    ],
  },
};

const NL = String.fromCharCode(10);
const HR = '-'.repeat(72);
results.detailed_analysis = [
  'SUMMARY', '=======', results.summary, '',
  'FINDINGS (severity-ranked, file:line citations)',
  '='.repeat(72), '',
  findings.map((f) => (
    '[' + String(f.severity).toUpperCase() + '] ' + f.id + ' — ' + f.title + NL +
    'FINDING: ' + f.note + NL +
    'CONSEQUENCE: ' + f.consequence + NL +
    'RECOMMENDATION: ' + f.recommendation
  )).join(NL + NL + HR + NL + NL),
  NL + HR, '',
  'DECISIONS ATTACKED AND CONFIRMED SOUND',
  '='.repeat(72), '',
  confirmedSound.map((c) => '[CONFIRMED] ' + c.id + ' — ' + c.title + NL + c.note).join(NL + NL + HR + NL + NL),
].join(NL);

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: CODE, targetApplication: 'EHG_Engineer', fallback: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(CODE, SD_ID, { name: 'Chief Security Architect' }, results, { sdKey: SD_KEY, phase: PHASE });
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('VERDICT=' + results.verdict);
