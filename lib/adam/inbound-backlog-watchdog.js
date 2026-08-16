/**
 * Adam INBOUND-backlog watchdog — SD-LEO-INFRA-ADAM-INBOUND-BACKLOG-WATCHDOG-001 (FR-2).
 *
 * The INBOUND analogue of lib/adam/outbound-silence-watchdog.js. That module watches Adam's
 * OWN SENDS for unanswered replies; this one watches rows SENT TO Adam that were never acked.
 * It alarms on AGE OF OLDEST unacked row — never count-within-window, never correlation state.
 *
 * MIRRORED from outbound-silence-watchdog.js: the thresholds (UNREAD_BREACH_MS 30m /
 * UNACKED_BREACH_MS 60m, re-exported from the shared selector), the per-day dedup discipline,
 * and the presence of an independent bounded per-tick ceiling.
 *
 * DELIBERATELY NOT MIRRORED (each divergence is load-bearing, not an omission):
 *   - NO probe-emission leg. An inbound probe addressed to Adam would land in the very lane
 *     this measures. Escalation is emitFeedback ONLY; this module performs ZERO
 *     session_coordination writes (FR-2 acceptance criterion 2).
 *   - NO liveness gate. The mirror skips targets without a fresh heartbeat; for INBOUND,
 *     "no live Adam session" is the WORST backlog condition, not an exemption — the witnessed
 *     incident had Adam's recurring loops dead overnight (SD criterion 4). The gate is INVERTED
 *     by simply not having one.
 *   - NO copy of MAX_PROBES_PER_TICK=5. That cap is per-TARGET, and every inbound row shares a
 *     single target (Adam), so a literal copy structurally collapses to 1 and would cap the
 *     alarm rather than bound it. See MAX_ESCALATIONS_PER_TICK for the ceiling that replaces it.
 */

import { createRequire } from 'node:module';
import { emitFeedback } from '../governance/emit-feedback.js';
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';
import {
  fetchInboundBacklog,
  classifyBacklog,
  UNREAD_BREACH_MS,
  UNACKED_BREACH_MS,
  EVIDENCE_FLOOR_MS,
} from './inbound-backlog.js';

// SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001 (FR-7): shared with lib/coordinator/adam-identity.cjs
// (CJS) via createRequire, matching this repo's existing ESM-requires-CJS pattern, so the retired-role
// value cannot drift between the movers and this watchdog.
const require = createRequire(import.meta.url);
const { ADAM_RETIRED_ROLE } = require('../fleet/worker-status.cjs');

export const ESCALATION_KIND = 'adam_inbound_backlog';
export const SCOPE_BACKLOG = 'backlog';
export const SCOPE_UNDRAINED = 'undrained_kind_in_lane';

/**
 * Bounded per-tick escalation ceiling, justified ON ITS OWN TERMS (FR-2 acceptance criterion 4).
 *
 * This bounds the number of distinct SIGNAL SCOPES emitted per tick, NOT a number of rows. There
 * are exactly two scopes by construction (SCOPE_BACKLOG, SCOPE_UNDRAINED), so 2 is the true
 * ceiling and any third emission is a bug — not a busy lane. Contrast the mirror's
 * MAX_PROBES_PER_TICK=5, which counts per-target probes; inbound rows all share one
 * target_session, so that shape degenerates here. Keeping a real ceiling preserves the mirror's
 * risk-agent C1 property: a dedup-guard parity bug degrades to a bounded ceiling, never a storm.
 */
export const MAX_ESCALATIONS_PER_TICK = 2;

/**
 * Guard the alarm against a later threshold relaxation that would outrun its own evidence
 * (FR-2 acceptance criterion 5). EVIDENCE_FLOOR_MS is the retention floor documented in
 * lib/adam/inbound-backlog.js against
 * database/migrations/20260713_fix_cleanup_expired_coordination_where_clause.sql — if a breach
 * threshold ever crept past it the alarm would "clear" because retention reaped the evidence,
 * not because anyone drained the lane. Returns an error string instead of throwing so the
 * caller can exit with the INFRA code rather than a false all-clear.
 */
export function assertThresholdsBelowEvidenceFloor() {
  const worst = Math.max(UNREAD_BREACH_MS, UNACKED_BREACH_MS);
  if (worst >= EVIDENCE_FLOOR_MS) {
    return `breach threshold ${worst}ms >= EVIDENCE_FLOOR_MS ${EVIDENCE_FLOOR_MS}ms — the alarm would clear by retention, not by drainage`;
  }
  return null;
}

/** Pure: the per-scope dedup key. Shape <kind>:<scope>:<date> → one row per scope per day. */
export function dedupKeyFor(scope, nowMs) {
  return `${ESCALATION_KIND}:${scope}:${new Date(nowMs).toISOString().slice(0, 10)}`;
}

/**
 * Pure: the escalation description for a scope.
 *
 * INVARIANT WITHIN THE DEDUP WINDOW (FR-2 acceptance criterion 3 + SD-level AC). emitFeedback
 * hashes `${today}::${description}::${dedup_key}` (lib/governance/emit-feedback.js:249-252), so
 * ANY per-tick-varying value here — an age, a count, a row id — changes the hash every firing and
 * defeats dedup entirely. That is precisely how the live 66-row fleet_dormancy storm happened.
 * Variable evidence therefore goes in `metadata` ONLY, which is not part of the hash input.
 */
export function descriptionFor(scope) {
  if (scope === SCOPE_UNDRAINED) {
    return 'One or more inbound kinds in the Adam lane are absent from DRAIN_SETS.adam, so they are structurally undrainable. They are excluded from the backlog age computation, and this signal exists so that exclusion cannot silently hide a real drain-set gap.';
  }
  return 'The oldest unacked inbound row addressed to Adam has exceeded its breach threshold. Correlation participation is deliberately NOT treated as discharge of the ack obligation: answering a chain Adam took part in is not the same as Adam having read this row.';
}

/**
 * IO: resolve EVERY historical Adam session id — live (role='adam') AND retired
 * (role=ADAM_RETIRED_ROLE, SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001 FR-7). Previously
 * filtered role='adam' only, which silently dropped a seat the moment it retired (role flips to
 * ADAM_RETIRED_ROLE via the live JS-merge fallback) — exactly the class of stranding gap this SD
 * closes for the movers; this watchdog's own population must stay consistent with what they now
 * inherit from, or its "historical ids" reads stop matching reality the same way.
 *
 * Paginated, not a bare read: this module's own contract forbids bare limits, and an unpaginated
 * select here would be the same PostgREST-cap defect one layer up (testing-agent 61d1a6e2). The
 * row count is small today, which is exactly when the bug is invisible.
 */
export async function resolveAdamSessionIds(supabase) {
  try {
    const rows = await fetchAllPaginated(() => supabase
      .from('claude_sessions')
      .select('session_id')
      .in('metadata->>role', ['adam', ADAM_RETIRED_ROLE]));
    return { ids: (rows || []).map((r) => r.session_id).filter(Boolean), error: null };
  } catch (e) {
    return { ids: [], error: e && e.message ? e.message : String(e) };
  }
}

/**
 * IO: run one inbound-backlog watchdog tick. FAIL-OPEN — never throws.
 *
 * @returns {Promise<{breaching:boolean, escalated:Array, undrainedKinds:string[],
 *   oldestAgeMs:number, breachingCount:number, rawBacklogCount:number, error:?string}>}
 */
export async function runInboundBacklogWatchdog(supabase, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const result = {
    breaching: false,
    escalated: [],
    undrainedKinds: [],
    oldestAgeMs: 0,
    breachingCount: 0,
    rawBacklogCount: 0,
    error: null,
  };

  const floorError = assertThresholdsBelowEvidenceFloor();
  if (floorError) {
    result.error = floorError;
    return result;
  }

  try {
    const { ids, error: idError } = await resolveAdamSessionIds(supabase);
    if (idError) { result.error = idError; return result; }
    // No historical Adam session at all is an INFRA condition, not an all-clear: reporting
    // "no backlog" here would be the same proxy-for-the-real-signal defect this SD closes.
    if (!ids.length) { result.error = 'no role=adam session ids resolved'; return result; }

    const { rows, error: fetchError } = await fetchInboundBacklog(supabase, ids);
    if (fetchError) { result.error = fetchError; return result; }

    const verdict = classifyBacklog(rows, now);
    result.breaching = verdict.breaching;
    result.breachingCount = verdict.breachingCount;
    result.oldestAgeMs = verdict.oldestAgeMs;
    result.rawBacklogCount = verdict.rawBacklogCount;
    result.undrainedKinds = verdict.undrainedKinds;

    const scopes = [];
    if (verdict.breaching) scopes.push(SCOPE_BACKLOG);
    if (verdict.undrainedKinds.length > 0) scopes.push(SCOPE_UNDRAINED);

    for (const scope of scopes) {
      if (result.escalated.length >= MAX_ESCALATIONS_PER_TICK) break; // bounded ceiling
      // dryRun reports the verdict without emitting. The read path above still runs in full, so
      // a dry run exercises exactly the same classification the live tick would.
      if (opts.dryRun) { result.escalated.push({ scope, id: null, deduped: false, dryRun: true }); continue; }
      const emitted = await emitFeedback({
        supabase,
        title: scope === SCOPE_UNDRAINED
          ? 'Adam inbound lane contains structurally undrainable kinds'
          : 'Adam inbound backlog: oldest unacked row past breach threshold',
        description: descriptionFor(scope),
        category: 'harness_backlog',
        severity: 'high',
        dedup_key: dedupKeyFor(scope, now),
        // Variable evidence lives HERE, never in the hashed description.
        metadata: {
          scope,
          oldest_age_ms: verdict.oldestAgeMs,
          oldest_row_id: verdict.oldestRowId,
          breaching_count: verdict.breachingCount,
          raw_backlog_count: verdict.rawBacklogCount,
          undrained_kinds: verdict.undrainedKinds,
          unread_breach_ms: UNREAD_BREACH_MS,
          unacked_breach_ms: UNACKED_BREACH_MS,
        },
      });
      result.escalated.push({ scope, id: emitted && emitted.id, deduped: !!(emitted && emitted.deduped) });
    }
  } catch (e) {
    result.error = e && e.message ? e.message : String(e);
  }
  return result;
}
