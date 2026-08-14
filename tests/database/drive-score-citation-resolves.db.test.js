/**
 * SD-LEO-INFRA-DRIVE-SCORE-PER-001 (TS-10) — the citation resolves in its NAMED table, for real.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS CANNOT BE A UNIT TEST, AND WHY THAT IS THE WHOLE POINT
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * The unit suite (tests/unit/drive-loop/score/verify-leg-citations.test.js) proves the CONTROL's
 * logic: which table it asks about, that a set comparison is used, that a null result is a failure.
 * It cannot prove the one thing this SD is actually about — that a citation's table LABEL IS
 * TRUE — because a unit fixture picks both the ids and the world they live in, so every id
 * resolves by construction. Author-chosen data can never disagree with an author-chosen belief.
 *
 * That is exactly how the original defect survived: drive-2026-08-12 shipped 12 row_ids labelled
 * table='drive_reports' of which ZERO existed there, and no test in the repo asked a real database
 * whether the label was true. Only a query against real Postgres can answer that.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHERE THIS RUNS
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * It WRITES (it seeds the rows it then resolves), so it is a db-tier test and the db project is
 * gated off production on purpose (vitest.config.js: DB_INCLUDE_GATED is empty unless DB_TARGET
 * names an explicitly designated non-production database). Against production vitest never loads
 * this file. That is deliberate and it is also a real limitation, stated rather than implied: this
 * test is NOT part of the evidence that the change works in the production environment it was
 * built in — the unit suite and the frozen negative fixture are. It is the check that runs where
 * writing is safe.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import { verifyLegCitations, makeRowResolver } from '../../lib/drive-loop/score/verify-leg-citations.js';
import { aggregateScore } from '../../lib/drive-loop/score/aggregate.js';
import { cite } from '../../lib/drive-loop/citation.js';

let client;
/** Only the top of the FK chain needs recording — roadmap_waves/items cascade from it. */
let roadmapId = null;
let sdKey = null;
const seeded = { waveItemIds: [], sdId: null };

/** The real resolver, expressed over the pg client this tier uses. Same contract as makeRowResolver. */
const pgResolver = async (table, ids) => {
  // Table names here are NEVER caller-controlled — they come from the legs' own citations, which
  // are source-committed literals. Parameterised for the ids regardless.
  const { rows } = await client.query(`SELECT id FROM ${table} WHERE id::text = ANY($1::text[])`, [ids.map(String)]);
  return rows.map((r) => String(r.id));
};

beforeAll(async () => {
  client = await createDatabaseClient();

  const suffix = process.env.GITHUB_RUN_ID || `local-${process.pid}`;
  sdKey = `SD-PER001-DBTEST-${suffix}`;

  const roadmap = await client.query(
    `INSERT INTO strategic_roadmaps (title, description, status)
     VALUES ($1, 'PER-001 TS-10 fixture', 'draft') RETURNING id`,
    [`PER-001 citation-resolution fixture ${suffix}`],
  );
  roadmapId = roadmap.rows[0].id;

  const wave = await client.query(
    `INSERT INTO roadmap_waves (roadmap_id, sequence_rank, title, status)
     VALUES ($1, 1, 'PER-001 wave', 'draft') RETURNING id`,
    [roadmapId],
  );

  for (const title of ['PER-001 item A', 'PER-001 item B']) {
    const item = await client.query(
      `INSERT INTO roadmap_wave_items (wave_id, source_type, title)
       VALUES ($1, 'manual', $2) RETURNING id`,
      [wave.rows[0].id, title],
    );
    seeded.waveItemIds.push(String(item.rows[0].id));
  }

  const sd = await client.query(
    `INSERT INTO strategic_directives_v2 (sd_key, title, status, category, priority, description, rationale, scope, target_application, sd_type)
     VALUES ($1, 'PER-001 TS-10 fixture', 'draft', 'Infrastructure', 'low', 'fixture', 'fixture', 'fixture', 'EHG_Engineer', 'infrastructure')
     RETURNING id`,
    [sdKey],
  );
  seeded.sdId = String(sd.rows[0].id);
}, 60000);

afterAll(async () => {
  // Delete only what this suite created, by id. ON DELETE CASCADE takes the waves and items with
  // the roadmap. No blanket predicate deletes — a teardown that tidies by pattern widens silently.
  if (client) {
    if (seeded.sdId) await client.query('DELETE FROM strategic_directives_v2 WHERE id = $1', [seeded.sdId]).catch(() => {});
    if (roadmapId) await client.query('DELETE FROM strategic_roadmaps WHERE id = $1', [roadmapId]).catch(() => {});
    await client.end();
  }
});

const legFor = (name, table, rowIds) => ({
  leg: name,
  points: cite({ value: 2, table, predicate: `p:${name}`, row_ids: rowIds }),
});

describe('TS-10 — a cited row id resolves in the table its own leg names', () => {
  it('a truthfully-labelled citation resolves N/N against real Postgres, with N > 0', async () => {
    const { legs, verification } = await verifyLegCitations({
      legs: [
        legFor('leg1_landed', 'roadmap_wave_items', seeded.waveItemIds),
        legFor('leg2_uptake', 'strategic_directives_v2', [seeded.sdId]),
      ],
      resolveRows: pgResolver,
    });

    expect(legs.every((l) => l.unavailable === undefined)).toBe(true);
    expect(verification.unresolved).toEqual([]);
    // The vacuity guard, against real data: a control that checked nothing must not read as a pass.
    expect(verification.ids_checked).toBe(seeded.waveItemIds.length + 1);
    expect(verification.ids_checked).toBeGreaterThan(0);
    expect(verification.ids_resolved).toBe(verification.ids_checked);
  });

  it('[THE ORIGINAL DEFECT] the SAME ids under the WRONG table label are rejected by real Postgres', async () => {
    // This is drive-2026-08-12 reproduced against a live database rather than a fixture: real ids
    // that genuinely exist, labelled with the table they do NOT live in. The rows are real, the
    // number would have been real, and the citation is still false.
    const { legs, verification } = await verifyLegCitations({
      legs: [legFor('fused_aggregate', 'drive_reports', seeded.waveItemIds)],
      resolveRows: pgResolver,
    });

    expect(legs[0].unavailable, 'ids that exist in roadmap_wave_items must NOT resolve in drive_reports').toBeDefined();
    expect(legs[0].unavailable.reason).toMatch(/CITATION_UNRESOLVED/);
    expect(verification.unresolved[0]).toMatchObject({ table: 'drive_reports' });
    expect(verification.unresolved[0].missing_ids.sort()).toEqual([...seeded.waveItemIds].sort());
    expect(verification.ids_resolved).toBe(0);
  });

  it('end to end: a verified score emits per-leg citations that an auditor can resolve independently', async () => {
    const { legs, verification } = await verifyLegCitations({
      legs: [
        legFor('leg1_landed', 'roadmap_wave_items', seeded.waveItemIds),
        legFor('leg2_uptake', 'strategic_directives_v2', [seeded.sdId]),
      ],
      resolveRows: pgResolver,
    });
    const score = aggregateScore({ legs, citationVerification: verification });

    // Re-resolve straight from the EMITTED structure, the way an auditor reading drive_reports
    // would — not from the inputs we happened to hold. If the emission dropped or relabelled a
    // grain, this fails even though the check above passed.
    let checked = 0;
    for (const entry of score.measured_legs) {
      if (!entry.row_ids) continue;
      const found = await pgResolver(entry.table, entry.row_ids);
      expect(new Set(found)).toEqual(new Set(entry.row_ids.map(String)));
      checked += entry.row_ids.length;
    }
    expect(checked).toBeGreaterThan(0);
    expect(score.score.citation.row_ids, 'the aggregate must carry no fused id list').toBeUndefined();
  });

  it('makeRowResolver (the production supabase path) is the same contract this suite exercised', () => {
    // The pg resolver above and makeRowResolver are two implementations of one contract. This does
    // not prove they agree — it pins that the production one exists and refuses a missing client,
    // so a future edit cannot quietly delete the injected-resolver requirement it depends on.
    expect(() => makeRowResolver(null)).toThrow(/supabase client is required/);
    expect(typeof makeRowResolver({ from: () => {} })).toBe('function');
  });
});
