#!/usr/bin/env node
/**
 * One-off: Insert the retro_type=SD_COMPLETION retrospective row required by
 * the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE for SD-LEO-INFRA-GH-MERGE-SAFE-WIRING-001.
 *
 * Only a retro_type='HANDOFF'/retrospective_type='LEAD_TO_PLAN' row existed
 * for this SD (id eda5465b-09d2-446d-a3bc-178b14cee152, quality_score 70) —
 * verified live, zero retro_type='SD_COMPLETION' rows for sd_id
 * 61939deb-3bef-43cc-8aee-3865bb92042a. getFilteredRetrospective()
 * (scripts/modules/handoff/retro-filters.js) only recognizes retro_type=
 * 'SD_COMPLETION' rows created after the SD's LEAD-TO-PLAN acceptance
 * (2026-08-16T18:52:57.803406Z) — the HANDOFF row does not satisfy it.
 *
 * quality_score below is advisory only: auto_validate_retrospective_quality()
 * (database/migrations/20260523_fix_retrospective_publish_gate_ordering.sql)
 * recomputes it server-side from what_went_well/key_learnings/action_items/
 * what_needs_improvement content on INSERT and REJECTS a status='PUBLISHED'
 * insert if the computed score is <70 — the value passed here is overwritten,
 * never trusted.
 */
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '61939deb-3bef-43cc-8aee-3865bb92042a';
const SD_KEY = 'SD-LEO-INFRA-GH-MERGE-SAFE-WIRING-001';

const what_went_well = [
  "TESTING sub-agent literally ran the exact command printed at ship-command-guide.md:101 and :223 rather than trusting that the guard turning green meant the replacement text was correct -- caught 2 of the 13 FR-2 doc-site repoints shipping without the <PR#> positional argument gh-merge-safe.mjs's parseArgs requires (an exit-2 defect a worker copy-pasting the printed line would have hit), a defect a text-substitution-only review would have missed entirely.",
  "SECURITY sub-agent caught a real gap on its first pass: the new gh-merge-guard-lint.yml workflow shipped with no explicit permissions block, defaulting to whatever the repo/org settings happened to allow -- fixed same-day with a scoped contents:read floor, a 3-line diff.",
  "VALIDATION (VERIFY phase) noticed the exact defect class TESTING had just caught (the missing PR# positional) had zero regression coverage -- added a 64-line invocation-shape scanner (TS-9) that checks every gh-merge-safe.mjs call across the guard's own SCAN_FILES corpus for a valid positional before its flags, plus a >=13-match sanity check so the guard cannot silently pass by matching nothing.",
  "FR-5's lint design was corrected mid-flight after the PRD's original string-opening heuristic (borrowed from scanner-convention-lint.mjs) failed to generalize to this corpus: decorative prefixes, chained `gh pr create && gh pr merge` commands, and prose-emphasis quoting all defeated a pure opening-substring test, so the design switched to comment-stripped whole-text matching with a mandatory-reason pragma escape hatch.",
  "The regression guard went from 42 violations before any fix, to 39 after FR-1 (2 live execution sites repointed: git-operations.js, worker-checkin.cjs), to 0 after FR-2/FR-3/FR-4 (13 doc/prompt sites, 2 leo_protocol_sections DB rows, CLAUDE_EXEC.md/CLAUDE_CORE.md regenerated) -- and a new CI workflow now blocks any future bare `gh pr merge` regression across that same ~22-file corpus.",
  "A CI pipefail bug (GitHub Actions' default `bash -eo pipefail` aborting the workflow before the $GITHUB_STEP_SUMMARY block ran on a non-zero lint exit, silently dropping the one output that mattered most -- the actionable violation list) was caught by the same TESTING review pass and fixed in the same commit, not left for a second incident to surface it."
];

const what_needs_improvement = [
  "FR-1B's Category E scope exclusion (5 cross-repo --repo sites: lead-final-approval/gates.js:747 and :873, MultiRepoCoordinator.js:312, ShippingPreflightVerifier.js:226 and :298) is very likely where the original incident this SD exists to fix actually happened -- gates.js:747 fires from LEAD-FINAL-APPROVAL cross-repo remediation messaging -- yet gh-merge-safe.mjs has no --repo support, so the single highest-probability repro site for the motivating incident (feedback f9dc1a98, PR #7026) remains un-repointed, pragma-exempted rather than fixed, with only a logged follow-up (feedback 83177b94).",
  "2 of the 13 FR-2 doc-site repoints initially shipped without the required <PR#> positional argument -- a mechanical find-and-replace sweep proved 'the bad string is gone' but not 'the new string actually runs', and that gap was only caught by an independent TESTING pass that executed the printed command instead of reading it.",
  "scripts/modules/shipping/worktree-merge.js:72 (a live execSync bare merge call, Category A) sat outside this SD's own PRD scope and was deferred whole rather than folded in, so a sixth live call-site class the SD's own motivating incident describes stays unfixed; a sibling site surfaced by a preceding QF (ShippingExecutor.js:228, feedback 320d98f4) is in the identical unresolved state.",
  "The PRD's original file-selection approach (an unrestricted repo-wide directory sweep) had to be abandoned mid-design after it pulled in roughly 35 unrelated incidental bare-command mentions with no way to discriminate this SD's real target sites from prose -- the fix (an explicit ~22-file SCAN_FILES list) is more maintainable, but it also means a brand-new bare `gh pr merge` site added outside that list in the future will not be caught by this guard at all."
];

const key_learnings = [
  "A text-substitution sweep across many call sites answers 'is the old bad string gone' but not 'does the new string actually execute' -- gh-merge-safe.mjs's parseArgs requires a positional <PR#> that bare `gh pr merge` does not need, and 2 of 13 FR-2 repoints shipped without it until an independent review ran the printed command rather than reading it. A mechanical repoint SD's own definition of done should include a runnability check, not just a guard-goes-green check.",
  "lib/lint/added-line-text.mjs's existing stripComments helper is diff-fragment-oriented, not line-count-preserving (it collapses a multi-line block comment down to a single space) -- wrong for a whole-file, line-numbered scanner. FR-5 had to write a local stripCommentsPreservingLines() instead of reusing the similar-sounding existing helper, which would have silently misreported violation line numbers.",
  "Auto-generated protocol files (CLAUDE_EXEC.md, CLAUDE_CORE.md) regenerated from a live, multi-session-shared DB show unrelated churn on every regen (this run's Recent Retrospectives rolling block moved) -- that is the database-first design working as intended, not a regression to chase, and any content-assertion test written against these files must anchor on text rather than line numbers for exactly that reason (FR-3's own new test does this).",
  "A worktree-local `gh pr merge --delete-branch` failure is deceptive precisely because the exit code arrives after the remote-side effect already succeeded: GitHub's API merge (step 1) completes, then the local checkout+branch-delete (step 2) fails with 'main is already used by worktree' -- so the non-zero exit and printed error describe step 2, but get read as 'the merge failed', when in fact it did not.",
  "Independent adversarial review rounds caught two real, distinct defect classes in this SD's own deliverable before merge (TESTING: missing positional arg + CI pipefail summary loss; VALIDATION: the missing-positional defect class itself had zero regression coverage) -- both fixed same-day in follow-up commits rather than accumulating as known gaps.",
  "A regression-guard lint's own file-selection scope is a permanent, silent boundary: SCAN_FILES is an explicit ~22-file list chosen after an unrestricted directory sweep proved unworkable (~35 unrelated incidental matches), which means the guard actively cannot see a new bare `gh pr merge` site introduced outside that list -- the guard's protection is exactly as wide as its enumerated file list, never wider."
];

const action_items = [
  {
    text: "Give gh-merge-safe.mjs --repo <owner/name> support and repoint the 5 deliberately-excluded Category E cross-repo sites (gates.js:747/873 -- the likely actual site of the motivating incident -- MultiRepoCoordinator.js:312, ShippingPreflightVerifier.js:226/298); tracked as feedback 83177b94-7984-481a-8771-6f7ec3862d24.",
    category: "follow-up",
    priority: "high"
  },
  {
    text: "Repoint scripts/modules/shipping/worktree-merge.js:72's live bare gh pr merge call (Category A, deferred out of this SD's scope; feedback 664e5f12-ab78-4f76-8b6d-da4a005831ce) and confirm whether its sibling ShippingExecutor.js:228 (feedback 320d98f4, deferred from a preceding QF) is still live-called before fixing it too.",
    category: "follow-up",
    priority: "medium"
  },
  {
    text: "When a future SD does a mechanical text-repoint across many call sites, add an explicit 'run the printed command' or invocation-shape check to its own definition of done -- this SD only caught its own missing-positional-arg defect via an independent TESTING pass, not via its own authoring process.",
    category: "process",
    priority: "medium"
  },
  {
    text: "Revisit gh-merge-guard-lint.mjs's SCAN_FILES list periodically (or add a lighter incidental-mention advisory pass) so a new bare gh pr merge site introduced outside the current ~22-file list does not silently escape the guard.",
    category: "tech-debt",
    priority: "low"
  },
  {
    text: "Confirm whether scripts/modules/shipping/index.js (ShippingExecutor) has any live caller before deciding how to fix ShippingExecutor.js:228 -- fixing or unwiring dead code is wasted effort either way.",
    category: "investigation",
    priority: "low"
  }
];

const success_patterns = [
  "Independent sub-agent review (TESTING, SECURITY, VALIDATION) each caught a distinct, real defect in this SD's own deliverable before merge, and each was fixed in a same-day follow-up commit rather than left as a known gap.",
  "A known, real gap (Category E --repo sites) was documented, pragma-exempted with a named reason, and logged as a harness_backlog follow-up (83177b94) rather than silently left unaddressed or scope-crept into an already-large SD.",
  "The lint scanner's design was corrected mid-flight (string-opening heuristic -> comment-stripped whole-text matching) after live testing against the actual corpus showed the PRD's original approach didn't generalize, rather than forcing the corpus to fit a heuristic that didn't work."
];

const failure_patterns = [
  "A mechanical text-repoint (FR-2, 13 sites) shipped 2 sites with a real runnable defect (missing required positional arg) because the review process checked 'is the old string gone' rather than 'does the new string execute' -- only caught by a later, independent pass.",
  "A regression test for a just-discovered defect class (missing-positional-arg) did not exist until a separate VALIDATION review pass explicitly asked whether one did -- the commit that caught and fixed the defect did not, on its own, add the test that prevents it recurring."
];

const improvement_areas = [
  "Root cause of the 2-of-13 missing-positional-arg defect: FR-2's repoint treated every site as textually equivalent to FR-1's, but gh-merge-safe.mjs's parseArgs contract (mandatory positional PR#, no branch-inference) differs from bare `gh pr merge`'s at every site, not just the two that got it wrong -- a per-site 'does this call site currently omit a PR#' check before repointing, not after, would have caught it at authoring time.",
  "Root cause of the CI pipefail bug: the workflow was authored and tested locally, where a non-zero exit does not silently eat downstream output, without accounting for GitHub Actions' default `bash -eo pipefail` shell, which a local dev environment does not replicate by default -- CI-specific shell semantics need a CI-environment check, not just a local dry run.",
  "The Category E cross-repo exclusion is a real, load-bearing capability gap in gh-merge-safe.mjs (no --repo support) rather than a scoping convenience -- FR-1B correctly named it as deliberate and logged a follow-up, but the underlying tool gap is the thing that should be fixed next, not re-deferred a second time."
];

const description = "SD-LEO-INFRA-GH-MERGE-SAFE-WIRING-001 fixed a false-failure trap in worker-facing merge instructions: bare `gh pr merge --delete-branch` merges a PR server-side via GitHub's API, then attempts a LOCAL git checkout + branch delete that fails inside a git worktree ('main is already used by worktree'), so the command exits non-zero AFTER the merge already succeeded -- teaching whoever ran it a false 'merge failed' conclusion. This happened live to a fleet worker (feedback f9dc1a98, PR #7026). scripts/gh-merge-safe.mjs (merges via `gh api PUT .../merge`, no local checkout) already solved this for one call site but was never wired into the other places workers and docs told someone to merge. FR-5 added a regression-guard lint (scripts/lint/gh-merge-guard-lint.mjs) scanning an explicit ~22-file SCAN_FILES list for bare `gh pr merge` text, wired into a new blocking CI workflow. FR-1 repointed the two live execution sites (git-operations.js, worker-checkin.cjs). FR-2/FR-3/FR-4 repointed 13 static doc/prompt sites, edited 2 leo_protocol_sections DB rows and regenerated CLAUDE_EXEC.md/CLAUDE_CORE.md, added a WHY clause to error-codes.md, and pragma-exempted every remaining out-of-scope bare-command mention with a named reason -- taking the guard from 42 violations to 39 (post-FR-1) to 0. A TESTING sub-agent review then caught 2 of the FR-2 sites shipping without the required <PR#> positional gh-merge-safe.mjs's parseArgs demands, plus a CI pipefail bug swallowing the actionable violation summary on failure -- both fixed same-day. A SECURITY review added an explicit contents:read permissions floor to the new workflow. A VALIDATION (VERIFY) review then found the just-caught missing-positional defect class had no regression coverage and added a 64-line invocation-shape scanner (TS-9) plus a named WHY-clause test (TS-8). FR-1B deliberately excludes 5 Category E cross-repo sites (gh-merge-safe.mjs has no --repo support) -- pragma-exempted, not silently ignored, with a logged harness_backlog follow-up (83177b94); gates.js:747 is likely the actual site of the original incident. worktree-merge.js:72 (Category A, live bare-merge call) is deferred out of scope (feedback 664e5f12).";

const record = {
  sd_id: SD_ID,
  title: "SD Completion Retrospective: Wire scripts/gh-merge-safe.mjs into worker-facing gh pr merge sites (worktree-safe merge)",
  description,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  status: 'PUBLISHED',
  generated_by: 'MANUAL',
  project_name: SD_KEY,
  learning_category: 'PROCESS_IMPROVEMENT',
  conducted_date: new Date().toISOString(),
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  target_application: 'EHG_Engineer',
  related_commits: ['9b1b4585153', 'afe9b1668a6', '3a8d05caf7f', 'f5313100196', '90394230048', '111bb7e79a1'],
  related_prs: [],
  tags: ['gh-merge-safe', 'worktree', 'ci-lint-guard', 'worker-recovery-instructions', 'protocol-docs', 'regression-guard', 'infrastructure'],
  what_went_well,
  what_needs_improvement,
  key_learnings,
  action_items,
  success_patterns,
  failure_patterns,
  improvement_areas,
  quality_score: 88 // advisory only -- recomputed server-side by auto_validate_retrospective_quality()
};

async function main() {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('retrospectives')
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('FAILED:', error.message, error.details || '', error.hint || '');
    process.exit(1);
  }

  console.log('RETROSPECTIVE WRITTEN:');
  console.log('  ID:', data.id);
  console.log('  retro_type:', data.retro_type, '| retrospective_type:', data.retrospective_type);
  console.log('  status:', data.status);
  console.log('  quality_score (server-computed):', data.quality_score);
  console.log('  quality_issues:', JSON.stringify(data.quality_issues));
  console.log('  what_went_well:', data.what_went_well.length, '| what_needs_improvement:', data.what_needs_improvement.length);
  console.log('  key_learnings:', data.key_learnings.length, '| action_items:', data.action_items.length);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
