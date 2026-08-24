// SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 — SECURITY sub-agent evidence writer (EXEC phase).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001';
const PHASE = 'EXEC';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 93,
  summary:
    'EXEC-phase security review of the never-pushed third state in createPRMergeVerificationGate ' +
    '(scripts/modules/handoff/executors/lead-final-approval/gates.js). NO newly-introduced, remotely-exploitable vulnerability. ' +
    'Every claim below was EXECUTED, not read. (1) SHELL INJECTION — CONFIRMED EXPLOITABLE in the new diagnostic at gates.js:1063 ' +
    '`git ls-remote --heads origin ${branch}`: branchBelongsToSd places NO constraint on the post-key suffix (verified: ";", "$()", ' +
    'backtick and "&" suffixes all return belongs:true), git accepts those ref names, and running the exact invocation through execSync ' +
    'against a branch feat/<KEY>-a&whoami captured stdout "rickf" — whoami executed. BUT the trust boundary is narrow: the new sink reads ' +
    'refs/heads/ (LOCAL branches only), and creating a local branch already requires git/filesystem write on the gate host, i.e. code ' +
    'execution the attacker would already have. It is the SAME accepted interpolation pattern the file already uses, not a new risk class. ' +
    '(2) The PRE-EXISTING Scan B sink at gates.js:861 `git rev-list --count origin/main..${branch}` is STRICTLY WORSE and is NOT introduced ' +
    'by this SD: its input comes from `git branch -r`, i.e. REMOTE branches. Demonstrated end-to-end — pushed feat/<KEY>-a&whoami to a ' +
    'remote, fetched into a FRESH clone that never held it locally, `git branch -r` surfaced it, and the pre-existing line executed whoami ' +
    '(stdout "rickf"). Reachable by anyone with push access to rickfelix/EHG_Engineer or rickfelix/ehg. Out of this SD scope; routed to a ' +
    'follow-up rather than blocking here. (3) `--search "${sdId}"` at gates.js:987 is NOT currently exploitable: a full paginated census of ' +
    'all 5799 sd_key values gives a total charset of exactly [-.0-9@A-Za-z_] with ZERO shell metacharacters, and "@" is inert in both sh ' +
    'and cmd.exe. However sd_key is `text` with only a UNIQUE constraint and NO CHECK constraint (measured via pg_constraint), so that ' +
    'safety is convention, and double-quoting stops cmd.exe "&" but not POSIX $()/backticks. (4) `${repo}` is NOT attacker-controllable: ' +
    'computeReposForSD never emits free-form SD-row content — metadata.target_repos is used only as a filter predicate against a hardcoded ' +
    'allowlist, and the venture path returns github_repo from the validated in-repo registry. (5) The new ship_review_findings query ' +
    '(gates.js:1030-1036) is clean: SELECT-only, PostgREST-parameterized (no SQL injection), and MEASURED to degrade FAIL-CLOSED — under ' +
    'anon it returns "permission denied for table ship_review_findings", supabase-js resolves {data:null,error} without throwing, the code ' +
    'takes data||[] and the missing rescue evidence makes isSpecimen MORE likely true, i.e. the gate blocks. The table is real and the path ' +
    'is not dead-by-construction (505 rows, all three selected columns present). (6) STRUCTURAL POSITIVE: the change is monotonically ' +
    'additive on failures — the new block sits after every pre-existing early-return and either returns a NEW failure or falls through to ' +
    'the original passed:true, so it can add FAILs but can never remove one. CONDITIONAL on hardening the new execSync sink and correcting ' +
    'the "process" sd_type named in the remediation text, which is not a valid value.',
  critical_issues: [],
  warnings: [
    {
      issue:
        'CONFIRMED command injection (local-trust) in NEW code: gates.js:1063 interpolates an unquoted branch name into ' +
        'execSync(`git ls-remote --heads origin ${branch}`). Verified by execution — whoami ran and its output was captured.',
      severity: 'high',
      recommendation:
        'Replace the execSync template literal with execFileSync("git", ["ls-remote", "--heads", "origin", "--", branch]) so the branch ' +
        'name is passed as an argv element and never parsed by a shell. Same treatment for the git for-each-ref call at gates.js:1056 ' +
        '(no interpolation today, but it is the source of the tainted value).',
    },
    {
      issue:
        'Scan C `--limit 100` still caps AFTER --search, and --search matches the SD key anywhere in a PR title/body/comments, not just ' +
        'on the owning branch. MEASURED: this SD key already returns 65 merged PRs against the cap of 100 (65% consumed) before it has ' +
        'even shipped. A heavily-referenced key can exceed 100, pushing the owning PR outside the window and yielding a spurious ' +
        'never_pushed FAIL.',
      severity: 'medium',
      recommendation:
        'Narrow the search (e.g. append a head/branch qualifier) or paginate past the cap, and treat a result set at the cap as ' +
        '"window saturated / cannot conclude" rather than as evidence of absence. Fail-closed direction, so not a security hole — but it ' +
        'is a self-inflicted completion-pipeline blockage that grows with fleet chatter.',
    },
    {
      issue:
        'The NO_CODE_SD_TYPES exemption is self-asserted by the row being gated. sd_type is DB-constrained (sd_type_check, 15 values) so ' +
        'arbitrary values cannot be injected, but an actor can set sd_type to documentation/docs/orchestrator and skip this check ' +
        'entirely — an UNAUDITED equivalent of --bypass-validation, which is audit-logged per protocol.',
      severity: 'low',
      recommendation:
        'Not a vulnerability (the actor already holds an authorized bypass) but the unaudited variant is worth closing: log the exemption ' +
        'decision with the sd_type that triggered it so an exemption is as visible in the audit trail as a bypass is.',
    },
    {
      issue:
        "NO_CODE_SD_TYPES includes 'process', which is NOT one of the 15 values permitted by the sd_type_check CHECK constraint " +
        "(feature, bugfix, database, infrastructure, security, refactor, documentation, orchestrator, performance, enhancement, docs, " +
        "discovery_spike, implementation, ux_debt, uat). The value is dead, and worse, the never-pushed remediation message tells the " +
        "operator \"its sd_type should be one of: documentation, docs, process, orchestrator\" — acting on 'process' produces a CHECK " +
        'constraint violation.',
      severity: 'low',
      recommendation:
        "Drop 'process' from NO_CODE_SD_TYPES (gates.js:627) so the constant and the operator-facing remediation text both name only " +
        'values the database will actually accept.',
    },
    {
      issue:
        'The ship_review_findings query destructures only { data } and drops { error } (gates.js:1033-1036). The direction is safe ' +
        '(fail-closed), but a permanently-broken query — renamed column, revoked grant — is indistinguishable from "no rows", so the ' +
        'rescue path could silently become dead without any signal.',
      severity: 'low',
      recommendation:
        'Bind and log error (repo convention: ALWAYS bind error on supabase reads). Keep the fail-closed behaviour; just make a broken ' +
        'lookup observable instead of silent.',
    },
  ],
  recommendations: [
    {
      action:
        'BLOCKING-ish (cheap, in-scope): convert gates.js:1063 to execFileSync with an argv array so the tainted branch name never reaches ' +
        'a shell. ~5 lines.',
      priority: 'high',
    },
    {
      action:
        "Remove 'process' from NO_CODE_SD_TYPES (gates.js:627) — it is not a valid sd_type and the remediation message currently advises " +
        'an operator to set a value the CHECK constraint rejects.',
      priority: 'high',
    },
    {
      action:
        'FOLLOW-UP SD (pre-existing, NOT this SD): harden the remote-reachable injection at gates.js:861 ' +
        '(`git rev-list --count origin/main..${branch}` fed by `git branch -r`) and the quoted-but-still-POSIX-vulnerable ' +
        'gates.js:872 (`gh pr list --head "${cleanBranch}"`). Both should use execFileSync argv arrays. This is the highest-severity ' +
        'item found, and it predates this change.',
      priority: 'high',
    },
    {
      action:
        'Consider a CHECK constraint or a shared validator pinning sd_key to ^[A-Za-z0-9._@-]+$ — measured true for all 5799 current ' +
        'rows, currently unenforced, and several shell/CLI sinks interpolate it.',
      priority: 'medium',
    },
    {
      action:
        'Treat a Scan C result set that hits --limit 100 as "cannot conclude" rather than as absence of evidence; this SD key alone ' +
        'already occupies 65 of the 100 slots.',
      priority: 'medium',
    },
    {
      action: 'Bind and log the supabase error on the ship_review_findings read so a permanently-broken rescue path is observable.',
      priority: 'low',
    },
  ],
  metadata: {
    review_type: 'exec_phase_security_review',
    prd_id: 'PRD-SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001',
    gate_file: 'scripts/modules/handoff/executors/lead-final-approval/gates.js',
    gate_function: 'createPRMergeVerificationGate',
    // NOT named `findings`: storeSubAgentResults deliberately strips metadata.findings and keeps
    // only _findings_had_keys (anti-snowball, QF-20260803-007). Verified by reading row
    // bde3ab1f back — all 10 notes were discarded while every other custom metadata key survived.
    security_findings: [
      {
        id: 'SEC-1-new-code-command-injection-git-ls-remote-local-trust',
        severity: 'high',
        note:
          'CONFIRMED BY EXECUTION, in code this SD introduces. gates.js:1063 runs ' +
          'execSync(`git ls-remote --heads origin ${branch}`) where branch comes from the git for-each-ref enumeration at gates.js:1056, ' +
          'filtered only by branchBelongsToSd. THE FILTER IMPOSES NO CHARACTER CONSTRAINT: resolveBranchOwner accepts <type>/<KEY> or ' +
          '<type>/<KEY>-<suffix> with the suffix entirely unconstrained — measured, feat/<KEY>-a;whoami, feat/<KEY>-a$(whoami), ' +
          'feat/<KEY>-a`whoami` and feat/<KEY>-a&whoami ALL return belongs:true. git accepts those ref names (git check-ref-format ' +
          'forbids space, ~ ^ : ? * [ \\ and control chars, but permits ; & $ ` ( ) etc.); verified by creating them in a throwaway repo. ' +
          'PROOF: running the exact gates.js invocation via execSync against feat/<KEY>-a&whoami captured stdout "rickf\\n" — the ' +
          'injected whoami executed even though git ls-remote itself failed. PLATFORM NOTE: on win32 execSync uses cmd.exe, where "&" ' +
          'separates and ";" does not; on POSIX /bin/sh, ";" "$()" and backticks separate. "|" was rejected by git on Windows (NTFS ' +
          'filename restriction on loose refs), but would be creatable on Linux. So both platforms are exploitable with different ' +
          'metacharacters. SEVERITY IS BOUNDED BY THE TRUST BOUNDARY, and this is the honest part: this sink enumerates refs/heads/ — ' +
          'LOCAL branches only. Creating a local branch requires git/filesystem write on the gate host, which already implies code ' +
          'execution (hooks, npm scripts). So this is NOT a privilege-escalation path on its own. The realistic route is indirect: a ' +
          'poisoned REMOTE branch that someone checks out locally (git DWIM creates a matching local head) becomes a local head and then ' +
          'reaches this sink. ATTRIBUTION: this is a new SINK but the same interpolation pattern already accepted throughout this file ' +
          '(gates.js:582, 737, 861, 872, 987) — it is not a risk class this SD introduces. FIX IS CHEAP AND IN SCOPE: ' +
          'execFileSync("git", ["ls-remote", "--heads", "origin", "--", branch], { cwd: repoPath, encoding: "utf8", timeout: 10000 }).',
      },
      {
        id: 'SEC-2-preexisting-REMOTE-reachable-injection-scan-b-rev-list',
        severity: 'high',
        note:
          'PRE-EXISTING — NOT INTRODUCED BY THIS SD, and explicitly not a reason to block it. Recorded because it is the ' +
          'highest-severity finding of this review and the team lead asked whether the new interpolation differs meaningfully from the ' +
          'pre-existing pattern. IT DOES, AND IN THE PRE-EXISTING CODE FAVOUR OF WORSE: gates.js:861 runs ' +
          'execSync(`git rev-list --count origin/main..${branch}`) where branch comes from `git branch -r` (gates.js:~846) — that is ' +
          'REMOTE-derived input, not local. DEMONSTRATED END-TO-END, not reasoned: created feat/<KEY>-a&whoami, pushed it to a remote, ' +
          'cloned into a FRESH repo that never held the branch locally, ran git fetch --prune, confirmed `git branch -r` lists ' +
          'origin/feat/<KEY>-a&whoami, then ran the exact gates.js:861 invocation — captured stdout "rickf\\n". So any principal with ' +
          'push access to rickfelix/EHG_Engineer or rickfelix/ehg can obtain code execution on every host that runs ' +
          'LEAD-FINAL-APPROVAL, with no local action required by the victim. gates.js:872 ' +
          '(`gh pr list --head "${cleanBranch}"`) is double-quoted, which neutralises cmd.exe "&" but NOT POSIX $()/backticks, so it is a ' +
          'second (POSIX-only) instance. Practical risk today is low — single-maintainer repos, so the precondition is an insider or a ' +
          'compromised collaborator/token — but the blast radius is full RCE on maintainer and CI hosts. RECOMMENDATION: file a follow-up ' +
          'SD converting gates.js:861 and 872 to execFileSync argv arrays. Do NOT expand this SD to cover it; its stated boundary is the ' +
          'never-pushed third state, and the same file already carries an explicit deferral note (FR-5) for another suppression site.',
      },
      {
        id: 'SEC-3-sdId-search-interpolation-not-currently-exploitable-but-unenforced',
        severity: 'low',
        note:
          'MEASURED, not assumed. gates.js:987 interpolates sdId into `gh pr list --repo ${repo} --state merged --search "${sdId}" ...`. ' +
          'sdId is ctx.sd.sd_key || ctx.sd.id. Full paginated census of strategic_directives_v2 (5799 sd_key rows, ordered paging, not a ' +
          'capped .select()): the ENTIRE charset across all keys is "-.0123456789@ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz". ' +
          'Exactly 2 rows contain anything outside [A-Za-z0-9._-], both a trailing "@" ' +
          '(SD-NARRATIVE-KNOWLEDGE-TO-ENFORCED-ORCH-001-@, SD-VENTURE-DETAIL-PAGE-REDESIGN-ORCH-001-@); "@" is inert in both sh and ' +
          'cmd.exe. Max key length 65. ZERO keys contain a shell metacharacter, so this is not exploitable today. THE CAVEAT: sd_key is ' +
          'column type `text` and pg_constraint shows only strategic_directives_v2_sd_key_key UNIQUE — there is NO CHECK constraint on ' +
          'its format. The safe charset is convention enforced by generators, not by the database, and sd_keys are authored by agents ' +
          'from human/LLM-supplied text. The double quotes around ${sdId} block cmd.exe & and | but do NOT block POSIX $(...) or ' +
          'backticks. Same execFileSync fix applies; optionally add a CHECK constraint ^[A-Za-z0-9._@-]+$, which is measured true for ' +
          '100% of current rows.',
      },
      {
        id: 'SEC-4-repo-value-is-not-attacker-controllable-positive',
        severity: 'info',
        note:
          'POSITIVE FINDING, recorded so a future reviewer does not re-derive it. ${repo} appears in three shell commands including the ' +
          'new Scan C, and the obvious worry is that it comes from SD-row metadata. IT DOES NOT. computeReposForSD (gates.js:117) never ' +
          'emits free-form SD content: Tier 1 reads sd.metadata.target_repos but uses it ONLY as a filter predicate ' +
          '(allowed.includes(shortName)) against a hardcoded two-element list, so the emitted githubRepo is always one of the hardcoded ' +
          'literals; Tier 2 returns those same literals or resolveGitHubRepo(target_application), which (lib/repo-paths.js:376) resolves ' +
          'against loadValidatedRegistry() — the committed, PR-reviewed applications/registry.json — and returns null on a miss; Tier 3 ' +
          'returns the hardcoded pair. So ${repo} is controlled by code-reviewed repo content, never by a database row an agent can ' +
          'write. This is the right design and it should not be regressed.',
      },
      {
        id: 'SEC-5-ship-review-findings-query-select-only-and-fail-closed-positive',
        severity: 'info',
        note:
          'VERIFIED BY EXECUTION against the live database — this was question 2 of the brief and the answer is clean on both counts. ' +
          'READ-ONLY: gates.js:1030-1036 is .from("ship_review_findings").select("id, pr_number, sd_key").eq("sd_key", sdId).limit(5). No ' +
          'insert/update/upsert/delete/rpc anywhere in the new block. The filter is PostgREST-parameterized by supabase-js, not ' +
          'string-concatenated SQL, so there is no SQL-injection surface; and sdId is measured metacharacter-free regardless (see SEC-3). ' +
          'NOT DEAD-BY-CONSTRUCTION: ran the exact query under service role — error null, data [] — and confirmed the table is real with ' +
          '505 rows and all three selected columns present (sample row: pr_number 2830). So the rescue path can genuinely fire; note ' +
          'many rows carry sd_key NULL, which narrows its coverage but only in the safe direction. FAIL-CLOSED DEGRADATION CONFIRMED: ran ' +
          'the same query under the anon key and got "permission denied for table ship_review_findings". supabase-js RESOLVES that as ' +
          '{data:null,error} rather than throwing, so the try/catch is not what saves it — the `data || []` fallback is. Either way ' +
          'shipReviewFindings becomes [], which REMOVES disqualifying evidence from isNeverPushedSpecimen and therefore makes isSpecimen ' +
          'MORE likely to be true, i.e. the gate FAILS. A DB outage can never turn this into a pass. Correct direction. Minor hygiene ' +
          'note: { error } is not bound, so a permanently-broken lookup (renamed column, revoked grant) is silent — safe, but invisible.',
      },
      {
        id: 'SEC-6-exemption-is-self-asserted-and-unaudited-control-integrity',
        severity: 'low',
        note:
          'CONTROL-INTEGRITY observation rather than a vulnerability, stated with its own limits. The new check is skipped entirely when ' +
          'ctx.sd.sd_type is in NO_CODE_SD_TYPES, and sd_type lives on the same row as the work being gated. Good news first: sd_type is ' +
          'genuinely constrained — pg_constraint shows sd_type_check restricting it to 15 literals — so an attacker cannot invent an ' +
          'exempt type, and the narrowing this SD chose over the rejected NON_CODE predicate is real (live census: infrastructure 3330, ' +
          'feature 947, orchestrator 604, bugfix 505, documentation 147, docs 11 across 5799 rows; this SD own type, infrastructure, is ' +
          'correctly NON-exempt). The residue: whoever completes an SD can set sd_type to documentation/docs/orchestrator and the ' +
          'never-pushed check never runs. That does not grant capability they lack — --bypass-validation is already available to them — ' +
          'but it grants an UNAUDITED version of it, whereas the bypass path is audit-logged with a required reason. Recommendation is ' +
          'observability, not restriction: log the exemption and the sd_type that triggered it so an exemption is as visible after the ' +
          'fact as a bypass.',
      },
      {
        id: 'SEC-7-process-is-not-a-valid-sd_type-remediation-text-is-wrong',
        severity: 'low',
        note:
          "MEASURED against the live CHECK constraint. NO_CODE_SD_TYPES (gates.js:627) is " +
          "new Set(['documentation','docs','process','orchestrator']). sd_type_check permits exactly: feature, bugfix, database, " +
          'infrastructure, security, refactor, documentation, orchestrator, performance, enhancement, docs, discovery_spike, ' +
          "implementation, ux_debt, uat. 'process' is NOT among them, so that Set member can never match a real row — dead by " +
          'construction. The consequence is not merely cosmetic: the never-pushed failure message interpolates the Set into ' +
          '"If this SD genuinely ships no code, its sd_type should be one of: ${[...NO_CODE_SD_TYPES].join(\', \')}", so the gate tells an ' +
          "operator to set a value the database will reject with a constraint violation. Remove 'process'.",
      },
      {
        id: 'SEC-8-change-is-monotonically-additive-on-failures-positive',
        severity: 'info',
        note:
          'POSITIVE STRUCTURAL FINDING and the most important one for a security verdict: this change CANNOT weaken the control. Traced ' +
          'the control flow rather than trusting the comments. The new block is guarded by ' +
          '`mergeEvidence.length === 0 && !NO_CODE_SD_TYPES.has(ctx.sd.sd_type)` and sits AFTER every pre-existing early return (key-set ' +
          'refusal, unreadableRepos refusal, openPRs failure, unmergedBranches failure), each of which returns before it. From there it ' +
          'has exactly three exits: a NEW fail (scan_c_unreadable), a NEW fail (never_pushed), or fall-through to the original ' +
          'passed:true. The only mutation it makes to pre-existing state is mergeEvidence.push(...) inside the Scan B loop, which does ' +
          'not touch the prMerged decision that drives the unmergedBranches verdict. Therefore the change is monotonic: it can add ' +
          'failures, never remove one. No path exists by which a gh outage, a DB outage, or an empty scan converts a previously-failing ' +
          'completion into a pass — the two new failure modes (scanCFailed with no merged PRs; DB rescue unavailable) both push toward ' +
          'FAIL. That is the correct posture for a completion control.',
      },
      {
        id: 'SEC-9-scanC-limit-100-window-saturation-fail-closed',
        severity: 'medium',
        note:
          'MEASURED. The peer TESTING agent --search fix is present and works — re-ran the exact gates.js:987 command for ' +
          'SD-LEO-INFRA-RESUME-FINAL-READ-001 and PR #6790 (merged 2026-08-04) came back, confirming the aged-out false-positive is ' +
          'closed. But --limit 100 still caps the result set AFTER the search, and --search matches the SD key anywhere in a PR ' +
          'title/body/comments, not only on the owning branch — which is precisely why the branchBelongsToSd filter is needed (the live ' +
          'payload for that key contained qf/QF-20260803-422 and feat/SD-REFILL-00C7I5BY as mention-only matches). Counts taken now: ' +
          'SD-LEO-INFRA-RESUME-FINAL-READ-001 -> 5, SD-LEO-INFRA-UNIFIED-GATE-ENFORCEMENT-001 -> 6, and ' +
          'SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (this SD, not yet shipped) -> 65 of a 100 cap. A key discussed as much as this one ' +
          'can plausibly exceed 100, at which point GitHub best-match ordering may drop the owning PR out of the window and the gate ' +
          'reports never_pushed for an SD that shipped. Direction is fail-closed (over-blocking, not a false pass) so this is not a ' +
          'security hole, but it is a self-inflicted completion blockage that grows with fleet chatter. Treat a result set sitting at the ' +
          'cap as "window saturated / cannot conclude" rather than as absence.',
      },
      {
        id: 'SEC-10-rate-limit-self-dos-hypothesis-FALSIFIED',
        severity: 'info',
        note:
          'RECORDED AS A FALSIFICATION so it is not re-raised. Hypothesis: because branches are normally deleted at merge, mergeEvidence ' +
          'is empty on the common shipped-and-cleaned-up path, so Scan C runs on nearly every completion; if `gh pr list --search` ' +
          'consumed GitHub REST search quota (30 requests/minute) then a busy fleet would exhaust it, and because Scan C now FAILS CLOSED ' +
          'on error, rate limiting would block completions fleet-wide — a self-DoS created by the new fail-closed posture. TESTED: read ' +
          'gh api rate_limit (search 30/limit, used 0; graphql 5000/limit, used 18; core 5000/limit, used 26), ran one real Scan C ' +
          'invocation, re-read. The search bucket did not move (still used 0/30); graphql went 18 -> 20. So `gh pr list --search` is ' +
          'served by the GraphQL API at 5000 points/hour, roughly 2500 completions/hour at 2 points each — not a constraint. HYPOTHESIS ' +
          'FALSIFIED; no rate-limit availability risk from this change.',
      },
    ],
    measurement_method:
      'Adversarial, execution-first. Injection was not argued from the source — a throwaway git repo was created, metacharacter branch ' +
      'names were created (confirming git accepts ; $() & and rejects | on Windows), and the exact gates.js execSync invocations were ' +
      'replayed against them, with the injected whoami output captured as proof. The pre-existing remote-reachable variant was proven the ' +
      'same way through a real push/fetch into a fresh clone, so the local-vs-remote trust distinction is measured rather than asserted. ' +
      'sd_key safety was established by a full paginated census of all 5799 rows (not a capped .select(), which would measure the cap) ' +
      'plus a pg_constraint read confirming no CHECK enforces it. The ship_review_findings query was executed under BOTH service-role and ' +
      'anon credentials to observe the actual degradation path. sd_type claims were checked against the live sd_type_check constraint. The ' +
      'rate-limit concern was deliberately falsified by measuring the bucket before and after a real invocation rather than assumed.',
    injection_proof: {
      new_sink: 'gates.js:1063 — execSync(`git ls-remote --heads origin ${branch}`)',
      new_sink_input: 'git for-each-ref refs/heads/ (LOCAL branches only) filtered by branchBelongsToSd',
      new_sink_trust_boundary: 'local git/filesystem write on the gate host — already implies code execution',
      preexisting_sink: 'gates.js:861 — execSync(`git rev-list --count origin/main..${branch}`)',
      preexisting_sink_input: 'git branch -r (REMOTE branches)',
      preexisting_sink_trust_boundary: 'push access to rickfelix/EHG_Engineer or rickfelix/ehg — strictly wider',
      payload_used: 'feat/<SD_KEY>-a&whoami',
      observed_stdout: 'rickf',
      metacharacters_accepted_by_git_on_win32: '; $ ( ) &  (| rejected — NTFS loose-ref filename restriction, would work on Linux)',
      resolver_imposes_no_charset_constraint: true,
    },
    sd_key_census: {
      rows: 5799,
      full_charset: '-.0123456789@ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz',
      keys_outside_A_Za_z0_9_dot_underscore_dash: 2,
      shell_metacharacters_present: 0,
      max_length: 65,
      format_check_constraint: 'NONE — sd_key is text with only strategic_directives_v2_sd_key_key UNIQUE',
    },
    ship_review_findings_probe: {
      select_only: true,
      writes: 'none',
      table_rows: 505,
      service_role_result: 'error null, data []',
      anon_result: 'permission denied for table ship_review_findings — resolves {data:null,error}, does not throw',
      degradation_direction: 'FAIL-CLOSED (missing rescue evidence makes isSpecimen more likely true)',
      error_bound: false,
    },
    scan_c_measurements: {
      bucket_consumed: 'graphql (5000/hr), NOT rest search (30/min) — measured before/after a real invocation',
      results_for_this_sd_key: 65,
      cap: 100,
      aged_out_sd_now_found: 'SD-LEO-INFRA-RESUME-FINAL-READ-001 -> PR #6790 returned, confirming the --search fix works',
    },
    conditions_to_clear: [
      'Convert gates.js:1063 to execFileSync("git", ["ls-remote","--heads","origin","--",branch]) — confirmed-executing injection in new code, ~5 line fix',
      "Remove 'process' from NO_CODE_SD_TYPES (gates.js:627) — not a valid sd_type; the remediation message currently advises a value the CHECK constraint rejects",
      'RECOMMENDED: bind and log the supabase error on the ship_review_findings read so a permanently-broken rescue path is observable',
      'FOLLOW-UP SD (out of scope here): harden the pre-existing remote-reachable injection at gates.js:861 and 872 — highest-severity finding, predates this change',
      'RECOMMENDED: treat a Scan C result set at --limit 100 as "cannot conclude" rather than absence (this SD key already occupies 65 of 100)',
    ],
    out_of_scope_confirmed_not_blocking: [
      'gates.js:861 / 872 pre-existing injection — same accepted pattern, wider trust boundary, predates this SD',
      'gates.js:~910 unreadable-repo suppression — already documented in-code as deferred FR-5',
    ],
  },
  execution_time_ms: 1620000,
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
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
console.log('CRITICAL_ISSUES=' + (results.critical_issues?.length ?? 'unset'));
console.log('WARNINGS=' + (results.warnings?.length ?? 'unset'));
console.log('RECOMMENDATIONS=' + (results.recommendations?.length ?? 'unset'));
console.log('SECURITY_FINDINGS=' + (results.metadata.security_findings?.length ?? 'unset'));
