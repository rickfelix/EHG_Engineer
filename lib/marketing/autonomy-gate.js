/**
 * Fail-closed publish-autonomy gate — SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C FR-3.
 *
 * This is the enforcement chokepoint mandated by SECURITY sub-agent review
 * (sub_agent_execution_results id b2beecdc-9ef9-4e4a-a24b-9130b4f7f8b1): the hard gate
 * MUST be called from lib/marketing/publisher/index.js's publish() BEFORE the adapter is
 * constructed, never inside the adapter itself, where it would be trivially bypassed the
 * instant production credentials are set. Every check here fails CLOSED — any missing or
 * errored read denies the publish attempt, there is no log-only branch.
 *
 * Autonomy is per-(venture,channel), never venture-wide, and is data-driven: a channel
 * only reaches 'autonomous' via N consecutive shipped_clean+accepted outcomes in
 * venture_channel_publish_ledger (recordPublishOutcome), and any reverted/caused_rework
 * outcome immediately demotes it back to 'propose_and_approve'. outcome is set from the
 * ACTUAL observed result of a post, never self-reported at publish time — this module
 * deliberately does not auto-mark an outcome as part of a successful publish() call.
 */
import { recordPendingDecision } from '../chairman/record-pending-decision.mjs';
// QF-20260710-243: this fail-closed publish gate never checked for a fixture venture before
// recordPendingDecision() -- confirmed live: 'Test Venture for Owned-Audience Loop'
// (launch_mode='simulated', is_demo=false) surfaced a real outbound-publish-approval to the
// chairman queue. The authorization DECISION (allowed/denied, ledger propose row) is
// unaffected -- only the chairman-facing side effect is skipped for a fixture.
import { isFixtureVenture, fetchVentureForFixtureCheck } from '../eva/chairman-decision-watcher.js';
// FR-1 honesty invariants derive from the EXISTING authority for each policy rather than
// re-deriving it here — a replica of a policy drifts from the thing it copies.
import { ENROLLMENT_STATUS } from './ai/email-campaigns.js';
import { guardSequenceSend } from '../venture-email/provision-venture-email.js';
import { AupWitnessError } from '../venture-email/errors.js';
import { checkWriteBudget } from './marketlens-caps.js';
// SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-5: the secondary/preventive layer of the no-crack
// gate. Reuses the exact same evaluator + observation-writer as the primary/detective sweep
// layer (scripts/cron/venture-ops-actuals-sweep.mjs) so both layers write into one queryable
// observe-only dataset. OBSERVE-ONLY today: never denies a publish, only records what would
// happen -- see the module-level note above checkCrackGateObserveOnly().
import { evaluateCrackGateStatus, recordCrackGateObservation, hasUnavailableSource } from '../eva/lifecycle/crack-gate-evaluator.js';

const DEFAULT_RATE_LIMIT_MAX_POSTS = 50;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_GRADUATION_STREAK = 5;

/**
 * Durable, DB-backed rate limit check keyed by (venture, channel). Replaces the prior
 * in-memory limiter in adapters/x.js, which reset every call because publisher/index.js
 * constructs a fresh adapter per publish() (making it inert in practice).
 */
export async function checkRateLimit({ supabase, ventureId, channelType, maxPosts = DEFAULT_RATE_LIMIT_MAX_POSTS, windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS }) {
  const windowStart = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await supabase
    .from('venture_channel_publish_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('venture_id', ventureId)
    .eq('channel_type', channelType)
    .gte('created_at', windowStart);

  if (error) {
    return { allowed: false, reason: `RATE_LIMIT_LOOKUP_FAILED (fail-closed): ${error.message}` };
  }

  const current = count || 0;
  if (current >= maxPosts) {
    return { allowed: false, reason: `RATE_LIMIT_EXCEEDED: ${current}/${maxPosts} posts in the last ${Math.round(windowMs / 60000)} minutes`, count: current };
  }

  return { allowed: true, count: current };
}

/* ───────────────────────────────────────────────────────────────────────────────
 * FR-1 (SD-LEO-FEAT-CODIFY-HONEST-ACTIVATION-001) — per-send honesty invariants.
 *
 * The 'autonomous' state removes the human who kept each send honest and, before this
 * change, replaced them with nothing but a ledger write and a rate limit. These four
 * invariants are that human, codified. They run ONLY in the autonomous branch — the
 * propose_and_approve path still has its human and is deliberately untouched.
 *
 * Every invariant returns a DISTINCT named refusal, never a shared catch-all and never a
 * log line, so a refusal names which honesty property failed and whether it failed because
 * the property was VIOLATED or because it could not be EVALUATED. Anything unevaluable
 * fails CLOSED. Nothing here returns a pass it did not measure.
 * ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Channels that publish to a public timeline and therefore have no enumerable recipient
 * list. The recipient-keyed invariants (suppression, consent) are structurally
 * inapplicable to them — an explicit, auditable classification, NOT a data-absence pass.
 *
 * Polarity matters: any channel NOT named here is treated as DIRECTED and gets the strict
 * recipient-keyed path, so a newly-added channel joins the SAFE side of this set by
 * default. Adding a channel here is a deliberate assertion that it has no recipients.
 */
const BROADCAST_CHANNELS = Object.freeze(['x', 'bluesky']);

/**
 * marketing_content.lifecycle_state values that mean the content has cleared the REVIEW
 * stage of the pipeline's own state machine (content-generator.js transitionContentState:
 * IDEATE → GENERATE → REVIEW → SCHEDULE → DISPATCH → MEASURE → OPTIMIZE). Being *in*
 * REVIEW means under review, not approved — so REVIEW is deliberately excluded.
 */
const REVIEWED_CONTENT_STATES = Object.freeze(['SCHEDULE', 'DISPATCH', 'MEASURE', 'OPTIMIZE']);

export const HONESTY_INVARIANTS = Object.freeze(['suppression', 'consent', 'non_fabrication', 'aup_volume']);

function isBroadcastChannel(channelType) {
  return BROADCAST_CHANNELS.includes(channelType);
}

/** A malformed audience is not a small audience — it is an unknown one. Fails closed. */
function normalizeAudience(audience) {
  if (!Array.isArray(audience) || audience.length === 0) return null;
  const cleaned = audience.filter((a) => typeof a === 'string' && a.trim() !== '');
  return cleaned.length === audience.length ? cleaned : null;
}

/**
 * Invariant 1 — suppression / opt-out. Reads the opt-out state from campaign_enrollments
 * using email-campaigns.js's own ENROLLMENT_STATUS, so the two cannot disagree about what
 * "unsubscribed" means.
 */
export async function checkSuppressionInvariant({ supabase, channelType, audience }) {
  if (isBroadcastChannel(channelType)) {
    return { ok: true, refusal: null, basis: 'NOT_APPLICABLE_BROADCAST_CHANNEL' };
  }
  const recipients = normalizeAudience(audience);
  if (!recipients) return { ok: false, refusal: 'SUPPRESSION_AUDIENCE_UNRESOLVED' };

  const { data, error } = await supabase
    .from('campaign_enrollments')
    .select('lead_email')
    .eq('status', ENROLLMENT_STATUS.UNSUBSCRIBED)
    .in('lead_email', recipients);

  if (error) return { ok: false, refusal: 'SUPPRESSION_LOOKUP_FAILED', detail: error.message };
  if (data && data.length > 0) {
    return { ok: false, refusal: 'SUPPRESSION_LIST_HIT', detail: `${data.length} suppressed recipient(s)` };
  }
  return { ok: true, refusal: null, basis: 'NO_SUPPRESSION_HIT' };
}

/**
 * Invariant 2 — consent / opt-in, enforced through the EXISTING Resend AUP witness
 * (guardSequenceSend): a send may only reach a recipient captured through a real opt-in,
 * evidenced by a capture-record reference.
 *
 * RESIDUAL, stated so no reader over-reads this: the witness proves a reference was
 * SUPPLIED, not that it resolves to a genuine capture event — no capture-record table
 * exists to resolve it against (measured absent). Tightening that belongs in
 * guardSequenceSend, which is why this calls it instead of copying it.
 */
export function checkConsentInvariant({ channelType, audience, consentWitnesses }) {
  if (isBroadcastChannel(channelType)) {
    return { ok: true, refusal: null, basis: 'NOT_APPLICABLE_BROADCAST_CHANNEL' };
  }
  const recipients = normalizeAudience(audience);
  if (!recipients) return { ok: false, refusal: 'CONSENT_AUDIENCE_UNRESOLVED' };

  const witnesses = consentWitnesses || {};
  for (const recipient of recipients) {
    try {
      guardSequenceSend({ captureRecordId: witnesses[recipient] });
    } catch (err) {
      if (err instanceof AupWitnessError) {
        return { ok: false, refusal: 'CONSENT_WITNESS_MISSING', detail: recipient };
      }
      throw err;
    }
  }
  return { ok: true, refusal: null, basis: 'CAPTURE_RECORD_WITNESSED' };
}

/**
 * Invariant 3 — content non-fabrication. Requires the content to have cleared the
 * pipeline's REVIEW stage before an unsupervised channel may send it.
 *
 * RESIDUAL, stated plainly: this proves the content was REVIEWED, not that its claims were
 * VERIFIED. Screening copy against a claims registry is genuinely unimplemented — there is
 * no claims_registry table (probed live: PGRST205, absent), the same absence
 * lib/creative/quality-gate.js records for generated assets. That depth is reported on the
 * result as unverifiedDepth rather than folded into a silent pass.
 */
export async function checkNonFabricationInvariant({ supabase, contentId }) {
  if (typeof contentId !== 'string' || contentId.trim() === '') {
    return { ok: false, refusal: 'NON_FABRICATION_CONTENT_UNIDENTIFIED' };
  }
  const { data, error } = await supabase
    .from('marketing_content')
    .select('lifecycle_state')
    .eq('id', contentId)
    .maybeSingle();

  if (error) return { ok: false, refusal: 'NON_FABRICATION_LOOKUP_FAILED', detail: error.message };
  if (!data) return { ok: false, refusal: 'NON_FABRICATION_CONTENT_UNKNOWN' };
  if (!REVIEWED_CONTENT_STATES.includes(data.lifecycle_state)) {
    return { ok: false, refusal: 'NON_FABRICATION_CONTENT_UNREVIEWED', detail: `lifecycle_state=${data.lifecycle_state}` };
  }
  return {
    ok: true,
    refusal: null,
    basis: `REVIEW_CLEARED:${data.lifecycle_state}`,
    unverifiedDepth: ['claims_registry_absent'],
  };
}

/**
 * Invariant 4 — AUP volume, delegated to the existing standing write-cap
 * (marketlens-caps.checkWriteBudget → get_venture_write_budget_status). That helper
 * already fails closed on any RPC fault; this only gives the two failure modes distinct
 * names so "over the cap" and "could not read the cap" are never conflated.
 */
export async function checkAupVolumeInvariant({ supabase, ventureId, logger }) {
  const budget = await checkWriteBudget(ventureId, logger ? { supabase, logger } : { supabase });
  if (budget.error) return { ok: false, refusal: 'AUP_VOLUME_LOOKUP_FAILED', detail: budget.error };
  if (budget.isOverBudget) {
    return { ok: false, refusal: 'AUP_VOLUME_EXCEEDED', detail: `writesUsed=${budget.writesUsed}` };
  }
  return { ok: true, refusal: null, basis: `WITHIN_WRITE_BUDGET:${budget.writesRemaining}` };
}

/**
 * Runs all four invariants. Deliberately does NOT short-circuit: an operator fixing an
 * autonomous send should see every honesty property that failed in one refusal, not
 * discover them one redeploy at a time.
 */
export async function evaluateHonestyInvariants({ supabase, ventureId, channelType, contentId, send = {}, logger }) {
  const results = {
    suppression: await checkSuppressionInvariant({ supabase, channelType, audience: send.audience }),
    consent: checkConsentInvariant({ channelType, audience: send.audience, consentWitnesses: send.consentWitnesses }),
    non_fabrication: await checkNonFabricationInvariant({ supabase, contentId }),
    aup_volume: await checkAupVolumeInvariant({ supabase, ventureId, logger }),
  };
  const failed = HONESTY_INVARIANTS.filter((name) => !results[name].ok);
  return {
    ok: failed.length === 0,
    refusal: failed.length > 0 ? results[failed[0]].refusal : null,
    failedInvariants: failed,
    results,
  };
}

/**
 * SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-5: observe-only no-crack-gate precondition.
 *
 * Called ONCE, before the autonomy-state read, so it structurally covers BOTH downstream
 * branches (autonomous and propose_and_approve) with a single call rather than duplicating
 * it into each — the branch is decided by a read that happens strictly after this one.
 *
 * OBSERVE-ONLY BY DESIGN: never denies a publish and never throws into the caller. Live PBN
 * storage is measurably broken/unpopulated today (see crack-gate-evaluator.js header), so a
 * hard-blocking gate shipped now would deny with a misleading reason. This records what WOULD
 * happen into system_events (shared with the sweep layer) so a future SD can measure a real
 * promotion criterion before flipping to enforcing. A failure in the check itself (RPC error,
 * missing table) is swallowed here — the real publish flow must never be affected by an
 * observe-only witness failing to write.
 */
async function checkCrackGateObserveOnly({ supabase, ventureId, logger }) {
  try {
    const verdict = await evaluateCrackGateStatus(supabase, ventureId);
    await recordCrackGateObservation(supabase, ventureId, verdict, 'publish_gate');
    // SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-8 (class h): still observe-only (never denies a
    // publish here either), but a source-unavailable verdict means this check just measured
    // NOTHING -- loud, not folded silently into the same NOT_MET bucket as a genuinely
    // not-yet-scored venture. Same failure class that let the choke-gate backstop read as
    // shipped while being DB-inert for weeks.
    const unavailable = hasUnavailableSource(verdict);
    if (unavailable.unavailable) {
      logger?.error?.(`[autonomy-gate] FR-8 ESCALATION: crack-gate check for venture ${ventureId} has an UNAVAILABLE data source (not "unscored"): ${unavailable.reasons.join('; ')}. This publish-gate precondition measured nothing for this venture.`);
    }
    return verdict;
  } catch (err) {
    // ADVERSARIAL REVIEW FIX (PR2 deep-tier review): err.message unguarded would throw a
    // TypeError out of THIS catch block on a nullish rejection (e.g. a bare `throw null`
    // somewhere in the chain), defeating the one guarantee this function exists to make —
    // that an observe-only failure can never propagate into the real authorization/graduation
    // outcome. err?.message ?? String(err) can't itself throw regardless of what was thrown.
    logger?.warn?.(`[autonomy-gate] crack-gate observe-only check failed (non-fatal, publish unaffected): ${err?.message ?? String(err)}`);
    return null;
  }
}

/**
 * Fail-closed authorization check. Reads venture_channel_autonomy for the channel's
 * current state; if 'autonomous', allows immediately. If 'propose_and_approve' (the
 * default, including when no row exists yet), requires a prior 'accepted' ledger entry
 * for this exact contentRef. If none exists, a 'pending' ledger entry is created (the
 * "propose" side of propose-and-approve) so the attempt becomes reviewable via
 * chairman_decisions / v_injection_quarantine_queue-adjacent views, and the call is
 * denied — the caller must retry after a human approves it.
 */
export async function checkPublishAuthorization({ supabase, ventureId, channelType, contentId, correlationId, send = {}, logger }) {
  await checkCrackGateObserveOnly({ supabase, ventureId, logger });

  const { data: autonomy, error: autonomyError } = await supabase
    .from('venture_channel_autonomy')
    .select('autonomy_state')
    .eq('venture_id', ventureId)
    .eq('channel_type', channelType)
    .maybeSingle();

  if (autonomyError) {
    return { allowed: false, reason: `AUTONOMY_LOOKUP_FAILED (fail-closed): ${autonomyError.message}` };
  }

  const autonomyState = autonomy?.autonomy_state || 'propose_and_approve';

  if (autonomyState === 'autonomous') {
    // FR-1: the honesty invariants that stand in for the human this state removes. They
    // run BEFORE authorization is granted and BEFORE the ledger write below — a refused
    // attempt must not leave a decision:'accepted' row asserting it was authorized.
    const honesty = await evaluateHonestyInvariants({ supabase, ventureId, channelType, contentId, send, logger });
    if (!honesty.ok) {
      return {
        allowed: false,
        autonomyState,
        reason: `AUTONOMOUS_HONESTY_INVARIANT_FAILED (fail-closed): ${honesty.failedInvariants.join(', ')} — ${honesty.refusal}`,
        honesty,
      };
    }

    // ADVERSARIAL REVIEW FIX: an autonomous channel MUST still write a ledger row per
    // publish attempt. Without one, checkRateLimit() (which counts ledger rows in the
    // window) never sees autonomous-tier activity — the exact unsupervised tier that
    // most needs the limit — and recordPublishOutcome()/evaluateGraduation() have no
    // row to attach a bad outcome to, so the "any reverted/caused_rework demotes
    // immediately" safety valve could never fire once a channel graduates.
    const autoCorrelationId = correlationId || `${ventureId}:${channelType}:${contentId}:${Date.now()}`;
    const { data: inserted, error: insertError } = await supabase
      .from('venture_channel_publish_ledger')
      .insert({
        venture_id: ventureId,
        channel_type: channelType,
        content_ref: contentId,
        correlation_id: autoCorrelationId,
        decision: 'accepted',
        decision_by: 'system:autonomous',
        decision_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError) {
      // Fail closed: an autonomous channel that can't record its own publish attempt
      // must not be allowed to bypass rate-limiting/outcome-tracking silently.
      return { allowed: false, reason: `AUTONOMOUS_LEDGER_WRITE_FAILED (fail-closed): ${insertError.message}` };
    }

    return { allowed: true, autonomyState, ledgerEntryId: inserted?.id, correlationId: autoCorrelationId };
  }

  const { data: accepted, error: acceptedError } = await supabase
    .from('venture_channel_publish_ledger')
    .select('id, correlation_id')
    .eq('venture_id', ventureId)
    .eq('channel_type', channelType)
    .eq('content_ref', contentId)
    .eq('decision', 'accepted')
    .maybeSingle();

  if (acceptedError) {
    return { allowed: false, reason: `LEDGER_LOOKUP_FAILED (fail-closed): ${acceptedError.message}` };
  }

  if (accepted) {
    return { allowed: true, autonomyState, ledgerEntryId: accepted.id, correlationId: accepted.correlation_id };
  }

  // No prior approval — auto-propose (idempotent on correlationId) and deny this attempt.
  const proposeCorrelationId = correlationId || `${ventureId}:${channelType}:${contentId}`;

  // Dedup check BEFORE inserting: a caller retrying the same unapproved publish must not
  // spawn a fresh chairman_decisions row on every retry — only the first proposal notifies.
  const { data: existingPending, error: existingPendingError } = await supabase
    .from('venture_channel_publish_ledger')
    .select('id')
    .eq('correlation_id', proposeCorrelationId)
    .maybeSingle();

  if (existingPendingError) {
    return { allowed: false, reason: `AUTONOMY_APPROVAL_REQUIRED and propose-record dedup check failed: ${existingPendingError.message}` };
  }

  if (!existingPending) {
    const { data: inserted, error: proposeError } = await supabase
      .from('venture_channel_publish_ledger')
      .insert({
        venture_id: ventureId,
        channel_type: channelType,
        content_ref: contentId,
        correlation_id: proposeCorrelationId,
        decision: 'pending',
      })
      .select('id')
      .single();

    if (proposeError) {
      return { allowed: false, reason: `AUTONOMY_APPROVAL_REQUIRED and propose-record write failed: ${proposeError.message}` };
    }

    // FR-7: a pending outbound approval routes through the existing chairman_decisions
    // surface rather than a new UI. Non-blocking — the pending ledger row is the durable
    // record regardless of whether this notification succeeds. Fixture ventures never
    // reach the live chairman queue (QF-20260710-243).
    const ventureForCheck = await fetchVentureForFixtureCheck(supabase, ventureId);
    if (!isFixtureVenture(ventureForCheck)) {
      await recordPendingDecision(supabase, {
        title: `Outbound publish pending approval (${channelType})`,
        decisionType: 'outbound_publish_approval',
        ventureId,
        blocking: false,
        context: { ledger_entry_id: inserted?.id, channel_type: channelType, content_ref: contentId, correlation_id: proposeCorrelationId },
      }).catch(() => { /* fail-soft: the pending ledger row is the durable record */ });
    }
  }

  return { allowed: false, reason: 'AUTONOMY_APPROVAL_REQUIRED: no accepted approval record for this content on this channel — a pending approval has been recorded for review' };
}

/**
 * Records the ACTUAL observed outcome of a previously-approved or autonomous publish
 * (shipped_clean | reverted | caused_rework). Must be called from a downstream
 * observation step (e.g. an engagement/error-rate check), never from publish() itself
 * immediately after a successful API call — that would be exactly the self-report
 * anti-pattern this ledger exists to prevent.
 */
export async function recordPublishOutcome({ supabase, correlationId, outcome, outcomeRef }) {
  if (!['shipped_clean', 'reverted', 'caused_rework'].includes(outcome)) {
    throw new Error(`recordPublishOutcome: invalid outcome '${outcome}'`);
  }

  const { data, error } = await supabase
    .from('venture_channel_publish_ledger')
    .update({ outcome, outcome_ref: outcomeRef || null })
    .eq('correlation_id', correlationId)
    .select('venture_id, channel_type')
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message };
  }
  if (!data) {
    return { success: false, error: `No ledger entry found for correlation_id ${correlationId}` };
  }

  return evaluateGraduation({ supabase, ventureId: data.venture_id, channelType: data.channel_type });
}

/**
 * Re-evaluates a channel's autonomy_state from its ledger history. A single
 * reverted/caused_rework outcome resets clean_streak to 0 and demotes to
 * propose_and_approve immediately. requiredStreak consecutive shipped_clean+accepted
 * outcomes graduate the channel to autonomous.
 */
export async function evaluateGraduation({ supabase, ventureId, channelType, requiredStreak = DEFAULT_GRADUATION_STREAK }) {
  const { data: recent, error: recentError } = await supabase
    .from('venture_channel_publish_ledger')
    .select('decision, outcome, created_at')
    .eq('venture_id', ventureId)
    .eq('channel_type', channelType)
    .neq('outcome', 'unknown')
    .order('created_at', { ascending: false })
    .limit(requiredStreak);

  if (recentError) {
    return { success: false, error: recentError.message };
  }

  let cleanStreak = 0;
  for (const row of recent || []) {
    if (row.decision === 'accepted' && row.outcome === 'shipped_clean') {
      cleanStreak += 1;
    } else {
      break;
    }
  }

  const streakEarned = cleanStreak >= requiredStreak;

  // SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-5. A clean streak proves the channel PUBLISHES
  // WELL; it proves nothing about whether anyone WANTS what it publishes. Before this, those two
  // questions were the same question — a venture with zero market demand graduated to autonomous
  // on five tidy posts.
  //
  // POLARITY IS THE SAFETY PROPERTY, so the permit is phrased POSITIVELY. A .maybeSingle() on an
  // absent row returns {data:null,error:null}: `verdict === 'PASS'` is false, so absence BLOCKS.
  // A negatively-phrased flag (`!row?.blocked`) would be false-on-null and PASS on absence —
  // fail-OPEN, and the failure would be invisible. Same shape as the fail-closed authorization
  // read earlier in this file.
  let demandValidated = false;
  let demandDetail;
  const { data: passRow, error: verdictError } = await supabase
    .from('venture_demand_verdicts')
    .select('verdict, citation, computed_at')
    .eq('venture_id', ventureId)
    .eq('verdict', 'PASS')
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (verdictError) {
    // "I could not look" is NOT "there is nothing there". An unreadable verdict store — including
    // one whose migration has not been applied yet — must never read as permission.
    demandDetail = `demand verdict unreadable: ${verdictError.message}`;
  } else if (passRow?.verdict === 'PASS') {
    demandValidated = true;
    demandDetail = `PASS verdict ${passRow.computed_at}: ${passRow.citation}`;
  } else {
    demandDetail = 'no PASS row in venture_demand_verdicts for this venture — a NO_DATA or BLOCKED verdict does not authorize autonomy, and neither does an absent one';
  }

  // SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-5: observe (do not yet block) the promotion-to-
  // autonomous write itself, not only the publish read above — an unchecked venture must not
  // be able to graduate into the human-free tier while this stays observe-only.
  if (streakEarned && demandValidated) {
    await checkCrackGateObserveOnly({ supabase, ventureId, logger: undefined });
  }

  const graduate = streakEarned && demandValidated;
  const update = graduate
    ? { autonomy_state: 'autonomous', clean_streak: cleanStreak, graduated_at: new Date().toISOString(), graduated_by: 'system:proven-outcome-ledger+demand-validated' }
    : { autonomy_state: 'propose_and_approve', clean_streak: cleanStreak };

  const { error: updateError } = await supabase
    .from('venture_channel_autonomy')
    .upsert({ venture_id: ventureId, channel_type: channelType, ...update }, { onConflict: 'venture_id,channel_type' });

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // The refusal is REPORTED, not merely logged: a caller that only saw a log line could not
  // distinguish "earned the streak but demand is unproven" from "never earned the streak", and
  // those are entirely different situations for an operator.
  if (streakEarned && !demandValidated) {
    return {
      success: true,
      autonomyState: update.autonomy_state,
      cleanStreak,
      graduationRefused: { reason: 'DEMAND_VALIDATION_REQUIRED', detail: demandDetail },
    };
  }

  return { success: true, autonomyState: update.autonomy_state, cleanStreak };
}

export default {
  checkRateLimit,
  checkPublishAuthorization,
  recordPublishOutcome,
  evaluateGraduation,
  evaluateHonestyInvariants,
};
