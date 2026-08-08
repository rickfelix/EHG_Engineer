/**
 * spine-verify-first-run.mjs is GUARDED. SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-D, FR-2.
 *
 * WHY THIS TEST EXISTS IN THIS SHAPE. Before the conversion this producer reused the fixture row
 * BUILDER from s20-fixture.mjs while skipping its GUARD, and the only mention of the predicate was
 * a prose comment — compliance to a grep, executing nothing.
 *
 * The obvious test ("delete the guard, watch it go red") WOULD HAVE PASSED WITHOUT THE GUARD. The
 * internally-built row satisfies the canonical discriminant two independent ways: the builder
 * hardcodes is_demo:true, and the overridden name starts with TEST-. With no reachable failing
 * input, removing the guard is unobservable. That is why FR-2 required an INJECTION SEAM first —
 * `buildVentureRow` — and why this suite drives it. The seam is the difference between a mutation
 * claim that is true and one that is decoration.
 */
import { describe, it, expect } from 'vitest';
import { runSeededThread } from '../../../scripts/harness/spine-verify-first-run.mjs';

/**
 * Minimal supabase fake: records ventures inserts and fails every later step, because this suite
 * asserts ONLY the guarded insert. runSeededThread catches downstream errors into its manifest, so
 * a later failure does not mask the thing under test.
 */
const mkSupabase = () => {
  const inserted = [];
  return {
    inserted,
    from: (table) => ({
      insert: (row) => {
        inserted.push({ table, row });
        return {
          select: () => ({ single: async () => ({ data: { id: 'v1', name: row.name }, error: null }) }),
        };
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  };
};

/**
 * SCOPE OF THESE TESTS, stated so a reader does not mistake them for more: they assert the GUARDED
 * VENTURE INSERT and nothing else. Everything after step 1 of runSeededThread drives VentureFactory
 * against a real schema, so on the accept path the thread fails downstream on the thin fake. That
 * failure is deliberately swallowed and NOT under test — swallowing it is safe here precisely
 * because the reject path below asserts the guard's throw explicitly, so a guard that silently
 * stopped throwing could not hide inside the same catch.
 */
const ventureInserts = (sb) => sb.inserted.filter((i) => i.table === 'ventures');
const ignoreDownstream = (p) => p.catch(() => {});

describe('the guard is REACHABLE at this producer, and rejects an unguarded row', () => {
  it('REFUSES to insert a row that trips no canonical pattern, and says so', async () => {
    const sb = mkSupabase();
    // Reachable failing input, delivered through the seam: no fixture prefix, no epoch tail, and
    // is_demo explicitly false so the short-circuit cannot rescue it. Without the seam this input
    // is unreachable and the whole scenario is decoration.
    await expect(runSeededThread({
      supabase: sb,
      runId: 'r1',
      buildVentureRow: () => ({ name: 'Perfectly Real Venture', is_demo: false }),
    })).rejects.toThrow(/refusing to create an unguarded fixture/);
    // MUTATION: restore the bare supabase.from('ventures').insert(...) and BOTH halves fail — no
    // throw, and the unguarded row lands.
    expect(ventureInserts(sb)).toEqual([]);
  });

  it('ACCEPTS a properly-marked fixture row — the guard is not stuck-on', async () => {
    const sb = mkSupabase();
    await ignoreDownstream(runSeededThread({
      supabase: sb,
      runId: 'r1',
      buildVentureRow: () => ({ name: 'TEST-HARNESS-guarded', is_demo: false }),
    }));
    // is_demo is false ON PURPOSE: acceptance is carried by the NAME branch — the branch the
    // pre-existing producer never exercised, because its builder always set is_demo:true.
    expect(ventureInserts(sb)).toHaveLength(1);
  });

  it('inserts the exact row object the seam produced', async () => {
    const sb = mkSupabase();
    const row = { name: 'TEST-HARNESS-identity', is_demo: false };
    await ignoreDownstream(runSeededThread({ supabase: sb, runId: 'r1', buildVentureRow: () => row }));
    expect(ventureInserts(sb)[0].row).toBe(row);
  });

  it('still inserts on the DEFAULT path, so the seam did not change production behaviour', async () => {
    const sb = mkSupabase();
    await ignoreDownstream(runSeededThread({ supabase: sb, runId: 'r1' }));
    // No buildVentureRow: the internal builder runs exactly as before and its row passes the guard.
    // Two-sided against the first test — without this, breaking the default branch would go unseen.
    expect(ventureInserts(sb)).toHaveLength(1);
    expect(ventureInserts(sb)[0].row.name).toMatch(/^TEST-/);
  });
});
