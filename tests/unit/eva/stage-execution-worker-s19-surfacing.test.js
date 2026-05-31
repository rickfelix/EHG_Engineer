/**
 * SD-LEO-FEAT-SURFACE-S19-VISION-001 / FR-2 — vision-surfacing logic.
 *
 * Covers the FR-2 methods ADDED to StageExecutionWorker (FR-1's pre-existing S19 gate flow
 * is exercised by stage-execution-worker-s19-gate.test.js and is NOT re-tested here):
 *   - _buildVisionSurfacing        — server-authoritative copy-paste commands + draft_seed key
 *   - _createOrReuseVisionDecision — non-destructive create-or-reuse vs the partial-unique
 *                                    pending-decision slot (insert / reuse-update / skip / 23505)
 *   - _resolveVisionPendingDecision — idempotent resolve of the pending vision_approval row
 *   - _blockS19LeoBridge           — vision-pending vs vision-approved discrimination of the
 *                                    block row's advisory_data + the Decision-Deck surfacing
 *
 * Harness mirrors stage-execution-worker-s19-gate.test.js: a real worker instance is built with
 * an injected chainable `_supabase` mock and a no-op logger; the chain records insert/update/upsert
 * payloads and `.eq()` filter args so the assertions read straight off the captured calls. The
 * chain is awaitable (thenable) so terminal `.insert(...)` and `.update().eq()…` resolve to the
 * queued `{ data, error }` result (the gate suite only needed `.maybeSingle()`/`.upsert()` awaits).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

/**
 * Build a chainable supabase mock. Per `from(table)` invocation we create a fresh chain that:
 *   - records every `.eq(col,val)` into `calls.eq` (tagged with the table)
 *   - records `.upsert/.insert/.update` payloads into `calls.{upsert,insert,update}` (tagged)
 *   - resolves the terminal `.maybeSingle()/.single()` from a per-table LIFO-ish queue
 *     (next queued value, falling back to a per-table default), and
 *   - is itself awaitable, resolving to a per-table terminal result (default `{data:null,error:null}`),
 *     which is what `.insert(...)` and a fully-filtered `.update().eq()…` await on.
 *
 * @param {object} cfg
 * @param {object} [cfg.tableSingle]   table → resolved value returned by maybeSingle/single
 * @param {object} [cfg.tableQueue]    table → array of resolved values consumed in order by maybeSingle/single
 * @param {object} [cfg.tableAwait]    table → resolved value returned when the chain is awaited (insert/update terminal)
 */
function createMockSupabase({ tableSingle = {}, tableQueue = {}, tableAwait = {} } = {}) {
  const calls = { from: [], eq: [], upsert: [], insert: [], update: [], select: [] };
  const queues = {};
  for (const [t, arr] of Object.entries(tableQueue)) queues[t] = [...arr];

  const from = vi.fn((table) => {
    calls.from.push(table);
    const awaitResult = tableAwait[table] ?? { data: null, error: null };
    const nextSingle = () => {
      if (queues[table] && queues[table].length) return Promise.resolve(queues[table].shift());
      if (table in tableSingle) return Promise.resolve(tableSingle[table]);
      return Promise.resolve({ data: null, error: null });
    };
    const chain = {
      select: vi.fn((cols) => { calls.select.push({ table, cols }); return chain; }),
      eq: vi.fn((col, val) => { calls.eq.push({ table, col, val }); return chain; }),
      in: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(() => nextSingle()),
      single: vi.fn(() => nextSingle()),
      upsert: vi.fn((payload, opts) => { calls.upsert.push({ table, payload, opts }); return Promise.resolve(awaitResult); }),
      insert: vi.fn((payload) => { calls.insert.push({ table, payload }); return Promise.resolve(awaitResult); }),
      update: vi.fn((payload) => { calls.update.push({ table, payload }); return chain; }),
      // Make a `.update().eq()…` chain awaitable: `then` resolves to the table's await result.
      then: (resolve) => resolve(awaitResult),
    };
    return chain;
  });

  return { from, _calls: calls };
}

function makeWorker(supabase) {
  const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
  // Keep block/surfacing paths hermetic regardless of unrelated worker plumbing.
  worker._verifyAndProvisionVenture = vi.fn().mockResolvedValue(undefined);
  return worker;
}

// Helpers to filter captured calls.
const eqFor = (calls, table) => calls.eq.filter((e) => e.table === table);
const eqStrings = (calls, table) => eqFor(calls, table).map((e) => `${e.col}=${e.val}`);

describe('FR-2 _buildVisionSurfacing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('embeds the exact venture name + --seed-from draft_seed in the brainstorm command; approve is /eva vision create', async () => {
    const supabase = createMockSupabase({
      tableSingle: {
        ventures: { data: { name: 'CronGenius' }, error: null },
        eva_vision_documents: { data: { vision_key: 'VK-CRON-L2-001', status: 'draft_seed' }, error: null },
      },
    });
    const worker = makeWorker(supabase);

    const out = await worker._buildVisionSurfacing('v-1');

    expect(out.ventureName).toBe('CronGenius');
    expect(out.draftSeedVisionKey).toBe('VK-CRON-L2-001');
    expect(out.visionStatus).toBe('draft_seed');
    expect(out.commands.brainstorm).toBe('/brainstorm --venture CronGenius --seed-from draft_seed');
    expect(out.commands.brainstorm).toContain('CronGenius');
    expect(out.commands.brainstorm).toContain('--seed-from draft_seed');
    expect(out.commands.approve).toBe('/eva vision create');
  });

  it('falls back to placeholder name + null vision_key/"missing" status when no rows exist', async () => {
    const supabase = createMockSupabase(); // both lookups resolve to { data: null }
    const worker = makeWorker(supabase);

    const out = await worker._buildVisionSurfacing('v-2');

    expect(out.ventureName).toBe('this venture');
    expect(out.draftSeedVisionKey).toBeNull();
    expect(out.visionStatus).toBe('missing');
    expect(out.commands.brainstorm).toBe('/brainstorm --venture this venture --seed-from draft_seed');
    expect(out.commands.approve).toBe('/eva vision create');
  });
});

describe('FR-2 _createOrReuseVisionDecision', () => {
  beforeEach(() => vi.clearAllMocks());

  const surfacing = {
    ventureName: 'CronGenius',
    draftSeedVisionKey: 'VK-CRON-L2-001',
    visionStatus: 'draft_seed',
    commands: { brainstorm: '/brainstorm --venture CronGenius --seed-from draft_seed', approve: '/eva vision create' },
  };

  it('inserts exactly once (no update) when the pending slot is free', async () => {
    const supabase = createMockSupabase({
      tableSingle: { chairman_decisions: { data: null, error: null } }, // no existing pending row
    });
    const worker = makeWorker(supabase);

    await worker._createOrReuseVisionDecision('v-1', surfacing);

    const inserts = supabase._calls.insert.filter((c) => c.table === 'chairman_decisions');
    const updates = supabase._calls.update.filter((c) => c.table === 'chairman_decisions');
    expect(inserts).toHaveLength(1);
    expect(updates).toHaveLength(0);
    const row = inserts[0].payload;
    expect(row.decision_type).toBe('vision_approval');
    expect(row.status).toBe('pending');
    expect(row.decision).toBe('pending');
    expect(row.lifecycle_stage).toBe(19);
    expect(row.blocking).toBe(true);
    expect(row.venture_id).toBe('v-1');
    expect(typeof row.summary).toBe('string');
    expect(row.brief_data.commands).toEqual(surfacing.commands);
    expect(row.brief_data.draft_seed_vision_key).toBe('VK-CRON-L2-001');
  });

  it('reuses (UPDATE, no insert) when an existing pending vision_approval row occupies the slot', async () => {
    const supabase = createMockSupabase({
      tableSingle: {
        chairman_decisions: { data: { id: 'dec-9', decision_type: 'vision_approval' }, error: null },
      },
    });
    const worker = makeWorker(supabase);

    await worker._createOrReuseVisionDecision('v-1', surfacing);

    const inserts = supabase._calls.insert.filter((c) => c.table === 'chairman_decisions');
    const updates = supabase._calls.update.filter((c) => c.table === 'chairman_decisions');
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(1);
    // Refresh updates only summary + brief_data; targeted by the existing row id.
    expect(updates[0].payload.brief_data.commands).toEqual(surfacing.commands);
    expect(eqStrings(supabase._calls, 'chairman_decisions')).toContain('id=dec-9');
  });

  it('skips (NEITHER insert NOR update) + warns when a DIFFERENT pending decision_type holds the slot', async () => {
    const supabase = createMockSupabase({
      tableSingle: {
        chairman_decisions: { data: { id: 'dec-7', decision_type: 'budget_approval' }, error: null },
      },
    });
    const worker = makeWorker(supabase);

    await worker._createOrReuseVisionDecision('v-1', surfacing);

    expect(supabase._calls.insert.filter((c) => c.table === 'chairman_decisions')).toHaveLength(0);
    expect(supabase._calls.update.filter((c) => c.table === 'chairman_decisions')).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('swallows a 23505 unique-violation insert result without throwing', async () => {
    const supabase = createMockSupabase({
      tableSingle: { chairman_decisions: { data: null, error: null } }, // slot looks free…
      tableAwait: { chairman_decisions: { data: null, error: { code: '23505', message: 'duplicate key' } } }, // …but insert races
    });
    const worker = makeWorker(supabase);

    await expect(worker._createOrReuseVisionDecision('v-1', surfacing)).resolves.toBeUndefined();
    expect(supabase._calls.insert.filter((c) => c.table === 'chairman_decisions')).toHaveLength(1);
  });
});

describe('FR-2 _resolveVisionPendingDecision', () => {
  beforeEach(() => vi.clearAllMocks());

  it('issues an UPDATE filtered by venture + stage=19 + status=pending + decision_type=vision_approval', async () => {
    const supabase = createMockSupabase();
    const worker = makeWorker(supabase);

    await worker._resolveVisionPendingDecision('v-1');

    const updates = supabase._calls.update.filter((c) => c.table === 'chairman_decisions');
    expect(updates).toHaveLength(1);
    expect(updates[0].payload.status).toBe('approved');
    expect(updates[0].payload.decision).toBe('proceed');
    expect(typeof updates[0].payload.resolved_at).toBe('string');

    const filters = eqStrings(supabase._calls, 'chairman_decisions');
    expect(filters).toContain('venture_id=v-1');
    expect(filters).toContain('lifecycle_stage=19');
    expect(filters).toContain('status=pending');
    expect(filters).toContain('decision_type=vision_approval');
  });

  it('does not throw when the update affects nothing (idempotent no-op)', async () => {
    const supabase = createMockSupabase({
      tableAwait: { chairman_decisions: { data: null, error: null } },
    });
    const worker = makeWorker(supabase);

    await expect(worker._resolveVisionPendingDecision('v-ghost')).resolves.toBeUndefined();
  });

  it('does not throw when the update returns an error', async () => {
    const supabase = createMockSupabase({
      tableAwait: { chairman_decisions: { data: null, error: { message: 'boom' } } },
    });
    const worker = makeWorker(supabase);

    await expect(worker._resolveVisionPendingDecision('v-err')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('FR-2 _blockS19LeoBridge — vision-pending vs vision-approved discrimination', () => {
  beforeEach(() => vi.clearAllMocks());

  it('vision PENDING (approved-L2 lookup → null): advisory_data.vision_pending=true + commands, and a Deck decision is created/reused', async () => {
    const supabase = createMockSupabase({
      tableSingle: {
        // approved-L2 discriminator query in _blockS19LeoBridge → null ⇒ pending
        // (same table is also read by _buildVisionSurfacing latest-L2); queue both reads.
      },
      tableQueue: {
        eva_vision_documents: [
          { data: null, error: null },                                          // approved-L2 discriminator → not approved
          { data: { vision_key: 'VK-CRON-L2-001', status: 'draft_seed' }, error: null }, // latest-L2 for surfacing
        ],
        ventures: [{ data: { name: 'CronGenius' }, error: null }],
        chairman_decisions: [{ data: null, error: null }],                      // pending slot free → insert
      },
    });
    const worker = makeWorker(supabase);

    await worker._blockS19LeoBridge('v-1', ['Venture CronGenius: no L2 vision document found.']);

    const block = supabase._calls.upsert.find((c) => c.table === 'venture_stage_work');
    expect(block).toBeDefined();
    expect(block.payload.lifecycle_stage).toBe(19);
    expect(block.payload.stage_status).toBe('blocked');
    expect(block.payload.advisory_data.reason).toBe('vision_pending');
    expect(block.payload.advisory_data.vision_pending).toBe(true);
    expect(block.payload.advisory_data.commands).toBeDefined();
    expect(block.payload.advisory_data.commands.brainstorm).toContain('--seed-from draft_seed');
    expect(block.payload.advisory_data.draft_seed_vision_key).toBe('VK-CRON-L2-001');

    // A Decision-Deck row is surfaced (slot was free → insert).
    expect(supabase._calls.insert.filter((c) => c.table === 'chairman_decisions')).toHaveLength(1);
  });

  it('vision APPROVED (approved-L2 lookup → row): advisory_data.vision_pending=false, NO commands, and NO Deck insert/update', async () => {
    const supabase = createMockSupabase({
      tableQueue: {
        // approved-L2 discriminator returns a row ⇒ approved ⇒ no surfacing, no decision
        eva_vision_documents: [{ data: { vision_key: 'VK-CRON-L2-APPROVED' }, error: null }],
      },
    });
    const worker = makeWorker(supabase);

    await worker._blockS19LeoBridge('v-2', ['Some non-vision bridge failure']);

    const block = supabase._calls.upsert.find((c) => c.table === 'venture_stage_work');
    expect(block).toBeDefined();
    expect(block.payload.advisory_data.vision_pending).toBe(false);
    expect(block.payload.advisory_data.commands).toBeUndefined();
    expect(block.payload.advisory_data.draft_seed_vision_key).toBeUndefined();
    expect(block.payload.advisory_data.vision_status).toBeUndefined();

    // No chairman_decisions touched when the vision is already approved.
    expect(supabase._calls.insert.filter((c) => c.table === 'chairman_decisions')).toHaveLength(0);
    expect(supabase._calls.update.filter((c) => c.table === 'chairman_decisions')).toHaveLength(0);
    // And the surfacing builder / latest-L2 read is never reached.
    expect(supabase._calls.from.filter((t) => t === 'ventures')).toHaveLength(0);
  });

  it('approved-L2 discriminator applies the level=L2 + status=active + chairman_approved=true filters', async () => {
    const supabase = createMockSupabase({
      tableQueue: { eva_vision_documents: [{ data: { vision_key: 'VK' }, error: null }] },
    });
    const worker = makeWorker(supabase);

    await worker._blockS19LeoBridge('v-3', ['err']);

    const filters = eqStrings(supabase._calls, 'eva_vision_documents');
    expect(filters).toContain('venture_id=v-3');
    expect(filters).toContain('level=L2');
    expect(filters).toContain('status=active');
    expect(filters).toContain('chairman_approved=true');
  });
});
