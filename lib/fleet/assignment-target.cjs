/**
 * Shared WORK_ASSIGNMENT target resolver — the ONE place a dispatch target is resolved.
 * SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 (FR-1, FR-4, FR-5).
 *
 * WHY THIS MODULE EXISTS. A WORK_ASSIGNMENT whose target the worker cannot find is silently
 * skipped — no ack, no claim attempt, no warning. That happened three times, and each prior
 * remedy added ONE more field name to ONE extractor (QF-20260704-602 added payload.qf_id,
 * QF-20260707-650 added payload.qf). That cannot converge, because the field list was never
 * the defect.
 *
 * THE ACTUAL DEFECT IS A WRITER/READER ASYMMETRY, measured on live rows: the five dispatch-side
 * resolutions in lib/coordinator/dispatch.cjs all read the TOP-LEVEL COLUMN row.target_sd, and
 * the worker-side extractor read ONLY payload.* fields plus text — it never looked at that column.
 * 10 of 46 inert-and-unacked assignments were therefore fully valid to every dispatch guard and
 * completely invisible to the worker. They were not malformed; they were unreadable by one side.
 *
 * ============================================================================================
 * THE SHARED THING IS THE FIELD REGISTRY, *NOT* A SINGLE GLOBAL ORDER. THIS IS LOAD-BEARING.
 * ============================================================================================
 * The first cut of this module imposed one order on every caller. Measured against live rows it
 * CHANGED the resolution of 26 of the 70 rows the old extractor already resolved — e.g. a row
 * that resolved to SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-B started resolving to
 * QF-20260727-259. That is misrouting: it converts a visible failure (nothing happens) into an
 * invisible one (the wrong work is claimed), which is strictly worse than the bug being fixed.
 *
 * So: every call site keeps its OWN precedence (PROFILES below, each pinned to the exact
 * expression it replaces), and the newly-taught locations are appended LAST in every profile.
 * Appending last is what makes this provably additive — a new source can only ever resolve a row
 * that previously resolved to NOTHING. Sharing the registry is what removes the asymmetry;
 * sharing an order was never required and is actively harmful.
 *
 * AMBIGUITY IS A FIRST-CLASS RESULT, NOT A GUESS. 35 of the 46 rows name a QF key only in text,
 * and 12 name MORE THAN ONE distinct key — e.g. "SUPERSEDES my QF-20260725-630 dispatch — take
 * QF-20260726-459 instead", where a first-match scan picks the SUPERSEDED key. Text therefore
 * yields a target ONLY when exactly one distinct key is present.
 *
 * THERE IS DELIBERATELY NO first-match COMPATIBILITY MODE. One was drafted and removed: the legacy
 * scan was SD-anchored, so teaching it QF keys CHANGES first-match by construction on any row
 * naming both — measured live, e.g. a row resolving to SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001
 * began resolving to QF-20260726-175 purely because the QF appeared earlier in the prose. A mode
 * that promises "zero behaviour change" while widening the pattern cannot keep that promise, and
 * offering it would have shipped the misroute under a compatibility label.
 *
 * THE ACCEPTANCE BAR IS THEREFORE NOT IDENTITY, IT IS DIRECTIONAL:
 *   null -> key            GAIN      (a previously-unreadable row becomes readable)
 *   key  -> null           SAFE      (multi-key text: we now refuse instead of guessing — FR-5)
 *   key  -> DIFFERENT key  FORBIDDEN (this is misrouting; zero occurrences permitted)
 * Only the third class is a regression, and it is the one the tests pin at zero.
 *
 * @module lib/fleet/assignment-target
 */

'use strict';

/** SD- and QF- work-item keys. The historical worker-side regex was SD-anchored, so a QF key in
 *  text could never match — 35 rows deep, that mattered. */
const WORK_KEY_RE = /\b(?:SD|QF)-[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g;

/**
 * THE SHARED REGISTRY — every location a target has ever been observed in. Sites differ in the
 * ORDER they consult these, never in which ones exist. Adding a location here teaches every
 * caller at once, which is the property the two prior fixes lacked.
 *
 * `historical: true` = no CURRENT writer emits it (verified across the live population). Retained
 * for back-compat, tagged with the incident that introduced it so the list stays auditable.
 */
const SOURCES = {
  'payload.assigned_sd': { scope: 'payload', key: 'assigned_sd', historical: true },
  'payload.sd_key': { scope: 'payload', key: 'sd_key' },
  'payload.current_sd': { scope: 'payload', key: 'current_sd' },
  'payload.available_sds': { scope: 'payload', key: 'available_sds', array: true },
  'payload.qf_id': { scope: 'payload', key: 'qf_id', historical: true, since: 'QF-20260704-602' },
  'payload.qf': { scope: 'payload', key: 'qf', historical: true, since: 'QF-20260707-650' },
  'top.target_sd': { scope: 'top', key: 'target_sd' },
  'payload.target_sd': { scope: 'payload', key: 'target_sd' }
};

/** Sources taught by THIS SD. Appended last in every profile so adoption is provably additive. */
const NEWLY_TAUGHT = ['top.target_sd', 'payload.target_sd'];

/**
 * Per-call-site precedence. Each profile reproduces the expression it replaces EXACTLY, then
 * appends NEWLY_TAUGHT. `text` marks where the site's text scan sits in its own order.
 */
const PROFILES = {
  // scripts/worker-checkin.cjs:297 extractSdFromAssignment
  worker: ['payload.assigned_sd', 'payload.sd_key', 'payload.qf_id', 'payload.qf',
    'payload.available_sds', 'text', 'payload.current_sd', ...NEWLY_TAUGHT],
  // scripts/worker-checkin.cjs:336 extractDirectedSd — deliberately narrow. The stale-session-sweep
  // emits a generic "next work available" assignment to every busy claim-holder carrying
  // {available_sds, current_sd}; treating that queue pointer as a directed redirect would yank a
  // worker off its own SD (SD-FDBK-FIX-WORKER-CHECK-SURFACES-001). Structured-directed only.
  directed: ['payload.assigned_sd', 'payload.sd_key', ...NEWLY_TAUGHT],
  // lib/coordinator/dispatch.cjs:219 assertSdDispatchable
  dispatchGuard: ['top.target_sd', 'payload.sd_key', 'payload.current_sd', 'payload.assigned_sd',
    ...NEWLY_TAUGHT],
  // lib/coordinator/dispatch.cjs:295/:347/:494/:572 — stamps + tier/door guards
  dispatchStamp: ['payload.assigned_sd', 'payload.sd_key', 'top.target_sd', ...NEWLY_TAUGHT]
};

function readSource(row, name) {
  const src = SOURCES[name];
  if (!src) return null;
  const container = src.scope === 'top'
    ? row
    : (row.payload && typeof row.payload === 'object' ? row.payload : {});
  const v = container ? container[src.key] : undefined;
  if (src.array) return Array.isArray(v) && v.length && typeof v[0] === 'string' && v[0] ? v[0] : null;
  return typeof v === 'string' && v ? v : null;
}

/** Distinct work-item keys in the row's human text, in order of first appearance. */
function keysInText(row) {
  const p = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const text = `${row.subject || ''} ${row.body || ''} ${p.body || ''}`;
  return [...new Set(text.match(WORK_KEY_RE) || [])];
}

/**
 * Resolve the target of a WORK_ASSIGNMENT row.
 *
 * @param {object} row - session_coordination row (top-level fields + .payload)
 * @param {object} [opts]
 * @param {'worker'|'directed'|'dispatchGuard'|'dispatchStamp'} [opts.profile='worker']
 * @returns {{key: string|null, source: string|null, ambiguous: boolean, candidates: string[]}}
 *   A caller MUST NOT pick from `candidates` when `ambiguous` — refuse (write side) or flag
 *   (backfill). `candidates` exists for whoever does the routing.
 */
function resolveAssignmentTarget(row, opts = {}) {
  const miss = { key: null, source: null, ambiguous: false, candidates: [] };
  if (!row || typeof row !== 'object') return miss;
  const order = PROFILES[opts.profile] || PROFILES.worker;

  for (const name of order) {
    if (name === 'text') {
      const inText = keysInText(row);
      if (inText.length === 1) return { key: inText[0], source: 'text', ambiguous: false, candidates: inText };
      // >1 distinct key: refuse rather than guess (FR-5). Ambiguity stops the scan — falling
      // through to a lower-priority source here would silently re-introduce the guess.
      if (inText.length > 1) return { key: null, source: null, ambiguous: true, candidates: inText };
      continue;
    }
    const v = readSource(row, name);
    if (v) return { key: v, source: name, ambiguous: false, candidates: [] };
  }
  return miss;
}

/** Convenience: the key only, or null. Never throws. */
function resolveAssignmentTargetKey(row, opts) {
  return resolveAssignmentTarget(row, opts).key;
}

/**
 * FR-2/FR-3: the shared unreadability verdict for a WORK_ASSIGNMENT row.
 *
 * Lives here, not in dispatch.cjs, because there is more than one writer. The canonical
 * choke point (insertCoordinationRow) is one; scripts/stale-session-sweep.cjs inserts RAW,
 * deliberately — it emits an informational completion nudge and must NOT acquire the tier /
 * door / fleet-target guards that the choke point applies to directed assignments. Duplicating
 * the check at that site would recreate this SD's own defect one layer up (two copies of a rule,
 * free to drift), so both call sites share THIS function instead.
 *
 * IT RESOLVES WITH THE READER'S PROFILE. The question is always "can the WORKER find a target
 * in this row?", never "can the writer?" — a writer-side check that uses the writer's own field
 * view would approve rows the reader cannot read, which is the exact asymmetry being closed.
 *
 * @param {object} row - the session_coordination row about to be written
 * @returns {null|{detail: string, ambiguous: boolean, candidates: string[], payloadKeys: string[]}}
 *   null when the row is fine (or is not a WORK_ASSIGNMENT). Otherwise a description naming what
 *   was actually present — the diagnostic whose absence let three incidents go undiagnosed.
 */
function describeUnreadableAssignment(row) {
  if (!row || row.message_type !== 'WORK_ASSIGNMENT') return null;
  const resolved = resolveAssignmentTarget(row, { profile: 'worker' });
  if (resolved.key) return null;
  const payloadKeys = row.payload && typeof row.payload === 'object' ? Object.keys(row.payload) : [];
  const detail = resolved.ambiguous
    ? `payload/text names MORE THAN ONE work item (${resolved.candidates.join(', ')}) — refusing to guess which is the target`
    : `no resolvable target in payload keys [${payloadKeys.join(', ')}] or top-level target_sd`;
  return { detail, ambiguous: resolved.ambiguous, candidates: resolved.candidates, payloadKeys };
}

module.exports = {
  resolveAssignmentTarget,
  resolveAssignmentTargetKey,
  describeUnreadableAssignment,
  WORK_KEY_RE,
  SOURCES,
  PROFILES,
  NEWLY_TAUGHT
};
