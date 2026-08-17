/**
 * Correction: PRD risk register wrongly claimed "no other monitor becomes fixed"
 * as a side effect of the FR-5 shared-client change. A deep-tier adversarial
 * review agent (spawned during /ship's mandatory review gate for PR #7152)
 * found this claim factually wrong for monitorHandoffRejections() specifically,
 * and I independently re-verified every load-bearing number directly against
 * the live database before accepting the finding (established discipline for
 * this whole SD -- every sub-agent claim gets re-checked, not trusted).
 *
 * What the adversarial agent claimed, and what I confirmed independently:
 *   - monitorHandoffRejections() shares triggerRCAOrThrow() with monitorTestFailures()
 *     -> CONFIRMED by direct code read (lib/rca-runtime-triggers.js:360,449,459):
 *        both call the same triggerRCA -> triggerRCAOrThrow -> createSupabaseServiceClient()
 *        chain. The FR-5 fix is a single shared helper, by design (TR-2).
 *   - sd_phase_handoffs is already in the supabase_realtime publication
 *     -> CONFIRMED live via pg_publication_tables (no chairman-gated DDL needed,
 *        unlike test_results).
 *   - monitorHandoffRejections() never reads payload.old, so relreplident='d'
 *     (default, PK-only OLD tuple) does not block it the way it blocks
 *     monitorQualityGates() on retrospectives.
 *     -> CONFIRMED: only `const handoff = payload.new` appears in the handler.
 *   - root_cause_reports INSERT/UPDATE/DELETE is restricted to service_role,
 *     SELECT is public -- so the anon-client 42501 root cause (QF-20260726-175)
 *     applies uniformly across all 4 monitors, not just the SD's headline target.
 *     -> CONFIRMED live via pg_policy: public_select (SELECT, using=true),
 *        service_role_all (ALL, roles={service_role}).
 *   - "162 rejections in the last 7 days, 20 in the last 24 hours" as evidence
 *     the monitor will fire again soon.
 *     -> The first re-verification attempt used rejected_at and got 0/0 --
 *        that column is NULL on all 13,174 historical status='rejected' rows
 *        (a separate, pre-existing, out-of-scope data-quality gap in this
 *        table, not something this SD introduces or needs to fix). Re-querying
 *        on created_at (the column the row transition actually populates)
 *        confirmed 162 in the last 7 days, most recent 2026-08-17T01:31:48Z --
 *        hours before this correction was written. 2,950 distinct
 *        (sd_id, handoff_type) pairs already have >=2 historical rejections,
 *        which is the monitor's own trigger threshold
 *        (lib/rca-runtime-triggers.js:359, unbounded historical count, no
 *        time window -- pre-existing design, unchanged by this SD's diff).
 *
 * Conclusion: the finding is REAL. monitorHandoffRejections() will resume
 * writing RCRs (and invoking the real RCA sub-agent via invokeRCASubAgent)
 * shortly after this PR merges, likely within hours given current volume.
 *
 * Decision (made autonomously -- no human in this session's loop; matches
 * this SD's established practice of independently verifying every claim
 * before acting on it, then making the highest-value defensible call):
 * ACCEPT, do not block or gate. Reasoning:
 *   1. This is CORRECTIVE, not scope creep. monitorHandoffRejections() shares
 *      the EXACT SAME root cause as this SD's headline target (anon-client
 *      RLS 42501, silently swallowed by the fail-soft wrapper added in
 *      QF-20260726-175). It was never deliberately disabled -- it died as an
 *      unintended side effect of a security-hardening migration, the same
 *      silent-failure defect class this whole SD exists to fix. Restoring it
 *      is the correct outcome of TR-2's shared-client design, not an
 *      accidental scope expansion.
 *   2. The mechanism is safe. triggerRCA() is fail-soft by construction
 *      (lib/rca-runtime-triggers.js:428-442) -- an RLS error, a duplicate,
 *      or an RCA sub-agent failure all degrade to a loud log line, never a
 *      crash. This exact safety property is what QF-20260726-175 built and
 *      what this SD's own TS-9 covers for the shared client.
 *   3. Un-sharing the client (giving monitorHandoffRejections its own,
 *      deliberately-still-anon client) would reintroduce a second silent
 *      write-path divergence between monitors for no safety benefit, and
 *      would violate TR-2's explicit "single shared diagnostic write path"
 *      design this PRD already committed to.
 *   4. The actual risk is operational noise (a burst of new root_cause_reports
 *      rows and RCA sub-agent invocations), not correctness or data safety.
 *      That risk is disclosed here and signaled to the fleet coordinator so
 *      other sessions don't mistake the resulting burst for a new bug.
 *
 * This script corrects the PRD risk register entry that asserted the false
 * claim, and records the correction as its own auditable one-off action
 * rather than silently rewriting the original LEAD-time decision scripts
 * (which remain accurate records of what was believed at the time they were
 * written).
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001';

async function main() {
  const { data: prd, error: fetchError } = await supabase
    .from('product_requirements_v2')
    .select('risks')
    .eq('id', PRD_ID)
    .single();

  if (fetchError) throw fetchError;

  const risks = prd.risks;
  const targetIndex = risks.findIndex((r) =>
    r.risk.startsWith('The FR-5 shared-client change touches code used by all 4 monitors')
  );

  if (targetIndex === -1) {
    throw new Error('Could not find the FR-5 shared-client risk entry to correct -- PRD content may have changed since this script was written.');
  }

  risks[targetIndex] = {
    risk: 'The FR-5 shared-client change touches code used by all 4 monitors in this file. A deep-tier adversarial review (PR #7152) found, and independent live-DB re-verification confirmed, that this WILL functionally resume monitorHandoffRejections() -- not just the SD\'s headline target -- because it shares the identical anon-client RLS 42501 root cause and is already realtime-published (sd_phase_handoffs, confirmed via pg_publication_tables) with no payload.old dependency to block it.',
    impact: 'MEDIUM',
    mitigation: 'ACCEPTED, not gated: monitorHandoffRejections() dying was itself an unintended side effect of the same QF-20260726-175 RLS hardening this SD\'s headline defect stems from -- restoring it is corrective, not scope creep, and the shared triggerRCA() write path is fail-soft by construction (never crashes on RLS/duplicate/sub-agent failure). Confirmed live: 13,174 historical status=\'rejected\' rows, 162 in the last 7 days (by created_at -- rejected_at is NULL on every row, a separate pre-existing data-quality gap, out of this SD\'s scope), most recent hours before this correction. 2,950 distinct (sd_id, handoff_type) pairs already exceed the monitor\'s own >=2 trigger threshold (pre-existing, unbounded-history design in monitorHandoffRejections(), unchanged by this SD), so firing is expected within hours of merge, not theoretical. Un-sharing the client to suppress this would reintroduce per-monitor write-path divergence for no safety benefit and violate TR-2\'s single-shared-write-path design. Disclosed via /signal (high severity) to the fleet coordinator so the resulting burst of root_cause_reports rows and RCA sub-agent invocations is not mistaken for a new bug by another session. The other 2 monitors (monitorQualityGates, monitorSubAgentFailures) remain non-functional for their own, separately-filed, independent reasons (feedback ade11984, d9fcf973) regardless of this change.',
    probability: 'HIGH',
    rollback_plan: 'git revert the single-line client change; triggerRCA reverts to the anon client and the pre-existing (already-broken) behavior for all 4 monitors resumes, including re-silencing monitorHandoffRejections(). If post-merge volume proves operationally noisy without any correctness concern, the narrower lever is a monitor-specific gate on monitorHandoffRejections() alone (a new, separately-scoped SD/QF) rather than reverting this fix.',
  };

  const { error: updateError } = await supabase
    .from('product_requirements_v2')
    .update({ risks })
    .eq('id', PRD_ID);

  if (updateError) throw updateError;

  console.log('Corrected PRD risk register entry', targetIndex, 'for', PRD_ID);
  console.log(JSON.stringify(risks[targetIndex], null, 2));
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
