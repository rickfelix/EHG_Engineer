/**
 * SD-LEO-INFRA-DRIVE-STATE-OBSERVABILITY-001 — FR-2 (persist) and FR-5 (duration).
 *
 * lib/governance/drive-state/ computes a six-axis verdict and has NO write path; both consumers
 * render it and discard it. This module is the write path, plus the one question the history
 * exists to answer.
 *
 * WHY IT LIVES IN scripts/lib AND NOT lib/drive-loop/: tests/unit/drive-loop/report-posture.test.js
 * fails the build on any `.insert(` under lib/drive-loop/. That boundary is deliberate (that
 * subsystem proposes, it does not write), and this is a different subsystem that shares only the
 * word "drive". Same reason scripts/lib/capacity-verdict-store.mjs sits here.
 *
 * Shape template: scripts/lib/capacity-verdict-store.mjs:94-140.
 */

'use strict';

// IMPORTED, NEVER REDECLARED. A retyped axis list would be a second representation of the frozen
// vocabulary — the precise thing this SD is forbidden to create. The schema CHECK is the one
// unavoidable second copy, and it is held in agreement by a two-sided drift test.
const { AXES, STATE, STATES, ACTIONS } = require('../../lib/governance/drive-state/contract.cjs');
const { safeCitation } = require('../../lib/governance/drive-state/render.cjs');

const TABLE = 'drive_state_verdicts';

/**
 * SANITISE AT THE SINK, not only at the sources. (SECURITY SEC-3.)
 *
 * Citations carry genuinely untrusted text: chairman-decisions.cjs:139 puts `feedback` titles into
 * one, and that table's anon INSERT policy constrains only source_type — an unauthenticated party
 * can supply the string. Every adapter wraps its own citation in safeCitation, EXCEPT the
 * adapter_threw path at index.cjs:60, which interpolates a raw error message unbounded.
 *
 * That was tolerable while a citation was a console line that scrolled away. THIS SD CONVERTS IT
 * INTO A DURABLE ROW, and a rendered string and a stored one have completely different exposure
 * lifetimes — which makes the sink the right place for the guarantee. Relying on every current and
 * FUTURE adapter to remember is convention; doing it here is construction.
 */
const CITATION_MAX = 400;
function cleanText(v, max = CITATION_MAX) {
  if (typeof v !== 'string') return v;
  try { return safeCitation(v, max); } catch { return v.slice(0, max); }
}

/**
 * Persist one computed verdict as SIX rows, one per (run_id, axis).
 *
 * THROWS on write failure. It does not log-and-continue, because a persist that swallows its own
 * failure recreates — one layer down — the exact blindness this SD exists to remove: the history
 * would silently stop growing while every hourly render still looked normal.
 *
 * @param {object} opts
 * @param {object} opts.supabase   service client
 * @param {string} opts.runId      groups the six rows into one run
 * @param {Array}  opts.entries    the verdict's axis entries (contract-shaped)
 * @returns {Promise<{run_id: string, written: number}>}
 */
async function persistDriveState({ supabase, runId, entries, table = TABLE } = {}) {
  if (!supabase) throw new Error('persistDriveState(): supabase client is required');
  if (typeof runId !== 'string' || runId.trim() === '') {
    throw new Error('persistDriveState(): runId must be a non-empty string — it is the key that makes six rows one run, and rows without it cannot be re-assembled into a history');
  }
  if (!Array.isArray(entries)) throw new Error('persistDriveState(): entries must be an array');

  // The write is guarded against a SHORT verdict as well as a wrong one. Six rows is the whole
  // premise of "all axes checked"; five rows renders identically to six on any consumer that
  // does not count, so a partial verdict must fail here rather than become a durable half-truth.
  if (entries.length !== AXES.length) {
    throw new Error(
      `persistDriveState(): expected ${AXES.length} axis entries, got ${entries.length}. `
      + 'A short verdict stored is a hole that reads exactly like an all-clear.'
    );
  }

  const seen = new Set();
  const rows = entries.map((e) => {
    if (!AXES.includes(e?.axis)) {
      throw new Error(`persistDriveState(): unrecognised axis ${JSON.stringify(e?.axis)} — expected one of ${AXES.join(', ')}`);
    }
    if (seen.has(e.axis)) throw new Error(`persistDriveState(): duplicate axis ${e.axis} in one verdict`);
    seen.add(e.axis);

    if (!STATES.includes(e?.state)) {
      throw new Error(`persistDriveState(): unrecognised state ${JSON.stringify(e?.state)} for axis ${e.axis} — expected one of ${STATES.join(', ')}`);
    }
    if (!ACTIONS.includes(e?.action_taken)) {
      throw new Error(`persistDriveState(): unrecognised action_taken ${JSON.stringify(e?.action_taken)} for axis ${e.axis}`);
    }
    // Guarded at the write, not left to the CHECK, so the failure names the axis.
    if (e.state === STATE.UNMEASURABLE && (typeof e.reason !== 'string' || e.reason.trim() === '')) {
      throw new Error(`persistDriveState(): axis ${e.axis} is UNMEASURABLE with no reason — an unexplained UNMEASURABLE is the state this vocabulary exists to prevent`);
    }
    if (typeof e.citation !== 'string' || e.citation.trim() === '') {
      throw new Error(`persistDriveState(): axis ${e.axis} has no citation — the contract requires one on EVERY state, which is the difference between a checked all-clear and an unchecked one`);
    }

    // recorded_at is DELIBERATELY NOT SENT: the column default fires. See the migration header.
    return {
      run_id: runId,
      axis: e.axis,
      state: e.state,
      citation: cleanText(e.citation),
      reason: typeof e.reason === 'string' && e.reason.trim() !== '' ? cleanText(e.reason) : null,
      action_taken: e.action_taken,
      action_citation: typeof e.action_citation === 'string' && e.action_citation.trim() !== '' ? cleanText(e.action_citation) : null,
    };
  });

  const { data, error } = await supabase.from(table).insert(rows).select('id, axis, state');

  if (error) {
    const err = new Error(
      `persistDriveState(): durable write failed (${error.code || 'no-code'}): ${error.message}. `
      + 'Throwing rather than letting the history silently stop growing while the render still looks normal.'
    );
    err.code = error.code;
    err.cause = error;
    throw err;
  }

  return { run_id: runId, written: Array.isArray(data) ? data.length : rows.length };
}

/**
 * FR-5 — the duration question the history exists to answer: for each axis, how long has it been
 * stalled, counting only its CURRENT UNBROKEN run of STALLED readings.
 *
 * IMPLEMENTED IN JS OVER FETCHED ROWS, ON PURPOSE. A SQL grouping or a view could not be
 * exercised by the repo's applying test fake (tests/unit/governance/drive-state-axes.test.js
 * implements eq/in/gte/not/order/limit and has no grouping, aggregation or HAVING), so it could
 * only ever be tested against an approximation that passes while the real query is wrong.
 *
 * CONTIGUITY IS THE WHOLE POINT. A naive "count the STALLED rows" reports a span that reaches back
 * across a period in which the axis RECOVERED. STALLED, then CLEAR, then STALLED is TWO short
 * stalls, never one long one — and the difference is exactly the kind of silently-wrong metric
 * this SD was written to stop producing.
 *
 * @returns {Promise<Array<{axis: string, since: string, runs: number}>>} one entry per CURRENTLY
 *          stalled axis; an axis that is not stalled right now is absent.
 */
async function currentStallSpans({ supabase, table = TABLE, limit = 2000 } = {}) {
  if (!supabase) throw new Error('currentStallSpans(): supabase client is required');

  const { data, error } = await supabase
    .from(table)
    .select('axis, state, recorded_at, run_id')
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) {
    const err = new Error(`currentStallSpans(): read failed (${error.code || 'no-code'}): ${error.message}`);
    err.cause = error;
    throw err;
  }

  const byAxis = new Map();
  for (const row of data || []) {
    if (!byAxis.has(row.axis)) byAxis.set(row.axis, []);
    byAxis.get(row.axis).push(row);
  }

  const out = [];
  for (const [axis, rows] of byAxis) {
    // rows are newest-first. The current span ends the moment a non-STALLED reading appears.
    if (rows.length === 0 || rows[0].state !== STATE.STALLED) continue;
    let i = 0;
    while (i < rows.length && rows[i].state === STATE.STALLED) i += 1;
    const span = rows.slice(0, i);
    out.push({ axis, since: span[span.length - 1].recorded_at, runs: span.length });
  }
  out.sort((a, b) => String(a.since).localeCompare(String(b.since)));
  return out;
}

module.exports = { persistDriveState, currentStallSpans, TABLE };
