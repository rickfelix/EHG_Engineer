/**
 * Founding known-answer fixtures for lib/checkers/readback-checker.mjs (FR-3).
 *
 * Each builder returns { intendedRow, persistedRow }:
 *   - intendedRow: what the caller believes it wrote (drives verifyReadback's
 *     expectedFields/requiredKeys in the test suite)
 *   - persistedRow: what an independent fresh read actually finds (drives the mocked
 *     Supabase client's return value) — null means "the match resolved to zero rows"
 *
 * Provenance: real, measured incidents from this session, not synthetic examples —
 * recorded in .claude/adam-session-state-228dd90c.md and
 * .claude/solomon-session-state-a26c2a97.md (not docs/, hence recorded here).
 * Solomon's Stage-B audit (9efc0493/133c8fca) ranked write-layer readback build-order
 * #1 of the checker-skills program specifically because these were the most-measured
 * specimens (8 total) of any candidate checker.
 *
 * @wire-check-exempt: fixture-builder module for tests/unit/checkers/readback-checker.test.js
 * only, by design — not consumed by any production entry point. Not a one-off/probe script
 * (it's the permanent fixture catalog for this checker's test suite, per PRD FR-3) and not
 * dead code (18 tests import it).
 */

const BASE_ROW = Object.freeze({
  id: 'row-1',
  sd_id: 'sd-uuid-1',
  sub_agent_code: 'TESTING',
  verdict: 'PASS',
  metadata: Object.freeze({ is_coordinator: true, coordinator_since: '2026-08-01T00:00:00.000Z' }),
});

/** Positive control: the write happened exactly as intended. */
export function correctWriteFixture() {
  const row = { ...BASE_ROW, metadata: { ...BASE_ROW.metadata } };
  return { intendedRow: row, persistedRow: row };
}

/**
 * fence-no-op: a .eq()/.match() filter on a non-matching key — the write believed it
 * landed, but nothing matches on independent re-read (the UPDATE-0-equals-success class).
 */
export function fenceNoOpFixture() {
  return { intendedRow: { ...BASE_ROW }, persistedRow: null };
}

/**
 * metadata-clobber: a blind-replace on a jsonb column drops required keys instead of
 * merging. Models the real coordinator-seat incident (2026-08-12T18:31:56Z): its own
 * wind-down writer overwrote metadata and lost is_coordinator/coordinator_since.
 * `nullify: true` models the sibling form — the keys survive as null rather than being
 * deleted outright; both forms must be caught identically (FR-1 requiredKeys check).
 */
export function metadataClobberFixture({ nullify = false } = {}) {
  const intendedRow = { ...BASE_ROW, metadata: { ...BASE_ROW.metadata } };
  const clobberedMetadata = nullify
    ? { ...BASE_ROW.metadata, is_coordinator: null, coordinator_since: null }
    : {};
  return { intendedRow, persistedRow: { ...BASE_ROW, metadata: clobberedMetadata } };
}

/** phantom-flip: the persisted value differs from the value the caller intended to write. */
export function phantomFlipFixture() {
  const intendedRow = { ...BASE_ROW, verdict: 'PASS', metadata: { ...BASE_ROW.metadata } };
  const persistedRow = { ...BASE_ROW, verdict: 'FAIL', metadata: { ...BASE_ROW.metadata } };
  return { intendedRow, persistedRow };
}
