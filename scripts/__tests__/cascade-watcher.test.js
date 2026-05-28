/**
 * Unit tests for scripts/cron/cascade-watcher.mjs
 *
 * SD: SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001 / FR-B
 *
 * Covers TS-1 + TS-3 + TS-4 + TS-5 + TS-14 from PRD test_scenarios.
 * Mock pattern follows quality-findings-aggregator.test.js + archplan-upsert.test.js.
 */
import { describe, it, expect, vi } from 'vitest';
import { parseArgs, main } from '../cron/cascade-watcher.mjs';

const VISION_WITH_ARCH_SECTION = `# Vision\n\n## Problem\n...\n\n## Architectural Plan\n\nPhase 1 plan body of substantial length here to clear the body minimum threshold.\n\n## Phase 1: Backend setup\nWith schema migration logic.\n\n## Phase 2: Frontend dashboard\nWith UI components.\n\n## Phase 3: Integration tests\nTest harness.\n`;

function makeSupabase({ visions = [], archplans = [], orchestrators = [], ventures = [], errorRows = [], insertCb = () => {} } = {}) {
  const inserts = [];
  const updates = [];

  function from(table) {
    const filters = [];
    const builder = {
      select(_cols, _opts) { return builder; },
      eq(col, val) { filters.push([col, val, 'eq']); return builder; },
      neq() { return builder; },
      gte() { return builder; },
      not(col, _op, val) { filters.push([col, val, 'not']); return builder; },
      is() { return builder; },
      filter() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      ilike() { return builder; },
      maybeSingle() { return _exec(true); },
      single() { return _exec(true); },
      then(resolve, reject) { return _exec(false).then(resolve, reject); },
      insert(row) {
        inserts.push({ table, row });
        insertCb({ table, row });
        if (table === 'cascade_watcher_heartbeats') {
          return { select: () => ({ single: () => Promise.resolve({ data: { run_id: 'fake-run-id' }, error: null }) }) };
        }
        return Promise.resolve({ error: null });
      },
      upsert(row, _opts) {
        inserts.push({ table, row });
        // Support chain: upsert(...).select(...).single() per archplan-upsert.js pattern
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'fake-id', plan_key: row?.plan_key || 'X', version: 1, status: 'active', vision_id: row?.vision_id || 'v1' }, error: null }),
          }),
          then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject),
        };
      },
      update(patch) {
        updates.push({ table, patch });
        return { eq: () => Promise.resolve({ error: null }) };
      },
    };
    async function _exec(single) {
      let dataset;
      if (table === 'eva_vision_documents') dataset = visions;
      else if (table === 'eva_architecture_plans') dataset = archplans;
      else if (table === 'strategic_directives_v2') dataset = orchestrators;
      else if (table === 'ventures') dataset = ventures;
      else if (table === 'eva_cascade_errors') dataset = errorRows;
      else dataset = [];
      const rows = filters.reduce((acc, [col, val, op]) => {
        if (op === 'eq') return acc.filter(r => r[col] === val);
        if (op === 'not') return acc.filter(r => r[col] !== null && r[col] !== undefined);
        return acc;
      }, dataset);
      if (single) return { data: rows[0] || null, error: null };
      return { data: rows, error: null };
    }
    return builder;
  }

  return { from, _inserts: inserts, _updates: updates };
}

describe('parseArgs', () => {
  it('parses --once and --dry-run', () => {
    expect(parseArgs(['node', 'cmd', '--once', '--dry-run'])).toMatchObject({ once: true, dryRun: true });
  });
  it('parses --venture-id <uuid>', () => {
    expect(parseArgs(['node', 'cmd', '--venture-id', 'abc-123'])).toMatchObject({ ventureId: 'abc-123' });
  });
  it('parses --help', () => {
    expect(parseArgs(['node', 'cmd', '--help'])).toMatchObject({ help: true });
  });
});

describe('cascade-watcher main()', () => {
  it('TS-1 happy path: vision with arch section → archplan created, heartbeat finished with success_count=1', async () => {
    const supabase = makeSupabase({
      visions: [{ id: 'v1', vision_key: 'VISION-TEST-API-L2-001', content: VISION_WITH_ARCH_SECTION, level: 'L2', status: 'active', chairman_approved: true, venture_id: 'vent1' }],
      archplans: [],
      orchestrators: [],
      ventures: [{ id: 'vent1', name: 'TestVenture' }],
    });
    const { exitCode, success } = await main(['node', 'cmd', '--once'], { supabase, pgClient: null, logger: { log: () => {}, warn: () => {}, error: () => {} } });
    expect(exitCode).toBe(0);
    expect(success).toBeGreaterThan(0);
  });

  it('TS-2 refusal: vision without arch section → ARCH_SECTION_NOT_FOUND row written', async () => {
    const supabase = makeSupabase({
      visions: [{ id: 'v1', vision_key: 'VISION-TEST-L2-001', content: '# Vision\n\n## Other\nno arch section here\n', level: 'L2', status: 'active', chairman_approved: true, venture_id: 'vent1' }],
      archplans: [],
      orchestrators: [],
      ventures: [{ id: 'vent1', name: 'TestVenture' }],
    });
    const { exitCode, refusal } = await main(['node', 'cmd', '--once'], { supabase, pgClient: null, logger: { log: () => {}, warn: () => {}, error: () => {} } });
    expect(exitCode).toBe(0);
    expect(refusal).toBeGreaterThanOrEqual(1);
    const errorInserts = supabase._inserts.filter(i => i.table === 'eva_cascade_errors');
    expect(errorInserts.some(i => i.row?.error_code === 'ARCH_SECTION_NOT_FOUND')).toBe(true);
    const archRow = errorInserts.find(i => i.row?.error_code === 'ARCH_SECTION_NOT_FOUND');
    expect(archRow.row.remediation_command).toMatch(/archplan-command\.mjs upsert/);
  });

  it('TS-4 manual-override: existing archplan with auto_generated=false → MANUAL_OVERRIDE_DETECTED', async () => {
    const supabase = makeSupabase({
      visions: [{ id: 'v1', vision_key: 'VISION-TEST-API-L2-001', content: VISION_WITH_ARCH_SECTION, level: 'L2', status: 'active', chairman_approved: true, venture_id: 'vent1' }],
      archplans: [{ id: 'a1', vision_id: 'v1', plan_key: 'ARCH-TEST-001', metadata: { auto_generated: false } }],
      orchestrators: [],
      ventures: [{ id: 'vent1', name: 'TestVenture' }],
    });
    const { exitCode } = await main(['node', 'cmd', '--once'], { supabase, pgClient: null, logger: { log: () => {}, warn: () => {}, error: () => {} } });
    expect(exitCode).toBe(0);
    const overrides = supabase._inserts.filter(i => i.table === 'eva_cascade_errors' && i.row?.error_code === 'MANUAL_OVERRIDE_DETECTED');
    expect(overrides.length).toBeGreaterThanOrEqual(1);
  });

  it('TS-5 advisory lock contention: pg client returns acquired=false → stages skipped, exit 0', async () => {
    const supabase = makeSupabase({
      visions: [{ id: 'v1', vision_key: 'VISION-TEST-API-L2-001', content: VISION_WITH_ARCH_SECTION, level: 'L2', status: 'active', chairman_approved: true, venture_id: 'vent1' }],
      ventures: [{ id: 'vent1', name: 'T' }],
    });
    // Stateful pg mock: hashtext returns key, pg_try_advisory_lock returns false (locked by other run)
    const pgClient = {
      connect: () => Promise.resolve(),
      query: (sql) => {
        if (sql.includes('hashtext')) return Promise.resolve({ rows: [{ k: 12345 }] });
        if (sql.includes('pg_try_advisory_lock')) return Promise.resolve({ rows: [{ acquired: false }] });
        return Promise.resolve({ rows: [] });
      },
      end: () => Promise.resolve(),
    };
    const { exitCode, success, refusal } = await main(['node', 'cmd', '--once'], { supabase, pgClient, logger: { log: () => {}, warn: () => {}, error: () => {} } });
    expect(exitCode).toBe(0);
    expect(success).toBe(0);
    expect(refusal).toBe(0);
  });

  it('TS-14 exit code: --dry-run does not write archplans or orchestrators', async () => {
    const supabase = makeSupabase({
      visions: [{ id: 'v1', vision_key: 'VISION-TEST-API-L2-001', content: VISION_WITH_ARCH_SECTION, level: 'L2', status: 'active', chairman_approved: true, venture_id: 'vent1' }],
      ventures: [{ id: 'vent1', name: 'T' }],
    });
    const { exitCode, success } = await main(['node', 'cmd', '--once', '--dry-run'], { supabase, pgClient: null, logger: { log: () => {}, warn: () => {}, error: () => {} } });
    expect(exitCode).toBe(0);
    expect(success).toBeGreaterThan(0);
    // Verify no archplan or orchestrator insert occurred
    const archplanInserts = supabase._inserts.filter(i => i.table === 'eva_architecture_plans');
    const orchInserts = supabase._inserts.filter(i => i.table === 'strategic_directives_v2');
    expect(archplanInserts.length).toBe(0);
    expect(orchInserts.length).toBe(0);
  });

  it('help mode exits 0 without doing work', async () => {
    const { exitCode } = await main(['node', 'cmd', '--help'], { supabase: {}, pgClient: null, logger: { log: () => {}, warn: () => {}, error: () => {} } });
    expect(exitCode).toBe(0);
  });
});
