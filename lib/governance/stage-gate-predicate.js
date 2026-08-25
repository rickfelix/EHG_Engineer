/**
 * Stage-gate predicate — the ONE shared implementation of
 * requiredStage(sd/qf) <= ventureStage(venture_id).
 * SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 (FR-1, FR-2, FR-4, FR-7).
 *
 * CHAIRMAN-COMMISSIONED, program step 3 (same provenance as the sibling
 * SD-LEO-INFRA-STAGE-WRITER-CHOKE-001). Nothing today stops a venture-linked SD or QF
 * from performing an external-contact action (emailing a lead, publishing to a
 * marketing channel) regardless of the venture's actual lifecycle stage. Building is
 * free at any stage; CONTACTING a real human is gated at S24 (Go Live).
 *
 * SCOPE RULES (checked in exactly this order in checkStageGate — the ORDER matters and
 * has already drifted from this comment once, per TESTING/SECURITY's 3rd-round finding:
 * a caller-bug requiredStage is checked BEFORE the venture is even fetched, so it can
 * fire for a venture that would otherwise have been (b)'s is_demo OUT_OF_SCOPE):
 *   (a) ventureId is null/absent      -> OUT_OF_SCOPE. Most SDs/QFs are not
 *       venture-linked at all (measured: 93.5% of SDs have null venture_id) — this
 *       predicate must never fail-closed on the ABSENCE of venture linkage, only on
 *       an UNRESOLVABLE stage for a venture that IS linked.
 *   (b) requiredStage is not an integer in 1..26 -> FAIL CLOSED (blocked,
 *       reason:'invalid_required_stage'), checked BEFORE the venture is fetched.
 *       SECURITY findings M4/M7: NaN/undefined/null/strings/0/negatives/non-integers
 *       all make `actualStage < requiredStage` evaluate to false, silently returning
 *       PASS -- a caller bug must never read as authorization. Because this runs first,
 *       it can fire even for an is_demo venture -- (b) is not gated by (c).
 *   (c) the venture's is_demo=true    -> OUT_OF_SCOPE (once reached, i.e. requiredStage
 *       was valid). Demo ventures are invisible to this predicate for every OTHER
 *       reason (never blocked, never audit-logged on a valid requiredStage) — this is a
 *       DELIBERATE consequence for CI fixture design: a demo venture can never be used
 *       as the paired-control negative-control fixture, since it is never evaluated.
 *       FR-6's CI controls therefore use a MOCKED venture object, not a demo venture.
 *   (d) the venture row cannot be resolved, or current_lifecycle_stage is
 *       null/unresolvable -> FAIL CLOSED (blocked, reason:'unresolvable_stage'). This
 *       and (b) are the ONLY fail-closed paths — neither fires for (a) or (c).
 *   (e) normal comparison: blocked = (currentStage < requiredStage).
 *
 * ARMING (FR-2): every in-scope evaluation ((b), (d), or (e)) writes exactly one
 * audit_log row (FR-7), regardless of arming state. `armed` defaults to
 * isEnabled('STAGE_GATE_PREDICATE_ARMED') (lib/feature-flags/evaluator.js) when the
 * caller omits it, but remains an explicit, overridable parameter so a caller (or a
 * test, per FR-6) can force it independent of the live flag. isEnabled() already
 * fails safe to `false` (unarmed/shadow) on ANY read fault (flag missing, cache
 * issue, kill-switch active) — the correct safe direction here, since an unarmed
 * predicate makes no blocking decisions at all. When unarmed, `blocked` in the
 * return value still reflects the real (shadow) verdict, but every call site must
 * treat armed:false as "never actually block" — see the 2 shipped call-site
 * integrations. The audit_log row is tagged metadata.armed to match. The FR-4
 * override-rate metric (countRecentOverrides) never reads audit_log at all — it counts
 * consumed_at on chairman_decisions directly. An armed:false shadow evaluation still
 * LOOKS UP an active override (so the shadow verdict/audit row accurately reports what
 * WOULD happen if armed) but never CONSUMES one — hasActiveOverride()'s shouldConsume
 * param is resolvedArmed, specifically so a shadow-mode evaluation can never burn a real
 * override's one-shot use or be counted by the rate metric (SECURITY finding H4: an
 * earlier version of this fix consumed unconditionally and both of those broke).
 *
 * ventures.current_lifecycle_stage's live CHECK constraint is
 * (current_lifecycle_stage BETWEEN 1 AND 26) — there is no stage 0. A "negative
 * control" fixture uses stage 1 (the real minimum), never a nonexistent "S0".
 *
 * @module lib/governance/stage-gate-predicate
 */
'use strict';

import { isEnabled } from '../feature-flags/evaluator.js';

export const STAGE_GATE_ARMED_FLAG_KEY = 'STAGE_GATE_PREDICATE_ARMED';

export const VERDICT = Object.freeze({
  PASS: 'PASS',
  BLOCK: 'BLOCK',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
});

/**
 * Look up an active (unconsumed, unexpired) chairman override for a specific gated action.
 * FR-4: chairman_decisions gains an `override_key` column (additive) alongside its existing
 * `undo_deadline`/`consumed_at` TTL columns — the per-action scope this predicate needs,
 * reusing the closest existing TTL-shaped scaffolding rather than a new table.
 *
 * NAMED override_key, not sd_key: the actorId passed here is whatever unique identifier the
 * calling site uses (a campaign_id, a channelType:contentId composite, or — for the deferred
 * early-layer sites, once built — an actual SD/QF key). Never assume it is an SD.
 *
 * SCOPED to ventureId too (SECURITY finding H3): a call-site actorId like a campaign_id is
 * NOT globally unique -- campaign_enrollments only enforces uniqueness per
 * (venture_id, lead_email, campaign_id) -- so an override_key-only lookup would let an
 * override minted for one venture's campaign silently suppress an unrelated venture's
 * campaign of the same name. chairman_decisions already carries a venture_id column for
 * exactly this reason.
 *
 * CONSUMES the match it finds, but ONLY when `shouldConsume` is true (SECURITY findings H2
 * then H4): a chairman override is a one-shot escape hatch for the specific blocked
 * evaluation it was minted for, not a standing bypass that sits active suppressing every
 * subsequent call until its TTL expires -- that motivates consuming it. But `checkStageGate`
 * calls this in EVERY in-scope evaluation, including unarmed shadow-mode ones where nothing
 * is actually suppressed (`shouldEnforceBlock()` ignores `blocked` when `armed` is false) --
 * an early version of this fix consumed the override there too, silently burning a real
 * override during shadow mode while suppressing nothing and polluting the FR-4 rate metric.
 * `shouldConsume` is `resolvedArmed` from the caller: only an evaluation whose verdict can
 * actually change behavior may spend the one-shot.
 *
 * @param {object} supabase
 * @param {string} overrideKey - must match the actorId passed to checkStageGate
 * @param {string} ventureId
 * @param {boolean} shouldConsume - pass resolvedArmed; false still reports a match without spending it
 * @returns {Promise<boolean>} true if an active override suppresses (or, unarmed, WOULD suppress) a block
 */
async function hasActiveOverride(supabase, overrideKey, ventureId, shouldConsume = false) {
  if (!supabase || typeof supabase.from !== 'function' || !overrideKey || !ventureId) return false;
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('chairman_decisions')
      .select('id')
      .eq('override_key', overrideKey)
      .eq('decision_type', 'stage_gate_override')
      .eq('venture_id', ventureId)
      .is('consumed_at', null)
      .gt('undo_deadline', nowIso)
      .limit(1)
      .maybeSingle();
    if (error) return false; // fail-closed on the OVERRIDE lookup: an unreadable override never suppresses a block.
    if (!data) return false;
    if (shouldConsume) {
      try {
        const { error: consumeError } = await supabase.from('chairman_decisions').update({ consumed_at: nowIso }).eq('id', data.id);
        if (consumeError) {
          // SECURITY finding M8: the exact {error}-swallowing bug class M6 fixed in
          // writeAuditRow(), left unfixed here in the same edit that introduced it.
          console.warn(`[stage-gate-predicate] override consume update failed (block still suppressed this call, override may be reused): ${consumeError.message || consumeError}`);
        }
      } catch (err) {
        // Best-effort consume: a failed write must not retroactively un-suppress the block
        // this call already granted -- the next call will simply find it still active.
        console.warn(`[stage-gate-predicate] override consume update threw (block still suppressed this call, override may be reused): ${err?.message ?? String(err)}`);
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * FR-4 AC-4: the weekly override-rate metric. Counts consumed stage-gate overrides in the
 * trailing N days — the standing autonomy/QC report reads this and compares it against the
 * documented >2/week threshold (guard calibration returns to review above it). Deliberately
 * excludes any shadow-mode (armed=false) audit_log row — a shadow verdict is not an override,
 * it never suppressed anything.
 *
 * @param {object} supabase
 * @param {number} [days=7]
 * @returns {Promise<number>} count of consumed stage_gate_override decisions in the window
 */
export async function countRecentOverrides(supabase, days = 7) {
  if (!supabase || typeof supabase.from !== 'function') return 0;
  try {
    const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('chairman_decisions')
      .select('id', { count: 'exact', head: true })
      .eq('decision_type', 'stage_gate_override')
      .not('consumed_at', 'is', null)
      .gte('consumed_at', sinceIso);
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

/** FR-4: the documented weekly override-rate threshold — above this, guard calibration returns to review. */
export const OVERRIDE_RATE_WEEKLY_THRESHOLD = 2;

async function writeAuditRow(supabase, { entityType, entityId, ventureId, requiredStage, actualStage, verdict, armed }) {
  if (!supabase || typeof supabase.from !== 'function') return;
  try {
    const { error } = await supabase.from('audit_log').insert({
      event_type: 'stage_gate_check',
      entity_type: entityType,
      entity_id: entityId,
      metadata: { venture_id: ventureId, required_stage: requiredStage, actual_stage: actualStage, verdict, armed },
    });
    if (error) {
      // SECURITY finding M6 (EXEC-TO-PLAN review): a silently-swallowed {error} return (as
      // opposed to a thrown exception) previously left a systematic write failure completely
      // invisible -- in shadow mode this audit row is the ONLY output this predicate produces,
      // so a failure here means the whole thing is shipping inert with every test green.
      console.warn(`[stage-gate-predicate] audit_log insert failed (non-blocking, verdict unaffected): ${error.message || error}`);
    }
  } catch (err) {
    // Best-effort: an audit-write failure must never itself block or throw (FR-7 is observability,
    // not a second gate). The predicate's own verdict/block decision is unaffected.
    console.warn(`[stage-gate-predicate] audit_log insert threw (non-blocking, verdict unaffected): ${err?.message ?? String(err)}`);
  }
}

/**
 * The sole implementation of requiredStage(sd/qf) <= ventureStage(venture_id).
 *
 * @param {object} params
 * @param {{ from: Function }} params.supabase - injected client (never module-scope)
 * @param {string|null|undefined} params.ventureId
 * @param {number} params.requiredStage - integer 1..26
 * @param {'sd'|'qf'|'campaign'|'channel_publish'} params.actorType
 * @param {string} params.actorId - the calling site's own unique key for this gated action
 *   (e.g. a campaign_id, a channelType:contentId composite, or an sd_key for a future
 *   early-layer site) -- used as entity_id and as the override_key lookup key
 * @param {boolean} [params.armed] - defaults to isEnabled(STAGE_GATE_PREDICATE_ARMED) when omitted
 * @returns {Promise<{ inScope: boolean, blocked: boolean, verdict: 'PASS'|'BLOCK'|'OUT_OF_SCOPE', reason: string|null, armed: boolean }>}
 */
export async function checkStageGate({ supabase, ventureId, requiredStage, actorType, actorId, armed }) {
  // Rule (a): no venture linkage at all -> out of scope, never audited, never blocked.
  if (!ventureId) {
    return { inScope: false, blocked: false, verdict: VERDICT.OUT_OF_SCOPE, reason: 'no_venture_id', armed: false };
  }

  const resolvedArmed = typeof armed === 'boolean' ? armed : await isEnabled(STAGE_GATE_ARMED_FLAG_KEY);

  // Rule (b): an out-of-range requiredStage is a caller bug, not "no requirement" --
  // NaN/undefined/null/strings all make `actualStage < requiredStage` evaluate to false,
  // silently returning PASS (SECURITY finding M4); 0/negative/non-integer values are
  // finite and pass a bare Number.isFinite check yet still fail OPEN the same way, since
  // any real currentStage (1..26 per the live CHECK constraint) is >= them (SECURITY
  // finding M7). This predicate is the SOLE implementation every future call site --
  // including the 3 deferred early-layer ones that would read requiredStage from data
  // rather than a hardcoded literal -- will rely on.
  if (!Number.isInteger(requiredStage) || requiredStage < 1 || requiredStage > 26) {
    await writeAuditRow(supabase, { entityType: actorType, entityId: actorId, ventureId, requiredStage, actualStage: null, verdict: VERDICT.BLOCK, armed: resolvedArmed });
    return { inScope: true, blocked: true, verdict: VERDICT.BLOCK, reason: 'invalid_required_stage', armed: resolvedArmed };
  }

  let venture = null;
  try {
    const { data, error } = await supabase
      .from('ventures')
      .select('is_demo, current_lifecycle_stage')
      .eq('id', ventureId)
      .maybeSingle();
    if (!error) venture = data;
  } catch {
    venture = null;
  }

  // Rule (c): demo ventures are invisible to the predicate for every OTHER reason (once
  // reached -- rule (b) above already ran, and is NOT gated by this check).
  if (venture && venture.is_demo === true) {
    return { inScope: false, blocked: false, verdict: VERDICT.OUT_OF_SCOPE, reason: 'is_demo', armed: false };
  }

  const actualStage = venture ? venture.current_lifecycle_stage : null;

  // Rule (d): the venture is non-demo and non-null-linked, but its stage cannot be
  // resolved -- one of the two fail-closed paths (see rule (b) above for the other).
  if (!venture || actualStage === null || actualStage === undefined) {
    await writeAuditRow(supabase, { entityType: actorType, entityId: actorId, ventureId, requiredStage, actualStage: null, verdict: VERDICT.BLOCK, armed: resolvedArmed });
    return { inScope: true, blocked: true, verdict: VERDICT.BLOCK, reason: 'unresolvable_stage', armed: resolvedArmed };
  }

  // Rule (e): normal comparison, subject to an active chairman override. The override
  // lookup always runs when rawBlocked (even unarmed, so the shadow verdict accurately
  // reports what WOULD happen), but only an armed evaluation may CONSUME it (SECURITY H4).
  const rawBlocked = actualStage < requiredStage;
  const overridden = rawBlocked ? await hasActiveOverride(supabase, actorId, ventureId, resolvedArmed) : false;
  const blocked = rawBlocked && !overridden;
  const verdict = blocked ? VERDICT.BLOCK : VERDICT.PASS;
  const reason = overridden ? 'chairman_override' : null;

  await writeAuditRow(supabase, { entityType: actorType, entityId: actorId, ventureId, requiredStage, actualStage, verdict, armed: resolvedArmed });

  return { inScope: true, blocked, verdict, reason, armed: resolvedArmed };
}

/**
 * The ONE place every call site decides whether to actually reject an action.
 * `checkStageGate()`'s `blocked` field is always the real (possibly shadow) verdict;
 * this is what turns that truth into an enforcement decision — a caller must NEVER
 * inline `result.blocked` on its own, or a future flip of the arming flag would change
 * behavior at every wired site except the one that forgot this wrapper.
 *
 * @param {Awaited<ReturnType<typeof checkStageGate>>} result
 * @returns {boolean}
 */
export function shouldEnforceBlock(result) {
  return !!(result && result.armed && result.blocked);
}

export default { checkStageGate, shouldEnforceBlock, VERDICT, STAGE_GATE_ARMED_FLAG_KEY };
