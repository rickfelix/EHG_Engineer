// Golden reference — feedback/error-capture seam (REFERENCE ONLY, never wired).
// Source SD: SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-F
//
// A capture seam turns a risky operation into a CAPTURED failure instead of a
// SWALLOWED one. The failure class it defeats: the empty catch that discards the
// error (fail-silent), and the "session-register" class where a call returns
// ok:true while the durable row it was supposed to write is missing. The seam
// makes every failure leave TWO traces — a durable row and a stderr line — while
// never throwing (so it does not break the caller) and never flooding (identical
// recurrences dedup).
//
// Estate anchor (the shape this distills): lib/governance/emit-feedback.js
//   (@canonical-writer-for:feedback) emitFeedback(...) with
//   dedupHash = crypto.sha256(`${today}::${description}::${dedup_key}`), today =
//   toISOString().slice(0,10) (per-UTC-day); the dedup CHECK is co-scoped by
//   (category, metadata->>dedup_hash); source_id/status/priority/resolution_notes
//   are EXCLUDED from the hash; emitted_at is volatile row metadata.
//
// ATTRIBUTION HONESTY (do not miscopy as estate-distilled): "never throws" and
// "a stderr line on every first capture" are deliberate SEAM-DESIGN HARDENING, not
// a mirror of emitFeedback (which DOES throw on insert/validation and is SILENT on
// success; log-harness-bug.js uses stdout). The estate "never fully silent" seed is
// emitFeedback's console.warn enrichment paths + its console.error dual-write catch.
//
// SYNC vs ASYNC (do not miscopy): captureBoundary is SYNCHRONOUS — a rejected
// Promise from an async `op` is NOT a synchronous throw, so a sync seam would
// SILENTLY pass a failing async op (itself a swallow). Use captureBoundaryAsync for
// an async `op` and/or an async sink (the estate's emitFeedback returns a Promise).
//
// Four doctrines:
//  1. CAPTURE-AT-BOUNDARY, NEVER SWALLOW — the risky op is wrapped; on failure a
//     structured, schema-shaped entry is recorded to the INJECTED sink.
//  2. BEST-EFFORT BUT NEVER SILENT — the seam NEVER throws (for ANY thrown value or
//     hostile dependency — see symptomOf/utcDayOf/safeNow and the last-ditch guard)
//     AND a first capture writes BOTH a row AND a stderr line. The capture itself is
//     best-effort: a throwing sink/logger/clock is caught, so the anti-swallow seam
//     never becomes a swallow footgun.
//  3. DEDUP ON STABLE FIELDS ONLY — dedup_hash = sha256(utcDay::symptom::source),
//     stable fields only; emitted_at (volatile) is stored but MUST NOT join the hash.
//     Per-UTC-day, co-scoped by category; a deduped recurrence writes no new row and
//     no new stderr.
//  4. HEALTHY PATH IS SILENT — success (op returns, even a FALSY value) writes
//     nothing. Discrimination is throw-vs-return, never truthiness.
import { createHash } from 'node:crypto';

/** Safe symptom text from ANY thrown value — never throws, and keeps DISTINCT object
 *  throws distinct (a bare String(obj) collapses every object to "[object Object]"
 *  and over-dedups). Order: message string -> JSON -> constructor+keys -> fallback. */
function symptomOf(err) {
  try { if (err && typeof err.message === 'string' && err.message) return err.message; } catch { /* throwing getter */ }
  if (err === null || err === undefined) return String(err);
  if (typeof err !== 'object') { try { return String(err); } catch { return 'unserializable-throw'; } }
  try { const j = JSON.stringify(err); if (j && j !== '{}') return j; } catch { /* circular / throwing toJSON */ }
  try {
    const name = (err.constructor && err.constructor.name) || 'Object';
    return `${name}{${Object.keys(err).slice(0, 12).sort().join(',')}}`;
  } catch { return 'unserializable-throw'; } // null-proto object
}
/** Epoch ms from the INJECTED clock — never throws; a hostile clock falls back to 0. */
function safeNow(clock) {
  try { const n = clock.now(); return typeof n === 'number' && Number.isFinite(n) ? n : 0; } catch { return 0; }
}
/** UTC day from the injected clock — never throws; an invalid/NaN time falls back to epoch. */
function utcDayOf(clock) {
  const d = new Date(safeNow(clock));
  const iso = Number.isFinite(d.getTime()) ? d.toISOString() : '1970-01-01T00:00:00.000Z';
  return iso.slice(0, 10);
}
/** Dedup hash over STABLE fields ONLY (utcDay::symptom::source); emitted_at excluded. */
function dedupHash(utcDay, symptom, source) {
  return createHash('sha256').update(`${utcDay}::${symptom}::${String(source)}`).digest('hex');
}
/** Best-effort stderr — the logger itself failing (or being absent) must never throw. */
function safeLog(logger, line) {
  try { logger.error(line); } catch { /* logger failed or absent; nothing left to do — never re-throw */ }
}
/** Build the schema-shaped entry from a thrown value + deps (pure; never throws). */
function buildEntry(err, deps) {
  const { category, type = 'error', source, severity = 'medium', clock } = deps;
  const symptom = symptomOf(err);
  const dedup_hash = dedupHash(utcDayOf(clock), symptom, source);
  return { category, type, symptom, source, severity, dedup_hash, emitted_at: safeNow(clock) };
}

/**
 * Run a SYNCHRONOUS `op` at a capture boundary.
 *   SUCCESS (op returns, even a falsy value) -> { ok:true, value }; writes NOTHING.
 *   FAILURE (op throws) -> NEVER throws; { ok:false, error, deduped }; for the FIRST
 *   occurrence of this (category, dedup_hash) it appends a row + emits a stderr line;
 *   a recurrence dedups (no row, no stderr).
 * NOTE: sync-only. For an async op or async sink use captureBoundaryAsync.
 *
 * @param {() => any} op
 * @param {{ sink?: { append: Function, findByHash: Function }, logger?: { error: Function },
 *           clock?: { now: () => number }, category?: string, type?: string,
 *           source?: string, severity?: string }} [deps]  sink/logger/clock are INJECTED.
 * @returns {{ ok: true, value: any } | { ok: false, error: any, deduped: boolean }}
 */
export function captureBoundary(op, deps = {}) {
  let value;
  try {
    value = op();                        // D4: throw-vs-return discrimination, NOT truthiness
  } catch (err) {
    return guard(err, deps, () => record(err, deps)); // FAILURE path — never throws
  }
  return { ok: true, value };            // SUCCESS: falsy values are valid; write nothing
}

/**
 * Async variant — awaits `op()` (a rejected Promise IS a captured failure) and awaits
 * the sink so an async writer (e.g. the estate's emitFeedback) reports its own failure.
 * Same doctrines; never rejects.
 * @param {() => (any|Promise<any>)} op
 * @param {object} [deps]
 * @returns {Promise<{ ok: true, value: any } | { ok: false, error: any, deduped: boolean }>}
 */
export async function captureBoundaryAsync(op, deps = {}) {
  let value;
  try {
    value = await op();
  } catch (err) {
    return guardAsync(err, deps, () => recordAsync(err, deps));
  }
  return { ok: true, value };
}

/** Last-ditch guard: run `fn` and return its result; if the CAPTURE itself throws
 *  (a hostile dep slipped past the field guards) return a best-effort result rather
 *  than propagate — never re-becoming the swallow footgun. */
function guard(err, deps, fn) {
  try { return fn(); }
  catch (captureErr) { safeLog(deps.logger, `[capture-seam] capture failed: ${symptomOf(captureErr)}`); return { ok: false, error: err, deduped: false }; }
}
async function guardAsync(err, deps, fn) {
  try { return await fn(); }
  catch (captureErr) { safeLog(deps.logger, `[capture-seam] capture failed: ${symptomOf(captureErr)}`); return { ok: false, error: err, deduped: false }; }
}

/** The sync failure path — best-effort capture (D1/D2/D3). */
function record(err, deps) {
  const { sink, logger, category } = deps;
  const entry = buildEntry(err, deps);
  let existing = null;
  try { existing = sink.findByHash({ category, dedup_hash: entry.dedup_hash }); } catch { existing = null; }
  if (existing) return { ok: false, error: err, deduped: true }; // D3: recurrence — no row, no stderr
  try { sink.append(entry); } catch (sinkErr) { safeLog(logger, `[capture-seam] sink append failed: ${symptomOf(sinkErr)}`); }
  safeLog(logger, `[capture-seam] ${entry.category}/${entry.type}: ${entry.symptom} (${entry.source})`); // D2: never silent
  return { ok: false, error: err, deduped: false };
}
/** The async failure path — awaits an async sink. */
async function recordAsync(err, deps) {
  const { sink, logger, category } = deps;
  const entry = buildEntry(err, deps);
  let existing = null;
  try { existing = await sink.findByHash({ category, dedup_hash: entry.dedup_hash }); } catch { existing = null; }
  if (existing) return { ok: false, error: err, deduped: true };
  try { await sink.append(entry); } catch (sinkErr) { safeLog(logger, `[capture-seam] sink append failed: ${symptomOf(sinkErr)}`); }
  safeLog(logger, `[capture-seam] ${entry.category}/${entry.type}: ${entry.symptom} (${entry.source})`);
  return { ok: false, error: err, deduped: false };
}
