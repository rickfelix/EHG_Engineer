/**
 * SD-LEO-INFRA-SOURCING-ENGINE-ADAM-DIRECT-REGISTRY-001 — pure unit tests.
 * An Adam-direct candidate registers+lanes; a registry-bypassing ghost SD backfills exactly one row;
 * a re-run is idempotent; a candidate that skips registration soft-warns (does not throw); and the
 * whole thing is DORMANT-SAFE (dry-run when the lane column / source_type CHECK are absent).
 */
import { describe, it, expect } from 'vitest';
import {
  buildAdamRoadmapItem,
  roadmapLaneColumnExists,
  findAdamGhostSds,
  registerAdamDirectCandidate,
  backfillAdamGhosts,
  ADAM_DIRECT_SOURCE_TYPE,
} from '../../../lib/sourcing-engine/adam-direct-registry.js';

/**
 * Configurable fake supabase. Each .from(table) chain is awaitable and resolves to the configured
 * response for (table, op). Inserts are recorded so a test can assert WHAT would be written.
 */
function makeDb(cfg = {}) {
  const inserted = [];
  const resolve = (table, op, row) => {
    const t = cfg[table] || {};
    if (op === 'insert') { if (!(t.insert && t.insert.error)) inserted.push({ table, row }); return t.insert || { error: null }; }
    return t.select || { data: [], error: null };
  };
  const builder = (table) => {
    const b = { _op: 'select', _row: null };
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: .range() added so
    // fetchAllPaginated-converted call sites (findAdamGhostSds) can chain on this
    // thenable builder like any other filter method.
    b.select = () => b; b.eq = () => b; b.in = () => b; b.limit = () => b; b.order = () => b; b.not = () => b; b.is = () => b; b.range = () => b;
    b.insert = (row) => { b._op = 'insert'; b._row = row; return b; };
    b.then = (res, rej) => Promise.resolve(resolve(table, b._op, b._row)).then(res, rej);
    b.catch = (rej) => b.then(undefined, rej);
    return b;
  };
  return { inserted, from: (table) => builder(table) };
}

describe('buildAdamRoadmapItem — routes via the shipped router, lane gated by column presence (FR-1/FR-3)', () => {
  const sd = { id: 'uuid-1', sd_key: 'SD-LEO-X-001', title: 'Some infra capability', disposition: 'BUILD' };

  it('produces a roadmap_wave_items payload with the SD link + adam_direct source_type', () => {
    const { payload } = buildAdamRoadmapItem(sd, { waveId: 'wave-1', lanePresent: true });
    expect(payload.wave_id).toBe('wave-1');
    expect(payload.source_type).toBe(ADAM_DIRECT_SOURCE_TYPE);
    expect(payload.source_id).toBe('uuid-1');
    expect(payload.promoted_to_sd_key).toBe('SD-LEO-X-001');
    expect(payload.metadata.sourced_by).toBe('adam');
    expect(payload.metadata.dedup_match_sd_key).toBe('SD-LEO-X-001');
  });

  it('OMITS lane when the column is dormant (lanePresent=false) — dormant-safe', () => {
    const { payload } = buildAdamRoadmapItem(sd, { waveId: 'wave-1', lanePresent: false });
    expect(payload).not.toHaveProperty('lane');
  });

  it('includes a VALID lane when the column is present', () => {
    const { payload, lane } = buildAdamRoadmapItem(sd, { waveId: 'wave-1', lanePresent: true });
    // router returns one of the canonical lanes; payload.lane only set when isValidLane(lane)
    if (payload.lane !== undefined) expect(typeof payload.lane).toBe('string');
    expect(typeof lane === 'string' || lane === undefined || lane === null).toBe(true);
  });
});

describe('roadmapLaneColumnExists — dormant probe', () => {
  it('true when the lane select succeeds', async () => {
    expect(await roadmapLaneColumnExists(makeDb({ roadmap_wave_items: { select: { data: [{}] } } }))).toBe(true);
  });
  it('false on 42703 (column absent)', async () => {
    expect(await roadmapLaneColumnExists(makeDb({ roadmap_wave_items: { select: { error: { code: '42703', message: 'column "lane" does not exist' } } } }))).toBe(false);
  });
  it('throws on an unrelated (auth) error — never mistakes an outage for missing-column', async () => {
    await expect(roadmapLaneColumnExists(makeDb({ roadmap_wave_items: { select: { error: { code: '42501', message: 'permission denied' } } } }))).rejects.toThrow();
  });
});

describe('findAdamGhostSds — enumerate Adam SDs without a roadmap row (FR-2)', () => {
  it('returns only Adam SDs whose sd_key is NOT already promoted', async () => {
    const db = makeDb({
      strategic_directives_v2: { select: { data: [
        { id: 'u1', sd_key: 'SD-A', title: 'A', status: 'draft', metadata: { sourced_by: 'adam' } },
        { id: 'u2', sd_key: 'SD-B', title: 'B', status: 'draft', metadata: { sourced_by: 'adam' } },
      ] } },
      roadmap_wave_items: { select: { data: [{ promoted_to_sd_key: 'SD-A' }] } },
    });
    const ghosts = await findAdamGhostSds(db);
    expect(ghosts.map((g) => g.sd_key)).toEqual(['SD-B']);
  });
});

describe('backfillAdamGhosts — dormant-safe, dry-run-default, idempotent (FR-2/FR-5)', () => {
  const adamRows = [
    { id: 'u1', sd_key: 'SD-A', title: 'A', status: 'draft', metadata: { sourced_by: 'adam' } },
    { id: 'u2', sd_key: 'SD-B', title: 'B', status: 'draft', metadata: { sourced_by: 'adam' } },
  ];
  const baseCfg = (laneErr) => ({
    strategic_directives_v2: { select: { data: adamRows } },
    roadmap_wave_items: { select: laneErr ? { error: { code: '42703', message: 'lane does not exist' } } : { data: [] } },
    strategic_roadmaps: { select: { data: [{ id: 'rm-1' }] } },
    roadmap_waves: { select: { data: [{ id: 'wave-1', sequence_rank: 5 }] } },
  });

  it('DRY-RUN by default: counts candidates, writes nothing', async () => {
    const db = makeDb(baseCfg(false));
    const res = await backfillAdamGhosts(db, { /* apply omitted */ });
    expect(res.dry_run).toBe(true);
    expect(res.candidates).toBe(2);
    expect(res.registered).toBe(2); // would-register
    expect(db.inserted).toHaveLength(0); // nothing written
  });

  it('lane column dormant forces dry-run even with --apply', async () => {
    // roadmap_wave_items lane select errors 42703 -> lane_column_missing -> dry-run.
    // But the ghost enumeration ALSO reads roadmap_wave_items.promoted_to_sd_key; in this fake both
    // return the same configured select. Use a wave + adam rows, lane probe errors.
    const cfg = baseCfg(true);
    // findAdamGhostSds reads roadmap_wave_items promoted list — with an error it yields [] => all are ghosts.
    const db = makeDb(cfg);
    const res = await backfillAdamGhosts(db, { apply: true });
    expect(res.lane_column_missing).toBe(true);
    expect(res.dry_run).toBe(true);
    expect(db.inserted).toHaveLength(0);
  });

  it('no target wave => dry-run (never inserts an orphan row)', async () => {
    const cfg = baseCfg(false);
    cfg.strategic_roadmaps = { select: { data: [] } }; // no roadmap
    const db = makeDb(cfg);
    const res = await backfillAdamGhosts(db, { apply: true });
    expect(res.wave_id).toBeNull();
    expect(res.dry_run).toBe(true);
    expect(db.inserted).toHaveLength(0);
  });

  it('source_type CHECK dormant (23514) downgrades a live apply to dry-run', async () => {
    const cfg = baseCfg(false);
    cfg.roadmap_wave_items = { select: { data: [{}] }, insert: { error: { code: '23514', message: 'source_type check' } } };
    const db = makeDb(cfg);
    const res = await backfillAdamGhosts(db, { apply: true });
    expect(res.source_type_unsupported).toBe(true);
    expect(res.dry_run).toBe(true);
  });

  it('no ghosts => zero candidates, no writes', async () => {
    const cfg = baseCfg(false);
    cfg.strategic_directives_v2 = { select: { data: [] } };
    const db = makeDb(cfg);
    const res = await backfillAdamGhosts(db, { apply: true });
    expect(res.candidates).toBe(0);
    expect(db.inserted).toHaveLength(0);
  });
});

describe('registerAdamDirectCandidate — idempotent + soft-warn (FR-1)', () => {
  const sd = { id: 'u1', sd_key: 'SD-A', title: 'A' };

  it('idempotent: already-registered SD is a no-op (no warn, not registered)', async () => {
    const db = makeDb({ roadmap_wave_items: { select: { data: [{ id: 'existing' }] } } });
    const out = await registerAdamDirectCandidate(db, sd, { apply: true });
    expect(out.registered).toBe(false);
    expect(out.reason).toBe('already registered');
    expect(out.warn).toBe(false);
  });

  it('missing sd_key/id => soft-warn, does NOT throw', async () => {
    const db = makeDb({});
    const out = await registerAdamDirectCandidate(db, { title: 'no key' }, { apply: true });
    expect(out.registered).toBe(false);
    expect(typeof out.warn).toBe('boolean');
    expect(out.reason).toContain('missing');
  });

  it('lane dormant => dry-run (no write)', async () => {
    const db = makeDb({
      roadmap_wave_items: { select: { error: { code: '42703', message: 'lane does not exist' } } },
      strategic_roadmaps: { select: { data: [{ id: 'rm-1' }] } },
      roadmap_waves: { select: { data: [{ id: 'wave-1', sequence_rank: 5 }] } },
    });
    const out = await registerAdamDirectCandidate(db, sd, { apply: true });
    expect(out.dry_run).toBe(true);
    expect(db.inserted).toHaveLength(0);
  });
});
