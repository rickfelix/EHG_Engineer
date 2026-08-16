#!/usr/bin/env node
// PLAN-phase correction to PRD-SD-LEO-INFRA-CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001.
// See testing-agent evidence row 660b1078-18ae-4682-ab1d-5eda27b2d3c9 (sub_agent_execution_results,
// phase PLAN-TO-EXEC) plus direct execution verification (Golf-5) against
// lib/chairman/chairman-actionable.mjs confirming isEscalationActionable({decision_type:
// 'session_question', blocking:false}) === false, and === true when blocking:true.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001';
const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, test_scenarios, risks, metadata')
  .eq('id', PRD_ID)
  .single();
if (fetchErr) { console.error('FETCH ERROR:', fetchErr.message); process.exit(1); }

const fr = prd.functional_requirements.map((item) => {
  if (item.id === 'FR-1') {
    return {
      ...item,
      description: item.description + " CORRECTION (testing-agent, PLAN-TO-EXEC evidence 660b1078): the 'no existing chairman_decisions row names this sd_key' exclusion only counts rows whose status is 'pending' -- a row that has since reached a terminal status (approved/rejected) does NOT suppress a later, NEW fence on the same SD. Without this, the 7 rows resolved on 2026-08-15 would permanently block any future re-fence of those same SDs.",
      acceptance_criteria: [
        ...item.acceptance_criteria,
        "AC-4: A fixture SD with an existing chairman_decisions row naming its sd_key, but that row's status is 'approved' (resolved, not pending), IS still selected as a hit -- a resolved decision does not block a new fence",
      ],
    };
  }
  if (item.id === 'FR-2') {
    return {
      ...item,
      requirement: 'Oldest eligible hit is auto-recorded using an envelope that is BOTH immediately-escalating AND durably re-surfaceable',
      description: "For hits older than 24h, eligible hits are recorded via lib/chairman/record-pending-decision.mjs recordPendingDecision() using the corrected envelope: decisionType='session_question', blocking=TRUE (corrected from the PLAN draft's blocking=false -- see mechanism correction below), raisedBy='adam', summary prefixed \"[FENCED-SD GO/DEFER <sd_key>]\", brief_data.context={sd_key, options, fenced_age, default_if_no_reply, batch, kind:'sd_unfence_go_defer'}, recommendation = the SD's recorded unfence_condition/Adam rec if present else a free-text fallback. MECHANISM CORRECTION (testing-agent, PLAN-TO-EXEC evidence 660b1078, confirmed by direct execution against lib/chairman/chairman-actionable.mjs): the LEAD-corrected envelope (blocking=false) satisfies shouldAutoEscalate() (fires the one-time creation email) but isEscalationActionable({decision_type:'session_question', blocking:false}) is FALSE -- confirmed by direct execution, contradicting the LEAD-phase validation-agent's evidence row fd5b1be7-52c4-4b1c-a661-78d89245b222, which incorrectly recorded this shape as isEscalationActionable:true. A false isEscalationActionable means the row is invisible to BOTH scripts/cron/chairman-decision-sla-sweep.mjs's re-escalation pass (selectBlockingSweepRows requires row.blocking===true) AND scripts/adam-decision-email.mjs's digest inclusion -- so if the one-shot creation email is suppressed (23:00-05:00 ET quiet window, or folded into a digest instead of sent standout under the QF-20260703-905 rate cap), the row becomes permanently invisible, reproducing this SD's own defect class one layer downstream. Setting blocking=TRUE fixes this: shouldAutoEscalate() still returns true (blocking===true is checked first, before decisionType, at record-pending-decision.mjs:102) AND isEscalationActionable() now returns true via its own `blocking === true` clause (confirmed by direct execution) -- making the row visible to the EXISTING, unmodified chairman-decision-sla-sweep.mjs pass 2 for durable re-escalation.",
      acceptance_criteria: [
        "AC-1: The inserted chairman_decisions row has decision_type='session_question', blocking=true, raised_by='adam' (all three fields, not a derived boolean)",
        "AC-2: shouldAutoEscalate() (imported directly from record-pending-decision.mjs) returns true for this exact envelope",
        "AC-3: isEscalationActionable() (imported directly from chairman-actionable.mjs) returns true for the inserted row's shape -- the durable-visibility regression guard this SD exists to satisfy",
        "AC-4: brief_data.context.kind === 'sd_unfence_go_defer' preserves the semantic tag without needing a decision_type allowlist/schema change",
      ],
    };
  }
  if (item.id === 'FR-3') {
    return {
      ...item,
      requirement: 'Escalation pacing and durable re-surfacing are fully delegated to EXISTING infrastructure -- no bespoke per-tick throttle is built',
      description: "REPLACED (testing-agent PLAN-TO-EXEC evidence 660b1078 found the original bespoke one-escalates-per-tick throttle both under-specified -- no suppression parameter exists on recordPendingDecision to differentiate an escalating vs non-escalating insert -- and entirely unnecessary once FR-2's blocking=true correction is applied): every eligible hit this tick is recorded using the SAME envelope from FR-2 (blocking=true) -- there is no 'oldest hit only' distinction and no separate non-escalating record path. At-creation email delivery is naturally paced by the EXISTING, unmodified QF-20260703-905 rate cap (at most 3 standout emails/rolling-hour, the remainder folds into ONE digest email). Any row whose escalation email is not confirmed-sent at creation (quiet-window suppression, or digest-folded rather than sent standout) remains eligible for the EXISTING, unmodified chairman-decision-sla-sweep.mjs blocking-row pass (selectBlockingSweepRows + escalateChairmanDecision), which re-attempts escalation after CHAIRMAN_BLOCKING_GRACE_MS (default 30 min) on its own already-scheduled cadence. This SD's probe verifies COMPATIBILITY with that existing selection function (by calling it directly against a fixture shaped like what the probe inserts) rather than reimplementing pacing/re-surfacing logic.",
      acceptance_criteria: [
        "AC-1: Every row this probe records satisfies selectBlockingSweepRows' selection predicate (blocking===true, isEscalationActionable()===true, non-fixture-venture) once its escalation_email_sent_at is unset and its age exceeds the grace period -- verified by calling selectBlockingSweepRows (imported unmodified from scripts/cron/chairman-decision-sla-sweep.mjs) directly against a fixture row shaped exactly like the probe's insert",
        "AC-2: With multiple eligible hits in one tick, all are recorded with the identical escalating-capable envelope -- verified field-by-field, not by a derived escalated:true/false split",
        "AC-3: No tick this SD's probe runs ever produces more than RATE_CAP_MAX_EMAILS (3) standout emails at creation time, verified against the existing, unmodified QF-20260703-905 cap logic (not re-implemented by this SD)",
      ],
    };
  }
  if (item.id === 'FR-4') {
    return {
      ...item,
      description: item.description.replace(
        'A stamp failure (mergeMetadataKeys returns merged:false) is printed as a QUIET_TICK_ERROR line',
        "A stamp is treated as FAILED whenever mergeMetadataKeys() returns merged:false, REGARDLESS of whether an .error field is present -- CORRECTION (testing-agent PLAN-TO-EXEC evidence 660b1078): lib/coordinator/safe-metadata-merge.mjs:75 returns {merged: rowCount > 0, sdKey} with NO .error field on a zero-row match (e.g. an sd_key/id mismatch, or the SD was deleted between selection and stamp) -- an `if (res.error)`-style check would silently treat this as success. The failure is printed as a dedicated QUIET_TICK_CHAIRMAN_GATED_STAMP_ERROR line"
      ) + " CORRECTION (testing-agent): a NEW, dedicated token (QUIET_TICK_CHAIRMAN_GATED_STAMP_ERROR) is used, not the existing QUIET_TICK_ERROR token -- QUIET_TICK_ERROR is already a whole-tick FATAL terminator (adam-quiet-tick.mjs:989, followed by process.exit(1)) exempt from the NO-OP parity lint; reusing it for a per-SD recoverable stamp failure would incorrectly abort the entire tick's remaining checks over one SD's transient DB error, and would still need its own parity-lint allowlist entry regardless.",
      acceptance_criteria: [
        ...item.acceptance_criteria.map(ac => ac.includes('forced stamp failure') ? "AC-2: A forced stamp failure (mocked mergeMetadataKeys returning {merged:false} with NO error field, matching the real zero-row-match shape) still prints a QUIET_TICK_CHAIRMAN_GATED_STAMP_ERROR line naming the sd_key" : ac),
      ],
    };
  }
  return item;
});

const tr = prd.technical_requirements
  .filter((item) => item.id !== 'TR-4')
  .map((item) => {
    if (item.id === 'TR-2') {
      return {
        ...item,
        requirement: "Use lib/chairman/record-pending-decision.mjs recordPendingDecision() with decisionType='session_question' AND blocking=true for every recorded hit -- never the original draft's 'sd_unfence_go_defer' decisionType, and never blocking=false",
        rationale: "shouldAutoEscalate() requires blocking===true OR (raisedBy==='adam' AND decisionType==='session_question') -- session_question alone (blocking=false) satisfies this for the one-time creation email, but isEscalationActionable() -- the predicate consumed by chairman-decision-sla-sweep.mjs and adam-decision-email.mjs -- requires blocking===true regardless of decisionType (confirmed by direct execution against lib/chairman/chairman-actionable.mjs). Both fields are load-bearing: decisionType keeps the insert on the already-proven-safe value (avoiding an unverified new decision_type), blocking=true is what makes the row durably re-surfaceable.",
      };
    }
    return item;
  });
tr.push({
  id: 'TR-6',
  requirement: 'The probe accepts a small, explicitly-documented duplicate-row risk under overlapping tick invocations rather than implementing distributed locking',
  rationale: "testing-agent (PLAN-TO-EXEC evidence 660b1078) flagged the select-then-insert-then-stamp sequence as non-atomic. Given this probe's minimum-age threshold (24h) and typical tick cadence (well under 24h), a genuine overlap requires a hung prior process -- rare. A duplicate row is self-correcting (both independently reach the chairman via the same rate-capped/digest-safe path; at worst a redundant, not harmful, notification). Full atomicity (e.g. a DB-level uniqueness constraint or advisory lock) is disproportionate to a periodic low-frequency probe and is explicitly out of scope -- documented as risk 5, not solved by this SD.",
});

const ts = prd.test_scenarios.map((item) => {
  if (item.id === 'TS-4') {
    return {
      ...item,
      given: "A fixture SD matching all selection criteria; mergeMetadataKeys is mocked to return {merged:false} with NO error field (matching lib/coordinator/safe-metadata-merge.mjs's real zero-row-match shape)",
      then: 'A QUIET_TICK_CHAIRMAN_GATED_STAMP_ERROR line is printed naming the sd_key; the check does not depend on an .error field being present. The SD is NOT silently marked done and remains a hit on the next run',
    };
  }
  if (item.id === 'TS-5') {
    return {
      ...item,
      scenario: 'Two eligible hits in the same tick both receive the identical escalating-capable envelope (no bespoke throttle)',
      given: 'Two fixture SDs both matching all selection criteria, with distinct created_at timestamps',
      when: 'The probe runs once',
      then: "Both recorded rows have decision_type='session_question', blocking=true, raised_by='adam' (verified field-by-field, not a derived escalated:true/false split); both satisfy isEscalationActionable()===true; both SDs get metadata.chairman_decision_id stamped",
    };
  }
  if (item.id === 'TS-6') {
    return {
      ...item,
      scenario: 'Regression guard: the recorded envelope satisfies BOTH shouldAutoEscalate() (immediate) AND isEscalationActionable() (durable) -- not just one derived boolean',
      given: "The exact envelope object the probe passes to recordPendingDecision() (decision_type, blocking, raised_by fields individually asserted first: 'session_question', true, 'adam')",
      when: 'shouldAutoEscalate() (imported directly from record-pending-decision.mjs) is called with {decisionType, blocking, raisedBy}, AND isEscalationActionable() (imported directly from chairman-actionable.mjs) is called with {status:"pending", decision_type: decisionType, blocking}',
      then: 'Both predicates return true -- guards against reverting to either the original inert shape (blocking=false + wrong decisionType) OR the LEAD-phase-corrected-but-still-insufficient shape (session_question + blocking=false), which passes shouldAutoEscalate() alone but fails isEscalationActionable()',
    };
  }
  return item;
});
ts.push({
  id: 'TS-10',
  scenario: "A row whose creation-time escalation was suppressed (quiet window) is correctly picked up by the EXISTING SLA sweep's selection function after its grace period",
  test_type: 'integration',
  given: 'A fixture chairman_decisions row shaped exactly like what this probe inserts (blocking:true, decision_type:session_question, status:pending, no brief_data.escalation_email_sent_at, created_at older than CHAIRMAN_BLOCKING_GRACE_MS)',
  when: 'selectBlockingSweepRows([fixtureRow], {cutoffIso, graceMs, nowMs}) is called directly (imported UNMODIFIED from scripts/cron/chairman-decision-sla-sweep.mjs)',
  then: 'The fixture row is included in the returned array -- confirming this SD\'s inserts are compatible with the existing, unmodified re-surfacing mechanism without this SD needing to reimplement it',
});
ts.push({
  id: 'TS-11',
  scenario: 'A resolved (non-pending) existing decision row does not permanently suppress a later re-fence of the same SD',
  test_type: 'unit',
  given: "A fixture SD matching all other selection criteria, with an existing chairman_decisions row naming its sd_key in brief_data.context.sd_key, but that row's status is 'approved' (not 'pending')",
  when: 'The probe runs',
  then: 'The SD IS selected as a hit and a NEW chairman_decisions row is recorded -- FR-1 AC-4',
});

const risks = [
  ...prd.risks,
  {
    risk: 'Reduced-atomicity between the population-select query and the per-hit insert/stamp steps could produce a duplicate chairman_decisions row if two probe invocations overlap (e.g. a hung prior process)',
    probability: 'LOW',
    impact: 'LOW',
    mitigation: "Accepted, not solved with a distributed lock (TR-6) -- the 24h minimum-age threshold makes genuine overlap rare given typical tick cadence, and a duplicate is self-correcting: both rows independently reach the chairman via the same rate-capped/digest-safe path, at worst a redundant but not harmful notification",
    rollback_plan: 'N/A -- no schema change; a duplicate row is a data-quality nit, not a functional regression',
  },
];

const metadata = {
  ...prd.metadata,
  plan_correction: {
    corrected_by: 'Golf-5',
    corrected_at: new Date().toISOString(),
    reason: "testing-agent (PLAN-TO-EXEC evidence 660b1078-18ae-4682-ab1d-5eda27b2d3c9) found the LEAD-corrected envelope (session_question/blocking=false) satisfies shouldAutoEscalate() (one-time creation email) but NOT isEscalationActionable() (confirmed FALSE by Golf-5's direct execution against lib/chairman/chairman-actionable.mjs, contradicting LEAD-phase validation-agent evidence fd5b1be7 which incorrectly recorded this shape as isEscalationActionable:true) -- meaning the row was invisible to the existing chairman-decision-sla-sweep.mjs re-escalation pass and adam-decision-email.mjs digest, so a quiet-window-suppressed or digest-folded creation email would leave the row permanently unsurfaced, reproducing this SD's own defect class one layer downstream. Corrected FR-2 to blocking=true (durably visible AND still fires the immediate email), which also let FR-3's bespoke throttle be REPLACED entirely by delegating to the existing, unmodified chairman-decision-sla-sweep.mjs pass 2 -- a smaller, safer design that reuses proven infrastructure instead of building novel untested throttle logic.",
    instrument_disagreement_note: "validation-agent (LEAD-phase, evidence fd5b1be7) and testing-agent (PLAN-phase, evidence 660b1078) produced CONTRADICTORY claims about isEscalationActionable() for the identical envelope shape. Resolved by direct execution (Golf-5): testing-agent's claim (false) is correct; validation-agent's evidence row contains an incorrect claim on this specific point. Recorded here per this repo's reasoning-traps discipline (when instruments disagree, verify directly rather than picking one by default).",
  },
};

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: fr, technical_requirements: tr, test_scenarios: ts, risks, metadata })
  .eq('id', PRD_ID);
if (updateErr) { console.error('PRD UPDATE ERROR:', updateErr.message); process.exit(1); }
console.log('PRD corrected:', PRD_ID, `FR=${fr.length} TR=${tr.length} TS=${ts.length} risks=${risks.length}`);

// Also correct the SD's own smoke_test_steps step 2 (unconditional escalated:true was wrong) and
// append a mechanism_verifications entry so the SD's own provenance stays accurate too.
const { data: sd, error: sdFetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('smoke_test_steps, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (sdFetchErr) { console.error('SD FETCH ERROR:', sdFetchErr.message); process.exit(1); }

const smokeTestSteps = sd.smoke_test_steps.map((step) => {
  if (step.step_number === 2) {
    return {
      ...step,
      expected_outcome: "A chairman_decisions row (decisionType='session_question', blocking=true) exists and the SD carries metadata.chairman_decision_id; the row satisfies both shouldAutoEscalate() and isEscalationActionable() so it reaches the chairman either immediately or via the next chairman-decision-sla-sweep.mjs pass; the tick prints QUIET_TICK_CHAIRMAN_GATED_UNSURFACED=1 on the run that found it and 0 after",
    };
  }
  return step;
});

const mechanismVerifications = [
  ...(sd.metadata.mechanism_verifications || []),
  {
    claim: "isEscalationActionable({decision_type:'session_question', blocking:false}) === false (contradicting validation-agent's LEAD-phase evidence, which recorded this exact shape as true); isEscalationActionable({decision_type:'session_question', blocking:true}) === true",
    verified_by: 'Golf-5 (direct node execution against lib/chairman/chairman-actionable.mjs, cross-checked with testing-agent PLAN-TO-EXEC evidence 660b1078-18ae-4682-ab1d-5eda27b2d3c9)',
    verified_at: 'lib/chairman/chairman-actionable.mjs:96-112 (isConsoleActionable, isEscalationActionable)',
    evidence_row: '660b1078-18ae-4682-ab1d-5eda27b2d3c9',
  },
  {
    claim: 'scripts/cron/chairman-decision-sla-sweep.mjs exports selectBlockingSweepRows(rows, opts) -- a pure, already-tested function selecting blocking===true + isEscalationActionable + past-grace-period + escalation_email_sent_at-unset rows for re-escalation via escalateChairmanDecision',
    verified_by: 'Golf-5 direct read',
    verified_at: 'scripts/cron/chairman-decision-sla-sweep.mjs:89-101',
    evidence_row: '660b1078-18ae-4682-ab1d-5eda27b2d3c9',
  },
];

const { error: sdUpdateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ smoke_test_steps: smokeTestSteps, metadata: { ...sd.metadata, mechanism_verifications: mechanismVerifications } })
  .eq('sd_key', SD_KEY);
if (sdUpdateErr) { console.error('SD UPDATE ERROR:', sdUpdateErr.message); process.exit(1); }
console.log('SD smoke_test_steps + mechanism_verifications corrected');
