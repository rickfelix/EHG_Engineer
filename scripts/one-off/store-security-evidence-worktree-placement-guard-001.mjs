// SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001 — SECURITY sub-agent evidence writer (EXEC phase).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001';
const PHASE = 'EXEC';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  summary:
    'Reviewed commits 25447bba0c3 + 4efcdffbd2f for injection/escalation surface by EXECUTING probes against the real ' +
    'modules, not by reading them. HEADLINE: no command-injection and no path-traversal vulnerability exists in this diff ' +
    '(both explicitly probed and refuted below), BUT the ENF-12e block is NOT gated on a match — it unconditionally ' +
    'require()s scripts/resolve-sd-workdir.js and spawns `git rev-parse` on EVERY Bash tool call, and that require runs ' +
    'dotenv.config() at import time, injecting 82 .env keys (measured — incl. ANTHROPIC_API_KEY, ADMIN_API_KEY, ' +
    'SUPABASE_SERVICE_ROLE_KEY) into the enforcement hook process that previously never loaded .env at all. That is a real ' +
    'expansion of the hook\'s secret/config surface, it contradicts the diff\'s OWN comment ("paid only on this rare, ' +
    'already-matched `git worktree add` branch") and the SD\'s own TR-4/F4 constraint, and it costs a MEASURED ~101-104ms ' +
    'on every Bash call. Also found a measured FALSE POSITIVE that blocks a correct command: the flag-skipping regex ' +
    'treats value-taking flags as boolean, so `git worktree add -b feat/x .worktrees/qf/117` extracts "feat/x" as the ' +
    'TARGET and REFUSES the sanctioned action. Both are one-line-scope fixes. Q1 (regex injection): no injection, but ' +
    'several enumerated bypasses — acceptable for an advisory guard, documented below. Q2 (execSync cwd): confirmed ' +
    'injection-SAFE by probe, with a narrow Windows caveat. Q3 (bypass): acceptable residual risk, do not harden. ' +
    'Q4 (kill switch): a command CANNOT set LEO_WORKTREE_ADD_GUARD for its own PreToolUse check — confirmed — but the ' +
    'inline `VAR=x git worktree add ...` form bypasses the guard anyway for an unrelated reason (regex boundary).',
  findings: [
    {
      id: 'S-1-unconditional-require-injects-82-env-keys-into-the-hook',
      severity: 'medium',
      note:
        'MEASURED, and the most significant finding. The ENF-12e block is entered for EVERY Bash tool call ' +
        '(`if (TOOL_NAME === "Bash" && process.env.LEO_WORKTREE_ADD_GUARD !== "off")`, pre-tool-enforce.cjs:810). The regex ' +
        'match happens LATER, inside worktreeAddIsSibling() at :836. So both require()s (:812, :813) and the ' +
        '`git rev-parse --git-common-dir` execSync (:828) run on every Bash call regardless of whether the command has ' +
        'anything to do with worktrees. The in-file comment at :823 asserts the opposite — "~10-20ms git subprocess, paid ' +
        'only on this rare, already-matched `git worktree add` branch" — and the PRD\'s TR-4/F4 rationale ("MUST be a lazy ' +
        'require inside the matched `git worktree add` branch only ... never a top-level require, or every Bash call pays ' +
        'the ~59ms plus the supabase/dotenv import graph") is therefore NOT satisfied by the shipped code. The comment ' +
        'describes an intent the code does not implement. ' +
        'SECURITY CONSEQUENCE, measured: scripts/resolve-sd-workdir.js:39-41 does `import dotenv from "dotenv"; ' +
        'dotenv.config();` at module scope. I stripped every .env-defined key from a child process env, required the ' +
        'module, and diffed process.env: INJECTED_COUNT=82. Those 82 keys include ANTHROPIC_API_KEY, ADMIN_API_KEY, ' +
        'SUPABASE_SERVICE_ROLE_KEY, CHAIRMAN_PHONE and CLOUDFLARE_ACCOUNT_ID. I separately enumerated every require() site ' +
        'in the 1700-line hook (grep, 46 sites): line 813 is the ONLY one that pulls in a dotenv-loading module. This diff ' +
        'is therefore the first thing to ever load .env into the enforcement hook process. Consequences: (a) the hook now ' +
        'holds secrets it never held, for the remainder of its run, and it spawn()s a child at :1361 which would inherit ' +
        'them; (b) every `process.env.<GUARD>` read that occurs AFTER line 852 becomes settable from a GITIGNORED, ' +
        'never-code-reviewed .env file. I checked what that means TODAY: .env on this host already contains ' +
        'LEO_WORKTREE_GUARD=off, and ENFORCEMENT 13 reads process.env.LEO_WORKTREE_GUARD at :866 — but :866 is gated on ' +
        '(TOOL_NAME === "Edit" || TOOL_NAME === "Write") while the ENF-12e require only fires on Bash, so the two never ' +
        'coexist in one hook process and there is NO live guard-disable today. This is LATENT, not exploited: the moment ' +
        'anyone adds a Bash-scoped guard flag (LEO_CLAIM_GUARD, LEO_RCA_ENFORCEMENT, LEO_FORCE_PUSH_OWN_BRANCH, ' +
        'EMERGENCY_RCA_BYPASS, FILE_CLAIM_ENFORCED are all read post-852) to .env, that guard is silently off with no diff, ' +
        'no PR, no audit row. FIX (restores TR-4 exactly and removes the whole class): require the dotenv-FREE CJS module ' +
        'first, run the cheap regex, and only then pay for the ESM module + subprocess — ' +
        '`const { worktreeAddIsSibling, extractTargetPath } = require("../../lib/worktree-add-sibling-guard.cjs"); ' +
        'if (extractTargetPath(input.command || "")) { ...require resolve-sd-workdir, execSync, verdict... }`. ' +
        'lib/worktree-add-sibling-guard.cjs already exports extractTargetPath and is pure/import-free, so this costs nothing.',
    },
    {
      id: 'S-2-value-taking-flag-consumed-as-boolean-refuses-the-sanctioned-command',
      severity: 'medium',
      note:
        'MEASURED FALSE POSITIVE that blocks correct work — the same seat-freezing class of harm the SD exists to prevent, ' +
        'inverted. WORKTREE_ADD_RE (lib/worktree-add-sibling-guard.cjs:24) skips flags with `(?:(-[-\\w]+\\s+)*)`, which ' +
        'treats EVERY flag as boolean. `-b` / `-B` take a VALUE. Probe results with repoRoot=cwd=C:/repo: ' +
        '`git worktree add -b feat/x .worktrees/qf/117` -> extractTargetPath returns "feat/x" (the BRANCH), resolves to ' +
        'C:\\repo\\feat\\x, verdict isSibling=TRUE -> ENF-12e exits 2 and REFUSES a perfectly sanctioned command, with an ' +
        'error message naming a path the user never typed. Same for -B. The guard only works when the path precedes the ' +
        'flag, which is the ordering its own banner prescribes — but the opposite ordering is idiomatic git and is used ' +
        'elsewhere in this very repo (scripts/modules/complete-quick-fix/shared-tree-contention-guard.test.js:61 uses ' +
        '`worktree add -q -B <branch> <path>`; source-tree-refresh uses `worktree add -B reaper-source <dir> origin/main`). ' +
        'THE TESTS GIVE FALSE CONFIDENCE: lib/__tests__/worktree-add-sibling-guard.test.js:21 is literally titled ' +
        '"extracts the target when flags precede it" but uses `--force` — a BOOLEAN flag. Not one of the 54 passing tests ' +
        'exercises a value-taking flag, so the suite is green while the guard mis-parses the most common real invocation. ' +
        'FIX: exclude the known value-taking flags from the boolean-skip class, e.g. skip `(?:-(?:b|B)\\s+\\S+\\s+|' +
        '--(?:reason|track)(?:=\\S+|\\s+\\S+)\\s+|-[-\\w]+\\s+)*`, and add a test for `-b <branch> <path>` in BOTH orders. ' +
        'Note the failure direction is fail-CLOSED (blocks), so it is a availability/friction defect rather than a hole — ' +
        'but it is a defect the shipped tests actively hide.',
    },
    {
      id: 'S-3-Q1-regex-parsing-no-injection-but-enumerated-bypasses',
      severity: 'low',
      note:
        'ANSWER TO Q1: NO command/argument injection. The extracted target is never concatenated into any command string ' +
        '— it flows only into path.resolve() and string comparison. There is no exec of the target anywhere. What DOES ' +
        'exist is mis-extraction/non-match. I ran 31 crafted commands through the real module. BYPASSED (guard allows, git ' +
        'would place a sibling): inline env prefix `LEO_WORKTREE_ADD_GUARD=off git worktree add ../evil` and `FOO=1 git ...` ' +
        '(no boundary char before `git`); backslash line continuation `git worktree \\<NL> add ../evil` (a backslash is not ' +
        '\\s); backtick subshell; `{ ... ; }` brace group; `if git worktree add ...`; `sh -c \'...\'` and `bash -c "..."`; ' +
        '`eval "..."`; `time`/`env` prefixes; `xargs git worktree add`; and `git -C /other worktree add` (the -C breaks ' +
        '`git\\s+worktree`). SHELL-EXPANSION MIS-EXTRACTION (the only class where the guard ALLOWS while git places ' +
        'outside): `git worktree add .worktrees/$ESCAPE` is read literally as ".worktrees/$ESCAPE", resolves under ' +
        '.worktrees/ and is ALLOWED, while the shell expands $ESCAPE to anything including ../../. Same for `$(...)`. ' +
        'CORRECTLY BLOCKED: `../evil`, tab/multi-space separators, leading whitespace, second line after \\n, literal ' +
        '`.worktrees/../../evil` (path.resolve normalizes, so literal traversal is caught), `.worktrees-evil/x` (F5 anchor ' +
        'genuinely works), absolute out-of-tree, and a quoted target with a space (blocked on the truncated fragment — ' +
        'conservative, fine). RESIDUAL, NOT FIXED: path.resolve does not realpath, so if `.worktrees` were ever a symlink ' +
        'or junction to an outside location the guard passes; and on Windows `.WORKTREES/x` is blocked (case-sensitive ' +
        'startsWith on a case-insensitive FS) — conservative direction, acceptable.',
    },
    {
      id: 'S-4-Q2-execSync-cwd-is-injection-safe-measured-with-a-windows-caveat',
      severity: 'low',
      note:
        'ANSWER TO Q2: injection-SAFE, and I did not assume it — I probed it. The command string is a fixed literal; cwd is ' +
        'passed as the execSync `cwd` OPTION, which node hands to uv_spawn, never to the shell parser. I created a real ' +
        'directory literally named `n a s t y $(whoami) `id` ;rm -rf x& |y` and ran the exact call: it THREW with empty ' +
        'stdout/stderr and no subcommand executed -> caught by the surrounding try/catch -> fail-open. A nonexistent cwd ' +
        'throws spawnSync ENOENT; a cwd pointing at a FILE throws; an empty-string cwd throws. Every hostile cwd degrades ' +
        'to fail-open, never to execution. ONE REAL WINDOWS CAVEAT, measured: execSync goes through cmd.exe, and cmd.exe ' +
        'searches the CURRENT DIRECTORY before PATH. I planted a `git.bat` in a directory and called ' +
        'execSync("git rev-parse --git-common-dir", {cwd: thatDir}) with NoDefaultCurrentDirectoryInExePath deleted from ' +
        'the child env: it returned "HIJACK-BAT" — the planted script ran, not git. With the variable present it returned ' +
        'the real git output. I then traced the variable: it is NOT in HKCU\\Environment, NOT in the HKLM system ' +
        'environment, and NOT set by any Git-Bash profile script — it is inherited down the process chain from the Claude ' +
        'Code process (measured =1 in the Bash-tool env and in its children), so the hook almost certainly inherits it too ' +
        'and the hijack does not fire on this host. That makes the mitigation ENVIRONMENTAL AND ACCIDENTAL, not designed. ' +
        'Why it is only LOW: exploiting it requires already having written git.exe/git.cmd into the chosen directory, which ' +
        'needs a prior approved tool call, and the payload runs as the same user. Its only real value to an attacker is ' +
        'deferred execution during a PreToolUse hook — i.e. before the permission prompt for a call the user might DENY. ' +
        'CHEAP HARDENING (optional, defense-in-depth): use execFileSync("git", ["rev-parse","--git-common-dir"], {cwd, ' +
        'shell:false}) so no shell and no .bat/.cmd resolution is involved. Also note input.cwd is not a documented field ' +
        'of the Bash tool schema (command/description/timeout only), so in practice this almost certainly resolves to ' +
        'process.cwd() — which is a correctness note, see S-5.',
    },
    {
      id: 'S-5-Q4-kill-switch-cannot-be-set-by-the-command-confirmed-but-the-inline-form-bypasses-anyway',
      severity: 'low',
      note:
        'ANSWER TO Q4: NO, a Bash command cannot disable its own PreToolUse check. The hook is a separate process spawned ' +
        'by Claude Code with Claude Code\'s environment, and it runs BEFORE the command text is executed by any shell; an ' +
        'inline `LEO_WORKTREE_ADD_GUARD=off git ...` prefix only ever affects the child the shell later forks, and an ' +
        '`export` in a previous Bash call mutates the persistent shell (a SIBLING of the hook, not its parent). The env ' +
        'gate at :810 is also evaluated BEFORE the dotenv-loading require at :813, so even S-1\'s .env injection cannot ' +
        'retroactively disable ENF-12e itself within the same process. HOWEVER — and this is the operationally important ' +
        'part — `LEO_WORKTREE_ADD_GUARD=off git worktree add ../evil` IS allowed through, measured, for a completely ' +
        'different reason: the inline assignment prefix means there is no `^` or [;&|(\\n] boundary immediately before ' +
        '`git`, so WORKTREE_ADD_RE never matches (target=null). A model that reads the ENF-12e banner (which advertises ' +
        '"Override (single-session only): LEO_WORKTREE_ADD_GUARD=off"), pastes it inline as a prefix, and re-runs, gets ' +
        'the sibling worktree it wanted and will reasonably conclude the documented override worked. It did not — the ' +
        'regex did. Worth either making the banner say "export it in the SESSION env, an inline prefix does not reach the ' +
        'hook", or accepting it knowingly.',
    },
    {
      id: 'S-6-Q3-bypass-surface-is-acceptable-residual-risk-do-not-harden',
      severity: 'info',
      note:
        'ANSWER TO Q3: ACCEPTABLE AS-IS — do not harden the regex further before merge, and I would argue against it. The ' +
        'threat model is a fleet worker (a cooperating model) that types the wrong command by habit, not an adversary ' +
        'evading a boundary; the SD frames this as defense-in-depth self-discipline and that framing is correct. Every ' +
        'bypass enumerated in S-3 requires the model to deliberately obfuscate a command it has no motive to obfuscate. ' +
        'Chasing them costs real safety: the command-start-boundary is what keeps `echo "run git worktree add ../x"` and ' +
        'git commit messages from false-positiving, and this hook already has scar tissue from exactly that class ' +
        '(NPM_INSTALL_RE at :712 carries a comment about a false-positive fix). Broadening the match would trade a ' +
        'nonexistent attacker for real seat-freezing false positives. The ONE bypass I would NOT dismiss is the ' +
        'shell-variable form (`.worktrees/$X`) in S-3, because that one can arise INNOCENTLY from a scripted invocation ' +
        'rather than from evasion — but the correct response is to leave the guard silent there (fail-open) rather than ' +
        'to start blocking any target containing $ or backticks, which would break legitimate scripted use. Net: the ' +
        'guard should be understood, and documented, as catching the LITERAL, HABITUAL `git worktree add ../<name>` — ' +
        'which is precisely the witnessed defect (EHG_Engineer-qf-117) — and nothing stronger. It must never be cited as ' +
        'a security control.',
    },
    {
      id: 'S-7-repoRoot-and-target-resolve-against-a-cwd-that-is-not-the-shell-cwd',
      severity: 'low',
      note:
        'CORRECTNESS/ACCURACY, not a vulnerability, but it bounds what the guard can honestly claim. `input.cwd` is not a ' +
        'documented Bash tool_input field (the schema is command/description/timeout/dangerouslyDisableSandbox), and I ' +
        'could not confirm it from permission_audit_log because that table stores only a context_hash, never the raw input ' +
        '(measured: 0 of 150 recent Bash rows carry raw input). So in practice both `path.resolve(input.cwd || ' +
        'process.cwd())` for repoRoot and the `cwd:` passed to worktreeAddIsSibling almost certainly collapse to the ' +
        'HOOK process\'s cwd, which is the session/project directory — NOT the persistent shell\'s current directory. ' +
        'Measured consequence: `cd /other/repo && git worktree add .worktrees/x` is ALLOWED because the guard resolves ' +
        '.worktrees/x against the session root, not against /other/repo where git will actually place it. The ' +
        '--git-common-dir choice (correctly fixing TESTING F-A) is unaffected by this and remains the right call. Note ' +
        'input.cwd is a PRE-EXISTING pattern in this hook (:717, :765, :788, :1483, :1594) — this diff did not invent it — ' +
        'but ENF-12e is the first block to use it as a SUBPROCESS cwd rather than as an fs path join, which is what makes ' +
        'S-4 worth writing down at all.',
    },
    {
      id: 'S-8-reaper-detector-and-wiring-clean',
      severity: 'info',
      note:
        'lib/worktree-reaper/detectors.js isOutsideWorktreesDir and its scripts/worktree-reaper.mjs wiring introduce NO ' +
        'injection or escalation surface: pure path.resolve + separator-anchored string comparison, no exec, no fs, no ' +
        'network. Reviewed specifically for the data-loss direction the SD flags, and the discipline holds — the detector ' +
        'result is written only into `reasons` / `evidence` and is never pushed to `categories`, so it cannot reach the ' +
        'hasStage1/hasStage2 staging tables, in any of the four call sites (classifyWorktree:792, cursor branch:1459, ' +
        'reap-protected branch:1488, active-claim branch:1533). The second commit (4efcdffbd2f) extending the gauge to the ' +
        'cursor/reap-protected/active-claim early-continue branches is the right shape: it adds visibility to branches ' +
        'that `continue` before classification while leaving verdict and stage untouched in each. Separator anchoring ' +
        'matches the CJS guard, so `.worktrees-evil` is correctly reported as a sibling in both. One cosmetic nit, no ' +
        'security weight: `path.resolve(wt.path || "")` resolves an empty path to process.cwd(), which would report ' +
        'matched:true for a malformed record — harmless because the gauge has no authority.',
    },
  ],
  recommendations: [
    'BLOCKING-ish (S-1): gate the ENF-12e body on a cheap regex pre-check before requiring scripts/resolve-sd-workdir.js ' +
    'or spawning git. Require the dotenv-free lib/worktree-add-sibling-guard.cjs first, call the already-exported ' +
    'extractTargetPath(input.command || ""), and return early when it is null. This restores the SD\'s own TR-4 ' +
    'constraint, removes ~101ms from every Bash tool call, and stops injecting 82 .env keys (incl. ANTHROPIC_API_KEY / ' +
    'SUPABASE_SERVICE_ROLE_KEY) into the enforcement hook process on every Bash call.',
    'BLOCKING-ish (S-2): stop consuming value-taking flags as boolean, so `git worktree add -b <branch> <path>` is not ' +
    'refused with the branch name reported as the target. Add tests for -b/-B in BOTH orderings; the existing ' +
    '"flags precede it" test uses --force and does not cover this.',
    'Recommended (S-4): switch to execFileSync("git", ["rev-parse","--git-common-dir"], { cwd, shell: false }) to remove ' +
    'the cmd.exe current-directory-first .bat/.cmd resolution path, rather than relying on an inherited ' +
    'NoDefaultCurrentDirectoryInExePath that this repo neither sets nor asserts.',
    'Recommended (S-5): correct the ENF-12e banner — an inline `LEO_WORKTREE_ADD_GUARD=off <cmd>` prefix never reaches ' +
    'the hook process; say to export it in the session environment. As written the banner teaches a workaround that ' +
    '"works" only because the inline assignment defeats the regex.',
    'Documentation (S-6/S-3): record in the PRD/module header that this guard catches the literal habitual form only and ' +
    'is explicitly NOT a security boundary — shell-variable targets (.worktrees/$X), sh -c, backticks, brace groups, ' +
    'backslash continuations and `git -C` all pass, by design and acceptably.',
    'No action (S-8): the reaper detector and its gauge-only wiring are clean; the never-in-categories discipline is ' +
    'correctly maintained across all four call sites.',
  ],
  metadata: {
    review_scope: 'commits 25447bba0c3 + 4efcdffbd2f vs baa261d98e2; 16 files, +846/-7',
    branch: 'feat/SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001',
    files_reviewed: [
      'lib/worktree-add-sibling-guard.cjs',
      'scripts/hooks/pre-tool-enforce.cjs (ENFORCEMENT 12e, lines 802-852)',
      'lib/worktree-reaper/detectors.js (isOutsideWorktreesDir)',
      'scripts/worktree-reaper.mjs (gauge wiring, 4 call sites)',
      'lib/__tests__/worktree-add-sibling-guard.test.js',
      'scripts/resolve-sd-workdir.js (validateWorktreePath, dotenv import)',
    ],
    injection_vulnerability_found: false,
    path_traversal_vulnerability_found: false,
    command_probes_run: 31,
    command_probes_bypassing_guard: 13,
    command_probes_false_positive_block: 2,
    execsync_cwd_injection_probe: 'metachar dir `n a s t y $(whoami) `id` ;rm -rf x& |y` -> THREW, no subcommand executed, fail-open',
    execsync_cwd_hijack_probe: 'planted git.bat + NoDefaultCurrentDirectoryInExePath deleted -> returned "HIJACK-BAT"; with var present -> real git',
    nodefaultcurrentdirectory_origin: 'inherited from the Claude Code process chain; absent from HKCU\\Environment, HKLM system env, and git-bash profile scripts',
    dotenv_keys_injected_into_hook_per_bash_call: 82,
    dotenv_require_is_only_such_site_in_hook: true,
    measured_added_latency_per_bash_call_ms: 101,
    measured_require_resolve_sd_workdir_ms: 58,
    measured_git_rev_parse_ms: 44,
    hook_timeout_ms: 3000,
    enf12e_gated_on_regex_match: false,
    comment_claims_gated_on_match: true,
    env_flags_read_after_line_852: ['LEO_WORKTREE_GUARD', 'LEO_CLAIM_GUARD', 'LEO_RCA_ENFORCEMENT', 'EMERGENCY_RCA_BYPASS', 'FILE_CLAIM_ENFORCED', 'LEO_FORCE_PUSH_OWN_BRANCH', 'LEO_WORKTREE_STRAND_RECOVERY', 'SWEEP_RESPECT_INFLIGHT_AGENT'],
    dotenv_guard_disable_live_today: false,
    dotenv_guard_disable_latent: true,
    dotenv_guard_disable_why_not_live: 'ENF-13 (the only such flag currently in .env, LEO_WORKTREE_GUARD=off) is gated on TOOL_NAME Edit|Write while the ENF-12e require only fires on Bash — the two never share a hook process',
    tests_run: 'npx vitest run lib/__tests__/worktree-add-sibling-guard.test.js ... => 2 files / 54 tests PASSED',
    test_coverage_gap: 'no test exercises a value-taking flag (-b/-B); the "flags precede it" test uses --force',
    reaper_gauge_reaches_removal_staging: false,
    work_committed: false,
  },
  execution_time_ms: 780000,
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
