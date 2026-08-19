#!/usr/bin/env node
/**
 * One-off: SECURITY sub-agent EXEC-TO-PLAN evidence for SD-FDBK-ENH-RETRO-SUB-AGENT-001.
 *
 * Threat assessment of the SHIPPED implementation (commit af0e13b6eec, PR #7276): the
 * bare-basename fallback, its unbounded filesystem walk, and the new ambiguity warning.
 * Every claim was established by MEASURING -- a real junction cycle against the real
 * buildBasenameIndex, timed/instrumented walks from both roots, an extractor fuzz for shell
 * metacharacters, a live anon-key RLS read, and a DB census of real execution cwds.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'c379f18b-c5e6-4fdc-9f92-7f23758d8146';
const SD_KEY = 'SD-FDBK-ENH-RETRO-SUB-AGENT-001';

const findings = [
  {
    severity: 'medium',
    type: 'resource_exhaustion',
    title: 'buildBasenameIndex is unbounded and costs 17.6s / 1.07M files / ~303MB RSS when cwd is the main repo root -- ~19.5% of real executions',
    summary: "buildBasenameIndex (lib/validation/hallucination/file-checks.js:64-89) has NO depth limit, NO entry-count cap and NO time budget, and validateFileReferences calls it UNCONDITIONALLY at lib/validation/hallucination-check.js:113 -- before the per-reference loop, with no early return -- so it runs even when the output contains zero file references. Its root is process.cwd() (lib/sub-agent-executor/executor.js:314), which is NOT validated as a repo root. MEASURED, not reasoned: from the worktree root the walk is 205ms / 18,285 files (matching the ~137ms claim in the file-checks.js:61 comment); from the MAIN repo root C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer it is 17,370-29,926ms / 1,076,759 files / +193.7MB heap / +302.7MB RSS. 94.7% of that mass (1,019,570 files) is .worktrees/, which currently holds 121 worktrees; .reaper-source/ adds another 18,261. Only node_modules and .git are excluded, so every gitignored/untracked working dir (.artifacts/, scratch/, .claude-work/, test-results/) is walked. End-to-end proof that the zero-reference case still pays it: validateSubAgentOutput with file_references.total=0 took 17,588ms from the main repo root vs 259ms from the worktree. REACHABILITY IS NOT THEORETICAL: a census of the 400 most recent sub_agent_execution_results rows shows 78 (19.5%) ran with executed_from_cwd = the main repo root, 221 from a worktree, 101 with no cwd recorded. The cost grows monotonically with worktree count, so this degrades over time on its own. The TESTING sub-agent logged this as 'low / unconditional_cost / negligible 207ms', but that measurement was taken only in the worktree; it is 85x worse in the case that covers a fifth of production runs.",
  },
  {
    severity: 'low',
    type: 'information_disclosure',
    title: 'ambiguous_basename_match warnings write real filesystem layout (incl. gitignored dirs) into an anon-readable DB column',
    summary: "The new warning (lib/validation/hallucination-check.js:125-130) embeds up to 5 real repo paths and is stored to subagent_validation_results.warnings (lib/sub-agent-executor/results-storage.js:930, 943). That table grants anon SELECT USING (true) -- policy subagent_validation_anon_read, database/migrations/20251220_rls_app_config_subagent_validation.sql:66-70 -- and I CONFIRMED IT IS LIVE by reading the table with the anon key (ALLOWED, 2 rows), not merely by reading the migration file. NO ABSOLUTE PATHS LEAK: file-checks.js:80 emits path.relative(root, ...) with separators normalized to '/', so no C:\\Users\\<user> host paths and no usernames reach the row, and path.relative cannot return an absolute path here because the walk provably never escapes root (see the symlink finding). The residual is structural only, and bounded to basenames the sub-agent already referenced: measured from the main repo root, the emitted warnings disclose paths under .reaper-source/ and .artifacts/venture-<uuid>/ -- untracked directories a reader would not otherwise enumerate -- e.g. \"Bare basename 'index.js' matches 10310 real files: .reaper-source/agents/story/index.js, ...\". Low severity inside one trust boundary, but it is a NEW disclosure channel: previously file_references.invalid only echoed strings the agent itself emitted; warnings now echo filesystem facts it never mentioned. Note the compounding risk with the finding above: because the walk root is unvalidated process.cwd(), a session started from a home directory would enumerate it into this same anon-readable column.",
  },
  {
    severity: 'info',
    type: 'noise_regression',
    title: 'The ambiguity warning is self-defeating at main-repo scale (README.md matches 11,198 files)',
    summary: "Not a vulnerability, but it degrades the signal the SD added. Measured from the main repo root: 17,261 ambiguous basenames, with README.md at 11,198 matches and index.js at 10,310, because 121 worktrees are near-identical copies of the same tree. From the worktree root the same basenames are 188 and 176 (545 ambiguous total). An 'ambiguity' warning citing 11,198 matches cannot inform a reader, and it is also the payload written to the anon-readable column above. The same root-scoping guard fixes both this and the resource finding.",
  },
];

const warnings = [
  {
    type: 'verified_non_issue',
    message: "SYMLINK RECURSION (the explicitly asked question): NOT A GAP -- and I verified it rather than asserting it. buildBasenameIndex recurses on entry.isDirectory() without checking entry.isSymbolicLink() (file-checks.js:76-78), which looks unsafe, but Node's Dirent type comes from the non-dereferencing readdir type (and an lstat fallback for DT_UNKNOWN), so a directory link is UV_DIRENT_LINK, never UV_DIRENT_DIR. PROVEN EMPIRICALLY: I built a real cycle -- root2/a/b/jloop as a Windows junction pointing back to its own ancestor root2/a -- and ran the REAL buildBasenameIndex against it on node v24.12.0/win32. Dirent for jloop reported {isDirectory:false, isFile:false, isSymbolicLink:true}; the walk completed in 0ms with index_size=1 and target.js resolved exactly once as 'a/b/target.js'. No infinite recursion, no duplicate entries. A native dir symlink could not be tested (EPERM: symlink creation needs admin/developer mode on this host), and WSL has no usable distro, so POSIX was not measured directly -- but the same single Node predicate (kType === UV_DIRENT_DIR) governs both platforms, and there is no production POSIX exposure: no .github/workflows file references hallucination or execute-subagent, and all 400 sampled executions ran from Windows paths. Side effect worth knowing: because a junction is neither isDirectory() nor isFile(), linked subtrees are silently skipped entirely, not just un-recursed.",
  },
  {
    type: 'verified_non_issue',
    message: "PATH TRAVERSAL / ATTACKER-CONTROLLED ROOT: NOT PRESENT. baseDir is never derived from the untrusted output being validated -- the only production call site hardcodes baseDir: process.cwd() (executor.js:314) and quickHallucinationCheck defaults to process.cwd() (hallucination-check.js:278) and has zero production callers. findBasenameMatches (file-checks.js:103-106) does a pure index.get(basename) Map lookup; the attacker-influenced basename NEVER reaches fs.* or execSync. The fallback is correctly gated on filePath === path.basename(filePath) (file-checks.js:50), so anything containing a separator -- including every traversal attempt -- skips it entirely. Fuzzed the extractor directly: '../../../../etc/shadow.sh', '..\\\\..\\\\windows\\\\system32\\\\x.js', '....//....//etc/passwd.sh', 'C:/Users/rickf/secret.js' and 'main:../../x.js' ALL extract to [] , because the regex prefix [./]? accepts only ONE leading dot-or-slash and intermediate segments are [\\w-]+ (no dots). Bare POSIX absolute paths like /tmp/pwn.sh DO extract and reach fs.existsSync (an existence oracle), but that is pre-existing behavior at file-checks.js:35-41, unchanged by this SD, and such paths never trigger the new fallback (isAbsolute=true, basename mismatch).",
  },
  {
    type: 'verified_non_issue',
    message: "execSync RISK PROFILE (checkFileExistsOnBranch, file-checks.js:124-127; readFileFromBranch, file-checks.js:150-153): ENTIRELY UNAFFECTED by this SD. Structurally, the branch check runs FIRST (file-checks.js:27-32), before the new fallback, and checkFileExists returns a bare boolean -- the basename-resolved relative path is discarded and can never be fed back into a git command. The interpolated relativePath is still only ever the raw extracted reference. I also confirmed the extractor cannot emit a shell metacharacter that would break out of the double-quoted \"${branch}:${relativePath}\": fuzzing 9 injection payloads (embedded quotes, `$(whoami)`, backticks, '; rm -rf /', '&& curl', '||', NUL) produced 8 extracted strings whose full character-code dumps contain ZERO characters from the set \" ' ` $ ; | & < > ( ) { } \\\\ * ? ! # ~ NUL or whitespace -- the regex character classes ([\\w.-], [\\w-], /) act as a strict allowlist. Critically, the SD's new \\\\n/\\\\r/\\\\t normalization (extractors.js:20) cannot widen this: it only deletes 2-char sequences and inserts a space, and space is itself excluded by those same classes. An earlier run of my own fuzzer appeared to flag a metacharacter; that was a bash heredoc mangling my detector's regex (\\\\\\\\ collapsed so the letter 'n' entered the character class) -- re-run via a properly written file, the result is clean.",
  },
];

const recommendations = [
  'RECOMMENDED BEFORE MERGE (2 LOC, fixes the medium finding): guard the walk in validateFileReferences (hallucination-check.js:113) behind `if (fileRefs.some(f => f === path.basename(f)))`. Measured: eliminates a 17.6s/303MB no-op on every zero-bare-basename run, which is the majority of runs. TESTING recommended the same guard as OPTIONAL on a 207ms worktree measurement; the main-repo measurement (78/400 real executions) makes it materially more valuable than it looked.',
  'RECOMMENDED: bound buildBasenameIndex itself so cost cannot be inherited by a future caller with a different root -- add EXCLUDED_DIRS entries for `.worktrees` and `.reaper-source` (removes 94.7% + 1.7% of the file mass at a stroke), and/or a hard entry-count cap that bails and returns the partial index. Today the function has no depth, size or time bound of any kind.',
  'RECOMMENDED: validate the walk root before walking -- e.g. require a .git entry at `root` -- so an unexpected process.cwd() (home directory, drive root) cannot turn an unbounded enumeration into an anon-readable DB payload.',
  'OPTIONAL: cap the ambiguity warning (hallucination-check.js:129) at a sane match count, e.g. emit "matches 11198 real files (index likely mis-rooted)" without the sample list when matches exceed ~50 -- the sample paths stop being informative and are the disclosure payload.',
  'NO ACTION: symlink/junction recursion, path traversal, attacker-controlled baseDir, and the execSync injection surface are all verified clear. Do not add an isSymbolicLink() check on the strength of the code reading alone -- it is already unreachable, measured.',
];

const summary = "SECURITY EXEC-TO-PLAN assessment of the SHIPPED implementation (af0e13b6eec, PR #7276). CONDITIONAL_PASS: no vulnerability -- all four questions asked (attacker-controlled root/path traversal, symlink-loop DoS, attacker-controlled basename reaching fs/execSync, information disclosure) come back clear on the security axis, three of them verified by measurement rather than by reading. (1) TRAVERSAL/ROOT: baseDir is never derived from the untrusted output; the only production call site hardcodes process.cwd() (executor.js:314). Fuzzing proved the extraction regex cannot emit '..' segments, Windows absolute paths, or shell metacharacters -- it is a strict [\\w.-]/[\\w-]// allowlist -- and the new fallback is gated on filePath === path.basename(filePath), so any separator-bearing string skips it. (2) SYMLINKS: the walk really does recurse on isDirectory() without an isSymbolicLink() guard, but I built an actual junction cycle (root2/a/b/jloop -> root2/a) and ran the real buildBasenameIndex against it: the Dirent reports {isDirectory:false, isSymbolicLink:true}, the walk terminated in 0ms with one indexed file, no recursion. Not a gap. POSIX not directly measurable here (symlink creation is EPERM without admin; no WSL distro), but there is no production POSIX exposure -- no CI workflow invokes this path. (3) BASENAME->fs/execSync: findBasenameMatches is a pure Map.get; the branch-aware execSync calls run BEFORE the fallback and receive the same raw reference as before, so their risk profile is byte-for-byte unchanged. (4) DISCLOSURE: matches are path.relative()-scoped so no absolute/host paths leak, but they land in subagent_validation_results.warnings, which I confirmed with a live anon-key read is anon-SELECTable -- a new, low-severity channel that now echoes untracked-directory layout (.reaper-source/, .artifacts/) the agent never mentioned. THE ONE REAL FINDING IS AVAILABILITY, and it is the reverse of the theoretical DoS asked about -- not attacker-amplifiable (untrusted output cannot make the walk run more than once per call), but environment-amplifiable and unbounded: buildBasenameIndex has no depth, count or time limit, runs unconditionally even for zero file references, and is rooted at an unvalidated process.cwd(). Measured from the main repo root: 17.6-29.9 seconds, 1,076,759 files, +303MB RSS per call -- versus 205ms/18,285 files from a worktree -- because .worktrees/ holds 121 near-identical copies (94.7% of the file mass). A DB census shows 78 of the 400 most recent sub-agent executions (19.5%) ran from exactly that root, and the cost grows with every new worktree. A 2-LOC guard removes it. GO, with the guard recommended before merge.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 92,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC-TO-PLAN',
      mode: 'threat assessment of shipped implementation (measurement-based, not review-based)',
      go_no_go: 'GO with one recommended 2-LOC guard before merge',
      commit_verified: 'af0e13b6eec',
      pr: 7276,
      questions_assessed: {
        attacker_controlled_root_or_traversal: 'CLEAR - baseDir hardcoded to process.cwd() at executor.js:314; regex allowlist blocks traversal; fallback gated on bare basename',
        symlink_loop_dos: 'CLEAR - verified with a real junction cycle, not asserted; Dirent isDirectory()=false for links',
        basename_reaching_fs_or_execSync: 'CLEAR - pure Map.get; execSync path runs before the fallback and is unchanged',
        information_disclosure: 'LOW - repo-relative only (no absolute/host paths), but sink is anon-SELECTable and now echoes untracked-dir layout',
      },
      symlink_probe: {
        method: 'created root2/a/b/jloop as a Windows junction targeting its own ancestor root2/a, then ran the real buildBasenameIndex',
        dirent_for_junction: { isDirectory: false, isFile: false, isSymbolicLink: true },
        native_dir_symlink: 'EPERM (needs admin/developer mode) - not testable on this host',
        walk_outcome: 'completed',
        walk_ms: 0,
        index_size: 1,
        target_resolved_once_as: 'a/b/target.js',
        runtime: 'node v24.12.0 win32',
        posix_residual: 'not directly measured (no WSL distro); no CI workflow references hallucination or execute-subagent, and 400/400 sampled executions were Windows paths',
      },
      walk_cost_measured: {
        worktree_root: { ms: 205, files: 18285, distinct_basenames: 16523, ambiguous_basenames: 545, worst: 'README.md x188' },
        main_repo_root: { ms_range: '17370-29926', files: 1076759, distinct_basenames: 34258, ambiguous_basenames: 17261, worst: 'README.md x11198', heap_delta_mb: 193.7, rss_delta_mb: 302.7 },
        file_mass_attribution: { '.worktrees': 1019570, '.reaper-source': 18261, 'test-results': 6460, scripts: 5909, worktree_count: 121 },
        zero_reference_call: { worktree_ms: 259, main_repo_ms: 17588, note: 'proves the walk is unconditional - hallucination-check.js:113 precedes the loop with no early return' },
      },
      reachability_census: {
        source: 'sub_agent_execution_results, 400 most recent rows, metadata.executed_from_cwd',
        worktree: 221,
        main_repo_root: 78,
        no_cwd_recorded: 101,
        main_repo_root_pct: 19.5,
      },
      injection_fuzz: {
        payloads: 9,
        extracted_strings: 8,
        shell_metacharacters_found: 0,
        charset_observed: 'alphanumeric, dot, dash, underscore, forward slash only',
        traversal_payloads_extracted: 0,
        note: 'an earlier self-inflicted false positive came from a bash heredoc mangling the detector regex; re-run from a written file, clean',
      },
      rls_live_check: {
        table: 'subagent_validation_results',
        role: 'anon',
        result: 'ALLOWED (2 rows returned)',
        policy: 'subagent_validation_anon_read - database/migrations/20251220_rls_app_config_subagent_validation.sql:66-70',
        verified_live_not_from_migration_file: true,
      },
      verification_method: 'Measurement over reading: a real Windows junction cycle run against the real buildBasenameIndex; timed and memory-instrumented walks from both roots; an end-to-end validateSubAgentOutput timing for the zero-reference case; a 9-payload extractor fuzz with full character-code dumps; a live anon-key SELECT to confirm RLS posture; and a 400-row DB census of executed_from_cwd to establish real reachability. All probe files were removed and the worktree confirmed clean.',
      relationship_to_testing_verdict: 'Independent and consistent. TESTING logged the unconditional walk as low/negligible at 207ms; that measurement was worktree-only. The main-repo measurement (17.6s, 1.07M files, 303MB, 19.5% of executions) escalates the same defect and converts their OPTIONAL guard into a RECOMMENDED one. TESTING asserted symlinks are not followed; this assessment verifies that assertion empirically.',
    },
    phase: 'EXEC-TO-PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_ID,
    { name: 'Chief Security Architect' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id, '| verdict:', stored.verdict, '@', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path, '| resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
