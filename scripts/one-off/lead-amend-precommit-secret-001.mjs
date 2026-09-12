#!/usr/bin/env node
// LEAD-phase scope-lock amendment for SD-LEO-FIX-PRE-COMMIT-SECRET-001 (worker Golf,
// session 81425e08-c5b5-4fde-bafc-f0b9d5e9c349, 2026-09-11). Incorporates three LEAD-phase
// sub-agent passes (validation-agent evidence 3a0213a7, risk-agent evidence 63e379f0,
// testing-agent prospective evidence 7f3f5cdf) that found the original mint-time scope
// would have shipped a worktree-inert fix and left three fail-open holes uncovered.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-PRE-COMMIT-SECRET-001';

const scope = `IN SCOPE (locked at LEAD, amended after 3 sub-agent passes): (1) .husky/pre-commit Stage 1
secret detection, BOTH content streams: STAGED_CONTENT (~:274) and FIXTURE_CONTENT (~:280, the
apa-calibration-fixtures allowlist diff). Merge-commit detection MUST use \`git rev-parse -q
--verify MERGE_HEAD\` (exit code), NEVER a literal \`[ -f .git/MERGE_HEAD ]\` path test — inside a
git worktree \`.git\` is a FILE (gitdir pointer) and MERGE_HEAD actually lives under
\`.git/worktrees/<name>/MERGE_HEAD\`; every fleet worker ships from a worktree, so a literal path
test is inert exactly where this bug bites (confirmed: PR #8490 was a worktree merge). On a merge
commit, restrict each stream's scanned added-line set to lines added relative to BOTH parents:
filter \`^+\`/\`^+++\` FIRST (hunk headers differ between the two diffs and corrupt a raw
line-for-line intersection), THEN intersect via \`grep -Fxf\` (NOT \`comm -12\` — comm requires
SORTED input; unsorted input makes comm warn on stderr and emit EMPTY stdout with rc=1, which this
hook's own \`2>/dev/null || true\` house style silently swallows, fail-OPEN — measured live). A
MANDATORY non-empty-fallback guards every degraded/empty case: if the MERGE_HEAD-derived added-line
set is empty OR \`git rev-parse\` errors OR the intersection primitive errors, fall back to the
existing HEAD-only basis rather than silently scanning nothing (measured: an empty second operand
returns empty from both \`grep -Fxf\` and \`comm -12\` alike -- fail-open by construction unless
the fallback is explicit, not incidental). Non-merge commits keep the current HEAD-only basis
unchanged. (2) A regression test under \`tests/unit/husky/\` (NOT \`tests/unit/hooks/\` -- that
directory does not exist; husky bash-hook tests live in tests/unit/husky/, reusing the
pre-commit-nonempty-index-guard.test.js pattern: vitest + spawnSync bash + bashAvailable() ->
describe.skip + mkdtempSync throwaway repo + a genuine \`git worktree add\` for the worktree-shaped
cases, since a plain-repo test would certify the worktree-inert literal-path bug as passing). (3)
No change to SECRET_PATTERNS, no bypass flags, no edits to hooks.Stop or permissions.allow.

TEST PLAN (10 cases from testing-agent prospective evidence 7f3f5cdf; T5-T7 are MUST-FAIL-IF-BROKEN
negative controls, not happy-path only): T1 rev-parse primitive detects MERGE_HEAD correctly in both
a plain repo and a linked worktree. T2 a merge bringing in a pre-existing redacted fixture line is
NOT blocked (the false positive this SD exists to fix). T3 a genuinely NEW secret introduced BY the
merge IS still blocked (negative control -- the guard from PR #8110 stays live). T4 a non-merge
commit is unaffected (existing HEAD-only behaviour unchanged). T5 an inverted merge-detection guard
mutation is caught (must fail if the guard silently empties the scan on non-merge commits). T6 an
unsorted-intersection-input mutation is caught (must fail if a \`comm -12\`-shaped regression
reintroduces the sortedness fail-open). T7 an empty/errored MERGE_HEAD-derived set falls back to the
HEAD-only basis rather than scanning nothing (fail-safe, not fail-open). T8 the FIXTURE_CONTENT
second stream gets the identical merge-basis treatment (fixing only STAGED_CONTENT leaves a live
gap). T9 the \`^+\`/\`^+++\` filter runs before intersecting, not after (ordering regression). T10
symmetric pathspec exclusions (hook self-exclusion, .githooks, apa-calibration-fixtures allowlist)
are preserved on both diff bases.

OUT OF SCOPE: other hook stages; the LEO_ALLOW escape hatch; classifier policy; the pre-existing
identical bug at hook lines ~718-719 using \`.git/COMMIT_EDITMSG\` as a literal path test (flagged by
validation-agent, out of scope for this SD -- a separate finding). KNOWN CONSTRAINT (measured
2026-09-11 on the origin QF, same file, session 64728de4): the auto-mode permission classifier
denies EVERY worker-seat WRITE to .husky/pre-commit (Bash AND Edit tool both), independent of
whether the fix ships via QF or full SD -- a seat-class limit, not a wording problem (chairman
ratification f0b5a482). If the classifier denies the .husky/pre-commit write from this SD's
worktree, the worker signals stuck with the complete, ready-to-apply patch + test plan and RELEASES
the claim (not hold -- distinct from the .github/workflows precedent, where holding is correct)
rather than working around it.`;

const description_amendment = `

LEAD-PHASE AMENDMENT (3 sub-agent passes, 2026-09-11, worker Golf session 81425e08): validation-agent
(evidence 3a0213a7) confirmed the defect is still live on current main and found no duplicate SD/QF,
but flagged the mint-time scope's literal "when .git/MERGE_HEAD exists" wording is ALWAYS FALSE
inside a git worktree (.git is a file there; MERGE_HEAD lives at
.git/worktrees/<name>/MERGE_HEAD) -- worktrees are this repo's documented ship path, i.e. exactly
where PR #8490 failed, so the literal wording would have shipped inert. risk-agent (evidence
63e379f0, CONDITIONAL_PASS@92) reproduced three fail-open modes live in a throwaway linked worktree:
an inverted merge-guard, an unsorted \`comm -12\` intersection (swallowed by this hook's
2>/dev/null || true), and an empty-second-operand case -- all three silently DISABLE secret
detection rather than merely re-blocking a false positive, which risk-agent ranked strictly worse
than the status quo bug. testing-agent prospective (evidence 7f3f5cdf, CONDITIONAL_PASS@88) measured
the same three fail-open modes independently, found the originally-scoped 2-case test plan
insufficient, and specified 10 concrete test cases (T1-T10, see scope) plus corrected the test
target directory from the non-existent tests/unit/hooks/ to tests/unit/husky/. All three findings
are now folded into the locked scope above; none change the SD's core purpose (merge-commit basis
fix for Stage 1 secret detection) or its OUT OF SCOPE boundary.`;

const success_metrics = [
  { metric: 'Merge-commit false positives eliminated', target: 'T2: a merge bringing in a pre-existing redacted fixture line is NOT blocked by Stage 1 (regression test green)' },
  { metric: 'Genuine secrets still blocked', target: 'T3: a newly added line matching SECRET_PATTERNS on the same merge commit IS blocked (negative-control test green)' },
  { metric: 'Non-merge behaviour unchanged', target: 'T4: existing hook unit tests under tests/unit/husky/ green; no change to SECRET_PATTERNS' },
  { metric: 'Fail-open modes closed, not just the happy path', target: 'T5 (inverted guard), T6 (unsorted-intersection regression), T7 (empty/errored MERGE_HEAD falls back to HEAD-only, never scans nothing) all pass as MUST-FAIL-IF-BROKEN negative controls' },
  { metric: 'Both content streams fixed', target: 'T8: FIXTURE_CONTENT (~:280) gets the identical merge-basis treatment as STAGED_CONTENT (~:274), not just one of the two' },
  { metric: 'Worktree-correctness', target: 'T1: git rev-parse -q --verify MERGE_HEAD (not a literal .git/MERGE_HEAD path test) correctly detects merge-in-progress in both a plain repo and a linked worktree' },
  { metric: 'Zero regressions', target: '0 existing tests broken (scoped unit run green); T9/T10 confirm filter-ordering and pathspec-exclusion symmetry preserved' },
];

const risks = [
  { risk: 'A wrong intersection implementation fails OPEN (silently disables secret detection on a merge) rather than fails closed (re-blocks a false positive) -- strictly worse than the bug this SD fixes.', impact: 'critical', likelihood: 'medium', mitigation: 'Mandatory non-empty-fallback to the HEAD-only basis on any empty/errored MERGE_HEAD-derived set; grep -Fxf instead of comm -12 (sortedness-independent); T5/T6/T7 pin all three measured fail-open modes as MUST-FAIL-IF-BROKEN regression tests, not happy-path-only coverage.' },
  { risk: 'The classifier denies the worker-seat WRITE to .husky/pre-commit at EXEC time regardless of QF-vs-SD workflow tier (measured on the origin QF-20260911-880, same file, 2026-09-11) -- a seat-class limit, not something a full SD gate pipeline bypasses.', impact: 'medium', likelihood: 'high', mitigation: 'At EXEC, attempt the write once to confirm current behaviour (a capability claim is settled only by attempting it); if denied, /signal stuck with the complete ready-to-apply patch + test plan and RELEASE the claim (not hold) so a differently-privileged actor can apply it directly from the PRD -- never retry the write repeatedly.' },
  { risk: 'A test that only exercises a plain repo (not a linked worktree) would certify the worktree-inert literal-path bug as passing.', impact: 'high', likelihood: 'medium', mitigation: "T1 and the worktree-shaped cases run against a genuine mkdtemp'd + git worktree add fixture, per validation-agent and risk-agent's independent reproductions." },
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'In a linked worktree, merge origin/main (bringing in a pre-existing redacted AKIA-shaped fixture line); run bash .husky/pre-commit.', expected_outcome: 'Stage 1 passes (no false-positive block) -- the bug this SD fixes.' },
  { step_number: 2, instruction: 'In the same merge commit, stage a genuinely new line matching a SECRET_PATTERNS entry (e.g. a fresh AKIA-shaped key) and re-run bash .husky/pre-commit.', expected_outcome: 'Stage 1 still BLOCKS -- proves the fix narrowed the false positive without disabling real detection (green step 1 + green step 2 would mean the scanner is off, not fixed).' },
];

async function main() {
  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('description')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw fetchErr;

  const description = current.description + description_amendment;

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ description, scope, success_metrics, risks, smoke_test_steps })
    .eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('OK amended', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  });
}
