/**
 * Unit Tests: Venture Nursery — LIVE-schema semantics.
 *
 * SD-LEO-INFRA-STAGE0-NURSERY-PARK-PATH-001 (Charlie ledger CH-1): parkVenture previously
 * wrote 9 columns that do not exist on live venture_nursery, so EVERY non-'ready'
 * chairman-review outcome threw and failed the whole request. These tests pin the
 * rewritten module to the live 20260209 schema (maturity_level CHECK, source_type CHECK,
 * source_ref as the rich-brief vessel, next_evaluation_at scheduling) — migrated from the
 * old suite equal-or-stronger: every guard test kept, fixtures moved to live shape, plus
 * insert-shape/mapper-matrix/source pins.
 */
import { describe, test, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  parkVenture,
  reactivateVenture,
  recordSynthesisFeedback,
  checkNurseryTriggers,
  getNurseryHealth,
  toNurseryMaturityLevel,
  toNurserySourceType,
  scheduleToIntervalDays,
  NURSERY_MATURITY_LEVELS,
  NURSERY_SOURCE_TYPES,
} from '../../../../lib/eva/stage-zero/venture-nursery.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const silentLogger = { log: vi.fn(), warn: vi.fn() };

const sampleBrief = {
  name: 'Test Venture',
  problem_statement: 'A problem',
  solution: 'A solution',
  target_market: 'SMBs',
  origin_type: 'discovery',
  raw_chairman_intent: 'Make money',
  maturity: 'seed',
  composite_score: 72,
  thesis: { who_pays: 'SMBs' },
  kill_criteria: [{ id: 'k1' }],
  explicit_decisions: { form_factor: { value: 'web' } },
  metadata: { synthesis: { weighted_score: { total_score: 81 }, cross_reference: {} } },
};

// Live column set from database/migrations/20260209_stage0_venture_entry_schema.sql —
// the ONLY keys any venture_nursery write may use.
const LIVE_COLUMNS = new Set([
  'id', 'brief_id', 'name', 'description', 'maturity_level', 'trigger_conditions',
  'current_score', 'score_history', 'last_evaluated_at', 'next_evaluation_at',
  'evaluation_interval_days', 'promoted_to_venture_id', 'source_type', 'source_ref',
  'created_at', 'updated_at',
]);

/** Capturing mock: records insert/update payloads + select cols; FIFO list/single data. */
function captureSb({ selectData = [], singleData = undefined, insertResult = undefined } = {}) {
  const captured = { inserts: [], updates: [], selects: [] };
  const supabase = { from: (table) => {
    const state = { table, filters: [] };
    const c = {
      insert: (payload) => { captured.inserts.push({ table, payload }); return c; },
      update: (payload) => { captured.updates.push({ table, payload, filters: state.filters }); return c; },
      select: (cols) => { captured.selects.push({ table, cols }); return c; },
      eq: (col, v) => { state.filters.push(['eq', col, v]); return c; },
      is: (col, v) => { state.filters.push(['is', col, v]); return c; },
      order: () => c,
      limit: () => c,
      // fetch-all-paginated (FR-6) awaits .range() as the paginated terminal.
      range: () => Promise.resolve({ data: selectData, error: null }),
      single: async () => ({
        data: singleData !== undefined ? singleData
          : insertResult !== undefined ? insertResult
          : { id: 'nursery-1', name: sampleBrief.name, ...(captured.inserts[0]?.payload || {}) },
        error: null,
      }),
      then: (res) => Promise.resolve({ data: selectData, error: null }).then(res),
    };
    return c;
  } };
  return { supabase, captured };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('parkVenture (FR-1: live-schema insert)', () => {
  test('throws on missing supabase', async () => {
    await expect(parkVenture(sampleBrief, { reason: 'test' }, {}))
      .rejects.toThrow('supabase client is required');
  });

  test('throws on missing reason', async () => {
    const { supabase } = captureSb();
    await expect(parkVenture(sampleBrief, {}, { supabase, logger: silentLogger }))
      .rejects.toThrow('reason is required');
  });

  test('throws on null params', async () => {
    const { supabase } = captureSb();
    await expect(parkVenture(sampleBrief, null, { supabase, logger: silentLogger }))
      .rejects.toThrow('reason is required');
  });

  test('insert payload uses ONLY live columns — the CH-1 phantom set is gone', async () => {
    const { supabase, captured } = captureSb();
    await parkVenture(sampleBrief, { reason: 'not ready' }, { supabase, logger: silentLogger });
    const payload = captured.inserts[0].payload;
    for (const key of Object.keys(payload)) {
      expect(LIVE_COLUMNS.has(key), `phantom column in insert: ${key}`).toBe(true);
    }
    for (const phantom of ['problem_statement', 'solution', 'target_market', 'origin_type', 'raw_chairman_intent', 'maturity', 'parked_reason', 'status', 'metadata']) {
      expect(payload).not.toHaveProperty(phantom);
    }
  });

  test('maps the brief into the live shape (description/maturity_level/score/schedule/source_ref)', async () => {
    const { supabase, captured } = captureSb();
    const result = await parkVenture(
      sampleBrief,
      { reason: 'Market not ready', triggerConditions: [{ type: 'market_shift' }], reviewSchedule: '30d' },
      { supabase, logger: silentLogger }
    );
    expect(result.id).toBe('nursery-1');
    const p = captured.inserts[0].payload;
    expect(p.name).toBe('Test Venture');
    expect(p.description).toContain('A problem');
    expect(p.maturity_level).toBe('seed');
    expect(p.trigger_conditions).toEqual([{ type: 'market_shift' }]);
    expect(p.current_score).toBe(81); // weighted synthesis score preferred over composite
    expect(p.score_history[0]).toMatchObject({ score: 81, reason: 'parked' });
    expect(p.evaluation_interval_days).toBe(30);
    expect(typeof p.next_evaluation_at).toBe('string');
    expect(p.source_type).toBe('discovery_mode');
    expect(p.source_ref.park.parked_reason).toBe('Market not ready');
    expect(p.source_ref.park.raw_chairman_intent).toBe('Make money');
    expect(p.source_ref.brief).toMatchObject({
      problem_statement: 'A problem',
      thesis: { who_pays: 'SMBs' },
      kill_criteria: [{ id: 'k1' }],
      explicit_decisions: { form_factor: { value: 'web' } },
    });
    expect(p.source_ref.synthesis_snapshot).toEqual(sampleBrief.metadata.synthesis);
  });

  test('calculates review date for every schedule format without throwing', async () => {
    const { supabase } = captureSb();
    await parkVenture(sampleBrief, { reason: 'test', reviewSchedule: '90d' }, { supabase, logger: silentLogger });
    await parkVenture(sampleBrief, { reason: 'test', reviewSchedule: '3m' }, { supabase, logger: silentLogger });
  });

  test('a non-ready (blocked) chairman outcome parks WITHOUT throwing — the CH-1 hard-fail class', async () => {
    const { supabase, captured } = captureSb();
    await expect(
      parkVenture({ ...sampleBrief, maturity: 'blocked' }, { reason: 'constraints failed' }, { supabase, logger: silentLogger })
    ).resolves.toBeTruthy();
    expect(captured.inserts[0].payload.maturity_level).toBe('seed'); // CHECK-safe mapping
  });

  test('surfaces a genuine insert error as "Failed to park venture: <msg>" (error branch preserved from the predecessor suite)', async () => {
    const supabase = { from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'boom' } }) }) }),
    }) };
    await expect(parkVenture(sampleBrief, { reason: 'x' }, { supabase, logger: silentLogger }))
      .rejects.toThrow('Failed to park venture: boom');
  });
});

describe('total mappers (FR-1: CHECK violation structurally impossible)', () => {
  it('maturity: seed/sprout/ready pass; blocked/nursery/unknown -> seed; always in the CHECK set', () => {
    expect(toNurseryMaturityLevel('seed')).toBe('seed');
    expect(toNurseryMaturityLevel('sprout')).toBe('sprout');
    expect(toNurseryMaturityLevel('ready')).toBe('ready');
    expect(toNurseryMaturityLevel('blocked')).toBe('seed');
    expect(toNurseryMaturityLevel('nursery')).toBe('seed');
    for (const v of ['seed', 'sprout', 'ready', 'blocked', 'nursery', undefined, 'x']) {
      expect(NURSERY_MATURITY_LEVELS).toContain(toNurseryMaturityLevel(v));
    }
  });

  it('source_type: every origin_type lands inside the CHECK enum', () => {
    expect(toNurserySourceType('discovery')).toBe('discovery_mode');
    expect(toNurserySourceType('nursery_reeval')).toBe('discovery_mode');
    expect(toNurserySourceType('competitor_teardown')).toBe('competitor_analysis');
    expect(toNurserySourceType('blueprint')).toBe('manual');
    expect(toNurserySourceType('seeded_from_venture')).toBe('manual');
    for (const v of ['discovery', 'competitor_teardown', 'blueprint', 'manual', 'nursery_reeval', 'seeded_from_venture', undefined, 'x']) {
      expect(NURSERY_SOURCE_TYPES).toContain(toNurserySourceType(v));
    }
  });

  it('schedule parsing: 30d->30, 12h->1 (min 1), 3m->90, garbage/undefined->90', () => {
    expect(scheduleToIntervalDays('30d')).toBe(30);
    expect(scheduleToIntervalDays('12h')).toBe(1);
    expect(scheduleToIntervalDays('3m')).toBe(90);
    expect(scheduleToIntervalDays('bogus')).toBe(90);
    expect(scheduleToIntervalDays(undefined)).toBe(90);
  });
});

describe('reactivateVenture (FR-2: live columns; no status column)', () => {
  test('throws on missing supabase', async () => {
    await expect(reactivateVenture('id-1', { reason: 'test' }, {}))
      .rejects.toThrow('supabase client is required');
  });

  test('throws on missing nurseryId', async () => {
    const { supabase } = captureSb();
    await expect(reactivateVenture(null, { reason: 'test' }, { supabase, logger: silentLogger }))
      .rejects.toThrow('nurseryId is required');
  });

  test('throws on missing reason', async () => {
    const { supabase } = captureSb();
    await expect(reactivateVenture('id-1', {}, { supabase, logger: silentLogger }))
      .rejects.toThrow('reason is required');
  });

  test('throws when venture already reactivated (source_ref.reactivation marker)', async () => {
    const { supabase } = captureSb({ singleData: { id: 'id-1', name: 'Test', source_ref: { reactivation: { reason: 'r' } } } });
    await expect(reactivateVenture('id-1', { reason: 'test' }, { supabase, logger: silentLogger }))
      .rejects.toThrow('Venture already reactivated');
  });

  test('throws when venture already promoted', async () => {
    const { supabase } = captureSb({ singleData: { id: 'id-1', name: 'Test', promoted_to_venture_id: 'v-9', source_ref: {} } });
    await expect(reactivateVenture('id-1', { reason: 'test' }, { supabase, logger: silentLogger }))
      .rejects.toThrow('Venture already promoted');
  });

  test('throws "Nursery entry not found" on a fetch error (error branch preserved from the predecessor suite)', async () => {
    const supabase = { from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'no row' } }) }) }),
    }) };
    await expect(reactivateVenture('missing-id', { reason: 'test' }, { supabase, logger: silentLogger }))
      .rejects.toThrow('Nursery entry not found: missing-id');
  });

  test('marks source_ref.reactivation + last_evaluated_at and rebuilds pathOutput from source_ref.brief', async () => {
    const entry = {
      id: 'id-1', name: 'Revived', description: 'desc', promoted_to_venture_id: null,
      source_ref: {
        park: { parked_reason: 'was not ready' },
        brief: { problem_statement: 'Prob', solution: 'Sol', target_market: 'Market' },
        synthesis_snapshot: { x: 1 },
      },
    };
    const { supabase, captured } = captureSb({ singleData: entry });
    const result = await reactivateVenture('id-1', { reason: 'Market shifted' }, { supabase, logger: silentLogger });

    const upd = captured.updates[0].payload;
    expect(upd.source_ref.reactivation.reason).toBe('Market shifted');
    expect(upd.source_ref.park).toEqual({ parked_reason: 'was not ready' }); // prior payload preserved
    expect(upd.last_evaluated_at).toBeTruthy();
    expect(upd).not.toHaveProperty('status');
    expect(upd).not.toHaveProperty('metadata');

    expect(result.pathOutput.suggested_name).toBe('Revived');
    expect(result.pathOutput.suggested_problem).toBe('Prob');
    expect(result.pathOutput.suggested_solution).toBe('Sol');
    expect(result.pathOutput.target_market).toBe('Market');
    expect(result.pathOutput.origin_type).toBe('nursery_reeval');
    expect(result.pathOutput.metadata.path).toBe('nursery_reeval');
    expect(result.pathOutput.metadata.reactivation_reason).toBe('Market shifted');
    expect(result.pathOutput.raw_material.previous_synthesis).toEqual({ x: 1 });
  });

  // QF-20260712-860: a row parked by the traversability gate (parkFailedCandidate) has no
  // source_ref.brief — its rich content lives under source_ref.candidate instead. Confirmed
  // on venture_nursery row ac45469b-c700-4033-87bd-95a3b6112d84 (Image Alt Text Generator).
  test('falls back to source_ref.candidate when source_ref.brief is absent (traversability-gate-parked row)', async () => {
    const entry = {
      id: 'id-2', name: 'Image Alt Text Generator', description: 'A problem', promoted_to_venture_id: null,
      source_ref: {
        sd: 'SD-LEO-INFRA-STAGE0-TRAVERSABILITY-GATE-001',
        gate: 'traversability',
        candidate: { problem_statement: 'Candidate problem', solution: 'Candidate solution', target_market: 'Candidate market', composite_score: 90 },
      },
    };
    const { supabase } = captureSb({ singleData: entry });
    const result = await reactivateVenture('id-2', { reason: 'Chairman venture-2 selection' }, { supabase, logger: silentLogger });

    expect(result.pathOutput.suggested_problem).toBe('Candidate problem');
    expect(result.pathOutput.suggested_solution).toBe('Candidate solution');
    expect(result.pathOutput.target_market).toBe('Candidate market');
    expect(result.pathOutput.raw_material.candidate).toEqual(entry.source_ref.candidate);
    expect(result.pathOutput.metadata.candidate).toEqual(entry.source_ref.candidate);
  });
});

describe('recordSynthesisFeedback (unchanged table — behavior preserved)', () => {
  test('throws on missing supabase', async () => {
    await expect(recordSynthesisFeedback({ ventureId: 'v1', outcome: 'approved' }, {}))
      .rejects.toThrow('supabase client is required');
  });

  test('throws on missing ventureId', async () => {
    const { supabase } = captureSb();
    await expect(recordSynthesisFeedback({ outcome: 'approved' }, { supabase, logger: silentLogger }))
      .rejects.toThrow('ventureId is required');
  });

  test('throws on invalid outcome', async () => {
    const { supabase } = captureSb();
    await expect(recordSynthesisFeedback({ ventureId: 'v1', outcome: 'invalid' }, { supabase, logger: silentLogger }))
      .rejects.toThrow('Invalid outcome: invalid');
  });

  test('inserts feedback record into venture_synthesis_feedback', async () => {
    const { supabase, captured } = captureSb({ insertResult: { id: 'fb-1', venture_id: 'v1', outcome: 'approved' } });
    const result = await recordSynthesisFeedback(
      { ventureId: 'v1', outcome: 'approved', lessons: ['lesson1'] },
      { supabase, logger: silentLogger }
    );
    expect(captured.inserts[0].table).toBe('venture_synthesis_feedback');
    expect(result).toBeDefined();
  });
});

describe('checkNurseryTriggers (FR-2: next_evaluation_at + promoted_to_venture_id IS NULL)', () => {
  test('throws on missing supabase', async () => {
    await expect(checkNurseryTriggers({})).rejects.toThrow('supabase client is required');
  });

  test('returns empty array when no parked items', async () => {
    const { supabase } = captureSb({ selectData: [] });
    expect(await checkNurseryTriggers({ supabase, logger: silentLogger })).toEqual([]);
  });

  test('returns items whose next_evaluation_at has passed; live columns only', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
    const { supabase, captured } = captureSb({ selectData: [
      { id: 'n1', name: 'Ready', next_evaluation_at: pastDate, trigger_conditions: ['market_shift'] },
      { id: 'n2', name: 'Not Ready', next_evaluation_at: futureDate, trigger_conditions: [] },
    ] });
    const result = await checkNurseryTriggers({ supabase, logger: silentLogger });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'n1', reason: 'scheduled_review', trigger_conditions: ['market_shift'] });
    const sel = captured.selects.find((s) => s.table === 'venture_nursery');
    expect(sel.cols).toContain('next_evaluation_at');
    expect(sel.cols).not.toContain('metadata');
    expect(sel.cols).not.toContain('status');
  });
});

describe('getNurseryHealth (FR-2: status derived, maturity_level read)', () => {
  test('throws on missing supabase', async () => {
    await expect(getNurseryHealth({})).rejects.toThrow('supabase client is required');
  });

  test('returns zero counts when no items', async () => {
    // fetch-all-paginated (FR-6) chains .select().order() and awaits .range().
    const supabase = { from: () => { const q = { select: () => q, order: () => q, range: () => Promise.resolve({ data: null, error: null }) }; return q; } };
    const result = await getNurseryHealth({ supabase });
    expect(result).toEqual({ total: 0, parked: 0, reactivated: 0, stale: 0, items: [] });
  });

  test('derives parked/reactivated/promoted from promoted_to_venture_id + source_ref.reactivation; stale by age', async () => {
    const now = new Date();
    const recent = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
    const old = new Date(now - 200 * 24 * 60 * 60 * 1000).toISOString();
    const rows = [
      { id: '1', name: 'A', maturity_level: 'seed', trigger_conditions: [], source_ref: {}, promoted_to_venture_id: null, created_at: recent },
      { id: '2', name: 'B', maturity_level: 'sprout', trigger_conditions: [], source_ref: { reactivation: {} }, promoted_to_venture_id: null, created_at: recent },
      { id: '3', name: 'C', maturity_level: 'seed', trigger_conditions: ['x'], source_ref: {}, promoted_to_venture_id: null, created_at: old },
      { id: '4', name: 'D', maturity_level: 'ready', trigger_conditions: [], source_ref: {}, promoted_to_venture_id: 'v-9', created_at: recent },
    ];
    const supabase = { from: () => { const q = { select: () => q, order: () => q, range: () => Promise.resolve({ data: rows, error: null }) }; return q; } };
    const result = await getNurseryHealth({ supabase });
    expect(result).toMatchObject({ total: 4, parked: 2, reactivated: 1, stale: 1 });
    expect(result.items.find((i) => i.id === '3')).toMatchObject({ status: 'parked', maturity: 'seed', has_triggers: true });
    expect(result.items.find((i) => i.id === '4').status).toBe('promoted');
  });
});

describe('source pins (FR-2: phantom columns gone from BOTH files)', () => {
  const nurserySrc = readFileSync(resolve(__dirname, '../../../../lib/eva/stage-zero/venture-nursery.js'), 'utf8');
  const discoverySrc = readFileSync(resolve(__dirname, '../../../../lib/eva/stage-zero/paths/discovery-mode.js'), 'utf8');

  it('venture-nursery.js carries no phantom-column DB references', () => {
    // parked_reason/raw_chairman_intent now live INSIDE source_ref (jsonb keys, fine);
    // the hazard is TOP-LEVEL column usage — pinned via the insert-payload key test above
    // plus these column-shaped patterns that existed pre-fix:
    expect(nurserySrc).not.toMatch(/status:\s*'parked'/);
    expect(nurserySrc).not.toMatch(/status:\s*'reactivated'/);
    expect(nurserySrc).not.toMatch(/\.eq\('status'/);
    expect(nurserySrc).not.toMatch(/select\([^)]*\bmetadata\b[^)]*\)/); // no metadata column reads
  });

  it("discovery-mode's nursery_reeval SELECT is live-schema and the KNOWN-BROKEN pragma is GONE", () => {
    const start = discoverySrc.indexOf('async function runNurseryReeval');
    const reevalBlock = discoverySrc.slice(start, start + 3500);
    expect(reevalBlock).toContain("is('promoted_to_venture_id', null)");
    expect(reevalBlock).toContain('source_ref');
    expect(reevalBlock).not.toContain('schema-lint-disable-line');
    expect(reevalBlock).not.toContain('original_score');
    expect(reevalBlock).not.toContain("eq('status'");
  });
});
