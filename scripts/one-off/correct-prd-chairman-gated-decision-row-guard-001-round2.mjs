#!/usr/bin/env node
// PLAN-phase correction round 2. See testing-agent evidence 39540b77-c5a4-446d-bd83-9e32cd1e443c
// (sub_agent_execution_results, PLAN-TO-EXEC) -- 5 original blocking conditions resolved, but 3
// new ones found: stale sibling fields (top-level acceptance_criteria, risks 1/3/4 text) left
// contradicting the corrected FR/TR/TS, and FR-1's chairman_decision_id-absent arm not qualified
// by the referenced row's current status (mirroring the fix already applied to the other arm).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('acceptance_criteria, risks, functional_requirements, test_scenarios, metadata')
  .eq('id', PRD_ID)
  .single();
if (fetchErr) { console.error('FETCH ERROR:', fetchErr.message); process.exit(1); }

const acceptanceCriteria = [
  prd.acceptance_criteria[0],
  "The recorded envelope for every hit satisfies BOTH shouldAutoEscalate() (immediate creation-time escalation attempt) AND isEscalationActionable() (durable re-surfacing via the existing chairman-decision-sla-sweep.mjs) -- decision_type='session_question', blocking=TRUE, raised_by='adam'. This exact shape is not novel: a live production row of this shape (950459ec-, venture_id null) has existed since 2026-07-27 via lib/adam/stall-alert.js and scripts/coordinator-escalate-question.mjs -- this SD adopts a proven-in-production envelope, not an invented one.",
  "Every eligible hit in a tick is recorded using the identical envelope -- there is no per-tick throttle. Creation-time email pacing is delegated entirely to the existing, unmodified QF-20260703-905 rate cap (<=3 standout emails/rolling-hour, remainder digest-folded); durable re-surfacing for anything not confirmed-sent is delegated to the existing, unmodified chairman-decision-sla-sweep.mjs blocking-row pass",
  prd.acceptance_criteria[3],
  "A metadata stamp failure prints a QUIET_TICK_CHAIRMAN_GATED_STAMP_ERROR line (a dedicated, newly-allowlisted token -- not the existing whole-tick-fatal QUIET_TICK_ERROR) and leaves the SD selectable on the next run -- never a silent skip",
];

const risks = prd.risks.map((r, i) => {
  if (i === 0) {
    return {
      ...r,
      risk: 'Reverting to the wrong decision_type while keeping blocking=true would still satisfy both shouldAutoEscalate() and isEscalationActionable() (measured: sd_unfence_go_defer + blocking=true also passes both predicates) -- so TS-6\'s field-by-field assertion of decision_type/blocking/raised_by (not just the derived predicate booleans) is the ONLY remaining regression guard against a decision_type revert',
      mitigation: 'TS-6 asserts decision_type, blocking, and raised_by individually before asserting the predicates -- this assertion must never be weakened back to predicates-only',
    };
  }
  if (i === 2) {
    return {
      ...r,
      risk: 'This SD does not fix the separately-broken away-bridge/decision-scheduler pathway (isAway() near-always false, durabilityUnavailable:true); that pathway remains inert for any OTHER caller still depending on it. This SD instead relies on the SEPARATE, live, functioning chairman-decision-sla-sweep.mjs (SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001) for durable re-surfacing -- confirmed distinct from the broken away-bridge pathway',
      impact: 'LOW',
    };
  }
  if (i === 3) {
    return {
      ...r,
      risk: 'Every eligible hit now escalates at creation time (no per-tick throttle) -- a genuine multi-hit tick (e.g. the current live population of 7) produces up to 3 standout emails plus 1 digest-fold email under the existing QF-20260703-905 cap, stressing the digest-fold path in a way the original throttled design would not have. This is a real, not merely theoretical, increase in blast radius introduced by the FR-3 redesign',
      mitigation: "The digest-fold path is EXISTING, unmodified infrastructure (not built by this SD) and is exercised today by any other multi-decision burst. FR-3's test coverage (TS-5 and a dedicated test) must seed MORE THAN 3 eligible hits in one tick to genuinely exercise the fold path -- a 2-hit test alone leaves this risk unverified while appearing covered",
      rollback_plan: r.rollback_plan,
    };
  }
  if (i === 4) {
    return {
      ...r,
      mitigation: r.mitigation.replace(
        'a duplicate is self-correcting: both rows independently reach the chairman via the same rate-capped/digest-safe path, at worst a redundant but not harmful notification',
        "a duplicate is NOT self-correcting -- blocking rows are never auto-resolved (chairman-sla-enforcer.js skips them before SLA comparison; chairman-decision-timeout.js likewise) -- but both rows independently and correctly reach the chairman via the same rate-capped/digest-safe path; the cost is a redundant notification and an extra manually-resolved row, not a functional failure or a lost decision"
      ),
    };
  }
  return r;
});

const fr = prd.functional_requirements.map((item) => {
  if (item.id === 'FR-1') {
    return {
      ...item,
      description: item.description + " FURTHER CORRECTION (testing-agent round 2, evidence 39540b77): the FIRST exclusion arm ('metadata.chairman_decision_id is absent') was left unqualified by status while only the SECOND arm (existing-row content-match) was fixed -- meaning a resolved-and-later-re-fenced SD (one of the 7 SDs resolved 2026-08-15 carries exactly this stamp, per LEAD evidence fd5b1be7) would still be permanently excluded by the stale id alone. CORRECTED: both arms collapse into a single check -- 'is there currently a PENDING chairman_decisions row associated with this SD, found EITHER by looking up the row metadata.chairman_decision_id points to (if present) OR by content-match (brief_data.context.sd_key / summary naming the sd_key)'. The SD is a hit iff NO pending row is found by either lookup -- a stale id pointing to an approved/rejected row does not exclude, exactly like a stale content-match does not exclude.",
      acceptance_criteria: [
        ...item.acceptance_criteria,
        "AC-5: A fixture SD with metadata.chairman_decision_id STAMPED (pointing to an existing chairman_decisions row) but that row's status is 'approved' (not 'pending') IS still selected as a hit -- a stale id does not block a new fence, mirroring AC-4's fix for the content-match arm",
      ],
    };
  }
  if (item.id === 'FR-3') {
    return {
      ...item,
      acceptance_criteria: item.acceptance_criteria.map((ac) =>
        ac.startsWith('AC-3:')
          ? 'AC-3: No tick this SD\'s probe runs ever produces more than RATE_CAP_MAX_EMAILS (3) standout emails at creation time, verified against the existing, unmodified QF-20260703-905 cap logic (not re-implemented by this SD) -- the test seeding this MUST use more than 3 eligible hits (e.g. 5) in one tick to genuinely exercise the digest-fold path for the remainder, not just the under-cap case'
          : ac
      ),
    };
  }
  return item;
});
fr.push({
  id: 'FR-6',
  priority: 'MEDIUM',
  requirement: 'Update the two repo guards this change trips (confirmed red by testing-agent, not merely theoretical)',
  description: "tests/unit/chairman/all-paths-producers.test.js's PRODUCERS list enumerates recordPendingDecision callers with a pinned count (toBe(16)) -- this SD adds a new caller and must update that count. tests/unit/lint/quiet-tick-token-parity-lint.test.js:99-103 asserts missingFromConsumer is empty for tick-line tokens -- the allowlist JSON alone silences only the lint script, not this vitest assertion, so scripts/adam-startup-check.mjs:102's NO-OP token prompt list must ALSO be updated to include both new tokens (QUIET_TICK_CHAIRMAN_GATED_UNSURFACED, QUIET_TICK_CHAIRMAN_GATED_STAMP_ERROR).",
  acceptance_criteria: [
    'AC-1: tests/unit/chairman/all-paths-producers.test.js PRODUCERS count is updated to include this SD\'s new recordPendingDecision call site',
    'AC-2: scripts/adam-startup-check.mjs:102\'s token list includes both QUIET_TICK_CHAIRMAN_GATED_UNSURFACED and QUIET_TICK_CHAIRMAN_GATED_STAMP_ERROR, and tests/unit/lint/quiet-tick-token-parity-lint.test.js passes with both tokens present',
  ],
});

const ts = prd.test_scenarios.map((item) => {
  if (item.id === 'TS-11') {
    return {
      ...item,
      scenario: 'A stale chairman_decision_id (pointing to a resolved row) does not permanently suppress a later re-fence of the same SD -- CORRECTED per testing-agent round 2 to actually exercise the gap (the original fixture implied an absent id, which passes trivially without catching this)',
      given: "A fixture SD matching all other selection criteria with metadata.chairman_decision_id STAMPED and pointing to an existing chairman_decisions row, but that row's status is 'approved' (not 'pending')",
      then: 'The SD IS selected as a hit and a NEW chairman_decisions row is recorded, with the stale id overwritten by the new one -- FR-1 AC-5',
    };
  }
  if (item.id === 'TS-5') {
    return {
      ...item,
      given: 'Five fixture SDs all matching all selection criteria, with distinct created_at timestamps -- more than RATE_CAP_MAX_EMAILS(3) to genuinely exercise the digest-fold path, not just the under-cap case',
      then: "All five recorded rows have decision_type='session_question', blocking=true, raised_by='adam' (verified field-by-field); all five satisfy isEscalationActionable()===true; at most 3 receive a standout email and the remainder fold into exactly 1 digest email, verified against the existing QF-20260703-905 cap logic (not re-implemented)",
    };
  }
  return item;
});

const metadata = {
  ...prd.metadata,
  plan_correction_round2: {
    corrected_by: 'Golf-5',
    corrected_at: new Date().toISOString(),
    reason: 'testing-agent round-2 re-verification (evidence 39540b77-c5a4-446d-bd83-9e32cd1e443c) confirmed all 5 original blocking conditions resolved, and found the blocking=true envelope is already proven-safe in live production (row 950459ec- since 2026-07-27). Found 3 new gaps from round-1\'s targeted field update: stale top-level acceptance_criteria, risks 1/3/4 text contradicting the redesign (risk 4\'s mitigation was factually inverted -- the digest-fold path IS now stressed by multi-hit ticks, not avoided), and FR-1\'s first exclusion arm (chairman_decision_id absence) left unqualified by the referenced row\'s status while only the second arm was fixed. All three corrected here.',
  },
};

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ acceptance_criteria: acceptanceCriteria, risks, functional_requirements: fr, test_scenarios: ts, metadata })
  .eq('id', PRD_ID);
if (updateErr) { console.error('UPDATE ERROR:', updateErr.message); process.exit(1); }
console.log('PRD round-2 corrected:', PRD_ID, `AC=${acceptanceCriteria.length} risks=${risks.length} FR=${fr.length} TS=${ts.length}`);
