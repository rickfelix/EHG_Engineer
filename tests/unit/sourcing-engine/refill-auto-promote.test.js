import { describe, it, expect } from 'vitest';
import {
  selectRefillBatch,
  buildRefillSdKey,
  buildRefillSdPayload,
  promoteStagedCandidate,
  DEFAULT_REFILL_BATCH_LIMIT,
} from '../../../lib/sourcing-engine/refill-auto-promote.js';

// A valid staged candidate per the -A predicate (pending, unpromoted, titled, traceable, non-fixture).
const validRow = (over = {}) => ({
  id: 'rwi-1',
  title: 'Real candidate',
  source_type: 'conversion_ledger',
  source_id: 'led-123',
  item_disposition: 'pending',
  promoted_to_sd_key: null,
  lane: 'belt',
  ...over,
});

describe('selectRefillBatch — SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-C', () => {
  it('returns only valid candidates (reusing the -A/-B SSOT)', () => {
    const rows = [
      validRow({ id: 'a' }),
      validRow({ id: 'b', item_disposition: 'declined' }), // not_staged
      validRow({ id: 'c', promoted_to_sd_key: 'SD-X' }),   // already_promoted
      validRow({ id: 'd', title: '' }),                    // missing_title
      validRow({ id: 'e', title: 'TEST seed' }),           // test_fixture
    ];
    const sel = selectRefillBatch(rows);
    expect(sel.total).toBe(5);
    expect(sel.validCount).toBe(1);
    expect(sel.batch.map((r) => r.id)).toEqual(['a']);
  });

  it('caps the batch at the limit (valid candidates beyond limit are deferred)', () => {
    const rows = Array.from({ length: 5 }, (_, i) => validRow({ id: `v${i}` }));
    const sel = selectRefillBatch(rows, { limit: 2 });
    expect(sel.validCount).toBe(5);
    expect(sel.batch).toHaveLength(2);
    expect(sel.limit).toBe(2);
  });

  it('defaults to DEFAULT_REFILL_BATCH_LIMIT for a missing/invalid limit', () => {
    expect(selectRefillBatch([], {}).limit).toBe(DEFAULT_REFILL_BATCH_LIMIT);
    expect(selectRefillBatch([], { limit: -3 }).limit).toBe(DEFAULT_REFILL_BATCH_LIMIT);
  });

  it('is total on empty/malformed corpus', () => {
    expect(selectRefillBatch(null).batch).toEqual([]);
    expect(selectRefillBatch(undefined).total).toBe(0);
    expect(selectRefillBatch([null, 42, 'x']).validCount).toBe(0);
  });
});

describe('buildRefillSdKey / buildRefillSdPayload (pure)', () => {
  it('builds a deterministic key (same source -> same key, for idempotency)', () => {
    const k1 = buildRefillSdKey(validRow());
    const k2 = buildRefillSdKey(validRow());
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^SD-REFILL-[0-9A-Z]{8}$/);
  });

  it('different source -> different key', () => {
    expect(buildRefillSdKey(validRow({ source_id: 'a' }))).not.toBe(buildRefillSdKey(validRow({ source_id: 'b' })));
  });

  it('builds a draft SD payload with traceable provenance', () => {
    const p = buildRefillSdPayload(validRow(), 'SD-REFILL-ABC');
    expect(p.sd_key).toBe('SD-REFILL-ABC');
    expect(p.status).toBe('draft');
    expect(p.title).toBe('Real candidate');
    expect(p.metadata.sourced_by).toBe('auto-refill');
    expect(p.metadata.promoted_from_roadmap_item_id).toBe('rwi-1');
    expect(p.metadata.source_id).toBe('led-123');
    // id is NOT NULL in strategic_directives_v2 with no DB default — the raw-insert path MUST mint one
    // (omitting it 23502-fails every promotion on live-flip). Guard against that regression.
    expect(p.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    // untyped item -> sd_type null so the createSD/key-prefix default applies (not a baked 'feature').
    expect(p.sd_type).toBeNull();
    // explicit target so harness items don't fall to the DB's EHG default.
    expect(p.target_application).toBe('EHG_Engineer');
    // DISTINCT description (not a title clone) via the canonical deriver.
    expect(p.description).not.toBe(p.title);
  });

  it('falls back to a traceable title for an empty title and caps length', () => {
    // The canonical deriver yields a traceable default ("Roadmap item <id>") for an empty title —
    // non-empty + identifiable, better than a generic constant.
    const p = buildRefillSdPayload({ id: 'x', title: '' }, 'SD-REFILL-Z');
    expect(p.title.length).toBeGreaterThan(0);
    expect(p.title).toContain('x');
    const long = buildRefillSdPayload({ id: 'y', title: 'z'.repeat(500) }, 'SD-REFILL-Y');
    expect(long.title.length).toBe(200);
  });
});

// Minimal supabase stub: records writes so we can assert dry-run performs none.
function makeStub({ existingSd = [] } = {}) {
  const writes = { inserts: [], updates: [] };
  const client = {
    from(table) {
      return {
        _table: table,
        _filters: {},
        select() { return this; },
        eq(col, val) { this._filters[col] = val; return this; },
        limit() {
          if (this._table === 'strategic_directives_v2') {
            const hit = existingSd.includes(this._filters.sd_key);
            return Promise.resolve({ data: hit ? [{ sd_key: this._filters.sd_key }] : [], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        insert(payload) {
          writes.inserts.push({ table: this._table, payload });
          // Simulate the strategic_directives_v2 NOT-NULL constraints so a payload missing id (the
          // live-fail the prior build shipped) is caught by tests instead of a fake {error:null}.
          if (this._table === 'strategic_directives_v2' && (!payload || !payload.id)) {
            return Promise.resolve({ error: { code: '23502', message: 'null value in column "id"' } });
          }
          return Promise.resolve({ error: null });
        },
        update(payload) {
          const u = { table: this._table, payload, _filters: {} };
          writes.updates.push(u);
          return { eq: (c, v) => { u._filters[c] = v; return Promise.resolve({ error: null }); } };
        },
      };
    },
  };
  return { client, writes };
}

describe('promoteStagedCandidate (only writer)', () => {
  it('dry-run (default) performs NO writes', async () => {
    const { client, writes } = makeStub();
    const r = await promoteStagedCandidate(client, validRow(), { apply: false });
    expect(r.promoted).toBe(false);
    expect(r.dry_run).toBe(true);
    expect(r.reason).toBe('dry_run');
    expect(writes.inserts).toHaveLength(0);
    expect(writes.updates).toHaveLength(0);
  });

  it('apply creates the SD and stamps the roadmap link', async () => {
    const { client, writes } = makeStub();
    const r = await promoteStagedCandidate(client, validRow(), { apply: true });
    expect(r.promoted).toBe(true);
    expect(r.reason).toBe('promoted');
    expect(writes.inserts).toHaveLength(1);
    expect(writes.inserts[0].table).toBe('strategic_directives_v2');
    expect(writes.updates).toHaveLength(1);
    expect(writes.updates[0].table).toBe('roadmap_wave_items');
    expect(writes.updates[0].payload.promoted_to_sd_key).toBe(r.sd_key);
  });

  it('no-op when the item is already promoted', async () => {
    const { client, writes } = makeStub();
    const r = await promoteStagedCandidate(client, validRow({ promoted_to_sd_key: 'SD-OLD' }), { apply: true });
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('already_promoted');
    expect(writes.inserts).toHaveLength(0);
  });

  it('no-op when the deterministic SD key already exists (idempotent re-run)', async () => {
    const key = buildRefillSdKey(validRow());
    const { client, writes } = makeStub({ existingSd: [key] });
    const r = await promoteStagedCandidate(client, validRow(), { apply: true });
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('sd_exists');
    expect(writes.inserts).toHaveLength(0);
  });

  it('warns (not throws) on a missing item id', async () => {
    const { client } = makeStub();
    const r = await promoteStagedCandidate(client, {}, { apply: true });
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('missing_item_id');
  });
});
