/**
 * chairman-gated-decision-row-guard.mjs — SD-LEO-INFRA-CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001.
 *
 * A chairman-gated SD (metadata.requires_human_action=true, chairman-named decider) with no
 * chairman_decisions row is invisible to every decision-driving instrument. This probe finds
 * those, auto-records a durable decision row using the proven-in-production envelope, and
 * stamps the SD so the gap can't recur silently.
 *
 * MECHANISM (see PRD metadata.plan_correction / plan_correction_round2 for the full
 * evidence trail — testing-agent evidence 660b1078 / 39540b77 / 98da9ade, validation-agent
 * evidence fd5b1be7):
 *   - Envelope: decisionType='session_question', blocking=TRUE, raisedBy='adam'. This exact
 *     shape is already live in production since 2026-07-27 (lib/adam/stall-alert.js,
 *     scripts/coordinator-escalate-question.mjs) — not invented here. blocking=true is what
 *     makes isEscalationActionable() true (chairman-actionable.mjs), which is what the
 *     EXISTING chairman-decision-sla-sweep.mjs's blocking-row pass (selectBlockingSweepRows)
 *     needs to durably re-surface anything not confirmed-sent (quiet-window or rate-cap
 *     suppressed). blocking=false alone (an earlier, LEAD-phase-only correction) satisfies
 *     shouldAutoEscalate() but NOT isEscalationActionable() — a dead end this module must
 *     never revert to.
 *   - No bespoke per-tick throttle: every eligible hit uses the identical envelope. Email
 *     pacing is the EXISTING, unmodified QF-20260703-905 rate cap; durable re-surfacing for
 *     anything not confirmed-sent is the EXISTING, unmodified chairman-decision-sla-sweep.mjs.
 *   - Selection exclusion (FR-1, widened by QF-20260816-118): is there a chairman_decisions row
 *     STILL COVERING this SD — PENDING, or DECIDED within a 14-day re-ask interval (rowStillExcludes)
 *     — found either by looking up the row metadata.chairman_decision_id points to, or by
 *     content-match (brief_data.context.sd_key / summary naming the sd_key)? A DEFER/GO ruling
 *     means the SD stays held, not "ask again next tick" (the original PENDING-only check re-minted
 *     a new row and a new chairman email every single tick after any decision was made — QF-118).
 *     A row past its re-ask interval does NOT exclude — a resolved decision must not permanently
 *     suppress a later genuine re-fence.
 */
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';
import { namedDecider, isHumanActionRequested } from '../governance/human-action-decider.mjs';
import { recordPendingDecision, shouldAutoEscalate } from './record-pending-decision.mjs';
import { isEscalationActionable } from './chairman-actionable.mjs';
import { mergeMetadataKeys } from '../coordinator/safe-metadata-merge.mjs';

const CHAIRMAN_REASON_RX = /chairman/i;
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const TERMINAL_STATUSES = ['completed', 'cancelled', 'archived', 'deferred'];
// QF-20260816-510: defensive per-SD escalation throttle, belt-and-suspenders alongside
// QF-118's row-reuse dedup (rowStillExcludes) below. That fix stops a fresh row/email from
// being minted while a covering row already exists; this bounds repeat escalations to at
// most one per THROTTLE_WINDOW_MS even if this SD is ever seen as a fresh "hit" again before
// a covering row exists (a race, a metadata-write failure, a future regression) -- the exact
// shape of flood this module's own drift-detection already treats as possible (see the
// per-tick try/catch discussion above).
const THROTTLE_WINDOW_MS = 4 * 60 * 60 * 1000;
// QF-20260816-118: a DECIDED row (Adam terminalized GO/DEFER) must keep excluding its SD for a
// bounded re-ask interval -- the ruling means "stays held", not "ask again next tick". Excluding
// forever would reintroduce the original silent-fence bug this module exists to close, so this is
// a window, not a permanent suppression.
const REASK_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

/** Does this chairman_decisions row still cover its SD -- pending, or decided within the
 *  re-ask interval? decided_by is required (not just status!=='pending') so an unrelated
 *  metadata touch that bumps updated_at can never masquerade as a real decision. */
function rowStillExcludes(row, now) {
  if (!row) return false;
  if (row.status === 'pending') return true;
  if (!row.decided_by) return false;
  const decidedAt = Date.parse(row.updated_at);
  return Number.isFinite(decidedAt) && now.getTime() - decidedAt < REASK_INTERVAL_MS;
}

/** PURE: does this SD's metadata name the chairman as decider (either OR-arm)? */
export function isChairmanGated(metadata) {
  const m = metadata || {};
  if (!isHumanActionRequested(m.requires_human_action)) return false;
  const decider = namedDecider(m);
  if (decider && CHAIRMAN_REASON_RX.test(decider)) return true;
  return CHAIRMAN_REASON_RX.test(m.requires_human_action_reason || '');
}

/**
 * PURE: build the proven-working envelope for recordPendingDecision(). Shared by every
 * eligible hit — there is no separate escalating/non-escalating variant (FR-3).
 * @param {{sd_key:string, metadata?:object}} sd
 * @returns {object} options object for recordPendingDecision(supabase, options)
 */
export function buildDecisionEnvelope(sd) {
  const m = sd.metadata || {};
  const fenceAgeH = Number.isFinite(sd.created_at ? (Date.now() - Date.parse(sd.created_at)) / 3600000 : NaN)
    ? Math.round((Date.now() - Date.parse(sd.created_at)) / 3600000)
    : null;
  return {
    title: `[FENCED-SD GO/DEFER ${sd.sd_key}]`,
    decisionType: 'session_question',
    blocking: true,
    raisedBy: 'adam',
    // QF-20260816-118: unfence_condition is the CONDITION under which the fence lifts, not a
    // recommendation -- folding it into `recommendation` made the chairman-facing email read it
    // as Adam's own advice. recommendation is Adam's actual recommendation only (or an honest
    // "no recommendation yet" default); the condition text lives in context, clearly labeled.
    recommendation: m.adam_recommendation || 'GO/DEFER — Adam to recommend',
    context: {
      sd_key: sd.sd_key,
      options: ['GO', 'DEFER'],
      fenced_age: fenceAgeH === null ? null : `${fenceAgeH}h`,
      default_if_no_reply: 'DEFER',
      batch: 'chairman-gated-decision-row-guard',
      kind: 'sd_unfence_go_defer',
      unfence_condition: m.unfence_condition || null,
    },
  };
}

/** Confirms the envelope this module builds actually reaches the chairman (regression guard). */
export function envelopeIsDurablyActionable(envelope) {
  const auto = shouldAutoEscalate({ decisionType: envelope.decisionType, blocking: envelope.blocking, raisedBy: envelope.raisedBy });
  const durable = isEscalationActionable({ status: 'pending', decision_type: envelope.decisionType, blocking: envelope.blocking });
  return { autoEscalates: auto, durablyActionable: durable, ok: auto && durable };
}

/**
 * Fetch the full, non-paginated-truncated population of candidate SDs.
 * @param {object} supabase
 */
async function fetchCandidateSDs(supabase) {
  const rows = await fetchAllPaginated(() =>
    supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, metadata, created_at')
      .is('claiming_session_id', null)
      .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
  );
  return (rows || []).filter((sd) => isChairmanGated(sd.metadata));
}

/**
 * Anchored content-match: does this pending row's summary or brief_data.context.sd_key name
 * EXACTLY this sd_key? SECURITY FIX (EXEC-TO-PLAN evidence 3f372743, SEC-F1): an earlier version
 * used an unanchored `summary.includes(sd.sd_key)` substring test — for a short key like
 * SD-NAV-CMD-001, that also matches a longer sibling's summary (SD-NAV-CMD-001C), silently
 * stamping the WRONG decision id onto the victim SD and durably suppressing it from future
 * probe runs (the exact defect class this SD exists to eliminate, reintroduced by an unanchored
 * string check). buildDecisionEnvelope's summary format is `[FENCED-SD GO/DEFER <sd_key>]` — the
 * trailing `]` is the anchor: SD-NAV-CMD-001] is never a substring of ...-001C]'s summary.
 */
function summaryNamesSdKey(summary, sdKey) {
  return (summary || '').includes(`DEFER ${sdKey}]`);
}

/**
 * Given a candidate SD, resolve whether an EXISTING chairman_decisions row still covers it —
 * PENDING, or DECIDED within the re-ask interval (QF-20260816-118, rowStillExcludes) — by
 * id-lookup (metadata.chairman_decision_id) OR content-match. Returns the covering row's id (for
 * backfill) and, if it was decided, its decided-at timestamp (for the chairman_decision_at
 * stamp); null/null if the SD is a genuine hit. FAILS CLOSED on a query error (EXEC-TO-PLAN
 * evidence f03f1509/3f372743, TESTING-F3/SEC-F2): an earlier version silently discarded query
 * errors and proceeded as "no covering row found", which on a transient DB error would mint a
 * DUPLICATE chairman_decisions row for an SD that already has one, reporting nothing. An error
 * here means "cannot determine" — never "not excluded".
 * @returns {Promise<{ excluded: boolean, backfillId: string|null, decidedAt: string|null, error: string|null }>}
 */
async function resolveExistingPendingDecision(supabase, sd, now) {
  const stampedId = sd.metadata?.chairman_decision_id;
  if (stampedId) {
    const { data, error } = await supabase.from('chairman_decisions').select('id, status, updated_at, decided_by').eq('id', stampedId).maybeSingle();
    if (error) return { excluded: true, backfillId: null, decidedAt: null, error: `id_lookup_failed: ${error.message}` };
    if (rowStillExcludes(data, now)) {
      return { excluded: true, backfillId: null, decidedAt: data.status === 'pending' ? null : data.updated_at, error: null };
    }
    // stale/absent id, or a decided row past its re-ask interval: falls through to content-match.
  }
  const { data: byContent, error: contentError } = await supabase
    .from('chairman_decisions')
    .select('id, status, summary, brief_data, updated_at, decided_by')
    .or(`brief_data->context->>sd_key.eq.${sd.sd_key},summary.ilike.%${sd.sd_key}%`);
  if (contentError) return { excluded: true, backfillId: null, decidedAt: null, error: `content_match_failed: ${contentError.message}` };
  const match = (byContent || []).find(
    (row) => (row.brief_data?.context?.sd_key === sd.sd_key || summaryNamesSdKey(row.summary, sd.sd_key))
      && rowStillExcludes(row, now)
  );
  if (match) {
    return { excluded: true, backfillId: stampedId === match.id ? null : match.id, decidedAt: match.status === 'pending' ? null : match.updated_at, error: null };
  }
  return { excluded: false, backfillId: null, decidedAt: null, error: null };
}

/**
 * Run one probe tick. Injectable supabase client for testability (TR pattern, CLAUDE_EXEC
 * "Testability-Aware Implementation"). No side effects beyond DB writes described in the PRD.
 * @param {object} supabase
 * @param {{ now?: Date, minAgeMs?: number, throttleMs?: number }} [opts]
 * @returns {Promise<{ hits: number, recorded: number, backfilled: number, suppressed: number, errors: Array<{sd_key:string, error:string}> }>}
 */
export async function runChairmanGatedDecisionRowGuard(supabase, opts = {}) {
  const now = opts.now || new Date();
  const minAgeMs = opts.minAgeMs ?? MIN_AGE_MS;
  const throttleMs = opts.throttleMs ?? THROTTLE_WINDOW_MS;

  const candidates = await fetchCandidateSDs(supabase);
  const eligible = candidates.filter((sd) => now.getTime() - Date.parse(sd.created_at) >= minAgeMs);

  let recorded = 0;
  let backfilled = 0;
  let suppressed = 0;
  const errors = [];
  let hits = 0;

  // ACCEPTED RESIDUAL (ship-review adversarial evidence, WARNING #2): the mergeMetadataKeys /
  // recordPendingDecision calls in this loop body are not individually try/caught. A thrown
  // (not returned-as-{error}) exception -- e.g. mergeMetadataKeys throws synchronously if
  // sd.sd_key is falsy, and strategic_directives_v2.sd_key has no NOT NULL/format constraint --
  // aborts processing of the REST of this tick's batch. Bounded, same shape/reasoning as the
  // SEC-F3-RESIDUAL tradeoff below: the outer try/catch in adam-quiet-tick.mjs still prevents a
  // whole-tick crash, and any unprocessed SD is simply retried next tick (no data loss, no
  // silent failure) -- accepted rather than wrapping each call, which would add complexity
  // disproportionate to a low-probability edge case guarded by this codebase's own SD-creation
  // tooling always setting sd_key.
  for (const sd of eligible) {
    const { excluded, backfillId, decidedAt, error: resolveError } = await resolveExistingPendingDecision(supabase, sd, now);

    if (resolveError) {
      // FAIL CLOSED (EXEC-TO-PLAN evidence f03f1509/3f372743): a query error means "cannot
      // determine", never "not excluded" — surfacing it and skipping this tick (retried next
      // tick) avoids minting a duplicate row for an SD that may already have one.
      errors.push({ sd_key: sd.sd_key, error: resolveError });
      console.error(`QUIET_TICK_CHAIRMAN_GATED_STAMP_ERROR=adam sd_key=${sd.sd_key} error="${resolveError}"`);
      continue;
    }

    if (excluded) {
      // QF-20260816-118: opportunistically stamp both the (possibly-backfilled) decision id and,
      // when the covering row was DECIDED (not merely pending), chairman_decision_at — the
      // audit trail for the re-ask interval. One merge call when both apply.
      const stampPatch = {};
      if (backfillId) stampPatch.chairman_decision_id = backfillId;
      if (decidedAt) stampPatch.chairman_decision_at = decidedAt;
      if (Object.keys(stampPatch).length) {
        const stamp = await mergeMetadataKeys(sd.sd_key, stampPatch);
        if (!stamp.merged) {
          errors.push({ sd_key: sd.sd_key, error: stamp.error || 'stamp_merge_failed' });
          console.error(`QUIET_TICK_CHAIRMAN_GATED_STAMP_ERROR=adam sd_key=${sd.sd_key} error="${stamp.error || 'stamp_merge_failed'}"`);
        } else if (backfillId) {
          backfilled += 1;
        }
      }
      // FIX (EXEC-TO-PLAN re-verification, testing-agent F10/F11): the SD is no longer a hit —
      // this IS the recovery this module's own drift-detection comment (below) already claimed
      // to handle. An earlier version left both drift markers set forever once stamped, so the
      // alreadyFlagged latch evaluated true permanently and a genuine recover -> re-fence ->
      // stuck-again cycle (FR-1 AC-4/AC-5's own designed happy path) produced zero drift
      // feedback on the second and all later episodes — a silence-shaped regression traded for
      // the noise-shaped bug the F1/F2 fix closed. Clearing both markers on recovery ends the
      // episode for real, so a future re-fence starts fresh and can be flagged again.
      // QF-20260816-510: gated_guard_last_escalated_at/suppressed_count must clear here too — a
      // new episode's tick 1 must be able to escalate immediately, not inherit the PRIOR
      // episode's last-escalation timestamp and get defensively throttled on a fresh re-fence.
      if (sd.metadata?.gated_guard_prior_hit_at || sd.metadata?.gated_guard_drift_flagged_at || sd.metadata?.gated_guard_last_escalated_at) {
        await mergeMetadataKeys(sd.sd_key, {
          gated_guard_prior_hit_at: null,
          gated_guard_drift_flagged_at: null,
          gated_guard_last_escalated_at: null,
          gated_guard_suppressed_count: 0,
        });
      }
      continue; // a pending row already covers this SD — not a hit, per FR-1's collapsed check.
    }

    hits += 1;

    // QF-20260816-510: suppress if a real escalation for this SD already fired within the
    // throttle window — a defensive cap independent of the row-reuse dedup above.
    const lastEscalatedAt = sd.metadata?.gated_guard_last_escalated_at;
    if (lastEscalatedAt && now.getTime() - Date.parse(lastEscalatedAt) < throttleMs) {
      suppressed += 1;
      await mergeMetadataKeys(sd.sd_key, { gated_guard_suppressed_count: (sd.metadata?.gated_guard_suppressed_count || 0) + 1 });
      continue;
    }
    const suppressedSinceLastEscalation = sd.metadata?.gated_guard_suppressed_count || 0;

    // Repeat-unsurfaced drift (FR-5): this SD was ALSO a hit on a prior tick (marker already
    // set) and has not yet been flagged for the current failure episode. One feedback row per
    // episode, not one per tick — flagged, then the marker prevents re-firing until the SD
    // recovers (stops being a hit) and later regresses again.
    // BUG FIX (EXEC-TO-PLAN evidence f03f1509, TESTING-F1/F2): gated_guard_prior_hit_at MUST
    // only be stamped the FIRST time this SD is seen as a hit (`if (!priorHitAt)` below) — an
    // earlier version stamped it unconditionally every tick, which advanced the "first seen"
    // marker forward on every tick INCLUDING the one that just flagged drift, making the
    // flagged_at>=prior_hit_at latch go stale one tick later and re-fire every OTHER tick
    // indefinitely (measured: fires on ticks 2, 4, 6...). Pinning prior_hit_at at first-sight
    // keeps the latch correctly "already flagged" until the SD actually recovers.
    const priorHitAt = sd.metadata?.gated_guard_prior_hit_at;
    const alreadyFlagged = sd.metadata?.gated_guard_drift_flagged_at
      && priorHitAt
      && Date.parse(sd.metadata.gated_guard_drift_flagged_at) >= Date.parse(priorHitAt);
    if (priorHitAt && !alreadyFlagged) {
      // FIX (CI schema-reference-lint, caught pre-merge): feedback has no `content` column —
      // confirmed against database/schema-reference-snapshot.json and the established insert
      // shape in lib/governance/coverage-matrix-referent-audit.js. Using title+description
      // matches every other feedback producer in this codebase.
      const { error: fbErr } = await supabase.from('feedback').insert({
        type: 'issue',
        category: 'adam_adherence_drift',
        priority: 'P2',
        status: 'new',
        title: `SD ${sd.sd_key} remained unsurfaced by chairman-gated-decision-row-guard`,
        description: `SD ${sd.sd_key} remained unsurfaced across consecutive probe ticks (first seen ${priorHitAt}) — the auto-record/stamp mechanism itself may be stuck.`,
        metadata: { sd_key: sd.sd_key, first_seen_hit_at: priorHitAt, detected_at: now.toISOString() },
      });
      if (!fbErr) {
        const flagStamp = await mergeMetadataKeys(sd.sd_key, { gated_guard_drift_flagged_at: now.toISOString() });
        if (!flagStamp.merged) {
          // SEC-F3 (EXEC-TO-PLAN evidence 3f372743): if this stamp fails, the "already flagged"
          // latch never engages and the feedback row would re-insert every tick, unbounded.
          // Loud, not silent — an operator can see the stamp is stuck even though the drift
          // detection itself degrades to "always fires" until the underlying DB issue clears.
          console.error(`QUIET_TICK_CHAIRMAN_GATED_STAMP_ERROR=adam sd_key=${sd.sd_key} error="drift_flag_stamp_failed: ${flagStamp.error || 'unknown'}"`);
        }
      }
    }
    if (!priorHitAt) {
      await mergeMetadataKeys(sd.sd_key, { gated_guard_prior_hit_at: now.toISOString() });
    }

    const envelope = buildDecisionEnvelope(sd);
    envelope.context.suppressed_since_last_escalation = suppressedSinceLastEscalation;
    const result = await recordPendingDecision(supabase, envelope);
    if (!result.recorded) {
      errors.push({ sd_key: sd.sd_key, error: result.error || 'record_failed' });
      continue; // left as a hit next tick; not silently dropped.
    }
    recorded += 1;

    const stamp = await mergeMetadataKeys(sd.sd_key, {
      chairman_decision_id: result.id,
      gated_guard_last_escalated_at: now.toISOString(),
      gated_guard_suppressed_count: 0,
    });
    if (!stamp.merged) {
      errors.push({ sd_key: sd.sd_key, error: stamp.error || 'stamp_merge_failed' });
      console.error(`QUIET_TICK_CHAIRMAN_GATED_STAMP_ERROR=adam sd_key=${sd.sd_key} error="${stamp.error || 'stamp_merge_failed'}"`);
    }
  }

  return { hits, recorded, backfilled, suppressed, errors };
}
