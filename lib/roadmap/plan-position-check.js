/**
 * plan-position-check — SD-LEO-INFRA-PLAN-POSITION-READABLE-001 (FR-5).
 *
 * A STANDING CHECK THAT TRIPS AT THE FIRST ORPHAN, not at a threshold. The failure mode this SD
 * exists to end was ACCUMULATION: the instrument degraded silently over weeks and nobody could name
 * the day it broke. A percentage-based alarm would have stayed green through all of it.
 *
 * THE PART THAT IS NOT IN THE SD, AND MATTERS MOST. Measured live: there are ZERO orphans today.
 * So a check that only counts orphans passes now and would keep passing if the linkage source
 * vanished entirely — reporting "0 orphans" while reading nothing at all. That is exactly the
 * unreadable zero this SD was filed about, rebuilt inside the instrument meant to detect it. Hence
 * evaluate() FAILS on an empty population: no-orphans-because-everything-is-linked and
 * no-orphans-because-nothing-was-read must never produce the same verdict.
 *
 * THE GATED CARVE-OUT IS STRUCTURAL, NOT A TITLE MATCH. The SD's zero-item complaint is real but
 * narrower than stated: exactly THREE approved waves hold no items, and one of them is Wave 3
 * (GATED), which may legitimately hold none until it is ungated. "GATED" appears ONLY in that
 * wave's title text — there is no structured gate key — so matching on the title would be fragile
 * and would silently stop working the day someone renames a wave. time_horizon IS structured, so
 * the invariant is scoped to horizon='now': a wave that is current must carry items; waves at
 * 'next'/'later' legitimately may not. Measured, that catches exactly Wave 0 — the real defect —
 * and leaves Wave 3 and Wave 4 (both 'next') alone.
 */

/** Verdicts, ordered worst-first so a caller can rank them. */
export const VERDICT = Object.freeze({
  UNREADABLE: 'UNREADABLE',   // the population is empty — we read nothing, so we know nothing
  FAIL: 'FAIL',               // real defects found
  PASS: 'PASS',
});

/**
 * @param {{items: Array<{is_orphaned?: boolean, child_sd_key?: string|null}>,
 *          waves: Array<{sequence_rank?: number, title?: string, status?: string,
 *                        time_horizon?: string, item_count?: number}>}} population
 */
export function evaluate({ items, waves } = {}) {
  const itemRows = Array.isArray(items) ? items : [];
  const waveRows = Array.isArray(waves) ? waves : [];

  // THE FALSE-ZERO GUARD. Must come first: every downstream count is meaningless over an empty read,
  // and reporting PASS here is the precise defect this SD exists to remove.
  if (itemRows.length === 0) {
    return {
      verdict: VERDICT.UNREADABLE,
      because: 'the committing-item population is EMPTY — this is not "no orphans", it is "nothing was read". '
        + 'Check the view exists and the active roadmap resolves before believing any count below.',
      orphans: null,
      emptyCurrentWaves: null,
      population: 0,
    };
  }

  const orphans = itemRows.filter((r) => r && r.is_orphaned === true);
  // Only CURRENT waves must carry items. 'next'/'later' may legitimately be empty — including the
  // GATED one — so the invariant is scoped structurally rather than by title.
  const emptyCurrentWaves = waveRows.filter((w) => w
    && w.status === 'approved'
    && w.time_horizon === 'now'
    && Number(w.item_count || 0) === 0);

  if (orphans.length === 0 && emptyCurrentWaves.length === 0) {
    return {
      verdict: VERDICT.PASS,
      because: `${itemRows.length} committing item(s) read; every one joins a real SD, and every current approved wave carries items`,
      orphans: 0,
      emptyCurrentWaves: 0,
      population: itemRows.length,
    };
  }

  const parts = [];
  if (orphans.length) parts.push(`${orphans.length} item(s) name a child SD that does not exist`);
  if (emptyCurrentWaves.length) {
    parts.push(`${emptyCurrentWaves.length} approved wave(s) at horizon=now hold zero items `
      + `(${emptyCurrentWaves.map((w) => `seq=${w.sequence_rank}`).join(', ')})`);
  }
  return {
    verdict: VERDICT.FAIL,
    because: parts.join('; '),
    orphans: orphans.length,
    emptyCurrentWaves: emptyCurrentWaves.length,
    population: itemRows.length,
    offendingWaves: emptyCurrentWaves.map((w) => ({ sequence_rank: w.sequence_rank, title: w.title })),
  };
}

export default { evaluate, VERDICT };
