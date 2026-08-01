/**
 * lib/chairman/decision-disposition.mjs — the disposition reader.
 * SD-FDBK-INFRA-DECISION-QUEUE-RETIREMENT-001, FR-3.
 *
 * THE QUEUE HAS NO WAY TO LEARN THAT A DECISION WAS ALREADY MADE. Five of its seven live rows carry
 * a chairman deferral — several deferred twice — and the queue keeps presenting them as untouched and
 * ageing. The records exist, are attributable, and are read by nothing. This module is the reader.
 *
 * DELIBERATELY PURE AND DEPENDENCY-FREE, matching lib/chairman/decision-queue.mjs (:10-11): callers
 * inject rows, so the unit tier can exercise every branch without DB plumbing.
 *
 * ===== WHY target_id, MEASURED RATHER THAN CHOSEN =====
 * A review flagged a join-key split in the WRITER: scripts/chairman-decisions.mjs:96 writes
 * metadata.flag_id while :113 writes metadata.target_id — two keys for one concept, twenty lines
 * apart, and a both-directions test cannot catch it because both directions share one seeding helper.
 * So the key was settled by a FULL KEY CENSUS over the whole live population rather than by reading
 * either line: 21 of 21 chairman_decision_deferred rows carry target_id, decided_by, deferred_at and
 * decision_type. flag_id appears ZERO times. target_id is the key; the flag_id branch writes
 * something this lane never sees.
 *
 * ===== DEFERRAL IS NOT RETIREMENT, AND CONFLATING THEM WOULD BE THE WORSE BUG =====
 * A deferral says "not now", not "never" — lib/chairman/decision-queue.mjs:128-130 documents it as a
 * visibility act. So a deferral RESTARTS THE AGE CLOCK; it does not remove the row. Treating it as a
 * retirement would silently delete decisions the chairman intends to make, which is the catastrophic
 * direction for this SD. Retirement requires its own explicit disposition.
 *
 * snoozed_until is honoured when present. It is currently populated on 0 of 21 rows even though
 * feedback.snoozed_until and lib/quality/snooze-manager.js both exist — that unused affordance is
 * FR-6's actual defect, and this reader is written to consume it the moment the writer sets it.
 */

/** The feedback category the chairman-deferral writer stamps. Measured: the only category in this lane. */
export const DEFERRAL_CATEGORY = 'chairman_decision_deferred';

/** The join key, established by a full key census over all 21 live rows (see header). */
export const DISPOSITION_KEY = 'target_id';

/**
 * Index disposition records by the decision they refer to.
 * Keeps the MOST RECENT per target: a row deferred twice is governed by the later deferral, and
 * three of the live rows have exactly that shape.
 *
 * @param {Array<object>} rows feedback rows (any categories; non-deferrals are ignored)
 * @returns {Map<string, object>} target_id -> {targetId, deferredAt, decidedBy, decisionType, snoozedUntil, basis, sourceId}
 */
export function indexDispositions(rows) {
  const out = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || r.category !== DEFERRAL_CATEGORY) continue;
    const md = r.metadata || {};
    const targetId = md[DISPOSITION_KEY];
    if (!targetId) continue; // no key, no claim — a record we cannot attribute governs nothing
    const deferredAt = md.deferred_at || r.created_at || null;
    const prev = out.get(targetId);
    if (prev && Date.parse(prev.deferredAt) >= Date.parse(deferredAt)) continue;
    out.set(targetId, {
      targetId,
      deferredAt,
      decidedBy: md.decided_by || null,
      decisionType: md.decision_type || null,
      snoozedUntil: r.snoozed_until || null,
      basis: r.description || r.title || null,
      sourceId: r.id
    });
  }
  return out;
}

/**
 * The effective age clock for a row: the deferral if one exists, otherwise creation.
 * THIS IS THE WHOLE POINT — the queue ages every row from created_at, so a decision the chairman
 * deferred yesterday still presents as 56 days stale and escalates on that basis.
 *
 * @returns {{since: string|null, source: 'deferral'|'creation', disposition: object|null}}
 */
export function ageClockFor(row, dispositions) {
  const id = row?.id;
  const d = id && dispositions instanceof Map ? dispositions.get(id) : null;
  if (d && d.deferredAt) return { since: d.deferredAt, source: 'deferral', disposition: d };
  return { since: row?.created_at || null, source: 'creation', disposition: null };
}

/**
 * Is this row under an ACTIVE hold right now?
 * A deferral with a snoozed_until in the future is held until then. A deferral without one is an
 * open-ended "not now": it restarts the clock (see ageClockFor) but does not suppress the row,
 * because suppressing indefinitely on an unbounded record would hide decisions permanently.
 */
export function isHeld(row, dispositions, now = new Date()) {
  const id = row?.id;
  const d = id && dispositions instanceof Map ? dispositions.get(id) : null;
  if (!d || !d.snoozedUntil) return false;
  const until = Date.parse(d.snoozedUntil);
  return Number.isFinite(until) && until > now.getTime();
}

/**
 * The authority for retiring a row, or null. FR-3: absence of authority BLOCKS retirement rather
 * than defaulting it, so this returns null rather than a permissive object and every caller must
 * handle null explicitly.
 *
 * Returns the citation a retirement must record — never a bare boolean, because "retired" without
 * a basis is exactly the unattributable stamp this SD exists to remove.
 */
export function retirementAuthority(row, dispositions) {
  const id = row?.id;
  const d = id && dispositions instanceof Map ? dispositions.get(id) : null;
  if (!d) return null;
  if (!d.deferredAt || !d.decidedBy) return null; // an unattributable record authorises nothing
  return {
    targetId: d.targetId,
    citedRecord: d.sourceId,
    decidedBy: d.decidedBy,
    decidedAt: d.deferredAt,
    basis: d.basis,
    disposition: 'deferred'
  };
}
