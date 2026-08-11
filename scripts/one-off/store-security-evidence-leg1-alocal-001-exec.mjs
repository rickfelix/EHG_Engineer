// SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001 — SECURITY sub-agent evidence writer (EXEC-TO-PLAN phase).
// Review of the ACTUALLY SHIPPED code on branch feat/SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001
// (01603df45a2, 51f180adbcf). Every claim below was measured by this agent against the shipped
// source and, for the production-environment finding, against a production-faithful shallow clone.
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001';
const PHASE = 'EXEC-TO-PLAN';

const results = {
  verdict: 'FAIL',
  confidence: 95,
  summary:
    'THE FOUR SECURITY QUESTIONS ASKED ALL COME BACK CLEAN — the injection, escaping, exhaustion and leakage posture of '
    + 'this leg is genuinely well built. (Q1) The git invocation is safe: production wires runHardenedGit (THE published '
    + 'argv-array, shell:false, env-scrubbed runner) rather than a hand-rolled execSync, and the argv is the frozen literal '
    + '[log, main, --merges, --format=%s] with no external data reaching it — the only unwired variable (sinceIso) is dead '
    + 'code and, even if wired, rides inside a single --since=<v> token so it cannot become option injection. (Q2) '
    + 'escapeRegExp is complete and correct: probed 19 adversarial sd_keys (nested quantifiers, alternation, backrefs, '
    + 'class-breaks, unicode escapes, NUL, newline) and measured ZERO metachar leaks into the compiled source. ReDoS is '
    + 'STRUCTURALLY IMPOSSIBLE, not merely unlikely: escaping reduces the key to a pure literal and the surrounding pattern '
    + '(?:^|[^K])LITERAL(?![K]) contains no quantifier at all, so no backtracking tree exists — worst case measured 0.16ms '
    + 'against a 50,000-char hostile subject. (Q3) Not a realistic exhaustion vector: the merge corpus measured 309,323 '
    + 'bytes = 29.5% of spawnSync\'s 1MB default maxBuffer, and overflow is FAIL-LOUD (status:null -> the runner throws), '
    + 'never a silent truncation; it is a cron with no external trigger. (Q4) NO LEAKAGE — verified empirically, not by '
    + 'inspection: I planted a fake credential in the git output and an item title in the DB rows and confirmed neither, '
    + 'nor any sd_key, nor any merge-subject text, reaches the persisted object. The untrusted side (git subject text) is '
    + 'collapsed to a BOOLEAN before it can travel; drive_reports receives only a rounded number, item_id UUIDs, a static '
    + 'table name, a static source path, and predicate prose containing two integer counts. That is a good design property. '
    + 'THE VERDICT IS FAIL ON Q5 — ONE INTEGRITY DEFECT FOUND IN THE SHIPPED WIRING, AND IT IS PRESENT-TENSE, NOT '
    + 'HYPOTHETICAL. .github/workflows/drive-report-cron.yml:71 uses actions/checkout@v4 with NO fetch-depth, i.e. the '
    + 'default depth-1 SHALLOW clone. MEASURED in a faithful simulation (git clone --depth 1 --branch main): the repo is '
    + 'shallow, `main` still resolves, and `git log main --merges --format=%s` EXITS 0 AND RETURNS ZERO SUBJECTS. Same '
    + 'shipped code, same keys, only clone depth differing: FULL clone scores 2/2, SHALLOW scores 0/2. There is no throw, '
    + 'no unavailable() posture and no alarm, because denominator>0 comes from the DB while the numerator comes from a git '
    + 'query that silently answered nothing. So on its first production run this leg writes a hard FALSE ZERO into '
    + 'drive_reports — an append-only, chairman-facing table that cannot be corrected after the fact. That is precisely the '
    + 'harm this SD family exists to prevent (the predecessor SD\'s own PRD: "the chairman score is never a false 0/2"), '
    + 'and it converts an honest `unavailable` into a permanent wrong attestation. The gap was invisible to every existing '
    + 'instrument: unit tests inject a fake runGitLog, and the TESTING agent\'s live 1.4/2 was measured from the dev '
    + 'worktree, which always has the full history production lacks. TESTING\'s F2 anticipated the adjacent LOUD variant '
    + '(main not a local ref -> throw -> sweep dies); the shallow variant is strictly worse because it is SILENT. '
    + 'Corroboration that the default is known-insufficient here: 25 of 188 workflows in this repo explicitly set '
    + 'fetch-depth: 0; this cron is not one of them. NOT YET MERGED (01603df45a2 is not an ancestor of origin/main), so '
    + 'this is catchable before a single false row is written. Fix is small and belongs in BOTH places — see remediation.',
  // Field names must match what results-storage.js actually reads — a caller-invented
  // `issues` key reaches the writer and is DROPPED (measured: critical_issues/warnings/
  // detailed_analysis all landed empty on the first store, row 51785652).
  critical_issues: [
    {
      severity: 'critical',
      title: 'S1 BLOCKING — production runs on a depth-1 shallow clone, so leg1 silently scores a FALSE 0/2 into the append-only chairman-facing drive_reports',
      detail:
        '.github/workflows/drive-report-cron.yml:71 is `uses: actions/checkout@v4` with no `with:` block at all — no '
        + 'fetch-depth, no ref, and no later `git fetch --unshallow` anywhere in the 83-line file (grep for '
        + 'fetch-depth|unshallow|fetch returns only the checkout line itself). actions/checkout@v4 therefore takes its '
        + 'default fetch-depth: 1. '
        + 'MEASURED (by this agent, faithful simulation `git clone --depth 1 --branch main file://<repo>`): '
        + 'git rev-parse --is-shallow-repository => true; `git log main --merges --format=%s` => EXIT 0, 0 lines. '
        + 'It does NOT error, so the hardened runner\'s `r.status !== 0` throw never fires. '
        + 'END-TO-END MEASURED with the real shipped scoreLeg1ALocal + the real runHardenedGit wiring, three genuinely '
        + 'landed keys, only cwd differing: FULL CLONE => 3777 subjects => points.value 2/2. SHALLOW d=1 => 0 subjects => '
        + 'points.value 0/2, landed 0 of 3, no throw, no unavailable. '
        + 'INFERRED (labelled): GHA on a schedule trigger checks out the default branch and creates local branch `main` '
        + '(checkout@v4 does `-B main refs/remotes/origin/main`), so production matches the simulated shape — `main` '
        + 'resolves, exit 0, near-empty history. If instead `main` did NOT resolve, the outcome is TESTING\'s F2 (throw '
        + 'kills gather(), no report at all). Both production shapes are broken; the shallow one is worse because silent. '
        + 'WHY NO INSTRUMENT SEES IT: every unit test injects a stub runGitLog, so no test observes the real git '
        + 'environment; and the TESTING agent\'s "live production score 1.4/2" was measured from the dev worktree, which '
        + 'is a FULL clone. The dev fixture HAS what production LACKS — the inverse of the usual fixture trap, and equally '
        + 'blinding. drive_reports is append-only (UPDATE/DELETE guarded, per this SD\'s own PRD), so a false zero written '
        + 'here is permanent and reaches the chairman via drive-report-sms. '
        + 'STATUS: 01603df45a2 is NOT an ancestor of origin/main — catchable pre-merge, zero bad rows written so far.',
    },
  ],
  warnings: [
    {
      severity: 'medium',
      title: 'S2 — "zero merge subjects in all of main\'s history" is scored as a real 0 when it is always an instrument outage; the leg has no honest-by-construction floor',
      detail:
        'Independent of the workflow fix, the code has no way to distinguish "I read main\'s full history and nothing '
        + 'matched" from "I could not read main\'s history". isSdLandedInMainHistory does `subjects.some(...)` on whatever '
        + 'it is handed, and scoreLeg1ALocal only routes to unavailable() when the DB-side denominator is 0 — never when '
        + 'the GIT-side corpus is 0. But a corpus of 0 merge subjects on a repo whose main has 3776 of them is never a '
        + 'legitimate measurement. This is the same class the file\'s own philosophy names ("honestly unavailable, never a '
        + 'false zero") applied to the numerator instead of the denominator. Fixing only the workflow leaves the code '
        + 'silently false-zeroing again the next time the environment regresses (a shallow runner, a PR-head checkout, a '
        + 'cwd that is not this repo — note the runner takes cwd: process.cwd(), so WHICH repo is answered is ambient).',
    },
    {
      severity: 'medium',
      title: 'S3 — the predicate is satisfiable by TEXT, not by landed code: revert merges and incidental mentions count as LANDED, and the disclosed limitation is asymmetric',
      detail:
        'MEASURED against real merge-subject shapes with the shipped anchoredKeyPattern. Correctly REJECTED (the guard the '
        + 'SD was specified to build works): `docs/<KEY>-changelog` false, child `<KEY>-B` false, no-separator child '
        + '`<KEY>A` false, `cleanup-after-<KEY>` false. But ACCEPTED: `Merge pull request #N from rickfelix/revert/<KEY>` '
        + 'true, `Revert "feat(<KEY>): thing"` true, and `Merge branch \'main\' into wip # relates to <KEY>` true. So an SD '
        + 'that landed and was then REVERTED scores as landed — twice — and anyone (or any fleet agent) who can name a '
        + 'branch can inflate a chairman-facing governance score without landing code. One revert-shaped merge subject '
        + 'already exists in main today. The rule itself is chairman-ratified (SMS 2026-08-10T23:26Z, ruling c8ad4998) and '
        + 'is not mine to overturn; the actionable defect is DISCLOSURE. The predicate text discloses the false-NEGATIVE '
        + 'tail (squash merges, renamed keys) at length but is silent on the false-POSITIVE tail. cite() already has a '
        + '`limitation` field built for exactly this and travels it with the emission; this leg does not use it.',
    },
    {
      severity: 'low',
      title: 'S4 — an oversized sd_key throws an UNCAUGHT SyntaxError out of scoreLeg1ALocal and kills the whole sweep',
      detail:
        'MEASURED: anchoredKeyPattern compiles an sd_key of 200,000 chars; at 200,001 V8 throws '
        + '"SyntaxError: Invalid regular expression" (pattern-size limit). The throw is uncaught — it escapes '
        + 'scoreLeg1ALocal, escapes the legs array and aborts gather(), so no drive report row is written at all (same '
        + 'blast radius as TESTING F2; leg4 by contrast wraps in try/catch and degrades to unavailable). This requires '
        + 'service-role write access to plant a malformed roadmap_wave_items.promoted_to_sd_key, so it is NOT remotely '
        + 'reachable and is defense-in-depth only — but it is the one input shape that turns a single bad DB row into a '
        + 'total report outage. A length sanity-check, or the same try/catch leg4 already has, closes it.',
    },
    {
      severity: 'low',
      title: 'S5 — the git spawn has neither a timeout nor an explicit maxBuffer, and is re-run once per key (N+1)',
      detail:
        'runHardenedGit is called with only { cwd }, so spawnSync gets no timeout (a hung git holds the cron until the '
        + 'workflow\'s 10-minute job cap) and the default 1MB maxBuffer. Headroom today is adequate and the failure mode is '
        + 'safe: MEASURED 309,323 bytes = 29.5% of 1MB, and on overflow spawnSync returns status:null which the runner '
        + 'turns into a throw — loud, not a silent truncation. The amplifier is that the fetch sits INSIDE the per-key '
        + 'filter (isSdLandedInMainHistory calls runGitLog(mergeLogArgs()) on every invocation), so the live population of '
        + '20 unique keys means 20 full spawns re-reading all 3776 subjects. This is TESTING\'s F3; I flag it here only '
        + 'because hoisting the fetch out of the loop creates exactly the ONE call site where the S2 empty-corpus guard '
        + 'belongs. The two fixes converge — do them together.',
    },
    {
      severity: 'info',
      title: 'S6 CLEAN — injection, escaping and leakage all verified negative (the four questions asked)',
      detail:
        'Q1 INJECTION: production uses runHardenedGit (argv array, explicit shell:false, env-scrubbed incl. the '
        + 'GIT_CONFIG_* prefix family, --literal-pathspecs, --no-optional-locks, core.fsmonitor/core.pager cleared, and '
        + '--no-ext-diff/--no-textconv auto-injected because `log` is a DIFF_VERB) rather than a hand-rolled execSync. '
        + 'argv is the frozen literal [log, main, --merges, --format=%s]; `main` is a source constant, never caller data. '
        + 'sinceIso is unreachable dead code and even if wired is a single --since=<v> token, so it cannot become option '
        + 'injection; note the runner also exposes validateRefs/VALID_BASE_REF if a ref ever does become dynamic. '
        + 'Q2 ESCAPING: /[.*+?^${}()|[\\]\\\\]/g is the complete canonical set for the RegExp-constructor context. `/` '
        + 'needs no escape (only special in literal notation — the \\/ visible in .source is V8 round-trip rendering, not '
        + 'the escape function) and `-` needs none (the key is interpolated OUTSIDE any character class). 19/19 adversarial '
        + 'inputs produced 0 metachar leaks; worst-case match 0.16ms on a 50k-char hostile subject; no quantifier exists in '
        + 'the constructed pattern so catastrophic backtracking has no structure to occur in. '
        + 'Q4 LEAKAGE: planted `sk-live-DEADBEEF...` in the git output and a `SECRET TITLE` on the DB row — the persisted '
        + 'object contains neither, nor any sd_key, nor any merge-subject substring. Persisted surface is exactly: a '
        + 'rounded number, item_id UUIDs, the static string roadmap_wave_items, a static source path, and predicate prose '
        + 'whose only variables are two integer counts.',
    },
  ],
  recommendations: [
    'S1 (BLOCKING, must land before merge) — add `with: { fetch-depth: 0 }` to the checkout in '
      + '.github/workflows/drive-report-cron.yml:71, matching the 25 other workflows in this repo that already do it.',
    'S2 (must land WITH S1, and is the more important half) — hoist the runGitLog call out of the per-key filter into '
      + 'scoreLeg1ALocal, then guard the hoisted corpus: if subjects.length === 0, return unavailable(...) naming the '
      + 'instrument outage. Never score a numerator whose instrument returned nothing. Fixing only the workflow leaves the '
      + 'code silently false-zeroing the next time the environment regresses.',
    'S1/S2 verification — the regression test must be environment-level, not another stubbed-runGitLog unit test: assert '
      + 'that a shallow/empty corpus routes to unavailable and NOT to 0. A stubbed runner structurally cannot see this class.',
    'S3 — add a `limitation:` to the leg1 cite() disclosing the false-POSITIVE tail (revert merges and incidental mentions '
      + 'satisfy the rule) so the chairman-facing citation is symmetric with its existing false-negative disclosure.',
    'S4 — wrap scoreLeg1ALocal in the same try/catch leg4 already uses, so a malformed sd_key degrades this leg to '
      + 'unavailable instead of aborting the entire sweep.',
    'S5 — pass an explicit timeout and maxBuffer to runHardenedGit; the N+1 disappears for free once S2 hoists the fetch.',
  ],
  metadata: {
    review_mode: 'retrospective_security_review_of_shipped_code',
    branch: 'feat/SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001',
    commits_reviewed: ['01603df45a2', '51f180adbcf'],
    merged_to_main: false,
    merge_base_check: '01603df45a2 is NOT an ancestor of origin/main — blocking finding is pre-merge catchable',
    q1_injection: 'CLEAN — runHardenedGit argv-array, shell:false explicit, env-scrubbed, frozen literal argv, no external data',
    q2_escaping: 'CLEAN — canonical escape set, 19/19 adversarial inputs, 0 metachar leaks',
    q2_redos: 'STRUCTURALLY IMPOSSIBLE — zero quantifiers in constructed pattern; worst case 0.16ms on 50,000-char hostile subject',
    q2_regex_size_cliff: 'sd_key of 200000 chars compiles; 200001 throws uncaught SyntaxError (S4)',
    q3_exhaustion: 'NON-ISSUE — 309323 bytes = 29.5% of 1MB default maxBuffer; overflow is fail-loud (status:null -> throw); cron, not user-facing',
    q4_leakage: 'CLEAN — planted credential + planted title both absent from persisted object; git subject text collapses to boolean',
    q4_persisted_surface: 'rounded number, item_id UUIDs, static table name, static source path, predicate prose with 2 integer counts',
    s1_measured_full_clone: '3777 subjects -> points.value 2/2',
    s1_measured_shallow_clone: '0 subjects, git exit 0 (no throw) -> points.value 0/2 silently',
    s1_shallow_sim_method: 'git clone --depth 1 --branch main file://<repo>; rev-parse --is-shallow-repository => true',
    s1_workflow_line: '.github/workflows/drive-report-cron.yml:71 actions/checkout@v4 with no with: block',
    s1_corroboration: '25 of 188 workflows in this repo explicitly set fetch-depth: 0; drive-report-cron.yml is not one of them',
    s3_spoof_accepted: ['revert/<KEY> branch merge', 'Revert "feat(<KEY>): ..."', 'prose mention of <KEY> in a merge subject'],
    s3_anchor_correctly_rejected: ['<KEY>-changelog', '<KEY>-B', '<KEY>A', 'cleanup-after-<KEY>'],
    s3_revert_shaped_merges_in_main_today: 1,
    s5_live_population: '21 done rows / 20 unique keys at windowHours 720 -> 20 git spawns per sweep',
    process_cwd_lint_scope: 'lib/sub-agents/ only — scripts/cron/drive-report-sweep.mjs is out of scope, not a finding',
    relationship_to_testing_f2: 'TESTING F2 found the LOUD variant (main unresolvable -> throw -> sweep dies); S1 is the SILENT variant (main resolves, exit 0, empty corpus -> false zero), which is strictly worse and was not covered',
  },
  execution_time_ms: 1500000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'SECURITY',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('SECURITY', SD_ID, { name: 'Chief Security Architect' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || PHASE));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
