#!/usr/bin/env node
/**
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 -- LEAD-phase enrichment.
 *
 * The mint-time plan_content (Adam-authored, coordinator-ratified) was substantially TRUE but
 * overstated the void: a thin signal-ack mechanism (coordinator-ack-signal.cjs + receipt-ledger.cjs)
 * already exists, and the "162-row backlog" is a snapshot of a single remediation event, not a
 * live count (now 262 open: 109 never-touched + 153 hand-stamped-but-structurally-open, with
 * hand-stamping still ongoing as of this enrichment). Corrected via an Explore premise-verification
 * pass before EXEC scoping. See metadata.mechanism_verifications for the cited evidence.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-SIGNAL-LANE-PER-001';

const scope = `Signal-lane per-item disposition machinery, EXTENDING (not replacing) the existing thin ack mechanism.

## FR-1: Disposition writer extending coordinator-ack-signal.cjs + receipt-ledger.cjs
A signal-lane disposition vocabulary (actioned / promoted / duplicate-of / rejected-with-reason / deferred-with-trigger) stamped via a single canonical writer, mirroring coordinator-ack-adam.cjs's contract shape (ack retires the row via acknowledged_at; disposition is a separate, mandatory-linkage-checked stage; deferred requires a trigger). This is an EXTENSION of scripts/coordinator-ack-signal.cjs + lib/coordination/receipt-ledger.cjs, not a parallel mechanism -- a second, conflicting disposition writer would recreate the exact "drained visually, still open" defect this SD exists to close. Writer identity recorded (never a hand-stamp).

## FR-2: Coordinator inbox surfaces undispositioned signal age
Oldest-first undispositioned-signal age surfaced at the coordinator tick (fleet-dashboard.cjs's existing acknowledged_at IS NULL gate is the correct retirement signal to build on).

## FR-3: Backfill path for the current open signal population, DYNAMIC not a frozen count
The "162-row" figure named in the mint plan was a snapshot of one 2026-08-23T18:48:15Z remediation event and is already stale (262 open as of LEAD enrichment: 109 rows with acknowledged_at NULL and no payload.disposition at all, PLUS 153 rows carrying a hand-stamped payload.disposition while acknowledged_at is still NULL -- i.e. dispositioned-looking but structurally still open by the only mechanism the codebase actually checks). Manual hand-stamping is confirmed STILL ONGOING (5 more hand-stamps landed after the original batch, at 22:46:17Z and 01:41:25Z) -- the backfill must query live at run time, not target a hardcoded row count, and must canonicalize the 153 already-hand-stamped rows (retroactive writer-identity backfill) rather than only handling the 109 untouched ones.

## FR-4: SIGNAL_RESOLVED notify-back loop widened beyond the promotion-only path
The existing SIGNAL_RESOLVED loop (stale-session-sweep.cjs runCoordinatorHousekeeping) fires ONLY when payload.routed_to_sd_key is set, which is stamped ONLY when an aggregated/promoted feedback row (3+ same-fingerprint) becomes an SD (scripts/sd-from-feedback.js). A lone signal that receives an individual disposition (FR-1, never promoted) has NO path into this notify-back loop today. FR-4 must widen the trigger surface to also fire on a per-item terminal disposition, not just rename the field it keys off.

## Out of scope
Changing the aggregation/promotion threshold (lib/coordinator/signal-router.cjs's THRESHOLD=3/WINDOW_MIN=60); the /signal CLI's send side (scripts/worker-signal.cjs); stampRouted()'s deliberate non-disposing-on-promotion design (a prior fix for 9 critical signals silently vanishing -- do not reintroduce that regression by disposing a row purely because it was promoted).`;

const description = `Signal-lane per-item disposition machinery.

Provenance: Coordinator<->Adam review cycle 5b3ed68a (2026-08-23) -- the cycle's DOMINANT measured friction: /signal rows have no per-item disposition machinery, so a validated falsified-premise escalation (signal 26318f2b) sat undispositioned for ~4.4h; remediation required a manual batch (6 individually-authored dispositions + ~150 generic-text rows stamped in one mass UPDATE at 2026-08-23T18:48:15Z). Ranked #1 of seven by Adam (measured-harm order), rank accepted by coordinator, trigger fired 2026-08-23T22:47Z.

LEAD-phase correction (Explore premise-verification pass, 2026-08-24): the mint plan's "nothing mirrors coordinator-ack-adam's contract" framing overstated the void -- a thin signal-ack mechanism (coordinator-ack-signal.cjs + receipt-ledger.cjs) already exists and must be extended, not duplicated. The "162-row backlog" is a stale snapshot of the one remediation event (262 open now, hand-stamping still ongoing). See scope for the corrected FR-1..FR-4 framing and metadata.mechanism_verifications for cited evidence.`;

const key_changes = [
  { change: 'Extend scripts/coordinator-ack-signal.cjs + lib/coordination/receipt-ledger.cjs with a 5-value signal-lane disposition vocabulary (actioned/promoted/duplicate-of/rejected-with-reason/deferred-with-trigger), mandatory-linkage + defer-trigger checks mirroring coordinator-ack-adam.cjs, single canonical writer (no hand-stamps).', type: 'feature' },
  { change: 'Surface oldest-first undispositioned signal age at the coordinator tick, built on fleet-dashboard.cjs\'s existing acknowledged_at IS NULL retirement gate.', type: 'feature' },
  { change: 'Live-queried backfill (not a hardcoded row count) that canonicalizes the 153 already-hand-stamped-but-structurally-open rows via retroactive writer-identity attribution, plus the 109 never-touched rows.', type: 'fix' },
  { change: 'Widen stale-session-sweep.cjs\'s SIGNAL_RESOLVED notify-back loop to also fire on a per-item terminal disposition, not only the promotion-derived routed_to_sd_key path.', type: 'fix' },
];

const strategic_objectives = [
  'Close the structural gap where a signal row can look dispositioned (payload.disposition present) while remaining open by the only mechanism the codebase actually checks (acknowledged_at), reproduced live on 153 current rows including the named falsified-premise specimen (signal 26318f2b).',
  'Extend the existing thin ack/disposition machinery (coordinator-ack-signal.cjs, receipt-ledger.cjs) rather than build a second, conflicting mechanism -- avoiding the exact class of drift this SD exists to remove.',
  'Give lone (non-promoted) dispositioned signals a path into the SIGNAL_RESOLVED notify-back loop, which today only reaches workers whose signal was aggregated into a promoted SD.',
];

const risks = [
  {
    risk: 'A second, parallel disposition-writer mechanism could be built alongside coordinator-ack-signal.cjs/receipt-ledger.cjs instead of extending them, recreating the "drained visually, still open" defect one layer deeper.',
    impact: 'high',
    likelihood: 'medium',
    mitigation: 'FR-1 explicitly scoped as an extension; PLAN-phase PRD must cite the existing files as the extension target, not a greenfield design.',
  },
  {
    risk: 'Manual hand-stamping of payload.disposition is confirmed still ongoing (5 more since the original 2026-08-23T18:48:15Z batch) -- a backfill script targeting a frozen row count or ID list could miss newly-hand-stamped rows landing between authoring and EXEC, or double-process rows already canonicalized by a concurrent session.',
    impact: 'medium',
    likelihood: 'medium',
    mitigation: 'FR-3 backfill queries live at run time (acknowledged_at IS NULL, regardless of payload.disposition presence) rather than a fixed row-id list; idempotent re-run safe.',
  },
  {
    risk: 'Widening SIGNAL_RESOLVED to fire on per-item disposition could regress stampRouted()\'s deliberate non-disposing-on-promotion design (a prior fix for 9 critical signals silently vanishing from fleet view) if the widened trigger accidentally also fires on promotion alone.',
    impact: 'high',
    likelihood: 'low',
    mitigation: 'FR-4 must key strictly off the new per-item disposition field, never off promotion/routed_to_sd_key alone; regression test asserting a promoted-but-undispositioned signal does NOT fire SIGNAL_RESOLVED.',
  },
];

const success_criteria = [
  { criterion: 'A signal row cannot sit >SLA (coordinator-set) without either a disposition or an explicit surfaced-overdue line at the coordinator tick.', measure: 'FR-2 dashboard surfaces oldest-first undispositioned age; a fixture row past SLA appears in the surfaced list.' },
  { criterion: 'Negative test: hand-stamping a disposition outside the writer is detectable (writer identity recorded).', measure: 'A payload.disposition value written by any path other than the canonical writer fails a dedicated detection test (writer identity field absent/mismatched).' },
  { criterion: 'The 26318f2b-class replay: a critical signal reaches dispositioned state within one coordinator tick cycle in fixture.', measure: 'Fixture test: inject a critical severity signal, run one tick, assert acknowledged_at + disposition both set by the extended coordinator-ack-signal.cjs path.' },
];

const smoke_test_steps = [
  { step: 1, instruction: 'Run the FR-1 disposition writer against a fixture signal row and confirm it stamps BOTH acknowledged_at (via the existing coordinator-ack-signal.cjs mechanism) AND a canonical disposition value with writer identity -- not a payload.disposition hand-stamp.', expected_outcome: 'Row transitions from open to genuinely closed by the acknowledged_at IS NULL check fleet-dashboard.cjs already uses.' },
  { step: 2, instruction: 'Query live session_coordination for signal-lane rows and confirm the FR-3 backfill script processes both the never-touched rows AND the already-hand-stamped-but-open rows, live-queried (not a hardcoded ID list).', expected_outcome: 'Zero signal-lane rows remain with acknowledged_at NULL after backfill; each backfilled row records writer identity distinguishing it from a hand-stamp.' },
  { step: 3, instruction: 'Dispose a lone (non-promoted) fixture signal via the FR-1 writer and run the FR-4-widened SIGNAL_RESOLVED check.', expected_outcome: 'The sender receives a SIGNAL_RESOLVED notification even though no routed_to_sd_key/promotion ever occurred.' },
  { step: 4, instruction: 'Promote a fixture signal via the existing aggregation path (3+ same-fingerprint) WITHOUT giving it an individual disposition, then run the FR-4-widened SIGNAL_RESOLVED check.', expected_outcome: 'No SIGNAL_RESOLVED fires from promotion alone -- regression guard against reintroducing the prior "critical signals silently vanish" defect.' },
];

const mechanism_verifications = [
  { claim: 'coordinator-ack-signal.cjs stamps acknowledged_at as the sole retirement action for a signal row', verified_by: 'Explore premise-verification pass', verified_at: 'scripts/coordinator-ack-signal.cjs:77-84 (acknowledged_at stamp on --advisory)', reproduction: 'Read the function body directly; confirmed acknowledged_at is the only field this script writes that fleet-dashboard.cjs checks.' },
  { claim: 'receipt-ledger.cjs already has a 3-value disposition enum (ACTIONED/DECLINED/SUPERSEDED) written to a separate ledger, not onto session_coordination.payload', verified_by: 'Explore premise-verification pass', verified_at: 'lib/coordination/receipt-ledger.cjs:70-74 (DISPOSITIONS enum)', reproduction: 'Read the enum definition and its write target directly.' },
  { claim: 'coordinator-ack-adam.cjs implements the ack-then-separate-disposition contract shape being mirrored, with a 4-value vocabulary (accepted/rejected/partial/deferred), mandatory outcome-ref linkage, and a required defer-trigger', verified_by: 'Explore premise-verification pass', verified_at: 'scripts/coordinator-ack-adam.cjs:509-528 (actioned_at stamp), :55 (VALID_DISPOSITIONS), :226-248 (LINKAGE_REQUIRED_DISPOSITIONS/resolveOutcomeRef), :285-287 (defer-trigger requirement)', reproduction: 'Read all four cited code regions directly.' },
  { claim: 'Signal aggregation (3+ same-fingerprint within 60min -> feedback promotion) already exists, is wired into the live sweep, and deliberately does NOT stamp acknowledged_at on promotion', verified_by: 'Explore premise-verification pass', verified_at: 'lib/coordinator/signal-router.cjs:35-36 (THRESHOLD/WINDOW_MIN), :108-111 (shouldPromote), :281-335 (aggregateSignals), :256-279 (stampRouted, documented non-disposing-by-design after a prior regression); called from lib/sweep/passes/coordination-detectors.cjs:21', reproduction: 'Read the cited functions and confirmed the call site is invoked every stale-session-sweep.cjs tick.' },
  { claim: 'A SIGNAL_RESOLVED notify-back loop exists but fires only via the promotion-derived routed_to_sd_key path, never for a lone individually-dispositioned signal', verified_by: 'Explore premise-verification pass', verified_at: 'scripts/stale-session-sweep.cjs:1945-2026 (runCoordinatorHousekeeping, routed_to_sd_key gate at :1955-1960); routed_to_sd_key stamped only by scripts/sd-from-feedback.js:386-394 on promotion; consumed by scripts/worker-checkin.cjs:498-506 and scripts/hooks/coordination-inbox.cjs:177-184', reproduction: 'Read the cited functions and traced the routed_to_sd_key write/read path end to end.' },
  { claim: 'session_coordination has no disposition or terminal-state column beyond the binary acknowledged_at, and the canonical /signal writer never sets a payload.disposition key', verified_by: 'Explore premise-verification pass', verified_at: 'supabase/ehg_engineer/migrations/20260309_session_coordination.sql (column list); scripts/worker-signal.cjs:691-701 (canonical payload keys)', reproduction: 'Read the migration schema and the writer\'s payload-construction code directly.' },
  { claim: '153 signal-lane rows currently carry a hand-written payload.disposition while acknowledged_at is still NULL (dispositioned-looking but structurally open); 109 more are untouched by any mechanism; manual hand-stamping continued after the original 2026-08-23T18:48:15Z remediation batch', verified_by: 'Explore premise-verification pass', verified_at: 'Direct live query against session_coordination, 2026-08-24 (counts: 275 total signal-lane rows, 262 open, 153 hand-stamped-but-open, 109 never-touched, 5 additional hand-stamps at 22:46:17Z and 01:41:25Z after the 18:48:15Z batch)', reproduction: 'Re-run the same query against session_coordination filtering payload.signal_type IS NOT NULL, grouped by acknowledged_at IS NULL and payload.disposition presence.' },
];

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr || !sd) { console.error('READ ERR', readErr?.message); process.exit(1); }

const newMetadata = {
  ...sd.metadata,
  mechanism_verifications,
  lead_enrichment: {
    performed_at: new Date().toISOString(),
    performed_by: 'fleet worker (session c29c1952-8d10-4a11-a71e-5ca637c41106), LEAD role',
    method: 'Explore agent premise-verification pass against live code + DB before scoping FRs',
    correction_summary: 'Mint plan_content was substantially true but overstated the void (a thin ack mechanism already exists, must be extended not duplicated) and used a stale frozen row count (162 -> now 262 open, hand-stamping still ongoing). Scope/key_changes/risks/success_criteria/smoke_test_steps corrected accordingly.',
  },
};

const { error: updErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    description,
    scope,
    key_changes,
    strategic_objectives,
    risks,
    success_criteria,
    smoke_test_steps,
    metadata: newMetadata,
  })
  .eq('id', sd.id);
if (updErr) { console.error('WRITE ERR', updErr.message); process.exit(1); }
console.log('OK: SD enriched for', sd.id);
