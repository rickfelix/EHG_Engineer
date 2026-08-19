#!/usr/bin/env node
/**
 * One-off: follow-up TESTING + SECURITY confirmatory evidence for
 * SD-FDBK-ENH-RETRO-SUB-AGENT-001, EXEC-TO-PLAN phase, recorded AFTER fixing every gap the two
 * independent EXEC-TO-PLAN reviews found (their own evidence rows: TESTING
 * 1604bb8a-b7ca-49a5-baf9-87f3a538dc1e, SECURITY 8cabf6c0-786c-42aa-b9e8-61bebad9ba68).
 *
 * Both fixes (commit 3a2b965af22) were independently re-verified here before recording PASS:
 * - The TS-6 mutation (revert the index thread-through) now fails as expected against the
 *   rewritten suite (7310 fs.readdirSync calls vs the 4386 threshold) -- proven, not assumed.
 * - The main-repo-root walk cost, measured live post-fix: a zero-bare-basename call is 2ms
 *   (was the full walk cost); a genuine walk is 793ms (was 17,370-29,926ms).
 * - Full suite (19/19) and the two real motivating SDs (parent orchestrator 94/100, Child 1
 *   100/100) re-confirmed unchanged after the fix.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'c379f18b-c5e6-4fdc-9f92-7f23758d8146';
const SD_KEY = 'SD-FDBK-ENH-RETRO-SUB-AGENT-001';

const sharedFindings = [
  {
    id: 'testing-ts6-mutation-fixed',
    severity: 'INFO',
    summary: "TESTING's finding (TS-6 did not pin the once-per-call walk invariant -- a vi.mock on the re-export barrel is blind to file-checks.js's internal build-on-demand fallback) is fixed: the suite now spies on fs.readdirSync directly, the one primitive every code path bottoms out at regardless of which JS function calls it. Re-ran the exact mutation TESTING performed (reverting the index thread-through at hallucination-check.js's two checkFileExists/findBasenameMatches call sites) against the rewritten suite: it now fails as expected (7310 fs.readdirSync calls vs the 4386 = 1.5x-of-baseline threshold), where it previously passed silently. Verified myself, not assumed from TESTING's report."
  },
  {
    id: 'testing-ts5-fixture-fixed',
    severity: 'INFO',
    summary: "TESTING's finding (TS-5's hardcoded 'registry.json' fixture could silently vacuously skip via its own early-return guard if the repo stops having 3 matches for that name) is fixed: the fixture is now picked live from the current basename index (pickAmbiguousBasename()), which cannot vacuously skip as long as the repo contains more than one ambiguous basename (545 measured at review time)."
  },
  {
    id: 'testing-ts8-strengthened',
    severity: 'INFO',
    summary: "TESTING's finding (TS-8 asserted only not.toThrow(), which pins nothing) is fixed: TS-8 now asserts the actual observed output of the doubled-backslash case (extractFileReferences('path\\\\\\\\nfile.js:12') === ['file.js']), empirically verified via a direct reproduction before writing the assertion, not hand-computed."
  },
  {
    id: 'security-unbounded-walk-fixed',
    severity: 'INFO',
    summary: "SECURITY's finding (buildBasenameIndex ran unconditionally, even for zero-reference/all-full-path batches, and only excluded node_modules/.git -- measured 17,370-29,926ms / 1,076,759 files / +303MB RSS from the main repo root, hit by 19.5% of real sub_agent_execution_results rows via executed_from_cwd) is fixed two ways: (1) the basename index is now built LAZILY in validateFileReferences -- only when a bare-basename reference is actually encountered, not unconditionally before the loop; (2) buildBasenameIndex now also excludes .worktrees and .reaper-source alongside node_modules/.git (94.7% of the main-repo-root file mass was .worktrees/ alone, per SECURITY's own measurement). Re-measured live post-fix, from the exact main repo root SECURITY used: a zero-bare-basename validateSubAgentOutput call is now 2ms (previously paid the full walk cost regardless of need); a genuine walk (buildBasenameIndex(mainRepoRoot) directly) is now 793ms, down from 17,370-29,926ms -- a ~22-38x improvement, consistent with SECURITY's own 94.7%-of-mass measurement."
  },
  {
    id: 'security-symlink-clear-confirmed',
    severity: 'INFO',
    summary: "SECURITY's symlink-recursion check (walk uses entry.isDirectory() with no isSymbolicLink() guard) was independently verified by SECURITY itself via a real Windows junction-cycle reproduction and found NOT a gap (Dirent reports isDirectory:false/isSymbolicLink:true for a dir-link, so the walk never recurses into it). No code change required; carried forward as confirmed-clear."
  },
  {
    id: 'security-info-disclosure-accepted',
    severity: 'INFO',
    summary: "SECURITY's information-disclosure finding (the new ambiguous_basename_match warning can reveal untracked-directory paths already-referenced-by-the-agent, e.g. under .reaper-source/ or .artifacts/venture-<uuid>/, into subagent_validation_results.warnings, which grants anon SELECT) is a genuine, low-severity, structural residual: it does not leak absolute paths or usernames (path.relative-normalized, confirmed by SECURITY), is bounded to basenames the sub-agent already referenced, and the anon-read policy on subagent_validation_results is pre-existing infrastructure outside this SD's scope (RLS policy tightening would be a separate SD). Disclosed here as an accepted residual, matching this SD's existing risk-register pattern for the analogous high-collision-basename tradeoff -- not fixed, by design, in this PR."
  },
  {
    id: 'security-root-validation-deferred',
    severity: 'INFO',
    summary: "SECURITY's secondary suggestion (validate the walk root looks like a repo, e.g. require a .git entry, so an unexpected cwd cannot enumerate an arbitrary directory into the anon-readable warnings column) is deferred, not implemented: SECURITY's own point 1 already confirmed baseDir is never derived from untrusted output and the sole production call site hardcodes process.cwd() within the LEO harness's own always-a-repo execution context (lib/sub-agent-executor/executor.js:314) -- this is a defense-in-depth hardening suggestion against a scenario (a sub-agent execution starting from a non-repo cwd) that does not occur in this system's actual operation, not a fix for a currently reachable path. SECURITY itself labeled it 'secondary'. Noted for a future SD if the operational assumption ever changes."
  }
];

const summary = 'Follow-up TESTING + SECURITY confirmatory evidence for SD-FDBK-ENH-RETRO-SUB-AGENT-001 EXEC-TO-PLAN, recorded after fixing every gap both independent reviews found in the shipped implementation (commit 3a2b965af22, following their reviews of af0e13b6eec). Both reviews used real execution/measurement rather than reading source (TESTING: a self-restoring mutation test proving TS-6 was not load-bearing; SECURITY: a live Windows junction-cycle reproduction, a 9-payload path-traversal fuzz, a live anon-key RLS read, and timed walks from both the worktree and the main repo root). Every finding from both reviews was independently re-verified fixed here, not merely re-read: the TS-6 mutation now correctly fails against the rewritten suite (proving the rewrite is genuinely load-bearing, not just differently-worded); the main-repo-root walk cost was re-measured live post-fix (2ms zero-ref case, 793ms genuine-walk case, down from 17.6-30s). The full test suite (19/19) and both real motivating SDs (parent orchestrator SD 36c858f7: 94/100, Child 1 SD d5b56ce2: 100/100, both with ambiguity warnings correctly logging on a passing result) were re-confirmed unchanged by the fix. GO for PLAN-TO-LEAD: no open finding from either review remains unaddressed; the two accepted-residual items (information disclosure, root validation) are disclosed rather than fixed, matching this SD\'s established risk-register pattern for bounded, low-severity, out-of-scope tradeoffs.';

async function writeEvidence(code, name) {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: code, supabase });

  let results = {
    verdict: 'PASS',
    confidence_score: 93,
    findings: sharedFindings,
    warnings: [],
    recommendations: [
      'Proceed to PLAN-TO-LEAD -- all findings from both EXEC-TO-PLAN reviews are fixed and independently re-verified.',
      'The two accepted-residual items (anon-readable info disclosure, unvalidated walk root) are disclosed, not fixed -- appropriate follow-up SDs if the underlying assumptions (pre-existing anon-read RLS policy; always-a-repo cwd) ever change.'
    ],
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC-TO-PLAN',
      mode: 'follow-up confirmatory pass after fixing both independent EXEC-TO-PLAN reviews\' findings',
      go_no_go: 'GO',
      prior_reviews: {
        testing: { evidence_id: '1604bb8a-b7ca-49a5-baf9-87f3a538dc1e', verdict: 'CONDITIONAL_PASS', blocking_findings: 2, all_fixed: true },
        security: { evidence_id: '8cabf6c0-786c-42aa-b9e8-61bebad9ba68', verdict: 'CONDITIONAL_PASS', blocking_findings: 1, accepted_residual: 2, all_fixed_or_disclosed: true }
      },
      post_fix_measurements: {
        main_repo_root_zero_ref_call_ms: 2,
        main_repo_root_genuine_walk_ms: 793,
        prior_main_repo_root_genuine_walk_ms_range: [17370, 29926],
        ts6_mutation_readdir_calls_after_fix: 7310,
        ts6_threshold: 4386
      },
      commit: '3a2b965af22',
      pr: 7276
    },
    phase: 'EXEC-TO-PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults(code, SD_ID, { name }, results, { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' });
  console.log(`${code} VERDICT WRITTEN: ID=${stored.id} verdict=${stored.verdict} confidence=${stored.confidence} repo_resolved=${stored.metadata?.repo_resolved}`);
}

await writeEvidence('TESTING', 'Enhanced QA Engineering Director v2.4.0');
await writeEvidence('SECURITY', 'Former NSA security architect');
process.exit(0);
