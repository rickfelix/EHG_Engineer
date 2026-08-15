/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — compose the drive_reports row. PURE, NO I/O.
 *
 * ── WHY THE COMPOSER IS SEPARATE FROM THE PRODUCER ────────────────────────────────────────
 * The producer (a GHA cron) must WRITE. Nothing under lib/drive-loop may, and that is enforced —
 * the FR-7 propose-only scan fails on any insert/update/claim/dispatch call in this directory. So
 * the split is not stylistic: this file turns inputs into the row SHAPE and returns it, the script
 * layer persists it. That keeps the report's whole meaning testable without a database, and keeps
 * the "the report proposes, it never acts" boundary something a machine checks rather than something
 * a reviewer remembers.
 *
 * ── THE ROW CARRIES NO RECEIPTS FIELD AT ALL ──────────────────────────────────────────────
 * Per C1, receipts are STAMPED BY EACH CONSUMER, never by the producer — a producer-stamped
 * receipt would prove only that the producer believed delivery happened, which is the one thing
 * a receipt must not do.
 *
 * This used to ship `consumption_receipts: {}`, an empty jsonb map. Under the coordinator's
 * per-lane ruling (2026-08-04) receipts are ROWS in drive_report_receipts, keyed
 * UNIQUE(report_id, lane), so there is nothing for the producer to ship — not even an empty
 * shape. That is strictly better than shipping an empty one: an empty map is still a field a
 * consumer can write, and the whole point is that this producer offers no such surface.
 * Children -C and -D insert their own rows.
 */

import { isAvailable } from './report-posture.js';

export const SCHEMA_VERSION = 1;
// SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-5: 'hourly' added. This allowlist is a SEPARATE
// enforcement point from the drive_reports.cadence DB CHECK constraint (widened by the same
// SD's migration) -- both must stay in sync, pinned by vocabulary-drift.test.js.
export const CADENCES = Object.freeze(['scheduled', 'on_demand', 'hourly']);

/**
 * @param {object} o
 * @param {Record<string, object>} o.sections built section outputs, keyed by SECTION_ID
 * @param {object} o.driveScore the aggregate's output
 * @param {string} o.generatedAt ISO stamp — injected, never Date.now()
 * @param {string} [o.runId]
 * @param {string} [o.cadence]
 * @returns {object} a drive_reports row, ready to persist. NOT persisted here.
 */
export function composeReport({ sections, driveScore, generatedAt, runId = null, cadence = 'scheduled' } = {}) {
  if (typeof generatedAt !== 'string' || Number.isNaN(Date.parse(generatedAt))) {
    // Injected, because a report whose timestamp is implicit cannot be tested and cannot be
    // reproduced. Section 5's whole job is report-over-report deltas — it needs a stamp it can trust.
    throw new Error('composeReport(): generatedAt must be an ISO timestamp — an implicit clock makes the report unreproducible');
  }
  if (!CADENCES.includes(cadence)) {
    // The column has a CHECK constraint; failing here names the problem instead of letting the
    // insert fail later with a constraint violation nobody can trace back to a caller.
    throw new Error(`composeReport(): cadence must be one of ${CADENCES.join(', ')} — got ${JSON.stringify(cadence)}`);
  }
  if (!sections || typeof sections !== 'object' || Object.keys(sections).length === 0) {
    // A report with no sections is not an empty report — it is a failed run. Emitting it would put a
    // row in the trend that reads as "we looked and there was nothing", which is the false-zero this
    // SD keeps guarding against, one level up from the individual readings.
    throw new Error('composeReport(): no sections — a report with nothing in it is a failed run, not an empty one');
  }

  // Which sections could not be measured. Recorded ON the row so a reader sees the gap without
  // having to notice a key is missing; an absent key is exactly the kind of silence nobody audits.
  const unavailableSections = Object.entries(sections)
    .filter(([, s]) => s && s.unavailable && !isAvailable(s.unavailable))
    .map(([id, s]) => ({ section: id, reason: s.unavailable.reason }));

  return {
    generated_at: generatedAt,
    run_id: runId,
    cadence,
    sections,
    drive_score: driveScore ?? {},
    // NO receipts field. They are rows in drive_report_receipts, written by each consumer.
    schema_version: SCHEMA_VERSION,
    metadata: {
      section_ids: Object.keys(sections),
      unavailable_sections: unavailableSections,
      // Stated on every row rather than inferred from the absence of receipts. Names the table
      // so a reader looking for "did anyone read this?" is not left concluding "no receipts
      // field, so nobody tracks it" — the absence here is the design, not a gap.
      receipts_note: 'receipts are ROWS in drive_report_receipts, UNIQUE(report_id, lane), stamped BY EACH CONSUMER (C1); the producer never writes one and this row carries no receipts field',
    },
  };
}
