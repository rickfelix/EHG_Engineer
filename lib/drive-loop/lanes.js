/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — the consuming lanes of a Drive Report.
 *
 * ── WHY THIS IS ITS OWN MODULE ────────────────────────────────────────────────────────────
 * Three children write receipts against these names (-C and -D consume; this child ships the
 * DDL). A vocabulary that each of them spells for itself is three vocabularies, and the failure
 * is silent in the worst way: a receipt row written as 'chairman-brief' against a table
 * expecting 'chairman_brief' inserts CLEANLY, satisfies UNIQUE(report_id, lane) separately from
 * the real lane, and reads as "that lane never consumed the report". Nobody gets an error.
 *
 * ── NAMED SO IT CANNOT BE CONFUSED WITH THE OTHER LANES ───────────────────────────────────
 * lib/coordination/receipt-ledger.cjs already exports a frozen LANES with an entirely different
 * vocabulary (SIGNAL / WORK_ASSIGNMENT / ADVISORY) for a different receipt contract. Two frozen
 * constants both called LANES, both about receipts, meaning different things, is a collision
 * waiting for the first person who imports the wrong one — which is why this is
 * DRIVE_REPORT_LANES and not LANES. The coordinator flagged the collision risk independently.
 *
 * ── THIS LIST AND THE SQL CHECK ARE PINNED TOGETHER BY TEST ───────────────────────────────
 * The lane vocabulary necessarily exists twice: here, and as a CHECK constraint in
 * database/migrations/20260803_drive_reports.sql. Two representations of one vocabulary can
 * drift, and the drift is invisible until an INSERT fails in production. So
 * tests/unit/drive-loop/vocabulary-drift.test.js parses the CHECK out of the migration and
 * asserts the two sets are EQUAL — adding a lane in one place and not the other fails CI.
 * That test also covers CADENCES, which had the identical exposure and no coverage at all.
 */

/**
 * The lanes, BY NAME, so a consumer can name one without spelling it.
 *
 * Added by -D (AC-8: "no lane-key string literal exists outside the shared constant"). Importing
 * DRIVE_REPORT_LANES alone did not achieve that — an array cannot be indexed by meaning, so both
 * consumers ended up writing `lane: 'adam'` and `lane: 'chairman_brief'` at the call site while
 * importing the constant for validation. That is the hyphen hazard at the top of this file,
 * one layer in: every prose message in the coordination thread spelled it 'chairman-brief'.
 *
 * NOT A THIRD SPELLING (TR-3 forbids one) — this map is the AUTHORITY and the array below is
 * derived from it, so the two cannot disagree and the SQL-CHECK pin keeps working unchanged. A
 * mistyped KEY is `undefined` at the call site rather than a plausible-looking string.
 */
export const DRIVE_REPORT_LANE = Object.freeze({
  COORDINATOR: 'coordinator',
  ADAM: 'adam',
  CHAIRMAN_BRIEF: 'chairman_brief',
});

/**
 * Every lane that may stamp a consumption receipt. A receipt proves the CONSUMER read the
 * report; the producer never writes one (C1).
 */
export const DRIVE_REPORT_LANES = Object.freeze(Object.values(DRIVE_REPORT_LANE));

/** True iff `lane` is a lane this report knows how to be consumed by. */
export function isDriveReportLane(lane) {
  return typeof lane === 'string' && DRIVE_REPORT_LANES.includes(lane);
}
