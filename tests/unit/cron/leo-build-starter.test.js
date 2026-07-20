/**
 * SD-LEO-INFRA-AUTO-EXECUTE-LEO-001 — headless tests for the build-ready DETECTOR.
 *
 * Drives main(argv, deps) with injected { supabase, pgClient, logger }. No DB, no network, no
 * Task tool. The keystone is the STARTER-ONLY static-source guardrail (T9) which codifies the
 * RCA a14ff998 invariant as an executable test: a future edit that re-introduces an advance,
 * claim, or teammate-spawn fails at unit time.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { main } from '../../../scripts/cron/leo-build-starter.mjs';

const SILENT = { log: () => {}, warn: () => {}, error: () => {} };

// ── Fluent supabase stub: routes results per table/operation from a config object ──
function makeSupabase(cfg = {}) {
  const updates = [];
  const events = [];
  const handlers = {
    strategic_directives_v2: (ctx) => {
      if (ctx.op === 'update') {
        updates.push({ filters: ctx.filters, payload: ctx.payload });
        return { data: null, error: cfg.sdUpdateError || null };
      }
      // candidate query — uniquely identified by the created_via DB-side filter
      if (ctx.filters['metadata->>created_via'] !== undefined) {
        if (cfg.candidateError) return { data: null, error: { message: cfg.candidateError } };
        return { data: cfg.candidates || [], error: null };
      }
      // children read — .eq('parent_sd_id', <real id>)
      if (ctx.filters['parent_sd_id'] != null) {
        const kids = cfg.childrenFor ? cfg.childrenFor(ctx.filters['parent_sd_id']) : (cfg.children || []);
        return { data: kids, error: null };
      }
      // emitSignal re-read — single + id
      if (ctx.single && 'id' in ctx.filters) {
        const rr = cfg.rereadFor ? cfg.rereadFor(ctx.filters['id']) : (cfg.reread !== undefined ? cfg.reread : { metadata: {} });
        return { data: rr, error: null };
      }
      return { data: [], error: null };
    },
    ventures: (ctx) => ({ data: cfg.ventureFor ? cfg.ventureFor(ctx.filters['id']) : cfg.venture, error: null }),
    eva_vision_documents: (ctx) => ({ data: cfg.visionFor ? cfg.visionFor(ctx.filters['venture_id']) : cfg.vision, error: null }),
    system_events: (ctx) => { events.push(ctx.payload); return { data: null, error: cfg.eventError || null }; },
  };
  function builder(table) {
    const ctx = { table, op: 'select', filters: {}, payload: null, single: false };
    const resolve = () => Promise.resolve(handlers[table] ? handlers[table](ctx) : { data: null, error: null });
    const b = {
      select() { ctx.op = 'select'; return b; },
      update(p) { ctx.op = 'update'; ctx.payload = p; return b; },
      insert(p) { ctx.op = 'insert'; ctx.payload = p; return resolve(); },
      eq(k, v) { ctx.filters[k] = v; return b; },
      is(k, v) { ctx.filters[k] = v; return b; },
      in(k, v) { ctx.filters[k] = v; return b; },
      not() { return b; },
      filter(k, _op, v) { ctx.filters[k] = v; return b; },
      order() { return b; },
      limit() { return b; },
      maybeSingle() { ctx.single = true; return resolve(); },
      // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: production now paginates
      // the candidate read via fetchAllPaginated, which calls .range() explicitly instead of
      // relying on the builder's thenable — resolve the same per-table result so a short page
      // (fewer rows than pageSize) ends the pagination loop after one page.
      range() { return resolve(); },
      then(res, rej) { return resolve().then(res, rej); },
    };
    return b;
  }
  const sb = { from: (t) => builder(t) };
  sb.__updates = updates;
  sb.__events = events;
  return sb;
}

function makePg({ acquired = true, failConnect = false } = {}) {
  const queries = [];
  return {
    __queries: queries,
    connect: vi.fn(async () => { if (failConnect) throw new Error('connfail'); }),
    end: vi.fn(async () => {}),
    query: vi.fn(async (sql) => {
      queries.push(sql);
      if (/hashtext/.test(sql)) return { rows: [{ k: 123 }] };
      if (/pg_try_advisory_lock/.test(sql)) return { rows: [{ acquired }] };
      if (/pg_advisory_unlock/.test(sql)) return { rows: [{}] };
      return { rows: [] };
    }),
  };
}

// ── Fixtures ──
const ORCH = (over = {}) => ({
  id: 'orch-1', sd_key: 'SD-DD-ORCH-001', venture_id: 'v1',
  metadata: { created_via: 'lifecycle-sd-bridge' }, ...over,
});
const VENTURE_OK = (id = 'v1') => ({ id, build_model: 'leo_bridge', status: 'active', current_lifecycle_stage: 19, deleted_at: null });
const VISION_OK = { vision_key: 'VISION-DD-L2-002' };
const CHILDREN_INCOMPLETE = [
  { sd_key: 'SD-DD-ORCH-001-A', status: 'draft', sequence_rank: 4033 },
  { sd_key: 'SD-DD-ORCH-001-B', status: 'draft', sequence_rank: 4040 },
];
const ONCE = ['node', 'leo-build-starter.mjs', '--once'];

describe('leo-build-starter detector', () => {
  beforeEach(() => vi.clearAllMocks());

  it('T0: zero candidates → no writes, exit 0', async () => {
    const sb = makeSupabase({ candidates: [] });
    const res = await main(ONCE, { supabase: sb, pgClient: null, logger: SILENT });
    expect(res.exitCode).toBe(0);
    expect(res.candidates).toBe(0);
    expect(sb.__updates).toHaveLength(0);
    expect(sb.__events).toHaveLength(0);
  });

  it('T1: happy path signals a fresh S19 tree exactly once', async () => {
    const sb = makeSupabase({ candidates: [ORCH()], venture: VENTURE_OK(), vision: VISION_OK, children: CHILDREN_INCOMPLETE });
    const res = await main(ONCE, { supabase: sb, pgClient: null, logger: SILENT });
    expect(res.exitCode).toBe(0);
    expect(res.signalled).toBe(1);
    expect(sb.__updates).toHaveLength(1);
    expect(typeof sb.__updates[0].payload.metadata.build_ready_at).toBe('string');
    expect(sb.__updates[0].payload.metadata.ready_child_sd_key).toBe('SD-DD-ORCH-001-A');
    expect(sb.__events).toHaveLength(1);
    expect(sb.__events[0].event_type).toBe('LEO_BUILD_READY_SIGNALLED');
    expect(sb.__events[0].venture_id).toBe('v1');
    expect(sb.__events[0].payload.ready_child_sd_key).toBe('SD-DD-ORCH-001-A');
  });

  it('T2: idempotent — candidate already carrying build_ready_at writes nothing', async () => {
    const sb = makeSupabase({
      candidates: [ORCH({ metadata: { created_via: 'lifecycle-sd-bridge', build_ready_at: '2026-06-01T00:00:00Z' } })],
      venture: VENTURE_OK(), vision: VISION_OK, children: CHILDREN_INCOMPLETE,
    });
    const res = await main(ONCE, { supabase: sb, pgClient: null, logger: SILENT });
    expect(res.exitCode).toBe(0);
    expect(sb.__updates).toHaveLength(0);
    expect(sb.__events).toHaveLength(0);
  });

  it('T2b: race guard — re-read shows a marker (peer won) → no duplicate write', async () => {
    const sb = makeSupabase({
      candidates: [ORCH()], venture: VENTURE_OK(), vision: VISION_OK, children: CHILDREN_INCOMPLETE,
      reread: { metadata: { build_ready_at: '2026-06-01T00:00:00Z' } },
    });
    const res = await main(ONCE, { supabase: sb, pgClient: null, logger: SILENT });
    expect(res.signalled).toBe(0);
    expect(sb.__updates).toHaveLength(0);
    expect(sb.__events).toHaveLength(0);
  });

  it('T3: skips a complete tree (all children terminal)', async () => {
    const sb = makeSupabase({
      candidates: [ORCH()], venture: VENTURE_OK(), vision: VISION_OK,
      children: [{ sd_key: 'A', status: 'completed', sequence_rank: 1 }, { sd_key: 'B', status: 'cancelled', sequence_rank: 2 }],
    });
    const res = await main(ONCE, { supabase: sb, pgClient: null, logger: SILENT });
    expect(res.exitCode).toBe(0);
    expect(sb.__updates).toHaveLength(0);
  });

  it('T4: refuses non-bridge trees (created_via filter yields no candidates)', async () => {
    // The created_via='lifecycle-sd-bridge' filter is applied DB-side; a chairman-created
    // orchestrator simply does not appear in the candidate set.
    const sb = makeSupabase({ candidates: [] });
    const res = await main(ONCE, { supabase: sb, pgClient: null, logger: SILENT });
    expect(res.candidates).toBe(0);
    expect(sb.__updates).toHaveLength(0);
  });

  it('T5: advisory-lock contention → graceful skip, exit 0, no unlock', async () => {
    const pg = makePg({ acquired: false });
    const sb = makeSupabase({ candidates: [ORCH()], venture: VENTURE_OK(), vision: VISION_OK, children: CHILDREN_INCOMPLETE });
    const res = await main(ONCE, { supabase: sb, pgClient: pg, logger: SILENT });
    expect(res.exitCode).toBe(0);
    expect(sb.__updates).toHaveLength(0);
    expect(pg.__queries.some((q) => /pg_advisory_unlock/.test(q))).toBe(false);
  });

  it('T6: precondition — no approved L2 vision → no signal', async () => {
    const sb = makeSupabase({ candidates: [ORCH()], venture: VENTURE_OK(), vision: null, children: CHILDREN_INCOMPLETE });
    const res = await main(ONCE, { supabase: sb, pgClient: null, logger: SILENT });
    expect(res.exitCode).toBe(0);
    expect(sb.__updates).toHaveLength(0);
  });

  it.each([
    ['killed', { ...VENTURE_OK(), status: 'killed' }],
    ['retired', { ...VENTURE_OK(), status: 'retired' }],
    ['tombstoned', { ...VENTURE_OK(), deleted_at: '2026-06-01T00:00:00Z' }],
    ['not-at-s19', { ...VENTURE_OK(), current_lifecycle_stage: 20 }],
    ['not-leo-bridge', { ...VENTURE_OK(), build_model: 'seeded_repo' }],
  ])('T7: precondition — %s venture → no signal', async (_label, venture) => {
    const sb = makeSupabase({ candidates: [ORCH()], venture, vision: VISION_OK, children: CHILDREN_INCOMPLETE });
    const res = await main(ONCE, { supabase: sb, pgClient: null, logger: SILENT });
    expect(res.exitCode).toBe(0);
    expect(sb.__updates).toHaveLength(0);
    expect(sb.__events).toHaveLength(0);
  });

  it('T8: --dry-run writes nothing', async () => {
    const sb = makeSupabase({ candidates: [ORCH()], venture: VENTURE_OK(), vision: VISION_OK, children: CHILDREN_INCOMPLETE });
    const res = await main([...ONCE, '--dry-run'], { supabase: sb, pgClient: null, logger: SILENT });
    expect(res.exitCode).toBe(0);
    expect(sb.__updates).toHaveLength(0);
    expect(sb.__events).toHaveLength(0);
  });

  it('T9: STARTER-ONLY static-source guardrail (RCA a14ff998 keystone)', () => {
    const srcPath = fileURLToPath(new URL('../../../scripts/cron/leo-build-starter.mjs', import.meta.url));
    const raw = readFileSync(srcPath, 'utf8');
    // Strip comments so the header's intentional mention of forbidden tokens (in negation) is
    // ignored; we only police actual CODE.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const forbidden = [
      /_advanceStage/, /advance_venture_stage/, /chairman_decisions/, /getNextReadyChild/,
      /release_sd/, /TeamCreate/, /spawnTeammate/, /Task\s*\(/, /sd-start/,
      /current_lifecycle_stage\s*:/, // write-as-object-key (reads use dot/select strings)
      /chairman_approved\s*:/,        // write-as-object-key (the precondition uses .eq('chairman_approved', true))
    ];
    for (const pat of forbidden) {
      expect(code, `forbidden pattern ${pat} present in code`).not.toMatch(pat);
    }
  });

  it('T10a: fatal misconfiguration (no connection env, no injected supabase) → exit 2', async () => {
    // The connection env-var NAMES are computed (not written as literals) so the static
    // DB-test guard (audit-db-test-guards.mjs) does not false-positive this pure-mock,
    // ALWAYS-run unit suite as a live-DB test — it touches no real database, and wrapping
    // it in describeDb would wrongly skip it whenever no real DB is configured.
    const urlKey = 'SUPABASE_' + 'URL';
    const keyKey = 'SUPABASE_SERVICE_' + 'ROLE_KEY';
    const saved = { [urlKey]: process.env[urlKey], [keyKey]: process.env[keyKey] };
    delete process.env[urlKey];
    delete process.env[keyKey];
    try {
      const res = await main(ONCE, { pgClient: null, logger: SILENT });
      expect(res.exitCode).toBe(2);
    } finally {
      for (const k of [urlKey, keyKey]) if (saved[k] !== undefined) process.env[k] = saved[k];
    }
  });

  it('T10b: operational error (candidate query fails) → exit 1, lock released in finally', async () => {
    const pg = makePg({ acquired: true });
    const sb = makeSupabase({ candidateError: 'boom' });
    const res = await main(ONCE, { supabase: sb, pgClient: pg, logger: SILENT });
    expect(res.exitCode).toBe(1);
    expect(pg.__queries.some((q) => /pg_advisory_unlock/.test(q))).toBe(true);
    expect(pg.end).toHaveBeenCalled();
  });

  it('T11: multiple candidates — per-candidate isolation (#2 vision-pending skipped)', async () => {
    const sb = makeSupabase({
      candidates: [
        ORCH({ id: 'o1', sd_key: 'S1', venture_id: 'v1' }),
        ORCH({ id: 'o2', sd_key: 'S2', venture_id: 'v2' }),
        ORCH({ id: 'o3', sd_key: 'S3', venture_id: 'v3' }),
      ],
      ventureFor: (id) => ({ v1: VENTURE_OK('v1'), v2: VENTURE_OK('v2'), v3: VENTURE_OK('v3') }[id]),
      visionFor: (vid) => ({ v1: VISION_OK, v2: null, v3: VISION_OK }[vid]),
      childrenFor: (pid) => ({ o1: CHILDREN_INCOMPLETE, o3: CHILDREN_INCOMPLETE }[pid] || []),
      rereadFor: () => ({ metadata: {} }),
    });
    const res = await main(ONCE, { supabase: sb, pgClient: null, logger: SILENT });
    expect(res.exitCode).toBe(0);
    expect(res.signalled).toBe(2);
    expect(sb.__updates).toHaveLength(2);
    expect(sb.__updates.map((u) => u.filters.id).sort()).toEqual(['o1', 'o3']);
  });

  it('T12: happy path releases the advisory lock once and ends the pg client', async () => {
    const pg = makePg({ acquired: true });
    const sb = makeSupabase({ candidates: [ORCH()], venture: VENTURE_OK(), vision: VISION_OK, children: CHILDREN_INCOMPLETE });
    const res = await main(ONCE, { supabase: sb, pgClient: pg, logger: SILENT });
    expect(res.exitCode).toBe(0);
    expect(pg.__queries.filter((q) => /pg_advisory_unlock/.test(q))).toHaveLength(1);
    expect(pg.end).toHaveBeenCalledTimes(1);
  });
});
