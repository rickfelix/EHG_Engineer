/**
 * QF-20260726-908 — the backfill's selection rule.
 *
 * The whole point is that identification is DELEGATED to isFixtureVenture, the canonical predicate
 * the chairman surfaces already use. A private regex in this script would be a fourth copy of the
 * rule, and a fourth copy is precisely how this defect happened: the JS predicate, the SQL function
 * and the SQL view had drifted apart, and the one the chairman reads was the stale one.
 *
 * The write is positive-identification-only and never clears a flag: a false positive (hiding a
 * REAL governance decision from the chairman) is far worse than a miss, so the asymmetry is
 * deliberate and pinned here.
 */
import { describe, it, expect } from 'vitest';
import { findUnflaggedFixtures } from '../../scripts/backfill-fixture-venture-is-demo.mjs';

/** Minimal supabase double: ventures.select(...).limit(n). */
function db(rows) {
  return { from: () => ({ select: () => ({ limit: async () => ({ data: rows, error: null }) }) }) };
}

describe('findUnflaggedFixtures', () => {
  it('selects fixture ventures that are NOT yet flagged', async () => {
    const out = await findUnflaggedFixtures(db([
      { id: '1', name: 'HCGate-RealDB-rpc-scope-178', is_demo: false },
      { id: '2', name: 'StageArtifactGate-RealDB-complete-178', is_demo: null },
    ]));
    expect(out.map((v) => v.id)).toEqual(['1', '2']);
  });

  it('NEVER selects a real venture — the failure that would hide genuine governance items', async () => {
    const out = await findUnflaggedFixtures(db([
      { id: 'real-1', name: 'ApexNiche AI', is_demo: false },
      { id: 'real-2', name: 'EHG operating-company SUBSTRATE', is_demo: false },
    ]));
    expect(out).toEqual([]);
  });

  it('is idempotent — already-flagged fixtures are not re-selected', async () => {
    const out = await findUnflaggedFixtures(db([
      { id: '1', name: 'HCGate-RealDB-x', is_demo: true },
    ]));
    expect(out).toEqual([]);
  });

  it('uses the CANONICAL predicate, so a family the shared list knows is caught here too', async () => {
    // These come from FIXTURE_NAME_PATTERNS, not from any regex written in the backfill script.
    const out = await findUnflaggedFixtures(db([
      { id: 'a', name: '__e2e_park_status_178__', is_demo: false },
      { id: 'b', name: 'Test Venture for Marketing', is_demo: false },
      { id: 'c', name: 'TS-fixture-a6e265ae', is_demo: false },
      { id: 'd', name: 'Pipeline-Test-178', is_demo: false },
    ]));
    expect(out).toHaveLength(4);
  });

  it('tolerates an empty table', async () => {
    expect(await findUnflaggedFixtures(db([]))).toEqual([]);
  });

  it('surfaces a read error instead of silently reporting zero targets', async () => {
    const failing = { from: () => ({ select: () => ({ limit: async () => ({ data: null, error: { message: 'boom' } }) }) }) };
    await expect(findUnflaggedFixtures(failing)).rejects.toThrow(/ventures read failed/);
  });
});
