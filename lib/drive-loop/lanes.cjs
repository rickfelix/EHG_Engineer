/**
 * Consumption-receipt lane keys for drive_reports.consumption_receipts.
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-C, FR-1.
 *
 * WHY THIS FILE EXISTS AT ALL. drive_reports.consumption_receipts is a per-lane JSONB map, and the
 * lane names existed ONLY as prose inside a COMMENT ON COLUMN in sibling -B's migration. -C is the
 * FIRST writer and -D adds two more consumers, so a contract living in a comment across three
 * sibling SDs is a writer-consumer asymmetry waiting to fire: a typo in a lane key produces a
 * receipt nobody reads, and a receipt nobody reads is indistinguishable from a producer that never
 * produced — which is the exact failure the Drive Loop instrument exists to detect.
 *
 * NAMED DRIVE_REPORT_LANES, NOT `LANES`. lib/coordination/receipt-ledger.cjs already exports a
 * frozen `LANES` with a DIFFERENT vocabulary for a DIFFERENT table. Two constants called LANES in
 * one codebase is the collision that makes a later reader import the wrong one and get a receipt
 * that writes cleanly into a key nothing consumes.
 *
 * FROZEN deliberately: a consumer that can mutate the shared contract at runtime is not a shared
 * contract.
 */

/** Lane keys, transcribed from -B's COMMENT ON COLUMN — the producer's vocabulary, not ours. */
const DRIVE_REPORT_LANES = Object.freeze({
  COORDINATOR: 'coordinator',
  ADAM: 'adam',
  CHAIRMAN_BRIEF: 'chairman-brief',
});

/** Every lane key, for callers that need to enumerate rather than address one. */
const ALL_DRIVE_REPORT_LANES = Object.freeze(Object.values(DRIVE_REPORT_LANES));

module.exports = { DRIVE_REPORT_LANES, ALL_DRIVE_REPORT_LANES };
