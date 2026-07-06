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
//   are EXCLUDED from the hash; emitted_at is volatile row metadata. Callers:
//   scripts/log-harness-bug.js + scripts/capture-completion-flags.js.
//
// ATTRIBUTION HONESTY (do not miscopy as estate-distilled): TWO properties here
// are deliberate SEAM-DESIGN HARDENING, not a mirror of emitFeedback:
//   - "never throws" — emitFeedback DOES throw on its INSERT failure and on
//     validation; only its enrichment (_autoFillDeferredFromSdKey) and its
//     non-blocking dual-write catch are best-effort. A CAPTURE seam, though,
//     must not throw — or it re-becomes the swallow class it fights.
//   - "a stderr line on every first capture" — emitFeedback is SILENT on the
//     successful row write and log-harness-bug.js logs to STDOUT on success. The
//     estate's "never fully silent" seed is its console.warn enrichment paths and
//     its console.error dual-write path; this seam COMPOSES those into a
//     per-capture stderr guarantee. Labeled as hardening, not distillation.
//
// Four doctrines:
//  1. CAPTURE-AT-BOUNDARY, NEVER SWALLOW — the risky op is wrapped; on failure a
//     structured, schema-shaped entry is recorded to the INJECTED sink. An empty
//     catch that discards the error is the anti-pattern.
//  2. BEST-EFFORT BUT NEVER SILENT — the seam NEVER throws (returns a best-effort
//     result so the caller is not broken) AND is never silent: a first capture
//     writes BOTH a row AND a stderr line. Crucially, the capture ITSELF is
//     best-effort: a throwing sink or logger is caught, so the anti-swallow seam
//     never becomes a swallow footgun (an unguarded sink.append is exactly that).
//  3. DEDUP ON STABLE FIELDS ONLY — dedup_hash = sha256(utcDay::symptom::source),
//     STABLE fields only; emitted_at (volatile) is stored on the row but MUST NOT
//     join the hash or identical failures flood. Dedup is per-UTC-day and
//     co-scoped by category; a recurrence across a day boundary is intentionally
//     a fresh row. A deduped recurrence writes NO new row AND NO new stderr — the
//     first capture already made it visible; re-emitting IS the flood.
//  4. HEALTHY PATH IS SILENT — success (op returns, even a FALSY value like 0/''/
//     false/null) writes no row and emits no stderr. Discrimination is
//     throw-vs-return, never truthiness.
import { createHash } from 'node:crypto';

/** Safe symptom text from ANY thrown value (Error, string, number, null, undefined). */
function symptomOf(err) {
  if (err && typeof err.message === 'string' && err.message) return err.message;
  return String(err);
}
/** UTC day from the INJECTED clock (never Date.now() — injected for determinism). */
function utcDayOf(clock) {
  return new Date(clock.now()).toISOString().slice(0, 10);
}
/** Dedup hash over STABLE fields ONLY (utcDay::symptom::source); emitted_at excluded. */
function dedupHash(utcDay, symptom, source) {
  return createHash('sha256').update(`${utcDay}::${symptom}::${source}`).digest('hex');
}
/** Best-effort stderr — the logger itself failing must never break the seam (D2). */
function safeLog(logger, line) {
  try { logger.error(line); } catch { /* logger failed; nothing left to do — never re-throw */ }
}

/**
 * Run `op` at a capture boundary.
 *   SUCCESS (op returns, even a falsy value) -> { ok:true, value }; writes NOTHING.
 *   FAILURE (op throws) -> NEVER throws; { ok:false, error, deduped }; for the FIRST
 *   occurrence of this (category, dedup_hash) it appends a schema-shaped row to the
 *   injected sink AND emits a stderr line; a recurrence dedups (no row, no stderr).
 *
 * @param {() => any} op
 * @param {{ sink: { append: Function, findByHash: Function }, logger: { error: Function },
 *           clock: { now: () => number }, category: string, type?: string,
 *           source: string, severity?: string }} deps  All of sink/logger/clock are
 *           INJECTED (never module singletons).
 * @returns {{ ok: true, value: any } | { ok: false, error: any, deduped: boolean }}
 */
export function captureBoundary(op, deps) {
  let value;
  try {
    value = op();                        // D4: throw-vs-return discrimination, NOT truthiness
  } catch (err) {
    return capture(err, deps);           // FAILURE path
  }
  return { ok: true, value };            // SUCCESS: falsy values are valid; write nothing
}

/** The failure path — best-effort capture (D1/D2/D3). Never throws. */
function capture(err, deps) {
  const { sink, logger, clock, category, type = 'error', source, severity = 'medium' } = deps;
  const symptom = symptomOf(err);
  const utcDay = utcDayOf(clock);
  const dedup_hash = dedupHash(utcDay, symptom, source);
  let deduped = false;
  // First-occurrence guard — best-effort read; a broken read falls through to append.
  let existing = null;
  try { existing = sink.findByHash({ category, dedup_hash }); } catch { existing = null; }
  if (existing) {
    deduped = true;                      // D3: recurrence already visible — no row, no stderr
  } else {
    // D2: durable row + stderr, EACH best-effort so neither's failure throws NOR
    // skips the other — the anti-swallow seam must not itself swallow.
    try {
      sink.append({ category, type, symptom, source, severity, dedup_hash, emitted_at: clock.now() });
    } catch (sinkErr) {
      safeLog(logger, `[capture-seam] sink append failed: ${symptomOf(sinkErr)}`); // still not fully silent
    }
    safeLog(logger, `[capture-seam] ${category}/${type}: ${symptom} (${source})`);
  }
  return { ok: false, error: err, deduped };
}
