#!/usr/bin/env node
/**
 * coordinator-ack-adam.cjs — coordinator-side two-stage ACK for Adam advisories.
 * SD-LEO-INFRA-RESILIENT-SYMMETRIC-ADAM-001 (FR-2).
 *
 * `--advisory <id>` stamps payload.actioned_at on the original advisory — the ONLY thing
 * that retires it (mirrors the read_at=DELIVERED / actioned_at=ACTIONED model in
 * lib/coordinator/adam-action-ack.cjs). Optional `--reply "<body>"` ALSO writes a
 * coordinator_reply row targeting the advisory's Adam sender_session + correlation_id,
 * reusing scripts/coordinator-reply.cjs sendCoordinatorReply — no hand-rolled insert, no
 * invented payload.kind. The --reply leg is gated behind COORDINATOR_TWOWAY_V2=on; the
 * ack-stamp works regardless.
 *
 * `--disposition <accepted|rejected|partial|deferred>` records the coordinator's/chairman's decision
 * on the advisory into solomon_advice_outcome_ledger (SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001,
 * FR-3; 'deferred' + tail-inheritance added by SD-LEO-FIX-SOLOMON-RECOMMENDATION-GUARDRAIL-001),
 * keyed on the advisory's payload.correlation_id (or the explicit --correlation-id override).
 * Idempotent (ON CONFLICT correlation_id DO UPDATE — re-running never duplicates a row). Fail-open:
 * a ledger write failure is logged but never blocks the advisory ack/retire above.
 *
 * MANDATORY OUTCOME LINKAGE (SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001, W2/FR-3): an
 * `--disposition accepted|partial` MUST name its tracking artifact via `--outcome-ref <SD/QF/PR/issue/commit id>`
 * OR carry `--no-artifact "<reason>"` (the explicit no-trackable-artifact marker). An accept with
 * neither is REJECTED before any ledger write — an unfalsifiable accept (no linkage a later
 * revert/red-merge/RCA can back-propagate a negative outcome onto) is exactly the disease this closes.
 * decision_at is always the real current time (contemporaneous-only; there is no backfill path here).
 *   node scripts/coordinator-ack-adam.cjs --advisory <id> --disposition accepted --outcome-ref SD-FOO-001
 *   node scripts/coordinator-ack-adam.cjs --advisory <id> --disposition accepted --no-artifact "verbal chairman ack"
 *
 * `--disposition deferred` REQUIRES `--defer-trigger "<named re-fire event>"` — a deferral without a
 * named trigger is rejected before any DB write (the DB's own CHECK constraint is a second line of
 * defense once database/migrations/20260705_solomon_ledger_tail_and_deferral.sql is chairman-applied).
 *
 * TAIL-INHERITANCE (SD-LEO-FIX-SOLOMON-RECOMMENDATION-GUARDRAIL-001, FR-4): after a primary row's
 * decision is stamped, any still-pending rows whose parent_correlation_id references this
 * correlation_id inherit the identical decision/decision_by/decision_at — closes the class where a
 * multi-part advisory's sub-recommendations rotted at 'pending' forever once only the first part
 * was ever stamped. Requires the FR-3 migration to be chairman-applied; degrades to a no-op tail
 * count (never an error) if the parent_correlation_id column does not exist yet.
 *
 * Usage:
 *   node scripts/coordinator-ack-adam.cjs --advisory <id>
 *   node scripts/coordinator-ack-adam.cjs --advisory <id> --reply "<reply body>"
 *   node scripts/coordinator-ack-adam.cjs --advisory <id> --disposition accepted [--correlation-id <id>]
 *   node scripts/coordinator-ack-adam.cjs --advisory <id> --disposition deferred --defer-trigger "next chairman weekly review"
 */
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { isTwoWayV2Enabled } = require('../lib/coordinator/resolve.cjs');
const { isFullUuid } = require('../lib/coordinator/dispatch.cjs');
const { fetchAdvisory, resolveGroupForAdvisory, stampActionedGroup } = require('../lib/coordinator/adam-advisory-store.cjs');
const { sendCoordinatorReply } = require('./coordinator-reply.cjs');
const { resolveAdamReplyTarget, retargetStaleAdamInbound, verifyReplyDelivered } = require('../lib/coordinator/adam-identity.cjs');

const VALID_DISPOSITIONS = Object.freeze(['accepted', 'rejected', 'partial', 'deferred']);

// FR-3 (SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001, W2): an ADOPT-class decision (accepted/partial)
// on the ledger must name its tracking artifact (outcome_ref) OR carry this explicit no-artifact
// marker. A decision with neither is unfalsifiable — there is no linkage a later revert/red-merge/RCA
// (FR-4) can back-propagate a NEGATIVE outcome onto. The marker is stored durably in outcome_ref; a
// NO_ARTIFACT-prefixed ref is deliberately never matchable by the FR-4 back-prop (nothing to track).
const NO_ARTIFACT_MARKER = 'NO_ARTIFACT';
const LINKAGE_REQUIRED_DISPOSITIONS = Object.freeze(['accepted', 'partial']);

/** True for the durable no-artifact sentinel (bare 'NO_ARTIFACT' or 'NO_ARTIFACT: <reason>'). */
function isNoArtifactRef(ref) {
  return typeof ref === 'string' && (ref === NO_ARTIFACT_MARKER || ref.startsWith(`${NO_ARTIFACT_MARKER}:`));
}

/**
 * Pure: resolve the outcome_ref to store for a decision, enforcing FR-3 mandatory linkage.
 * - accepted/partial: MUST supply a non-empty outcomeRef OR noArtifact — else { error }.
 *   noArtifact may be `true` (bare --no-artifact) or a string reason (stored as 'NO_ARTIFACT: <reason>').
 * - rejected/deferred: outcome_ref is optional (a stray outcomeRef is still recorded; none is fine).
 * Returns { ref } (string|null) on success, or { error } when linkage is mandatory and missing.
 * Exported for tests.
 */
function resolveOutcomeRef(disposition, { outcomeRef = null, noArtifact = null } = {}) {
  const cleanRef = typeof outcomeRef === 'string' ? outcomeRef.trim() : (outcomeRef ? String(outcomeRef).trim() : '');
  if (LINKAGE_REQUIRED_DISPOSITIONS.includes(disposition)) {
    if (cleanRef) return { ref: cleanRef };
    if (noArtifact) {
      const reason = typeof noArtifact === 'string' && noArtifact.trim() ? noArtifact.trim() : '';
      return { ref: reason ? `${NO_ARTIFACT_MARKER}: ${reason}` : NO_ARTIFACT_MARKER };
    }
    return { error: `disposition=${disposition} requires --outcome-ref <artifact-id> OR --no-artifact "<reason>" (mandatory outcome linkage, FR-3)` };
  }
  return { ref: cleanRef || null };
}

/**
 * Fail-open: stamp the identical decision onto any still-pending tail rows referencing
 * `correlationId` via parent_correlation_id. Never throws — returns the count inherited (0 on any
 * error, including "column does not exist yet" for a not-yet-chairman-applied migration).
 */
async function inheritTailDecisions(supabase, { correlationId, disposition, decidedBy, decisionAt, deferTrigger, outcomeRef }) {
  try {
    const patch = { decision: disposition, decision_by: decidedBy || null, decision_at: decisionAt };
    // A deferred primary's tails must carry the SAME defer_trigger, or the DB's
    // defer_trigger_required CHECK would reject the tail update once the migration is applied.
    if (disposition === 'deferred') patch.defer_trigger = deferTrigger;
    // FR-3: tails of an adopt-class decision inherit the primary's outcome_ref too, so a later
    // negative outcome back-propagates onto the whole advisory group (parent + sub-recommendations).
    if (outcomeRef) patch.outcome_ref = outcomeRef;
    const { data, error } = await supabase
      .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — chairman-apply-gated table, not yet in the live snapshot
      .update(patch)
      .eq('parent_correlation_id', correlationId)
      .eq('decision', 'pending')
      .select('id');
    if (error) return { inherited: 0, reason: error.message };
    return { inherited: (data || []).length };
  } catch (e) {
    return { inherited: 0, reason: (e && e.message) || String(e) };
  }
}

/**
 * Fail-open: record a coordinator/chairman decision into solomon_advice_outcome_ledger, keyed on
 * correlation_id (idempotent upsert), then inherit that same decision onto any pending tail rows
 * (FR-4). Never throws — returns { recorded, reason, tailsInherited }. Exported for tests.
 */
async function recordLedgerDecision(supabase, { correlationId, disposition, decidedBy, deferTrigger, outcomeRef = null, noArtifact = null }) {
  if (!correlationId) return { recorded: false, reason: 'no correlation_id' };
  if (!VALID_DISPOSITIONS.includes(disposition)) return { recorded: false, reason: `invalid disposition: ${disposition}` };
  if (disposition === 'deferred' && !deferTrigger) {
    return { recorded: false, reason: 'disposition=deferred requires --defer-trigger (a named re-fire event)' };
  }
  // FR-3: mandatory outcome linkage at accept time. An accepted/partial decision with neither an
  // outcome_ref nor an explicit no-artifact marker is REJECTED before any DB write (never a silent,
  // unfalsifiable accept). Resolution is deterministic; the marker is stored durably in outcome_ref.
  const refResult = resolveOutcomeRef(disposition, { outcomeRef, noArtifact });
  if (refResult.error) return { recorded: false, reason: refResult.error };
  const resolvedOutcomeRef = refResult.ref;
  // FR-3 contemporaneous guarantee: decision_at is ALWAYS the real current time. This writer has no
  // backfill path — a caller cannot inject a historical decision_at, so every new stamp is
  // contemporaneous by construction (the exact opposite of the 2026-07-12 retro batch).
  const decisionAt = new Date().toISOString();
  try {
    const row = {
      correlation_id: correlationId,
      decision: disposition,
      decision_by: decidedBy || null,
      decision_at: decisionAt,
    };
    if (resolvedOutcomeRef) row.outcome_ref = resolvedOutcomeRef;
    if (disposition === 'deferred') row.defer_trigger = deferTrigger;
    const { error } = await supabase
      .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — new table (this PR's migration), chairman-apply-gated, not yet in the live snapshot
      .upsert(row, { onConflict: 'correlation_id' });
    if (error) return { recorded: false, reason: error.message };
  } catch (e) {
    return { recorded: false, reason: (e && e.message) || String(e) };
  }
  const { inherited: tailsInherited } = await inheritTailDecisions(supabase, { correlationId, disposition, decidedBy, decisionAt, deferTrigger, outcomeRef: resolvedOutcomeRef });
  return { recorded: true, tailsInherited, outcomeRef: resolvedOutcomeRef };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--advisory' || a === '--reply') {
      flags[a.slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    } else if (a.startsWith('--')) {
      flags[a.slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

async function main() {
  const { flags, positional } = parseArgs(process.argv);
  const advisoryId = typeof flags.advisory === 'string' ? flags.advisory : null;
  if (!advisoryId) {
    console.error('Usage: node scripts/coordinator-ack-adam.cjs --advisory <id> [--reply "<reply body>"]');
    process.exit(2);
  }
  const wantsReply = flags.reply !== undefined;
  const replyBody = typeof flags.reply === 'string'
    ? [flags.reply, ...positional].join(' ').trim()
    : positional.join(' ').trim();

  const coordinatorSession = process.env.CLAUDE_SESSION_ID;
  if (!coordinatorSession) { console.error('ERROR: CLAUDE_SESSION_ID required (SessionStart hook).'); process.exit(1); }

  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }

  const { row: adv, error: fErr } = await fetchAdvisory(supabase, advisoryId);
  if (fErr) { console.error('ERROR: advisory lookup failed:', fErr.message); process.exit(1); }
  if (!adv) { console.error('ERROR: advisory not found:', advisoryId); process.exit(1); }

  // Stage 2: stamp actioned_at — the only thing that retires the advisory (idempotent).
  // SD-LEO-FIX-SOLOMON-MULTI-PART-001 (FR-3): resolve the FULL multi-part group this
  // advisory belongs to FIRST, then ack every member together — never retire part N
  // while a sibling part sits unactioned. A marker-less advisory resolves to its own
  // singleton group, byte-identical to the prior single-row ack.
  const nowIso = new Date().toISOString();
  const group = await resolveGroupForAdvisory(supabase, adv);
  const { error: sErr } = await stampActionedGroup(supabase, group, nowIso);
  if (sErr) { console.error('ERROR: failed to stamp actioned_at:', sErr.message); process.exit(1); }
  console.log('✓ Advisory actioned (retired)' + (group.isMultiPart
    ? ` — multi-part series, ${group.memberIds.length}${group.isComplete ? '' : '/' + group.total} part(s) acked together`
    : ''));
  console.log('  advisory_id:', advisoryId);
  if (group.isMultiPart) console.log('  series_member_ids:', group.memberIds.join(', '));
  if (group.isMultiPart && !group.isComplete) {
    const missing = Array.from({ length: group.total }, (_, i) => i + 1)
      .filter((i) => !group.presentIndices.includes(i));
    console.warn(`  ⚠ INCOMPLETE SERIES: only ${group.memberIds.length} of ${group.total} part(s) have arrived (missing part(s): ${missing.join(', ')}) — additional part(s) may still be en route; re-run ack once they land.`);
  }
  console.log('  actioned_at:', nowIso);

  const disposition = typeof flags.disposition === 'string' ? flags.disposition : null;
  if (disposition) {
    const correlationId = typeof flags['correlation-id'] === 'string'
      ? flags['correlation-id']
      : (adv.payload && adv.payload.correlation_id);
    const deferTrigger = typeof flags['defer-trigger'] === 'string' ? flags['defer-trigger'] : null;
    // FR-3: --outcome-ref names the tracking artifact (SD/QF/PR/issue/commit id); --no-artifact is the
    // explicit "no trackable artifact" marker (optional reason). One of the two is mandatory for an
    // accepted/partial disposition.
    const outcomeRef = typeof flags['outcome-ref'] === 'string' ? flags['outcome-ref'] : null;
    const noArtifact = flags['no-artifact'] !== undefined ? flags['no-artifact'] : null; // true (bare) or a reason string
    const result = await recordLedgerDecision(supabase, { correlationId, disposition, decidedBy: coordinatorSession, deferTrigger, outcomeRef, noArtifact });
    if (result.recorded) {
      console.log('✓ Ledger decision recorded');
      console.log('  correlation_id:', correlationId);
      console.log('  decision:', disposition);
      if (result.outcomeRef) console.log('  outcome_ref:', result.outcomeRef);
      if (result.tailsInherited > 0) console.log('  tails inherited:', result.tailsInherited);
    } else {
      console.warn(`⚠ Ledger decision REJECTED (advisory still actioned): ${result.reason}`);
    }
  }

  if (wantsReply) {
    if (!isTwoWayV2Enabled()) {
      console.error('NOTE: --reply skipped — COORDINATOR_TWOWAY_V2 is OFF (advisory was still actioned).');
      process.exit(0);
    }
    if (!replyBody) { console.error('ERROR: --reply requires a body.'); process.exit(2); }
    const originator = adv.sender_session;
    const correlationId = adv.payload && adv.payload.correlation_id;
    if (!isFullUuid(originator)) { console.error('ERROR: advisory sender_session is not a full UUID:', JSON.stringify(originator)); process.exit(1); }
    if (!correlationId) { console.error('ERROR: advisory carries no payload.correlation_id (not replyable).'); process.exit(1); }
    // FR-1: target the CURRENT live Adam, never a stale originating session.
    const { target: adamSession, retargeted } = await resolveAdamReplyTarget(supabase, originator);
    if (retargeted) {
      console.log(`  ↻ re-targeted from stale originator ${originator} → live Adam ${adamSession}`);
      // FR-2: recover any prior unread inbound stuck at the stale originator.
      const rec = await retargetStaleAdamInbound(supabase, { staleOriginator: originator, liveAdam: adamSession });
      if (rec.error) console.error('  WARN: stuck-inbound recovery error:', rec.error);
      else if (rec.retargeted > 0) console.log(`  ↻ recovered ${rec.retargeted} prior unread message(s) to the live Adam`);
    }
    const { data, error } = await sendCoordinatorReply(supabase, { coordinatorSession, workerSession: adamSession, correlationId, body: replyBody });
    if (error) { console.error('ERROR: failed to send reply:', error.message); process.exit(1); }
    // FR-3: verify delivery (send != delivered) — fail loud if the row cannot be confirmed.
    const delivered = await verifyReplyDelivered(supabase, data && data.id);
    if (!delivered) { console.error('ERROR: reply send reported success but the row could not be confirmed (delivery NOT verified) — failing loud.'); process.exit(1); }
    console.log('✓ Coordinator reply sent to Adam (delivery verified)');
    console.log('  reply_id:', data.id);
    console.log('  to_adam:', adamSession);
    console.log('  reply_to:', correlationId);
  }
}

module.exports = { parseArgs, recordLedgerDecision, inheritTailDecisions, VALID_DISPOSITIONS, resolveOutcomeRef, isNoArtifactRef, NO_ARTIFACT_MARKER, LINKAGE_REQUIRED_DISPOSITIONS };

if (require.main === module) {
  main().catch(err => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
