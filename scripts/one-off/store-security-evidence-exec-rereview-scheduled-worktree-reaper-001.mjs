/**
 * EXEC-phase SECURITY **RE-REVIEW** for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001
 * (row 23c2a2d4-89af-4885-b87b-7a5b3c4ded1d), after ae0833e50af / d3cf95f8e85 / 619640cb83a.
 *
 * Brief was explicitly adversarial: refute the claim that S1/S2/S3 are closed, do not confirm by
 * default. Every verdict below is MEASURED — real git in throwaway scratch repos, real module
 * loads, real detector calls — not inferred from source reading. Where a hypothesis was refuted
 * by measurement (S3's census producer) that is recorded too.
 *
 * NO destructive command was run against the live worktree pool (TR-4). allowSelfHeal was never
 * set true on the shared root (TR-1). No `git checkout` in the shared root. All mutation
 * experiments ran in disposable temp repos under the session scratchpad.
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
    id: 'S2-R',
    severity: 'critical',
    title: 'S2 NOT CLOSED — the identity probe is defeated at the DEFAULT path by a plain directory with no .git of its own, because git path discovery walks UP into the enclosing repo',
    note:
      'lib/fleet/source-tree-refresh.cjs:186-200 (isLinkedWorktreeOf), consumed at :209. The probe compares '
      + '`git -C <candidate> rev-parse --path-format=absolute --git-common-dir` against the same probe on repoRoot and '
      + 'reuses the directory when they match. The default source-tree location is path.join(repoRoot, ".reaper-source") '
      + '(resolveSourceTreeDir, :78-82) — i.e. INSIDE repoRoot\'s working tree. Git resolves --git-common-dir by walking '
      + 'PARENT directories, so a plain directory nested in the repo answers with the repo\'s OWN common dir. '
      + 'MEASURED with real git in a disposable scratch repo: probe(repoRoot) and probe(repoRoot/.reaper-source) both '
      + 'returned "<scratch>/main/.git" — byte-identical — for a directory that is not a worktree at all and contains no '
      + '.git. mine === theirs is therefore TRUE and the guard passes. '
      + 'MEASURED END TO END, twice, in two independently built scratch repos: with '
      + '<repoRoot>/.reaper-source/scripts/worktree-reaper.mjs containing console.log("PWNED") and NO .git in that '
      + 'directory, the real ensureSourceTreeWorktree returned {created:false, refreshed:true} — it did NOT throw — and '
      + 'additionally wrote .reap-protected.json into the attacker-controlled directory. '
      + 'ATTACKER CAPABILITY REQUIRED IS STRICTLY LESS THAN THE ATTACK THE FIX WAS WRITTEN AGAINST: `mkdir -p '
      + '<repoRoot>/.reaper-source/scripts` plus one file write. No `git init`, no fake remote, no fabricated history. '
      + '.reaper-source/ is gitignored (.gitignore:23), so the planted directory is also invisible to `git status` in the '
      + 'shared root. '
      + 'WHAT IS GENUINELY CLOSED, measured on the same fixtures so this is not a blanket rejection: a FOREIGN repo with '
      + 'its own .git at the default path throws correctly; FLEET_REAPER_SOURCE_DIR pointed at a plain directory OUTSIDE '
      + 'any repo throws correctly; a GENUINE linked worktree is reused with no breakage. The fix closes the variant its '
      + 'commit message describes and leaves open the cheaper one.',
    consequence:
      'TWO consequences, one adversarial and one that needs no attacker at all. '
      + '(1) CODE EXECUTION WITH REAPER PRIVILEGES: resolveReaperSourceRoot (scripts/fleet/worktree-reaper-tick.cjs:232-259) '
      + 'returns the attacker directory as sourceRoot; the fs.existsSync(reaperScript) check at :299-302 passes because the '
      + 'attacker supplied that file; enforceTreeCurrency({dir: sourceRoot}) at :313-334 runs git INSIDE that directory, '
      + 'which resolves to repoRoot\'s repository — so the currency guard measures repoRoot\'s currency while believing it '
      + 'measured the source tree, and passes whenever repoRoot is current. The tick then spawns node on the attacker\'s '
      + 'script with --execute --stage2 --yes (buildReaperArgs :189-195; WORKTREE_REAPER_EXECUTE=stage2 measured at '
      + '.env:96) plus the service-role Supabase client and worktree-removal authority. '
      + '(2) UNCOORDINATED SHARED-ROOT MUTATION, no attacker required: buildSourceTreeUpdateArgs then runs '
      + '`git -C <plain dir> merge --ff-only origin/main`, and because that directory belongs to repoRoot\'s repository the '
      + 'merge lands on THE SHARED ROOT. MEASURED: scratch main moved 71307af -> 85c0e37 and its working-tree file changed '
      + 'v1 -> v2 as a direct result of one ensureSourceTreeWorktree call. That is precisely the mutation this module\'s own '
      + 'header calls load-bearing to avoid ("a git pull --ff-only there is an uncoordinated mutation of a tree other live '
      + 'sessions are reading, which breaks them mid-operation", :24-26) and which the reaper refuses elsewhere via '
      + 'allowSelfHeal:false. It is reachable from any leftover or partially-created .reaper-source directory — a failed '
      + '`git worktree add`, an interrupted create, a restored backup, an operator mkdir.',
    recommendation:
      'Common-dir equality is necessary but not sufficient; it cannot distinguish "is this directory the worktree" from '
      + '"is this directory INSIDE the worktree tree". Add a second, position-sensitive probe: require '
      + '`git -C <dir> rev-parse --path-format=absolute --show-toplevel` to equal <dir> itself (a nested plain directory '
      + 'answers repoRoot, a genuine linked worktree answers itself), or require `git -C <dir> rev-parse --git-dir` to '
      + 'resolve under <common>/worktrees/, or check membership in `git worktree list --porcelain`. Whichever is chosen, '
      + 'the regression test MUST drive real git against a real temp repo containing a real plain subdirectory. '
      + 'tests/unit/fleet/source-tree-identity.test.js:38-50 uses a synthetic per-directory lookup runner, and its '
      + '"REFUSES a directory git cannot identify at all" arm (:80-88) hard-codes the assumption that git throws for a '
      + 'non-repo directory. Real git, for a directory nested inside the repo, answers with the repo\'s own common dir. '
      + 'The fixture cannot observe the behaviour it asserts about, which is why 26/26 tests are green over a defeated '
      + 'guard.',
  },
  {
    id: 'S2b',
    severity: 'medium',
    title: 'The S2 refusal reuses SPAWN_SOURCE_SITING_ERROR, so on the spawn path it escalates to a FATAL fleet-wide spawn outage — including on a transient git failure',
    note:
      'lib/fleet/spawn-control.js:296 passes code: SPAWN_SOURCE_SITING_ERROR into ensureSourceTreeWorktree. '
      + 'lib/fleet/source-tree-refresh.cjs:216 stamps that SAME code onto the new S2 identity error. '
      + 'lib/fleet/spawn-control.js:617 rethrows exactly that code as the one class that must stay fatal — a deliberate '
      + 'carve-out written for MIS-SITING, where failing soft would leave the spawn silently unguarded. The identity '
      + 'refusal now inherits that fatality by code collision. Compounding it: isLinkedWorktreeOf returns false on ANY '
      + 'throw from the runner (:197-199), so a transient `git rev-parse` failure — index.lock contention on a busy shared '
      + 'root is routine on this host — is indistinguishable from an identity violation and becomes fatal. This '
      + 'contradicts the function\'s own stated contract that a refresh hiccup must never throw while only a mis-SITED '
      + 'tree is a correctness violation (:120-127).',
    consequence:
      'Every spawn fails, fleet-wide, on a git hiccup, once FLEET_SPAWN_SOURCE_TREE is enabled — a strictly worse outage '
      + 'than the staleness problem the source tree exists to fix. The operator debugging it is also misdirected: the '
      + 'error code reads SPAWN_SOURCE_SITED_IN_EXEMPT_PATH for a problem that has nothing to do with siting. '
      + 'LATENCY, measured: FLEET_SPAWN_SOURCE_TREE is unset in .env, so this path is dormant today; '
      + 'FLEET_SPAWN_CONTROL_LIVE=true (.env:186), so spawns themselves are live. It arms the moment the documented '
      + 'rollout flips the flag. The reaper tick is unaffected — it passes no `code`, so err.code is undefined and '
      + 'resolveReaperSourceRoot correctly degrades to the guarded repoRoot path.',
    recommendation:
      'Give the identity refusal its own code (e.g. SOURCE_TREE_IDENTITY_UNVERIFIED) and let spawn-control fail soft on '
      + 'it, keeping fatality reserved for siting. Separately, distinguish "git answered, and the answer says not ours" '
      + '(refuse) from "git did not answer" (transient — fail soft to the create/fallback path) rather than collapsing '
      + 'both into one boolean.',
  },
  {
    id: 'S3b',
    severity: 'medium',
    title: 'CALL SITE — the starvation surfacing is gated on ONE tick result, so script_missing and skipped_in_flight are silent-death paths neither alarm kind can see; FR-1 widened script_missing\'s reachability',
    note:
      'scripts/stale-session-sweep.cjs:3805 calls runReaperStarvationSurfacing only when '
      + 'outcome.result === "refused_stale_tree". tick() has five terminal results '
      + '(scripts/fleet/worktree-reaper-tick.cjs:277 disabled, :286 skipped_not_due, :302 script_missing, '
      + ':359 refused_stale_tree, :372 skipped_in_flight). The script_missing return at :302 sits BEFORE the currency '
      + 'check, so state.consecutive_refusals is neither incremented nor reset — the streak freezes and no alarm of '
      + 'either kind can ever fire, however long the reaper stays dead. Same shape for skipped_in_flight if a reaper PID '
      + 'wedges.',
    consequence:
      'FR-1 made this materially more reachable rather than less. Before FR-1, sourceRoot was always repoRoot, where '
      + 'scripts/worktree-reaper.mjs certainly exists, so script_missing was near-unreachable. It is now a newly created '
      + 'directory whose checkout can be incomplete (a `git worktree add` that registered the worktree but failed to '
      + 'check out), or — per S2-R — an attacker directory. A source tree that exists but lacks the script silently '
      + 'disables all reaping with zero alarms, which is the same undrained-gauge failure class FR-4 exists to end, one '
      + 'layer up.',
    recommendation:
      'Alarm on a persistent NOT-INVOKED streak, not only on a refusal streak: track consecutive_not_invoked alongside '
      + 'consecutive_refusals and surface it when the reaper has failed to actually run for N due ticks for ANY reason. '
      + 'The call site should consume every non-invoked outcome, not one enumerated result string.',
  },
];

const confirmedSound = [
  {
    id: 'S1-R',
    title: 'S1 CLOSED — both layers verified present and effective; layer 1 is a real gate, not a log line',
    note:
      'LAYER 1 GATES REMOVAL, measured by reading the control flow at the decision point rather than the call: '
      + 'scripts/worktree-reaper.mjs:1372-1385 checks hasReapProtectedMarker and `continue`s BEFORE any classification '
      + 'runs, emitting verdict=keep reason=reap_protected_marker; :899 does the same inside selectStage0Reclaim so '
      + 'stage-0 reclaim is covered too. Nothing about it is advisory. '
      + 'THE MARKER WRITE ACTUALLY LOADS: source-tree-refresh.cjs is CommonJS and require()s an ESM module '
      + '(reap-protected-marker.js is `export`-only under "type":"module"). I executed that require in real Node rather '
      + 'than trusting vitest — Node v24.12.0 resolved it and typeof writeReapProtectedMarker === "function". Had it '
      + 'thrown, markSourceTreeReapProtected (:159-165) would have swallowed it into a console.error and layer 1 would '
      + 'have been silently inert. Independently confirmed by observing .reap-protected.json on disk after two real '
      + 'ensureSourceTreeWorktree runs. '
      + 'LAYER 2 PRESENT: lib/worktree-reaper/detectors.js:454 NON_SD_PREFIXES now carries ".reaper-source" and '
      + '".spawn-source"; isKnownNonSdPrefix matches via basename.startsWith against basenameKey = path.basename(wt.path) '
      + '(detectors.js:123, :164), and worktree-reaper.mjs:1387 sets key from exactly that basename. '
      + 'ENUMERATION RE-CONFIRMED (the hazard is real, not theoretical): lib/worktree-quota.js:150-172 filters only the '
      + 'main root, with no location or basename filter, so a tree at <repoRoot>/.reaper-source IS enumerated. '
      + 'The prior review\'s shipped-stale exclusion also re-derived independently: decideShippedStaleAction '
      + '(worktree-reaper.mjs:493-506) routes merged_pr_count===0 with a non-terminal key to advisory, so the '
      + '"shipped-stale" category is never pushed and the stage-1 route stays shut.',
  },
  {
    id: 'S1-R-caveat',
    title: 'S1 residual (LOW, non-blocking) — the two layers are not equally broad, and marker re-assertion sits behind the S2 throw',
    note:
      'Layer 2 lives inside hasOrphanSD only, so with the marker gone it neutralises orphan-sd but not `idle`, which is '
      + 'also a stage-2 category (stageForCategories, worktree-reaper.mjs:796-798). For a marker-less source tree isIdle '
      + '(detectors.js:341-419) needs max(HEAD-commit-time, dir mtime) beyond DEFAULT_IDLE_DAYS with zero unique commits '
      + '— and the zero-unique-commits half is ALWAYS true for this tree by construction. So the marker-less residual is '
      + 'still "origin/main quiet longer than the threshold", the same commit-cadence coincidence S1 was raised about, '
      + 'just with a much wider window (days, not 30 minutes). Not blocking — the window is large and layer 1 holds — but '
      + 'the commit message\'s "two independent layers" is accurate only for the orphan-sd route. '
      + 'Second: the S2 identity throw (source-tree-refresh.cjs:209-218) precedes the marker re-assertion (:219-222), so '
      + 'on any S2 refusal the self-healing re-write never runs while the tree remains on disk and enumerated. The '
      + 'self-healing property is exactly what the commit message says makes layer 1 robust to a deleted marker.',
  },
  {
    id: 'S3-R',
    title: 'S3 CLOSED — measured, including a refuted hypothesis that would have made the new branch unreachable',
    note:
      'I attacked this by hypothesising the census fails to 0 rather than null, which would leave the new '
      + 'reaper_census_blind_alert branch dead while looking green — and would land the git-broken case on `pool_empty` '
      + '(silent), i.e. the original hole with a guard beside it that cannot fire. That is true of '
      + 'lib/worktree-quota.js:150-172 (returns [] on git failure), but the tick uses its OWN duplicate counter at '
      + 'scripts/fleet/worktree-reaper-tick.cjs:124-149, which correctly returns null on git failure, and '
      + 'poolWatchdogDecision (:156-163) passes `used` through unchanged. Hypothesis refuted by measurement. '
      + 'DRIVEN THROUGH THE REAL PRODUCER SHAPE: threshold measured = 6; {refusals:6, used:null} -> matched, '
      + 'alertKind=reaper_census_blind_alert, reason=pool_unknown; {used:17} -> reaper_starvation_alert, reason=starving; '
      + '{used:0} -> silent, pool_empty. '
      + 'DEDUP INDEPENDENCE MEASURED with a stub client, not read: with an OPEN reaper_starvation_alert present, emitting '
      + 'the census-blind kind INSERTED ({ok:true,id:new-1}) while the same kind correctly deduped ({ok:true,'
      + 'skipped:true}). The dedup query keys payload->>kind (coordination-events.cjs:662), so neither kind can silence '
      + 'the other. The shared streak threshold is correct by design — both conditions are about refusals accumulating.',
  },
  {
    id: 'S3-drain-note',
    title: 'INFORMATIONAL, deliberately NOT raised as a finding — both alert kinds warn as outside the coordinator drain set, but the consumer reads them anyway',
    note:
      'Emitting either kind prints "[target-drain] WARN: kind \'reaper_starvation_alert\' / '
      + '\'reaper_census_blind_alert\' is not in role \'coordinator\' drain set — this delivery may orphan at the target". '
      + 'I checked the consumer before calling it a dead letter: scripts/coordinator-quiet-tick.mjs:374-380 fetches '
      + 'target_session IN (coordinatorId, "broadcast-coordinator") with NO kind filter, so both alerts are visible on '
      + 'that lane. Warn-only, pre-existing for the starvation kind and merely inherited by the new one. Recorded here so '
      + 'the warning is not rediscovered later as a scare.',
  },
  {
    id: 'C7',
    title: 'No net-new attack surface from the two extra git subprocess calls (lead question 5)',
    note:
      'The probe runs `git rev-parse` in the candidate directory — strictly less dangerous than the `fetch` and '
      + '`merge --ff-only` that were ALREADY being run in that same directory before the probe existed, and it runs '
      + 'strictly earlier. rev-parse runs no hooks and no filters. Git\'s dubious-ownership refusal makes a '
      + 'differently-owned directory fail closed. Cost is two extra subprocesses per ensure (hourly for the reaper). '
      + 'TOCTOU between the probe and the subsequent fetch/merge/execute is real but needs the same local-filesystem-'
      + 'write precondition, and is subsumed by S2-R, which defeats the probe outright at the default path without '
      + 'needing a race. Windows junctions were considered: `git worktree add` uses them here, and both the junction path '
      + 'and the resolved path answer the same --git-common-dir, so the probe is junction-stable — it is nesting, not '
      + 'linking, that defeats it.',
  },
  {
    id: 'C8',
    title: 'No legitimate production path is broken by S2 on the happy path (lead question 2)',
    note:
      'Both real callers hand ensureSourceTreeWorktree a runner that returns a STRING, so String(...) in the probe '
      + 'yields git\'s actual output rather than "[object Object]" — which would have made mine === theirs trivially true '
      + 'for every directory. Verified at both sites: scripts/fleet/worktree-reaper-tick.cjs:236-240 returns r.stdout '
      + 'from spawnSync with encoding utf8 and throws on non-zero status; lib/fleet/spawn-control.js:592-593 uses '
      + 'execFileSync with encoding utf8, wrapped as (args) => gitRunner(args, {cwd: repoRoot}). A genuine linked '
      + 'worktree at the default path was measured reused with no throw. The repoRoot-fallback path in '
      + 'resolveReaperSourceRoot (:253-258) still catches and degrades to the guarded repoRoot, unchanged. The one real '
      + 'breakage is S2b above, and it is on the failure branch, not the happy path.',
  },
];

const results = {
  verdict: 'FAIL',
  confidence: 90,
  summary:
    'EXEC SECURITY re-review of SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001 after ae0833e50af / d3cf95f8e85 / '
    + '619640cb83a. S1 and S3 are genuinely CLOSED and were verified by measurement, not by reading: the reap-protected '
    + 'marker is a real pre-classification gate at worktree-reaper.mjs:1372 and :899 (not a log line), its CJS-requires-'
    + 'ESM write path was executed in real Node rather than trusted from a green vitest run, and the marker was observed '
    + 'on disk; the census-blind alarm fires under a distinct kind with an independent dedup key, driven through the '
    + 'tick\'s real producer, and a hypothesis that would have made that branch unreachable was tested and refuted. '
    + 'S2 is NOT closed. The identity probe compares `rev-parse --git-common-dir` between the candidate and repoRoot, '
    + 'but the DEFAULT source-tree path is INSIDE repoRoot\'s working tree and git resolves that option by walking parent '
    + 'directories — so a plain directory with no .git of its own answers with repoRoot\'s own common dir and the '
    + 'comparison passes. Measured with real git in two independently built scratch repos: ensureSourceTreeWorktree did '
    + 'NOT throw for <repoRoot>/.reaper-source/scripts/worktree-reaper.mjs containing attacker code, returned '
    + '{created:false, refreshed:true}, and wrote its protection marker into the attacker directory. The capability '
    + 'required is a mkdir plus one file write — strictly LESS than the `git init` + fake-remote attack the fix was '
    + 'written against — and .reaper-source/ is gitignored so the plant is invisible to git status. Downstream, the '
    + 'currency guard then measures repoRoot instead of the source tree and passes, and the tick executes the planted '
    + 'script with --execute --stage2 --yes (WORKTREE_REAPER_EXECUTE=stage2, measured in .env). A second consequence '
    + 'needs no attacker at all and was also measured: the reuse `merge --ff-only` run in such a directory FAST-FORWARDS '
    + 'THE SHARED ROOT (scratch main moved 71307af->85c0e37, working file v1->v2), which is the uncoordinated shared-root '
    + 'mutation this module\'s own header calls load-bearing to avoid and which the reaper refuses elsewhere via '
    + 'allowSelfHeal:false. The S2 tests are green over the defeated guard because every arm uses a synthetic '
    + 'per-directory lookup runner that encodes the very assumption real git violates. Two further MEDIUM findings: the '
    + 'S2 refusal reuses SPAWN_SOURCE_SITING_ERROR, which spawn-control treats as its one must-stay-fatal class, so an '
    + 'identity refusal — or a transient git failure, since the probe cannot tell them apart — becomes a fleet-wide spawn '
    + 'outage once FLEET_SPAWN_SOURCE_TREE is enabled; and the starvation surfacing is gated on a single tick result '
    + '("refused_stale_tree"), so the script_missing path — which FR-1 made materially more reachable by moving the '
    + 'script out of repoRoot — silently disables all reaping with no alarm from either kind. What is genuinely closed in '
    + 'S2 is recorded too: a foreign repo with its own .git, and an override pointing outside any repo, are both '
    + 'correctly refused, and a genuine linked worktree is correctly reused.',
  findings: [...findings, ...confirmedSound],
  conditions: [
    {
      action:
        'Close S2-R: common-dir equality cannot distinguish "is the worktree" from "is INSIDE the worktree". Add a '
        + 'position-sensitive check — require `git -C <dir> rev-parse --path-format=absolute --show-toplevel` to equal '
        + '<dir>, or require --git-dir to resolve under <common>/worktrees/, or check `git worktree list --porcelain` '
        + 'membership. The regression test must drive REAL git against a real temp repo containing a real plain '
        + 'subdirectory; the current lookup-table fixture cannot observe this class.',
      priority: 'critical',
      blocking: true,
    },
    {
      action:
        'Give the S2 identity refusal its own error code instead of reusing SPAWN_SOURCE_SITING_ERROR, and let '
        + 'spawn-control fail soft on it (lib/fleet/spawn-control.js:617 must keep fatality for siting only). Distinguish '
        + '"git answered, not ours" from "git did not answer" rather than collapsing both into one boolean at '
        + 'source-tree-refresh.cjs:197-199.',
      priority: 'medium',
      blocking: false,
    },
    {
      action:
        'Alarm on a persistent NOT-INVOKED streak, not only on refused_stale_tree: track consecutive_not_invoked and '
        + 'surface it from scripts/stale-session-sweep.cjs:3805 for any non-invoked outcome, so script_missing and '
        + 'skipped_in_flight cannot silently disable reaping.',
      priority: 'medium',
      blocking: false,
    },
  ],
  justification:
    'FAIL rather than CONDITIONAL_PASS, on the same standard applied to the first review. S2-R is not a speculative '
    + 'chain: it was reproduced end to end with real git in two independently constructed scratch repositories, it '
    + 'requires strictly less attacker capability than the attack the fix was written against, and it has a second '
    + 'consequence — fast-forwarding the shared root — that needs no attacker at all and was directly observed mutating '
    + 'a working tree. The subsystem is destructive and the host is configured (WORKTREE_REAPER_EXECUTE=stage2) to '
    + 'exercise the affected path. The fix is also currently ACCOMPANIED by a green test suite that cannot see the '
    + 'defect, which is the more dangerous half: shipping it would retire the finding while leaving the hole, and the '
    + 'next reviewer would have 26 passing assertions telling them it was closed. S1 and S3 are stated as closed '
    + 'plainly, because they were measured and they hold.',
  metadata: {
    review_round: 2,
    supersedes_row: '8d976d93',
    attack_mode: true,
    reviewed_head: '619640cb83a',
    reviewed_commits: ['ae0833e50af', 'd3cf95f8e85', '619640cb83a'],
    destructive_commands_run_against_live_pool: false,
    self_heal_enabled_on_shared_root: false,
    git_checkout_in_shared_root: false,
    prior_findings_status: { S1: 'CLOSED', S2: 'NOT_CLOSED', S3: 'CLOSED' },
    new_findings: ['S2-R', 'S2b', 'S3b'],
    measurements: {
      probe_nested_plain_dir:
        'git -C <repoRoot>/.reaper-source rev-parse --path-format=absolute --git-common-dir returned the SAME value as '
        + 'the repoRoot probe for a directory with no .git — probe passes, guard defeated',
      ensure_did_not_throw_for_attacker_dir: '{created:false, refreshed:true} (two independent scratch repos)',
      shared_root_fast_forwarded_by_reuse_merge: 'scratch main 71307af -> 85c0e37, working file v1 -> v2',
      foreign_repo_at_default_path: 'correctly THREW (this variant is closed)',
      override_outside_any_repo: 'correctly THREW (this variant is closed)',
      genuine_linked_worktree: 'correctly reused, no throw (no happy-path breakage)',
      cjs_require_of_esm_marker_module: 'succeeded on Node v24.12.0; writeReapProtectedMarker is a function',
      starvation_threshold: 6,
      detect_used_null: 'matched, alertKind=reaper_census_blind_alert',
      detect_used_17: 'matched, alertKind=reaper_starvation_alert',
      detect_used_0: 'silent, reason=pool_empty',
      dedup_independence: 'census-blind INSERTED while a starvation alert was open; same-kind correctly skipped',
      s1_test_suite: '4 files / 26 tests PASS — green over the S2-R defect',
    },
    host_measured_config: {
      WORKTREE_REAPER_EXECUTE: 'stage2 (.env:96)',
      WORKTREE_REAPER_ENABLED: 'unset -> defaults ENABLED (worktree-reaper-tick.cjs:91-95)',
      FLEET_SPAWN_SOURCE_TREE: 'unset -> spawn-source path dormant (S2b latent)',
      FLEET_SPAWN_CONTROL_LIVE: 'true (.env:186)',
      dedicated_trees_present_on_disk_at_review_time: false,
      node_version: 'v24.12.0',
    },
    files_reviewed: [
      'lib/fleet/source-tree-refresh.cjs',
      'lib/fleet/spawn-control.js',
      'scripts/fleet/worktree-reaper-tick.cjs',
      'scripts/worktree-reaper.mjs',
      'lib/worktree-reaper/detectors.js',
      'lib/worktree-reaper/reap-protected-marker.js',
      'lib/worktree-quota.js',
      'lib/coordinator/coordination-events.cjs',
      'scripts/stale-session-sweep.cjs',
      'scripts/coordinator-quiet-tick.mjs',
      'tests/unit/fleet/source-tree-identity.test.js',
      'tests/unit/worktree-reaper/source-tree-self-protection.test.js',
      'tests/unit/fleet/spawn-source-ensure.test.js',
      'tests/unit/worktree-reaper/reaper-source-tree.test.js',
      '.gitignore',
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
console.log('VERDICT=' + results.verdict + ' CONFIDENCE=' + results.confidence);
