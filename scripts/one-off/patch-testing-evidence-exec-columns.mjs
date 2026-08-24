// SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 — companion to store-testing-evidence-exec-*.mjs.
//
// WHY THIS EXISTS: storeSubAgentResults has no `findings` column. A top-level results.findings is
// preserved into metadata.findings (results-storage.js:556) but is NOT projected onto the
// critical_issues / warnings / recommendations columns, which are what the CONDITIONAL_PASS
// downgrade path (results-storage.js:350-353) and downstream gate consumers actually read. Passing
// only `findings` therefore writes a row whose severity signal is invisible to every consumer —
// the same write-returns-green-while-discarding-payload class QF-20260803-007 documents for
// `summary` in that same file. This script projects the EXEC review's findings onto those columns.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const ROW_ID = 'd0b12eb8-5b1a-4ed1-b4fe-3d4a24125f3e';

const critical_issues = [
  'BLOCKING (measured, real-SD demo): Scan C uses `gh pr list --repo <R> --state merged --limit 100` with no search filter, so it sees only the 100 most recently merged PRs repo-wide -- MEASURED at 50.6h (2.11 days) on rickfelix/EHG_Engineer (PR#7389 2026-08-22T13:48Z .. PR#7495 2026-08-24T16:21Z). Demonstrated false positive on a REAL completed SD: SD-LEO-INFRA-RESUME-FINAL-READ-001 shipped via merged PR #6790 (2026-08-04) and returns 0 matches in Scan C while a bounded --head query finds it. With its branch deleted post-merge (normal /ship --delete-branch), re-running LEAD-FINAL-APPROVAL yields A=0/B=0/mergeEvidence=[]/C=0 -> FAIL reason never_pushed on a correctly-shipped SD. This falsifies the property the EXEC brief asked to confirm. Affects any of the 4024 non-exempt completed SDs approved >~48h after merge (orchestrator parents waiting on children, gate retries, weekends, resumed SDs). Fail-CLOSED so not a false pass, but the gate is correct only inside a 2-day window. FIX (verified by execution): add --search "<sdId>" to the Scan C invocation, keeping the branchBelongsToSd filter -- returns PR #6790 first for the aged-out SD. This is verbatim the PLAN-phase recommendation; EXEC kept the shape but dropped --search. Do NOT use per-pattern --head instead: it re-anchors on the 4 literal patterns and cannot see a suffixed branch, the exact blindness RESUME-FINAL-READ-001 FR-3 removed.',
  'HIGH (measured by repo-wide grep): isNeverPushedSpecimen (gates.js:644) is NOT called by the live gate. Its only callers are its own test file and the FR-4 census script; the gate inlines an independent condition at gates.js:973. The docstring claims it is shared by both "so the two definitions can never drift apart" -- false as written; only the NO_CODE_SD_TYPES Set is genuinely shared. THE DRIFT IS ALREADY PRESENT: the classifier treats a ship_review_findings row with a pr_number as disqualifying evidence (gates.js:654-656) and the gate has no such check, so the two disagree on exactly the population the census exists to enumerate -- a census that under-reports the defect it measures. Nothing in the suite asserts the two agree. FIX: either call the classifier from the gate with the evidence already gathered, or correct the docstring and pin the intended divergence with a test.',
];

const warnings = [
  'MEDIUM: Scan C per-repo catch (gates.js:984-989) swallows errors and continues. Sound for a persistent gh outage (Scan A fails closed with repo_scan_unreadable first) but NOT for a failure beginning between Scan A and Scan C (rate limit crossed mid-validator, transient network, token expiry at a 30s boundary). Then Scan C yields zero for a reason unrelated to the SD and the gate records reason=never_pushed. Verdict direction stays safe, but the reason code is load-bearing: FR-4 census and pattern analysis key off never_pushed, so a transient gh failure is censused as a never-pushed specimen. FIX: track Scan C read failures like unreadableRepos and return a distinct reason (merged_scan_unreadable).',
  'COVERAGE GAP: no test can reach the Scan C --limit window defect -- every fixture stubs the merged-PR command to return the SD PR unconditionally, so no mock expresses a 100-item cap (fixture proves logic, not observability). Add a fixture returning 100 unrelated merged PRs with the SD PR absent.',
  'COVERAGE GAP: nothing asserts the live gate and isNeverPushedSpecimen agree, which is what keeps the ship_review_findings divergence invisible.',
  'COVERAGE GAP (low): the diagnostic local-branch enumeration (git for-each-ref + git ls-remote, gates.js:997-1020) is exercised only in its empty form. No fixture returns a local branch absent from the remote, so the localCandidate-populated message branch and its ls-remote error path are unasserted. Low severity (diagnostic-only, never affects the verdict) but currently dead code from the suite perspective.',
  'MINOR: in the chore/ scenario details.openPRs is reported as 0 while an open PR exists on an unrecognized branch. Defensible as "0 open PRs resolved to this SD", but the census consumes details -- worth a comment.',
];

const recommendations = [
  'BLOCKING: add --search "<sdId>" to the Scan C gh invocation (gates.js:977-980), retaining the branchBelongsToSd filter. Verified by execution to find a PR 20 days / ~1300 PRs outside the current window.',
  'Add a regression fixture where the merged-PR command returns 100 unrelated PRs and the SD own PR is absent, asserting no never_pushed verdict once --search is in place.',
  'Resolve the isNeverPushedSpecimen sharing claim: call it from the gate, or correct the docstring and pin the ship_review_findings divergence with a test.',
  'Give Scan C read failures a distinct reason code (merged_scan_unreadable) so a transient gh failure is not censused as never_pushed.',
  'VERIFIED, no action: exemption narrowness (572/4596 = 12.4% exempt vs 73.8% for the rejected NON_CODE predicate, exact counts), zero stray isInfrastructureSDSync/SD_TYPE_CATEGORIES refs in gates.js, and third-state ordering (line 973 dominated by early returns at 771/789/923).',
];

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .update({ critical_issues, warnings, recommendations })
  .eq('id', ROW_ID)
  .select('id,critical_issues,warnings,recommendations')
  .single();

if (error) {
  console.error('UPDATE FAILED:', error.message);
  process.exit(1);
}
console.log('UPDATED row:', data.id);
console.log('  critical_issues:', data.critical_issues.length);
console.log('  warnings       :', data.warnings.length);
console.log('  recommendations:', data.recommendations.length);
