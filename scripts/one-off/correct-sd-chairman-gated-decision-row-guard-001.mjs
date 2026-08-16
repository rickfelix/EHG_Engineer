#!/usr/bin/env node
// LEAD-phase correction for SD-LEO-INFRA-CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001.
// See validation-agent evidence row fd5b1be7-52c4-4b1c-a661-78d89245b222 (sub_agent_execution_results,
// phase LEAD-TO-PLAN) for the full investigation this correction is grounded in.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001';

const description = `DOES: (1) a probe in the Adam adherence/quiet-tick family (reuse lib/governance/... probe conventions; run from adam-quiet-tick.mjs's deliberate-check set) that selects unclaimed, non-terminal (excludes status='deferred' -- deferred means already decided, per validation-agent's live re-measurement: the original 7-SD population is exactly the non-deferred subset) SDs with metadata.requires_human_action=true AND (metadata.human_decider='chairman'/'decider' via lib/governance/human-action-decider.mjs's namedDecider() OR requires_human_action_reason matches /chairman/i -- KEEP BOTH ARMS: validation-agent measured 1 of the 8 currently-fenced rows matches only via the reason-regex arm, so namedDecider() alone is under-inclusive) AND NO metadata.chairman_decision_id AND no chairman_decisions row whose brief_data.context.sd_key or summary names the sd_key; (2) for each hit older than 24h, AUTO-RECORD a durable chairman_decisions row via lib/chairman/record-pending-decision.mjs recordPendingDecision using the SAME-DAY PROVEN-WORKING envelope (decision 1270f408-3136-4ab0-8d6b-567a0c22d171, validation-agent-verified: decisionType='session_question', blocking=false, raisedBy='adam', summary prefixed "[FENCED-SD GO/DEFER <sd_key>]", brief_data.context={sd_key, options, fenced_age, default_if_no_reply, batch, kind:'sd_unfence_go_defer'} -- kind is a semantic tag inside context, not a new decision_type, so no RPC-allowlist migration is needed; recommendation = the SD's recorded unfence_condition/Adam rec if present, else a free-text fallback, which lands in brief_data.recommendation only since the recommendation COLUMN is enum-gated to proceed/pivot/fix/kill/pause per recordPendingDecision's own check -- confirmed non-blocking, no insert error). MECHANISM CORRECTION (LEAD-phase, superseding the original draft's 'decisionType sd_unfence_go_defer... NO email burst' + 'the decision-driving sweep... unchanged, it just now has rows to drive' claims): the original draft's decisionType='sd_unfence_go_defer' fails shouldAutoEscalate() (record-pending-decision.mjs:101-104, which only fires on blocking===true OR (raisedBy==='adam' AND decisionType==='session_question')) -- that row would sit in chairman_decisions as status=pending FOREVER, invisible to isConsoleActionable/isEscalationActionable (chairman-actionable.mjs's allowlist is [chairman_approval, gate_decision] + blocking-only [escalation, okr_acceptance]) and would never populate sms_outbound_obligations. The draft's fallback plan -- a separate 'decision-driving sweep' that later picks up pending rows and serializes them one-at-a-time by SMS -- does not exist as functioning code: the away-bridge/decision-scheduler pathway (lib/comms/adam-outbound/decision-scheduler/index.js + scripts/cron/adam-decision-scheduler-tick.mjs) says of itself "isAway() is near-ALWAYS false... the tick will near-NEVER fire" and buildOwedStore sets durabilityUnavailable:true so it refuses to re-surface; the observed one-at-a-time chairman cadence is a human/prose convention (brief_data.context.serialized_after), not enforced code. Relying on it would reproduce the exact defect this SD exists to close, one table downstream. THE FIX: use the proven session_question/blocking=false/raisedBy='adam' envelope (which DOES call shouldAutoEscalate()->true and fires the real send path through the existing, already-safe QF-20260703-905 rate cap: at most RATE_CAP_MAX_EMAILS=3 standout emails/rolling-hour, remainder folds into ONE digest -- so no repeat of the 165-email flood incident is possible regardless of how many hits surface in one tick), PLUS a new throttle the probe itself owns: (2b) at most ONE new hit is allowed to auto-escalate per probe tick (the oldest unescalated hit, by SD creation/fence date) -- the rest are still durably recorded (chairman_decisions row + metadata.chairman_decision_id stamped) this tick via a path that does not trigger the escalation side effect, and become eligible to escalate on a later tick if still unresolved. This mechanizes the chairman's 2026-08-11 one-at-a-time preference with actual code instead of prose, on top of (not replacing) the existing safe rate cap. Stamp metadata.chairman_decision_id back onto the SD via lib/coordinator/safe-metadata-merge.mjs mergeMetadataKeys() (never a raw .update({metadata}) -- avoids the stale-snapshot clobber of requires_human_action that QF-20260727-858 / human-action-decider.mjs's own docblock already documents as a real recurring defect class); insert error checked -- a failed stamp is a loud QUIET_TICK_ERROR line, never a silent skip. (3) emit QUIET_TICK_CHAIRMAN_GATED_UNSURFACED=<n> when hits exist so the tick is NOT a no-op, and record a feedback row category adam_adherence_drift when the same SD is unsurfaced two probes in a row; (4) tests: fixture SD fenced to chairman with no row -> row recorded (proven-working envelope, not the inert one) + id stamped; SD with chairman_decision_id -> skipped; SD with an existing decision row naming the key -> skipped + id backfilled; stamp failure -> error line; multiple eligible hits in one tick -> only the oldest escalates (shouldAutoEscalate-observable), the rest are recorded-but-not-escalated and remain eligible next tick; a test asserting the recorded envelope actually satisfies shouldAutoEscalate() (regression guard against silently reverting to the inert shape). DOES NOT: decide anything (CONST-002); send SMS itself directly (escalation still flows through the existing sendChairmanSMS/email funnel inside recordPendingDecision -- this SD only controls WHICH row's insert is allowed to reach that path in a given tick); unfence any SD; change fence semantics; fix the separately-broken away-bridge/decision-scheduler pathway (out of scope -- that is SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-E / SD-LEO-INFRA-DECISION-RESURFACE-GUARDS-001 territory; this SD's own one-per-tick throttle makes that pathway's brokenness irrelevant to closing this loop).`;

const keyChanges = [
  {
    change: 'New probe (fence-side -> decision-side join, reusing human-action-decider.mjs\'s namedDecider() as one OR-arm) with auto-record via recordPendingDecision using the proven session_question/blocking=false/raisedBy=adam envelope (not the inert sd_unfence_go_defer shape from the original draft) + chairman_decision_id stamp via safe-metadata-merge.mjs',
    type: 'feature',
  },
  {
    change: 'Escalation throttle: at most one new hit auto-escalates per probe tick (oldest-first); remaining hits are durably recorded but not escalated this tick',
    type: 'feature',
  },
  {
    change: 'QUIET_TICK_CHAIRMAN_GATED_UNSURFACED line + adherence-drift feedback row on repeat unsurfaced hit',
    type: 'feature',
  },
  {
    change: 'Tests for record/skip/backfill/error branches + a shouldAutoEscalate() regression guard on the recorded envelope + a one-escalates-per-tick test',
    type: 'test',
  },
];

const successCriteria = [
  {
    criterion: 'Every chairman-gated unclaimed non-deferred SD older than 24h has a chairman_decisions row and metadata.chairman_decision_id',
    measure: 'probe readback: 0 hits after the first run on the live population; unit test on the fixture set',
  },
  {
    criterion: 'The condition can never be silent again',
    measure: 'quiet-tick prints QUIET_TICK_CHAIRMAN_GATED_UNSURFACED=n whenever n>0 (in the NO-OP-breaking allowlist), and a repeat hit writes an adam_adherence_drift feedback row',
  },
  {
    criterion: 'Corrected from the original draft (which specified escalated:false + reliance on a "decision-driving sweep" verified NOT to function -- see mechanism_verifications): the auto-recorded row actually reaches the chairman, at a rate the existing QF-20260703-905 cap and the chairman\'s 2026-08-11 one-at-a-time preference both tolerate',
    measure: 'recordPendingDecision result has escalated:true for exactly the oldest eligible hit per tick (shouldAutoEscalate()-observable, unit-tested); remaining hits have escalated:false this tick and are re-evaluated next tick; no tick ever produces more than RATE_CAP_MAX_EMAILS=3 standout emails (already enforced by existing code, verified not regressed)',
  },
];

const risks = [
  {
    risk: 'Implementation may not fully address root cause',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'Verify against original evidence; re-queue via /learn if pattern recurs',
  },
  {
    risk: 'The one-escalates-per-tick throttle is new logic (no existing precedent in this codebase for partial-escalate-within-a-batch); an off-by-one or wrong dedup key could either escalate nothing (reproducing the exact silence this SD fixes) or escalate everything every tick (reproducing the QF-20260703-905 flood class, though that incident is independently capped by the existing rate limiter)',
    impact: 'medium',
    likelihood: 'low',
    mitigation: 'Explicit unit test asserting exactly-one-escalates-per-tick with multiple eligible hits seeded; explicit test asserting the recorded envelope satisfies shouldAutoEscalate() as a regression guard against silently reverting to the inert sd_unfence_go_defer shape',
  },
  {
    risk: 'This SD does not fix the separately-broken away-bridge/decision-scheduler pathway (isAway() near-always false, durabilityUnavailable:true) -- that pathway remains inert for any OTHER caller that still depends on it',
    impact: 'low',
    likelihood: 'high',
    mitigation: 'Explicitly out of scope (DOES NOT); this SD\'s own one-per-tick throttle does not depend on that pathway working, so its brokenness cannot regress this fix. Flagged for a future SD if other callers need it fixed.',
  },
];

const smokeTestSteps = [
  {
    step_number: 1,
    instruction: 'Run npx vitest run tests/unit/adam/chairman-gated-decision-row-guard.test.js',
    expected_outcome: 'record / skip / backfill / stamp-error / one-escalates-per-tick / shouldAutoEscalate-regression branches all pass',
  },
  {
    step_number: 2,
    instruction: 'Seed a scratch SD with requires_human_action=true + human_decider=chairman older than 24h (fixture-marked), run the probe once',
    expected_outcome: 'A chairman_decisions row (decisionType session_question, brief_data.context.kind=sd_unfence_go_defer, escalated:true since it is the sole/oldest hit) exists and the SD carries metadata.chairman_decision_id; the tick prints QUIET_TICK_CHAIRMAN_GATED_UNSURFACED=1 on the run that found it and 0 after',
  },
  {
    step_number: 3,
    instruction: 'Seed two scratch SDs (older + newer) matching the probe criteria, run the probe once',
    expected_outcome: 'Both get chairman_decisions rows + stamped ids, but only the OLDER one has escalated:true this tick; the newer one is recorded with escalated:false and remains eligible on the next tick',
  },
];

const mechanismVerifications = [
  {
    claim: 'lib/chairman/record-pending-decision.mjs exports recordPendingDecision(supabase, {title, decisionType, context, recommendation, blocking, ventureId, lifecycleStage, raisedBy, allowFixture})',
    verified_by: 'validation-agent (LEAD-TO-PLAN)',
    verified_at: 'lib/chairman/record-pending-decision.mjs:256',
    evidence_row: 'fd5b1be7-52c4-4b1c-a661-78d89245b222',
  },
  {
    claim: "shouldAutoEscalate({decisionType, blocking, raisedBy}) returns true only if blocking===true OR (raisedBy==='adam' AND decisionType==='session_question') -- the original draft's decisionType='sd_unfence_go_defer' with blocking=false NEVER satisfies this, so that row would never auto-escalate",
    verified_by: 'Golf-5 direct read + validation-agent (LEAD-TO-PLAN)',
    verified_at: 'lib/chairman/record-pending-decision.mjs:101-104',
    evidence_row: 'fd5b1be7-52c4-4b1c-a661-78d89245b222',
  },
  {
    claim: 'The recommendation DB column is enum-gated (proceed/pivot/fix/kill/pause); a non-enum free-text recommendation is silently omitted from the column (no error) and lands in brief_data.recommendation only',
    verified_by: 'validation-agent (LEAD-TO-PLAN), confirmed against 21 live rows with free-text brief_data.recommendation + NULL recommendation column',
    verified_at: 'lib/chairman/record-pending-decision.mjs (COLUMN_RECOMMENDATIONS gate near the insert)',
    evidence_row: 'fd5b1be7-52c4-4b1c-a661-78d89245b222',
  },
  {
    claim: "The 'decision-driving sweep' the original draft claimed serializes pending rows one-at-a-time by SMS does not function: away-bridge/decision-scheduler's own header states isAway() is near-ALWAYS false so its tick will near-NEVER fire, and buildOwedStore sets durabilityUnavailable:true so it refuses to re-surface",
    verified_by: 'validation-agent (LEAD-TO-PLAN)',
    verified_at: 'lib/comms/adam-outbound/decision-scheduler/index.js + scripts/cron/adam-decision-scheduler-tick.mjs (header docstrings)',
    evidence_row: 'fd5b1be7-52c4-4b1c-a661-78d89245b222',
  },
  {
    claim: 'QF-20260703-905 rate cap already limits standout emails to RATE_CAP_MAX_EMAILS=3/rolling-hour with the remainder folded into one digest -- an all-hits-escalate-at-once tick cannot repeat the 165-email flood incident',
    verified_by: 'Golf-5 direct read',
    verified_at: 'lib/chairman/record-pending-decision.mjs:119-131 (getEscalationWindowCounts + RATE_CAP_MAX_EMAILS)',
    evidence_row: 'fd5b1be7-52c4-4b1c-a661-78d89245b222',
  },
  {
    claim: 'lib/governance/human-action-decider.mjs exports namedDecider(metadata) checking DECIDER_KEYS=[human_decider, decider]; measured under-inclusive alone (1 of 8 live fenced rows matches only via the requires_human_action_reason regex arm) -- keep both OR-arms',
    verified_by: 'validation-agent (LEAD-TO-PLAN)',
    verified_at: 'lib/governance/human-action-decider.mjs:29-45',
    evidence_row: 'fd5b1be7-52c4-4b1c-a661-78d89245b222',
  },
  {
    claim: 'The proven-working same-day precedent (decision 1270f408-3136-4ab0-8d6b-567a0c22d171) used decisionType=session_question, blocking=false, raised_by=adam, summary prefixed "[FENCED-SD GO/DEFER <sd_key>]", brief_data.context={sd_key, options, fenced_age, default_if_no_reply, batch}, and produced a delivered SMS obligation',
    verified_by: 'validation-agent (LEAD-TO-PLAN), read directly from the live chairman_decisions row',
    verified_at: 'chairman_decisions row id=1270f408-3136-4ab0-8d6b-567a0c22d171',
    evidence_row: 'fd5b1be7-52c4-4b1c-a661-78d89245b222',
  },
];

const estimatedLocBasis = 'probe ~50 (incl. namedDecider reuse + deferred-exclusion), proven-envelope + safe-metadata-merge stamp wiring ~25, one-escalates-per-tick throttle ~25, tick line + feedback row ~10, tests (incl. shouldAutoEscalate regression guard + one-per-tick test) ~65 = ~175. Bumped from the original draft\'s 120 to reflect the corrected mechanism\'s real cost -- the throttle and its tests are net-new work the original (inert) design did not need.';

const { data: current, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('FETCH ERROR:', fetchErr.message); process.exit(1); }

const newMetadata = {
  ...current.metadata,
  mechanism_verifications: mechanismVerifications,
  estimated_loc: 175,
  estimated_loc_basis: estimatedLocBasis,
  lead_correction: {
    corrected_by: 'Golf-5',
    corrected_at: new Date().toISOString(),
    reason: 'validation-agent (LEAD-TO-PLAN evidence fd5b1be7-52c4-4b1c-a661-78d89245b222) found the original draft\'s proposed decisionType=sd_unfence_go_defer never satisfies shouldAutoEscalate(), and the draft\'s fallback dependency (a separate "decision-driving sweep") does not function -- the guard as originally specified would have moved the invisibility one table downstream instead of closing it. Corrected to the proven-working session_question envelope + a new one-escalates-per-tick throttle owned by this SD\'s own probe.',
  },
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    description,
    scope: description,
    key_changes: keyChanges,
    success_criteria: successCriteria,
    risks,
    smoke_test_steps: smokeTestSteps,
    metadata: newMetadata,
  })
  .eq('sd_key', SD_KEY);

if (updateErr) { console.error('UPDATE ERROR:', updateErr.message); process.exit(1); }
console.log('SD corrected successfully:', SD_KEY);
