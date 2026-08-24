#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-COMMS-LANE-TTLS-001';

// LEAD-phase VALIDATION (evidence 74c605e7) found real, non-scope-changing corrections:
// (1) FR-1's registry home should be lib/coordination/lane-contract.cjs (already the
//     payload.kind-keyed module) -- NOT lib/governance/gauge-registry.js, which would create
//     a second lane-keyed representation. FR-1 is also a RE-KEYING of the existing per-message
//     deadline machinery in lib/coordinator/reply-class.cjs (reply_class/reply_expected_by/
//     computeReplyExpectedBy/findOverdueReplyNeeded), not greenfield.
// (2) FR-2's ladder-paging path is PARTLY already built (lib/escalation/inbox-sla.js already
//     watches for overdue inbox rows and feeds the ladder) -- the genuinely novel piece is the
//     PAGING DIRECTION: this SD pages the SENDER's successor/owner, not the target/recipient.
// (3) The SD's own stated 62%/100% baseline does NOT reproduce against live session_coordination
//     (measured 45.8% for coordinator_directive) because cleanup_expired_coordination() deletes
//     answered rows preferentially -- the live table is 10.1% of all-time volume, survivorship-
//     biased. coordination_receipts (lane/state/disposition/is_retention/source_age_ms) is the
//     durable, retention-immune source. dispatch_suggestion's 100% is a structural artifact: that
//     kind is in no DRAIN_SET/DIRECTIVE_KINDS/INFORMATIONAL_KINDS bucket, so read_at IS NULL is
//     guaranteed by construction, not evidence of failed delivery.
// (4) FR-1's expired-unread stamp must be payload-only (never write acknowledged_at/read_at,
//     which would arm the purge or start an unrelated 7-day clock) -- mirror dead-letter-drain.js's
//     buildStampPatch()/isPurgeEligible() pattern.
// None of this changes WHAT the 3 FRs are; only WHERE to build them and how to state the
// baseline honestly. Per CLAUDE_LEAD.md's scope-lock rule, this is exactly what a validation-
// informed lock looks like, not a redesign requiring escalation.

const key_changes = [
  { change: 'FR-1: lane-TTL registry keyed by payload.kind (directive/advisory/reply/suggestion), homed in lib/coordination/lane-contract.cjs (already the payload.kind-keyed module -- confirmed by LEAD-phase VALIDATION, evidence 74c605e7) rather than a second lane-keyed representation. This is a RE-KEYING of the existing per-message deadline machinery already shipped in lib/coordinator/reply-class.cjs (payload.reply_class, payload.reply_expected_by, computeReplyExpectedBy(), findOverdueReplyNeeded()) from its current 3-value reply_class axis to the 4-lane payload.kind axis -- not a greenfield registry.', type: 'feature' },
  { change: 'FR-1: on TTL expiry, stamp the session_coordination row expired-unread via a PAYLOAD-ONLY marker (e.g. payload.dead_letter_reason=\'ttl_expired_unread\') -- never write acknowledged_at or read_at, which would arm cleanup_expired_coordination()\'s purge or start an unrelated 7-day clock this module does not own. Mirror lib/coordination/dead-letter-drain.js\'s buildStampPatch()/isPurgeEligible() pattern, which deliberately writes no timestamp column for exactly this reason.', type: 'feature' },
  { change: 'FR-2: dead-letter alarm paging the SENDER\'s successor/owner (not the target/recipient) when a lane\'s unread-past-TTL count breaches a threshold, via a surface OTHER than session_coordination. lib/escalation/inbox-sla.js already watches overdue inbox rows and feeds lib/periodic-liveness/ladder-escalation.mjs (the ladder) -- FR-2\'s genuinely novel piece is the paging DIRECTION (sender-side, not recipient-side); pin this explicitly in the PRD\'s acceptance criteria so it is not silently absorbed into the existing recipient-side watcher. scripts/coordinator-quiet-tick.mjs and the sms_outbound_obligations table remain the other two available different-surface paging options.', type: 'feature' },
  { change: 'FR-3: per-lane dead-letter gauge/metric, sourced from coordination_receipts (lane/state/disposition/is_retention/source_age_ms) rather than the live, retention-pruned session_coordination table -- LEAD-phase VALIDATION (74c605e7) found the SD\'s originally-stated 62%/100% baseline does NOT reproduce against the live table (measured 45.8% for coordinator_directive; the live table is only 10.1% of all-time volume due to cleanup_expired_coordination() preferentially deleting answered rows, a survivorship bias) and that dispatch_suggestion\'s 100% figure is a structural classification artifact (that kind is in no DRAIN_SET/DIRECTIVE_KINDS/INFORMATIONAL_KINDS bucket, so read_at IS NULL is guaranteed by construction). PLAN must re-measure the baseline via coordination_receipts before locking a numeric target -- do not carry the unverified 62%/100% figures forward as ground truth.', type: 'feature' },
];

const risks = [
  { risk: 'A miscalibrated dead-letter threshold could produce alarm noise (false pages) or, if set too high, could fail to page on a genuine dead-letter spike.', mitigation: 'Start with a conservative threshold informed by the RE-MEASURED (coordination_receipts-sourced, not the unverified 62%/100%) baseline; land the alarm observe-only (log/gauge only, no paging) for an initial soak before enabling live paging, mirroring this codebase\'s existing default-OFF-flag pattern (e.g. PATH_INTEGRITY_EXIT_GATE_ENFORCE).' },
  { risk: 'FR-2\'s hard "different surface" constraint is easy to violate by accident -- e.g. an implementation that pages by writing a NEW session_coordination row would silently fail the constraint while looking correct.', mitigation: 'A negative test asserting the alarm event lands OUTSIDE session_coordination is a first-class acceptance criterion (already specified in the SD\'s own success criteria), not an optional nice-to-have -- PLAN must carry it into the PRD as a blocking test, not an informational one.' },
  { risk: 'Overlap/confusion with the EXISTING, differently-scoped dead-letter machinery (lib/coordination/dead-letter-drain.js, which stamps payload.dead_letter=true for rows targeting DEAD/GONE sessions -- an orphan-detection class, not this SD\'s unread-past-TTL-to-a-LIVE-recipient class) could lead to a naming collision or accidental double-counting in the gauge.', mitigation: 'Use a distinct payload marker key for this SD\'s expired-unread state (not payload.dead_letter, which is already owned by the orphan-detection sweep) and have FR-3\'s gauge explicitly exclude/label rows already marked by the orphan-detection path.' },
  { risk: 'FR-1\'s expired-unread stamp could accidentally write acknowledged_at or read_at (the two columns cleanup_expired_coordination() keys its purge eligibility on), silently deleting the exact evidence FR-1 exists to preserve.', mitigation: 'Copy lib/coordination/dead-letter-drain.js\'s buildStampPatch()/isPurgeEligible() pattern verbatim (payload-only mutation, zero timestamp-column writes) rather than hand-rolling a new stamp function; add a regression test asserting a stamped row survives a cleanup_expired_coordination() pass.' },
  { risk: 'lib/escalation/inbox-sla.js already ladder-escalates overdue inbox rows from the RECIPIENT side; if FR-2 is built without explicitly distinguishing its sender-successor-paging direction, it risks being silently absorbed into or confused with the existing recipient-side watcher, leaving the sender-side gap (this SD\'s actual target) unaddressed.', mitigation: 'PRD acceptance criteria must explicitly test the paging DIRECTION (who gets paged: the sender\'s successor/owner, not the message target), not just that "an alarm fires somewhere outside session_coordination".' },
];

const success_criteria = [
  { criterion: 'TTL registry merged into lib/coordination/lane-contract.cjs, one entry per payload.kind lane; expired-unread stamping live and payload-only (verified to survive a cleanup_expired_coordination() pass).', measure: 'Code review + regression test asserting a stamped row is not purged by cleanup_expired_coordination().' },
  { criterion: 'Negative test: an alarm fires on a synthetic breached lane and lands on a surface OUTSIDE session_coordination, and specifically pages the SENDER\'s successor/owner (not the message target).', measure: 'Automated test asserting both the surface (not a new session_coordination row) and the paging direction (sender-side).' },
  { criterion: '30-day re-measure of the per-lane dead-letter rate, sourced from coordination_receipts (not the live session_coordination table), against a baseline PLAN records at PRD time via the SAME coordination_receipts-based measurement method -- not the SD\'s originally-stated, since-disproven 62%/100% figures.', measure: 'coordination_receipts query comparing pre-fix and post-fix 30-day windows, using an identical lane/state/disposition filter both times.' },
];

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr || !sd) { console.error('READ ERR', readErr?.message); process.exit(1); }

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ key_changes, risks, success_criteria })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERR', writeErr.message); process.exit(1); }
console.log('VALIDATION-informed corrections written for SD', sd.id);
