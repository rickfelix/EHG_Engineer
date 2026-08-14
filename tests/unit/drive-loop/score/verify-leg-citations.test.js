/**
 * SD-LEO-INFRA-DRIVE-SCORE-PER-001 (FR-3, FR-5) — the citation resolve control.
 *
 * The load-bearing tests here are the VACUITY ones. A resolve check is trivially easy to write in
 * a form that passes while proving nothing, and every one of the seven modes below was named
 * BEFORE the implementation (prospective testing-agent evidence d5d9218c and PLAN-phase evidence
 * c1c4cc51) rather than discovered afterwards. Mode E is the sharpest: a "resolves in ANY table"
 * check would have ACCEPTED the exact live data that motivated this SD.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifyLegCitations, CITATION_FAILURE_MARKER, makeRowResolver, RESOLVE_BATCH_SIZE } from '../../../../lib/drive-loop/score/verify-leg-citations.js';
import { cite } from '../../../../lib/drive-loop/citation.js';
import { unavailable } from '../../../../lib/drive-loop/report-posture.js';

const leg = (name, table, rowIds, extra = {}) => ({
  leg: name,
  points: cite({
    value: 2, table, predicate: `p:${name}`,
    ...(rowIds ? { row_ids: rowIds } : {}),
    ...extra,
  }),
});

/** A resolver that knows a fixed world: {table -> ids that exist}. Records what it was ASKED. */
const worldResolver = (world) => {
  const calls = [];
  const fn = async (table, rowIds) => {
    calls.push({ table, rowIds: [...rowIds] });
    const known = world[table] ?? [];
    return rowIds.filter((id) => known.includes(id));
  };
  fn.calls = calls;
  return fn;
};

const LIVE_WORLD = {
  roadmap_wave_items: ['rw-1', 'rw-2'],
  strategic_directives_v2: ['SD-ALPHA-001'],
  drive_reports: [],
};

describe('verifyLegCitations — the resolver is injected, because WHICH TABLE was asked is the defect', () => {
  it('[TS-14] refuses to run without an injected resolveRows', async () => {
    await expect(verifyLegCitations({ legs: [] })).rejects.toThrow(/resolveRows must be injected/);
  });

  it('[TS-4 / vacuity B] queries each leg\'s OWN table, and NEVER the aggregate\'s label', async () => {
    // The whole bug in one assertion. A check pointed at 'drive_reports' would re-derive the
    // original defect one layer down while looking like a working control.
    const resolve = worldResolver(LIVE_WORLD);
    await verifyLegCitations({
      legs: [leg('leg1_landed', 'roadmap_wave_items', ['rw-1']), leg('leg2_uptake', 'strategic_directives_v2', ['SD-ALPHA-001'])],
      resolveRows: resolve,
    });
    expect(resolve.calls.map((c) => c.table)).toEqual(['roadmap_wave_items', 'strategic_directives_v2']);
    expect(resolve.calls.some((c) => c.table === 'drive_reports')).toBe(false);
  });

  it('passes a fully-resolving set through untouched and counts what it checked', async () => {
    const { legs, verification } = await verifyLegCitations({
      legs: [leg('leg1_landed', 'roadmap_wave_items', ['rw-1', 'rw-2'])],
      resolveRows: worldResolver(LIVE_WORLD),
    });
    expect(legs[0].unavailable).toBeUndefined();
    expect(verification).toMatchObject({ legs_checked: 1, ids_checked: 2, ids_resolved: 2, unresolved: [] });
  });
});

describe('verifyLegCitations — it fails the CITATION, not the SCORE, and never throws', () => {
  it('[TS-8] converts an unresolvable leg to the ordinary unavailable shape and does not throw', async () => {
    const { legs, verification } = await verifyLegCitations({
      legs: [leg('leg1_landed', 'roadmap_wave_items', ['rw-1', 'ghost-id'])],
      resolveRows: worldResolver(LIVE_WORLD),
    });
    expect(legs[0].unavailable.available).toBe(false);
    expect(legs[0].leg).toBe('leg1_landed');
    expect(verification.unresolved).toEqual([
      { leg: 'leg1_landed', table: 'roadmap_wave_items', missing_ids: ['ghost-id'] },
    ]);
  });

  it('[TS-17] the citation-failure reason is DISCRIMINABLE from a genuine instrument outage', async () => {
    // The unavailable shape has no discriminator field — only a reason string — so the marker IS
    // the signal. Without it, "we could not verify the provenance" and "the instrument broke"
    // arrive at every downstream reader as the same thing.
    const { legs } = await verifyLegCitations({
      legs: [leg('leg1_landed', 'roadmap_wave_items', ['ghost-id'])],
      resolveRows: worldResolver(LIVE_WORLD),
    });
    expect(legs[0].unavailable.reason).toContain(CITATION_FAILURE_MARKER);
    // And it is genuinely distinct from the two real outage reasons the sweep emits.
    const outage = unavailable('scoreLeg4 could not be scored this run: persistCapacityVerdict(): durable write failed');
    expect(outage.reason).not.toContain(CITATION_FAILURE_MARKER);
    // The reason also discloses the trade-off rather than hiding it.
    expect(legs[0].unavailable.reason).toMatch(/unverifiable number is not a measurement/);
  });

  it('a resolver that THROWS becomes a measurement failure, not a crash and not a false pass', async () => {
    const { legs, verification } = await verifyLegCitations({
      legs: [leg('leg1_landed', 'roadmap_wave_items', ['rw-1'])],
      resolveRows: async () => { throw new Error('connection reset'); },
    });
    expect(legs[0].unavailable.reason).toContain(CITATION_FAILURE_MARKER);
    expect(legs[0].unavailable.reason).toMatch(/connection reset/);
    expect(verification.unresolved).toHaveLength(1);
  });

  it('legs that are ALREADY unavailable, and legs citing no rows, pass through untouched', async () => {
    const resolve = worldResolver(LIVE_WORLD);
    const already = { leg: 'leg2_uptake', unavailable: unavailable('no elapsed cohort') };
    const { legs, verification } = await verifyLegCitations({
      legs: [already, leg('leg4_capacity', 'drive_reports', null)],
      resolveRows: resolve,
    });
    expect(legs[0]).toBe(already);                          // byte-identical, FR-4
    expect(legs[0].unavailable.reason).toBe('no elapsed cohort');
    expect(legs[1].unavailable).toBeUndefined();            // leg4 still counts toward the score
    expect(resolve.calls).toHaveLength(0);                  // nothing to ask
    expect(verification.legs_checked).toBe(0);
  });
});

describe('verifyLegCitations — the seven ways this control could be vacuously green', () => {
  it('[TS-3 / mode A] N=0 is DISCLOSED as an empty check, never reported as "all resolved"', async () => {
    // leg4 cites no rows by design, so a run of leg4 alone checks nothing. If that read as a pass,
    // the control would certify a report it never examined.
    const { verification } = await verifyLegCitations({
      legs: [leg('leg4_capacity', 'drive_reports', null)],
      resolveRows: worldResolver(LIVE_WORLD),
    });
    expect(verification.ids_checked).toBe(0);
    expect(verification.legs_checked).toBe(0);
    expect(verification.note).toMatch(/This is not a pass/);
  });

  it('[TS-5 / mode C] a leg whose row_ids is an EMPTY array is not counted as a resolved leg', async () => {
    const resolve = worldResolver(LIVE_WORLD);
    const { verification } = await verifyLegCitations({
      legs: [leg('leg1_landed', 'roadmap_wave_items', [])],
      resolveRows: resolve,
    });
    expect(resolve.calls).toHaveLength(0);   // .in('id', []) is never even asked
    expect(verification.ids_checked).toBe(0);
  });

  it('[TS-6 / mode D] a null resolver result is a measurement failure, not "zero rows matched"', async () => {
    // A head-count against a table that does not exist returns no error and a null count. Read as
    // "found nothing", that silently converts a missing table into a clean bill of health.
    const { legs, verification } = await verifyLegCitations({
      legs: [leg('leg1_landed', 'roadmap_wave_items', ['rw-1'])],
      resolveRows: async () => null,
    });
    expect(legs[0].unavailable.reason).toMatch(/returned null rather than an array/);
    expect(legs[0].unavailable.reason).toMatch(/never as "zero rows matched"/);
    expect(verification.unresolved).toHaveLength(1);
  });

  it('[TS-15 / mode F] duplicate ids in the RESPONSE cannot inflate the comparison', async () => {
    // requested [a,b]; resolver echoes [a,a]. A length comparison passes. A set comparison does not.
    const { legs } = await verifyLegCitations({
      legs: [leg('leg1_landed', 'roadmap_wave_items', ['rw-1', 'rw-2'])],
      resolveRows: async () => ['rw-1', 'rw-1'],
    });
    expect(legs[0].unavailable).toBeDefined();
    expect(legs[0].unavailable.reason).toMatch(/rw-2/);
  });

  it('[TS-15 / mode F] duplicate ids in the REQUEST are deduped before being counted', async () => {
    const resolve = worldResolver(LIVE_WORLD);
    const { verification } = await verifyLegCitations({
      legs: [leg('leg1_landed', 'roadmap_wave_items', ['rw-1', 'rw-1', 'rw-1'])],
      resolveRows: resolve,
    });
    expect(verification.ids_checked).toBe(1);       // not 3 — a repeated id is one id
    expect(resolve.calls[0].rowIds).toEqual(['rw-1']);
  });

  it('[TS-16 / mode G] ids are compared exactly, with no type or case coercion', async () => {
    // Concrete for leg2, not theoretical: strategic_directives_v2.id is a VARCHAR carrying authored
    // slugs, so a resolver returning a differently-cased or differently-typed value is a MISS.
    const wrongCase = await verifyLegCitations({
      legs: [leg('leg2_uptake', 'strategic_directives_v2', ['SD-ALPHA-001'])],
      resolveRows: async () => ['sd-alpha-001'],
    });
    expect(wrongCase.legs[0].unavailable).toBeDefined();

    const wrongType = await verifyLegCitations({
      legs: [leg('leg1_landed', 'roadmap_wave_items', ['7'])],
      resolveRows: async () => [7],
    });
    expect(wrongType.legs[0].unavailable).toBeDefined();
  });

  it('a citation carrying row_ids but NO table resolves nowhere, and is rejected rather than skipped', async () => {
    // The defect's own shape at the leg level. Nothing to query must never mean nothing to check.
    const resolve = worldResolver(LIVE_WORLD);
    const { legs, verification } = await verifyLegCitations({
      legs: [{ leg: 'malformed', points: { value: 2, citation: { row_ids: ['x'] }, predicate: 'p' } }],
      resolveRows: resolve,
    });
    expect(legs[0].unavailable.reason).toMatch(/no table naming where they live/);
    expect(verification.unresolved[0]).toMatchObject({ leg: 'malformed', table: null });
  });
});

describe('verifyLegCitations — the founding negative case (FR-5)', () => {
  const FIXTURE = JSON.parse(readFileSync(
    fileURLToPath(new URL('../../../fixtures/drive-score/drive-2026-08-12.json', import.meta.url)),
    'utf8',
  ));

  it('the frozen fixture still carries the defect it was captured for', () => {
    // If this ever changes, the fixture stopped being the negative case and every test below is
    // asserting against something else.
    expect(FIXTURE.score.citation.table).toBe('drive_reports');
    expect(FIXTURE.score.citation.row_ids).toHaveLength(12);
    expect(FIXTURE.measured_legs.every((m) => typeof m === 'string')).toBe(true);
    expect(FIXTURE._measured_resolution.drive_reports).toBe(0);
  });

  it('[TS-7] the control REJECTS the drive-2026-08-12 shape, naming the table it was labelled with', async () => {
    // Reconstructed as a leg carrying exactly what that row claimed: 12 ids under drive_reports.
    const asLeg = leg('fused_aggregate', 'drive_reports', FIXTURE.score.citation.row_ids);
    const { legs, verification } = await verifyLegCitations({
      legs: [asLeg],
      // The real world: none of the 12 exist in drive_reports.
      resolveRows: worldResolver({ drive_reports: [] }),
    });
    expect(legs[0].unavailable).toBeDefined();
    expect(legs[0].unavailable.reason).toContain(CITATION_FAILURE_MARKER);
    expect(legs[0].unavailable.reason).toMatch(/drive_reports/);
    expect(verification.unresolved[0].missing_ids).toHaveLength(12);
    expect(verification.ids_resolved).toBe(0);
  });

  it('[TS-7] PINS WHY per-leg-table is the requirement: an ANY-TABLE check would have ACCEPTED this row', async () => {
    // This is the test that makes the strategy a requirement rather than a preference. All 12 ids
    // DO exist somewhere — 11 in roadmap_wave_items, 1 in strategic_directives_v2 — so a resolver
    // that searched "any table" would report a clean pass over the exact data that motivated the SD.
    const ids = FIXTURE.score.citation.row_ids;
    const anyTableResolver = async (_table, rowIds) => rowIds;   // "it exists somewhere" — the trap
    const permissive = await verifyLegCitations({
      legs: [leg('fused_aggregate', 'drive_reports', ids)],
      resolveRows: anyTableResolver,
    });
    expect(permissive.legs[0].unavailable, 'an any-table resolver ACCEPTS the defective row — this is the trap').toBeUndefined();
    expect(permissive.verification.unresolved).toEqual([]);

    // Whereas the honest, table-scoped world rejects it. Same input, opposite verdict: the
    // difference is entirely in WHICH TABLE was asked.
    const scoped = await verifyLegCitations({
      legs: [leg('fused_aggregate', 'drive_reports', ids)],
      resolveRows: worldResolver({ drive_reports: [], roadmap_wave_items: ids.slice(0, 11), strategic_directives_v2: ids.slice(11) }),
    });
    expect(scoped.legs[0].unavailable).toBeDefined();
  });
});

describe('makeRowResolver — the real supabase-backed resolver', () => {
  it('requires a client', () => {
    expect(() => makeRowResolver(null)).toThrow(/supabase client is required/);
    expect(() => makeRowResolver({})).toThrow(/supabase client is required/);
  });

  it('queries the table it is GIVEN, selecting ids, and returns the ids that exist', async () => {
    const asked = [];
    const supabase = {
      from: (table) => ({
        select: () => ({
          in: async (col, ids) => {
            asked.push({ table, col, ids });
            return { data: ids.filter((i) => i !== 'ghost').map((id) => ({ id })), error: null };
          },
        }),
      }),
    };
    const resolve = makeRowResolver(supabase);
    const found = await resolve('roadmap_wave_items', ['rw-1', 'ghost']);
    expect(found).toEqual(['rw-1']);
    expect(asked).toEqual([{ table: 'roadmap_wave_items', col: 'id', ids: ['rw-1', 'ghost'] }]);
  });

  it('throws on a query error rather than returning [] — an empty array would read as "none exist"', async () => {
    const supabase = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'relation missing', code: 'PGRST205' } }) }) }) };
    await expect(makeRowResolver(supabase)('nope', ['a'])).rejects.toThrow(/relation missing.*PGRST205/);
  });

  it('BATCHES beyond the PostgREST row cap, so a long id list is not silently truncated', async () => {
    // A truncated response would report the missing tail as "these ids do not exist" — a
    // FABRICATED failure, the same class of lie as a fabricated pass.
    const batches = [];
    const supabase = {
      from: () => ({ select: () => ({ in: async (_col, ids) => { batches.push(ids.length); return { data: ids.map((id) => ({ id })), error: null }; } }) }),
    };
    const ids = Array.from({ length: RESOLVE_BATCH_SIZE + 7 }, (_, i) => `id-${i}`);
    const found = await makeRowResolver(supabase)('t', ids);
    expect(batches).toEqual([RESOLVE_BATCH_SIZE, 7]);
    expect(found).toHaveLength(ids.length);
  });
});
