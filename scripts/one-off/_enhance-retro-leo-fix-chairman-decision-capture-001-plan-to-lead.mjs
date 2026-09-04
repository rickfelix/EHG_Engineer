// Enhance the auto-generated (boilerplate) SD_COMPLETION retrospective for
// SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001 with the actual session narrative:
// a retroactive QF->SD escalation (source LOC 121 vs the Tier-2 cap of 75,
// caught AFTER the code had already shipped and merged as QF-20260902-882),
// two genuine defects caught in already-merged code by same-session
// VALIDATION/SECURITY sub-agent findings before the new daily cron ran
// unattended, a reusable audit-db-test-guards.mjs false-positive gotcha, and
// a non-blocking public-repo governance-content exposure advisory routed as
// a fast-follow QF rather than a blocker.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const s = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

const RETRO_ID = 'c0fb0b41-cbe0-46ca-9785-06ec2520f0d7';
const SD_KEY = 'SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001';

const update = {
  description: 'Retroactive Tier-3 escalation of quick-fix QF-20260902-882: the QF\'s actual source LOC (121) exceeded the Tier-2 QF cap (75) by ~2.7x, triggering the LEO protocol\'s mandatory --from-qf escalation path after the code had already been implemented, tested, and merged. Root cause: apply-chairman-decision-captures.mjs (the chairman-decision capture reconciler) was unscheduled anywhere in the repo and covered only one of two relevant feedback categories (chairman_decision_capture), so captured already-made decisions piled up as unresolved critical feedback (27 rows in the covered category, plus 4 chairman_ruling_capture rows the reconciler could never see). Resolution shipped across two PRs: #8074 widened the reconciled categories to include chairman_ruling_capture, routed a CHECK-constraint-violating bare feedback update through the canonical resolveFeedback() helper, removed an erroneous resolve call from a hold-annotation branch, and added a new daily GitHub Actions cron (the reconciler was previously manual-only). #8079 was a same-session LEAD-TO-PLAN VALIDATION-sub-agent finding that the new cron would permanently block every RPC capture (isFixApplied() used a direct pg client needing a DB password no cron workflow in this repo injects) -- fixed by routing through the exec_sql RPC on the existing supabase-js client instead; it also fixed an unchecked resolveFeedback() result and an audit-db-test-guards.mjs false positive (a bare regex literal leaking past the audit\'s string-masking). Prevention: QF LOC estimates need to reflect true diff scope before implementation begins, not be reconciled after merge; the --from-qf escalation path is the correct backstop when they don\'t, and it was followed here rather than force-completing the QF at its stale estimate.',
  what_went_well: [
    { achievement: 'Correctly caught the LOC-cap escalation rather than force-completing the QF at its stale estimate: QF-20260902-882\'s actual source LOC (121) exceeded the Tier-2 QF cap (75) after the code had already shipped and merged, and the --from-qf escalation path converted it into a fully gate-tracked SD retroactively instead of leaving 121 LOC of production change under-governed.', is_boilerplate: false },
    { achievement: 'A same-session LEAD-TO-PLAN VALIDATION-sub-agent finding caught a genuine, would-have-shipped-blind defect in already-merged code: the new daily cron\'s isFixApplied() used a direct pg client requiring a DB password no cron workflow in this repo injects, which would have permanently blocked every RPC capture the moment the cron ran unattended. Caught and fixed (PR #8079) before the schedule ever fired.', is_boilerplate: false },
    { achievement: 'Routed a CHECK-constraint-violating bare feedback update through the canonical resolveFeedback() helper instead of leaving the direct/bare update path in place, removing a class of defect (bypassing shared validation helpers) rather than patching the single call site only.', is_boilerplate: false },
    { achievement: 'Live dry-run verification against the real database was used to confirm reconciler behavior, not just static test-pins -- reducing the risk that a passing pinned/mocked test suite would mask the same DB-auth defect the VALIDATION sub-agent later caught.', is_boilerplate: false },
    { achievement: 'A non-blocking SECURITY-sub-agent advisory (the new daily cron writes chairman decision-capture titles and unpark-trigger text into public GitHub Actions job summaries/artifacts, on a PUBLIC repo, now on an unattended daily schedule rather than only when a human ran the script locally) was proportionately triaged as a recommended fast-follow QF rather than blocking the SD -- correct calibration given the pattern already exists elsewhere in the repo (18/132 similar workflows), but flagged because the schedule/data-class combination was new.', is_boilerplate: false }
  ],
  what_needs_improvement: [
    'QF-20260902-882\'s original LOC estimate (45) was off by ~2.7x from the actual shipped source LOC (121) -- a QF-estimation lesson: reconciler/cron-adjacent quick-fixes that touch a shared helper, add a new workflow file, and change validation branching accumulate LOC fast, and estimates for this SD-shape should be sanity-checked against the diff before implementation starts, not reconciled into a retroactive escalation after merge.',
    'audit-db-test-guards.mjs (the static audit guarding DB-signal test pins) produced a false positive on a bare regex literal that happened to contain DB-signal identifier names, because the audit\'s string-masking pass does not account for regex literals -- a reusable gotcha for anyone else writing similar static-pin tests elsewhere in this repo; the audit was fixed in PR #8079 rather than worked around by rewording the regex.',
    'The reconciler (apply-chairman-decision-captures.mjs) had been unscheduled anywhere in the repo until this SD, and covered only one of two relevant feedback categories -- both gaps had been silently accumulating unresolved feedback (27 + 4 rows) before being noticed. New cron-adjacent, DB-writing scripts would benefit from an explicit "who schedules this and on what cadence" check at review time rather than discovery only after a feedback backlog forms.'
  ],
  key_learnings: [
    { learning: 'A quick-fix\'s LOC estimate is not self-correcting: QF-20260902-882 was implemented, tested, and merged at an assumed 45 LOC before the actual 121 LOC was measured and triggered the mandatory --from-qf Tier-3 escalation. The protocol\'s retroactive escalation path is the correct backstop for this failure mode, but it is a backstop, not a substitute for a more accurate upfront estimate on reconciler/cron-adjacent changes.', is_boilerplate: false },
    { learning: 'Sub-agent findings on already-merged code still have high value: the VALIDATION sub-agent finding that blocked the new cron\'s isFixApplied() DB-auth path surfaced during this same-session LEAD-TO-PLAN validation, not during original PR review -- catching it before the cron\'s first unattended run, not after a production incident.', is_boilerplate: false },
    { learning: 'Static audits that mask string literals for DB-signal detection can miss the same signal inside a regex literal -- audit-db-test-guards.mjs\'s false positive here is a template for a defect class (audit tooling that special-cases plain strings but not equivalent-content regex/template literals) worth checking for in other static-pin guards in this repo.', is_boilerplate: false },
    { learning: 'Public-repo governance-content exposure is a distinct risk axis from "does this pattern already exist elsewhere": the SECURITY advisory here was non-blocking specifically because the write-to-public-CI-logs pattern already exists in 18/132 workflows, but the same finding would look different (and might need to block) for a governance-content class not yet normalized onto an unattended daily schedule -- worth watching for in other new cron workflows that write sensitive-but-not-secret business content to CI logs.', is_boilerplate: false }
  ],
  action_items: [
    {
      owner: 'QF triage / LEO harness',
      action: 'Treat reconciler/cron-adjacent quick-fixes (touching shared validation helpers, adding a new workflow file, or changing branching logic) as a class worth a pre-implementation LOC sanity check against the QF cap, given this SD\'s original 45 LOC estimate was ~2.7x below the actual 121 LOC shipped',
      source: 'qf_estimation_gap',
      priority: 'medium',
      smart_format: true,
      success_criteria: 'QF triage guidance references this SD as a precedent for reconciler/cron-adjacent LOC underestimation',
      evidence_ref: 'QF-20260902-882 -> SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001 retroactive escalation'
    },
    {
      owner: 'Test infra owner (audit-db-test-guards.mjs)',
      action: 'Verify the fix in PR #8079 for the bare-regex-literal false positive generalizes: audit string-masking should also mask/allow regex literals containing DB-signal identifier names, not just plain string literals',
      source: 'reusable_gotcha',
      priority: 'low',
      smart_format: true,
      success_criteria: 'audit-db-test-guards.mjs treats regex literals equivalently to string literals for DB-signal masking; no new false positives on similar static-pin tests elsewhere in the repo',
      evidence_ref: 'PR #8079'
    },
    {
      owner: 'Security / GitHub Actions owner',
      action: 'Recommended fast-follow QF (SECURITY-sub-agent advisory, non-blocking): review whether chairman decision-capture titles and unpark-trigger text should be redacted or truncated before landing in public GitHub Actions job summaries/artifacts, now that the reconciler runs on an unattended daily schedule rather than only when a human ran it locally',
      source: 'security_advisory',
      priority: 'medium',
      smart_format: true,
      success_criteria: 'A QF or SD exists tracking the public-CI-log exposure review for the new daily reconciler cron',
      evidence_ref: 'SECURITY sub-agent finding, PLAN-TO-LEAD phase, SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001'
    }
  ],
  success_patterns: [
    'Retroactive --from-qf escalation triggered correctly when actual LOC (121) exceeded the QF cap (75), instead of force-completing the QF at its stale 45 LOC estimate',
    'Same-session VALIDATION sub-agent finding caught a cron-breaking DB-auth defect in already-merged code before the new unattended schedule could run it',
    'Live dry-run verification against the real database, not reliance on static test-pins alone',
    'Non-blocking SECURITY advisory proportionately routed as a recommended fast-follow QF rather than blocking the SD, given the pattern already exists elsewhere in the repo'
  ],
  failure_patterns: [
    'QF-20260902-882\'s original LOC estimate (45) was ~2.7x below the actual shipped source LOC (121), only caught after implementation, testing, and merge',
    'The reconciler had been unscheduled anywhere in the repo and covered only one of two relevant feedback categories, silently accumulating 27 + 4 unresolved feedback rows before being noticed',
    'audit-db-test-guards.mjs false-positived on a bare regex literal containing DB-signal identifier names, a gap in its string-masking logic'
  ],
  protocol_improvements: [
    'Cron/scheduled-workflow findings class: when a new GitHub Actions cron is added for a script that writes governance-content (chairman decisions, rulings, unpark triggers) into job summaries/artifacts on a PUBLIC repo, treat "does this data class already appear in scheduled unattended CI logs, or only in human-run-locally output" as an explicit SECURITY-sub-agent check -- the exposure surface changes materially even when the underlying write-to-CI-log pattern is already established elsewhere (18/132 workflows here).',
    'QF LOC-estimation: reconciler/cron-adjacent quick-fixes that touch shared validation helpers or add new workflow files are a class prone to significant LOC underestimation (2.7x here) -- worth a lighter-weight pre-implementation scope check for this SD-shape specifically, not just relying on the post-merge --from-qf escalation backstop.'
  ],
  bugs_found: 6,
  bugs_resolved: 6,
  technical_debt_addressed: true,
  technical_debt_created: false,
  related_prs: [
    'https://github.com/rickfelix/EHG_Engineer/pull/8074',
    'https://github.com/rickfelix/EHG_Engineer/pull/8079'
  ],
  tags: ['qf-escalation', 'chairman-decision-capture', 'cron-scheduling', 'security-advisory-fast-follow', 'audit-false-positive']
};

const { data: sd } = await s.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();

const { data, error } = await s
  .from('retrospectives')
  .update(update)
  .eq('id', RETRO_ID)
  .select('id, sd_id, quality_score')
  .single();

if (error) {
  console.error('ENHANCE ERROR:', error.message);
  process.exit(1);
}

if (data.sd_id !== sd.id) {
  console.error(`ENHANCE ERROR: RETRO_ID ${RETRO_ID} belongs to sd_id=${data.sd_id}, not ${SD_KEY} (${sd.id}) -- refusing to report success on a mismatched retro.`);
  process.exit(1);
}

console.log('Enhanced retrospective', data.id, 'for', SD_KEY, '- quality_score:', data.quality_score);
