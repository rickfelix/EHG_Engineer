#!/usr/bin/env node
/**
 * SD-completion retrospective for SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001.
 *
 * Written directly against the retrospectives table (same pattern as
 * scripts/one-off/insert-retro-sd-leo-infra-value-authenticity-spec-002.mjs) so the
 * PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE has a fresh retro_type=SD_COMPLETION row
 * created after the LEAD-TO-PLAN acceptance timestamp (2026-08-24T15:56:29.006Z).
 * The existing row for this sd_id (4c2f6895) is retro_type=HANDOFF and does not
 * satisfy the gate's filter.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = 'ed76707d-be3e-4b34-8066-7b9ec2db7709';
const SD_KEY = 'SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001';

const retro = {
  sd_id: SD_UUID,
  project_name: SD_KEY,
  retro_type: 'SD_COMPLETION',
  learning_category: 'PROCESS_IMPROVEMENT',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  title: 'SD Completion Retrospective: PR_MERGE_VERIFICATION gained a real never-pushed gate, and the review arc caught the same false-positive class twice',
  description:
    'The LEAD-FINAL-APPROVAL PR_MERGE_VERIFICATION gate (scripts/modules/handoff/executors/lead-final-approval/gates.js, ' +
    'createPRMergeVerificationGate) had a false-pass path: when Scan A (open PRs) and Scan B (unmerged remote branches) both ' +
    'returned zero, the gate unconditionally passed — but a merged-and-cleaned-up SD (PR opened, merged, branch deleted via ' +
    '/ship --delete-branch) produces that exact same zero/zero signature as an SD that was NEVER pushed at all. An SD could ' +
    'reach "shipped" status with zero merged code and the gate would not notice. The fix adds a third gate state that only ' +
    'fires when Scan A, Scan B, a newly-hoisted mergeEvidence accumulator (previously a function-local, silently-discarded ' +
    '`let prMerged`), AND a new Scan C (`gh pr list --state merged --search "<sdId>"`) are ALL empty for a non-exempt sd_type. ' +
    'The exemption list is deliberately narrow (documentation/docs/orchestrator via NO_CODE_SD_TYPES) rather than the broader ' +
    'isInfrastructureSDSync predicate, which measurement showed would have exempted 73.8% of completed SDs — including this ' +
    "SD's own type (infrastructure). A shared pure classifier, isNeverPushedSpecimen, was added for use by both the live gate " +
    'and a new retro-census one-off script (scripts/one-off/scan-completed-sds-for-never-pushed-merge-verification-never-001.mjs). ' +
    'The PRD (PRD-SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001) was amended four times across PLAN and EXEC as independent ' +
    'sub-agent reviews — at different phases, using different methods — each found a real, measured defect before merge: ' +
    'PLAN-phase TESTING probed (not just read) the original single-condition design and measured it 100% false-positive on ' +
    'normally-shipped SDs; EXEC-phase TESTING found the first Scan C implementation (no --search filter, --limit 100 repo-wide) ' +
    'reintroduced the identical false-positive class via a different mechanism — an unbounded window that ages out any SD ' +
    'merged more than ~2 days ago, demonstrated live against a real SD (SD-LEO-INFRA-RESUME-FINAL-READ-001, merged 2026-08-04, ' +
    'invisible to the unfiltered Scan C); EXEC-phase SECURITY found and proved-by-execution a real local-trust command-injection ' +
    'sink in the new local-branch diagnostic (fixed via execFileSync), an invalid \'process\' sd_type in the exemption list that ' +
    'would have told operators to set a DB-constraint-violating value, and that this very SD\'s own key was already saturating ' +
    "Scan C's 100-result cap before shipping; VERIFY-phase VALIDATION found the retro-census script's default --since window " +
    'diverged ~180x from the validated figure (731 vs 4 specimens) undisclosed, plus two stale PRD acceptance criteria that had ' +
    'drifted from the shipped code across the prior corrections; VERIFY-phase REGRESSION confirmed zero regressions (149/151 ' +
    "tests) and specifically re-verified the \"shared classifier\" claim — which an EXEC review had found FALSE (the live gate " +
    'never actually called isNeverPushedSpecimen, only claimed to in a docstring) — was genuinely fixed and wired by the time it ' +
    'reached VERIFY. A separate, pre-existing, HIGHER-severity command injection (remote-reachable, not local-trust) was found ' +
    'in the same file (gates.js:861/872) during the SECURITY review and was deliberately kept OUT of this SD\'s scope, escalated ' +
    'instead as its own critical harness-bug signal for a dedicated follow-up SD rather than scope-creeping this one.',
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['Explore', 'VALIDATION', 'DESIGN', 'RISK', 'TESTING', 'SECURITY', 'REGRESSION', 'VISION_FIDELITY', 'RETRO'],
  human_participants: [],
  affected_components: [
    'scripts/modules/handoff/executors/lead-final-approval/gates.js',
    'scripts/modules/handoff/executors/lead-final-approval/gates/pr-merge-verification.test.js',
    'scripts/modules/handoff/executors/lead-final-approval/gates/never-pushed-specimen.test.js',
    'tests/unit/harness/prmerge-exact-match.test.js',
    'scripts/one-off/scan-completed-sds-for-never-pushed-merge-verification-never-001.mjs',
  ],
  what_went_well: [
    'PLAN-phase TESTING did not just review the proposed design on paper — it ran two throwaway vitest probes and measured ' +
    'JSON.stringify(mergedAndBranchDeleted) === JSON.stringify(neverPushed), proving the naive single-condition design (Scan A=0 ' +
    'AND Scan B=0 => FAIL) would false-positive on 100% of normally-shipped, branch-deleted SDs, before a single line of the fix ' +
    'was written. Catching a design-level false-positive class by execution rather than inspection avoided building the wrong gate.',
    'The exemption list (NO_CODE_SD_TYPES) was deliberately kept narrow rather than reusing the existing, broader ' +
    'isInfrastructureSDSync predicate — measured exact population counts (count:exact, not a capped fetch) showed the broader ' +
    'predicate would exempt 73.8% of completed SDs from the gate, including this SD\'s own sd_type (infrastructure). Choosing the ' +
    'narrow list meant the gate actually applies to the SD that shipped it, rather than quietly exempting its own class.',
    'EXEC-phase SECURITY reviewed by executing, not just reading: it proved the command-injection sink in the local-branch ' +
    'diagnostic by actually triggering it, rather than flagging the pattern as theoretically risky, and it independently ' +
    'discovered this SD\'s own key was already saturating Scan C\'s 100-result cap — a concrete, present-tense demonstration of ' +
    'the exact defect class the SD exists to close, found in the SD\'s own dogfood data.',
    'The pre-existing, higher-severity (remote-reachable) command injection SECURITY found nearby in the same file was ' +
    'deliberately NOT folded into this SD\'s scope. It was escalated as its own critical harness-bug signal for a dedicated ' +
    'follow-up instead, keeping this SD\'s diff focused on the never-pushed defect it was scoped to fix.',
    'VERIFY-phase REGRESSION did not treat "shared classifier" as a documentation claim to accept — it specifically re-checked ' +
    'whether the live gate genuinely calls isNeverPushedSpecimen (an EXEC review had found the docstring claim FALSE, the gate ' +
    'was inlining an independent condition) and confirmed the wiring was actually fixed by VERIFY time, not just claimed fixed.',
  ],
  what_needs_improvement: [
    'The exact same false-positive class (merged-and-cleaned-up SD indistinguishable from never-pushed) was reintroduced TWICE ' +
    'through two different mechanisms: first as the original single-condition design (caught at PLAN by TESTING\'s probe), then ' +
    'again in the first Scan C implementation, which dropped the --search filter and used an unbounded --limit 100 repo-wide ' +
    'window that ages out any SD merged more than ~2 days before the gate runs (caught at EXEC by TESTING, demonstrated live on ' +
    'SD-LEO-INFRA-RESUME-FINAL-READ-001). Fixing the mechanism that produced a defect class does not guarantee the class itself ' +
    'is gone — a differently-shaped implementation of the fix can reopen the identical class through a new code path.',
    'The PRD was corrected in place as each finding landed (a deliberate discipline, not an accident), but VALIDATION at VERIFY ' +
    'still caught two PRD acceptance criteria that had drifted from the shipped code across the prior three rounds of ' +
    'corrections, plus a retro-census script whose default --since window diverged ~180x from the validated specimen count ' +
    '(731 vs 4) with the discrepancy left undisclosed. In-place correction reduces drift but does not eliminate it — a PRD that ' +
    "has been amended four times needs its own final cross-check against the shipped diff, not just against the finding that " +
    'triggered each individual amendment.',
    'The "shared classifier" claim (isNeverPushedSpecimen documented as used by both the live gate and the retro-census script) ' +
    'was false for at least one EXEC-phase review cycle: the live gate inlined its own independent condition and never actually ' +
    'called the shared function. A docstring asserting sharing is not evidence of sharing — REGRESSION had to re-verify the wiring ' +
    'directly rather than trust the prior claim that it had been fixed.',
  ],
  key_learnings: [
    'A false-positive class fixed at the design level can be reintroduced at the implementation level through a structurally ' +
    'different mechanism. Here the class was "merged-and-cleaned-up SD looks identical to never-pushed" — PLAN closed it by adding ' +
    'positive evidence (Scan C), but the first EXEC implementation of Scan C used an unbounded, unfiltered --limit 100 window that ' +
    'silently drops any merged PR older than ~2 days, recreating the same class through a time-window bug instead of a missing-scan ' +
    'bug. When a review finds and fixes a defect class, the next review of the SAME class should ask "does the fix hold under a ' +
    'different failure shape", not just "was the specific reported case addressed".',
    'Execution-based sub-agent review found defects that read-based review would very plausibly have missed: PLAN TESTING\'s ' +
    'JSON.stringify probe proving byte-identical output between two supposedly-distinguishable scenarios, EXEC SECURITY proving ' +
    'the command-injection sink by triggering it and separately measuring this SD\'s own key already saturating a 100-result cap, ' +
    'and EXEC TESTING demonstrating the Scan C window bug against a real, previously-shipped SD rather than a synthetic fixture. A ' +
    'design or code review that only reads the diff cannot observe a byte-identical output, a live cap being hit, or a real gh CLI ' +
    'response shape — these are only visible by actually running something against real data.',
    'A "correct in place PRD amendment" discipline (amending the PRD at the moment each finding lands, rather than deferring ' +
    'documentation to the end) measurably reduces PRD/code drift but does not eliminate it — VALIDATION at VERIFY still found two ' +
    'stale acceptance criteria after three prior rounds of correction. A PRD amended multiple times across phases needs one final, ' +
    'dedicated cross-check against the actually-shipped diff as its own step, not an assumption that incremental correction is ' +
    'self-verifying.',
    'Choosing a narrow, explicit exemption list (NO_CODE_SD_TYPES: documentation/docs/orchestrator) over an existing broader ' +
    'predicate (isInfrastructureSDSync) required measuring the actual population impact (count:exact over strategic_directives_v2) ' +
    'rather than assuming the existing predicate was "close enough" — the broader predicate would have exempted 73.8% of completed ' +
    'SDs, including this SD\'s own type, silently defeating the gate for the exact class of SD that built it.',
    'A defect found outside an SD\'s scope (the pre-existing, remote-reachable command injection at gates.js:861/872) is best ' +
    'escalated as its own signal rather than absorbed into the current SD\'s diff, even when it is more severe than anything in ' +
    'scope and sits in the same file. Keeping scope tight kept this SD\'s review cycles focused on the never-pushed defect class; ' +
    'the higher-severity finding gets its own dedicated review rather than riding along as an unplanned scope expansion.',
  ],
  action_items: [
    {
      title: 'Open a dedicated follow-up SD for the remote-reachable command injection at gates.js:861/872',
      description:
        'EXEC-phase SECURITY found a pre-existing, higher-severity (remote-reachable, not local-trust) command injection in the ' +
        'same file this SD modified, at scripts/modules/handoff/executors/lead-final-approval/gates.js:861 and :872. It was ' +
        'deliberately kept out of this SD\'s scope. File and prioritize a dedicated SD to fix it — do not let it sit un-scoped ' +
        'because the finding rode along inside this SD\'s review cycle rather than its own dispatch.',
      priority: 'critical',
      owner_role: 'LEAD',
    },
    {
      title: 'When a review closes a false-positive class, have the NEXT review at the NEXT phase explicitly re-probe the class under a different failure shape',
      description:
        'This SD\'s false-positive class (merged-and-cleaned-up indistinguishable from never-pushed) was closed at PLAN and ' +
        'reopened at EXEC through a different mechanism (unbounded Scan C window vs. missing Scan C entirely). Future PLAN-TO-EXEC ' +
        'or EXEC-phase review briefs for gates/classifiers that fix a measured false-positive/false-negative class should include an ' +
        'explicit instruction to test the SAME class against the NEW implementation shape, not just confirm the originally-reported ' +
        'scenario now passes.',
      priority: 'high',
      owner_role: 'PLAN',
    },
    {
      title: 'Add a dedicated final PRD-vs-shipped-diff cross-check step for SDs amended 3+ times mid-flight',
      description:
        'VALIDATION at VERIFY caught two stale PRD acceptance criteria after three prior rounds of in-place correction, plus an ' +
        'undisclosed ~180x discrepancy in the retro-census script\'s default --since window. When a PRD has been amended multiple ' +
        'times across PLAN and EXEC, add an explicit final pass comparing every acceptance criterion against the actually-shipped ' +
        'diff, rather than relying on the cumulative effect of point-in-time corrections.',
      priority: 'medium',
      owner_role: 'PLAN',
    },
  ],
  improvement_areas: [
    {
      area: 'False-positive class recurrence across PLAN and EXEC (merged-and-cleaned-up vs never-pushed)',
      analysis:
        'PLAN-phase TESTING measured the naive single-condition design as 100% false-positive on shipped-and-branch-deleted SDs. ' +
        'The corrected design added Scan C (merged-PR search evidence) to close this. The first EXEC implementation of Scan C used ' +
        '`gh pr list --state merged --limit 100` with no --search filter — a repo-wide window that silently ages out any SD merged ' +
        'more than ~2 days before the gate runs. EXEC-phase TESTING demonstrated this live against SD-LEO-INFRA-RESUME-FINAL-READ-001 ' +
        '(merged 2026-08-04, invisible to the unfiltered Scan C at review time). The root cause is that "add a scan for positive ' +
        'evidence" and "the scan must not itself be time-windowed" are two separate correctness properties, and only the first was ' +
        'explicitly required by the PLAN-phase correction.',
      prevention:
        'Fixed via --search "<sdId>" on Scan C, verified by execution to surface the previously-invisible SD. Documented here so ' +
        'future gate/classifier work that adds a positive-evidence scan explicitly checks whether the underlying API call is bounded ' +
        'by a window (time, count, or pagination) that could silently exclude old-but-valid evidence.',
    },
    {
      area: '"Shared classifier" claim was false for at least one review cycle',
      analysis:
        'isNeverPushedSpecimen was documented as shared between the live gate and the retro-census script, but an EXEC-phase review ' +
        'found the live gate never actually called it — it inlined an independent condition instead. A docstring claim of sharing is ' +
        'not evidence of sharing.',
      prevention:
        'REGRESSION at VERIFY re-verified the wiring directly (not the docstring) and confirmed it was genuinely fixed by that point. ' +
        'Generalizable practice: any "shared implementation" claim in a docstring or PRD should be checked by grepping for the actual ' +
        'call site, not accepted from the comment.',
    },
  ],
  success_patterns: [
    'Execution-based (probe/run/measure) sub-agent review over read-based review — PLAN TESTING\'s JSON.stringify probe, EXEC ' +
    'SECURITY\'s live-triggered injection proof and live cap measurement, and EXEC TESTING\'s real-SD demonstration all found ' +
    'defects that a text-only review of the diff would very plausibly have missed.',
    'Choosing a narrow, measured exemption list over reusing a broader existing predicate, verified against actual population ' +
    'counts rather than assumed equivalence.',
    'Keeping a higher-severity, out-of-scope finding (the remote-reachable injection) out of this SD\'s diff and escalating it ' +
    'separately, rather than scope-creeping the fix.',
    'Correcting the PRD in place as each of the four rounds of findings landed, rather than deferring documentation to the end.',
  ],
  failure_patterns: [
    'The same false-positive class (merged-and-cleaned-up SD indistinguishable from never-pushed) was reintroduced through a ' +
    'different mechanism after being closed once — first as a missing-scan gap (caught at PLAN), then as an unbounded-window gap ' +
    'in the fix for that gap (caught at EXEC).',
    'A "shared classifier" docstring claim was false for at least one EXEC review cycle — the live gate did not actually call the ' +
    'function it claimed to share.',
    'Despite in-place PRD correction across four rounds, VALIDATION at VERIFY still found two stale acceptance criteria and an ' +
    'undisclosed ~180x discrepancy in a script\'s default time window.',
  ],
  metadata: {
    sd_key: SD_KEY,
    branch: 'feat/SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001',
    prd_id: 'PRD-SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001',
    prd_amendment_rounds: 4,
    review_arc: [
      { phase: 'PLAN', sub_agent: 'TESTING', evidence_row: '8437e223-7012-4bd6-8b44-ecae4aa06214', finding: 'Naive single-condition design measured 100% false-positive on shipped SDs (probe, not inspection)' },
      { phase: 'EXEC', sub_agent: 'TESTING', evidence_row: 'd0b12eb8-5b1a-4ed1-b4fe-3d4a24125f3e', finding: 'First Scan C implementation (no --search, --limit 100) reintroduced the same false-positive class via a 2-day window; demonstrated on SD-LEO-INFRA-RESUME-FINAL-READ-001' },
      { phase: 'EXEC', sub_agent: 'SECURITY', evidence_row: 'bde3ab1f-3179-41f3-b635-ea49316a760c', finding: 'Local-trust command injection proved by execution; invalid \'process\' sd_type in exemption list; this SD\'s own key already saturating Scan C 100-cap; separately flagged a pre-existing higher-severity remote-reachable injection nearby, kept out of scope' },
      { phase: 'PLAN_VERIFICATION', sub_agent: 'VALIDATION', evidence_row: 'f9b360f7-e8de-48d2-88e7-add723b21013', finding: 'Retro-census script default --since window diverged ~180x (731 vs 4) undisclosed; two stale PRD acceptance criteria' },
      { phase: 'PLAN_VERIFICATION', sub_agent: 'REGRESSION', evidence_row: '7d18e34b-997c-4a2d-976e-d92bc974e262', finding: 'Zero regressions (149/151 tests); re-verified the "shared classifier" claim (previously found false) was genuinely fixed and wired' },
    ],
    out_of_scope_escalation: {
      finding: 'Pre-existing, remote-reachable command injection at gates.js:861/872, higher severity than anything in this SD\'s scope',
      disposition: 'Deliberately excluded from this SD\'s diff; escalated as a critical harness-bug signal for a dedicated follow-up SD',
    },
    handoffs_completed: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN'],
  },
};

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const s = createClient(url, key);

  const { data: ins, error: insErr } = await s.from('retrospectives').insert(retro).select('id').single();
  if (insErr) {
    console.error('Insert failed:', insErr.message);
    process.exit(1);
  }
  const retroId = ins.id;
  console.log('Inserted retrospective id:', retroId);

  const { data: ver, error: verErr } = await s
    .from('retrospectives')
    .select('id, sd_id, retro_type, retrospective_type, quality_score, status, created_at, learning_category, target_application')
    .eq('id', retroId)
    .single();
  if (verErr) {
    console.error('Verify failed:', verErr.message);
    process.exit(1);
  }
  console.log('Verified:', JSON.stringify(ver, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
