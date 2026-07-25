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
  applyPendingNurseryPredicate,
  recordNurseryEvaluation,
  NURSERY_EVAL_TRIGGER_TYPES,
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
  const captured = { inserts: [], updates: [], selects: [], ors: [], orders: [], filters: [] };
  const supabase = { from: (table) => {
    const state = { table, filters: [] };
    const c = {
      insert: (payload) => { captured.inserts.push({ table, payload }); return c; },
      update: (payload) => { captured.updates.push({ table, payload, filters: state.filters }); return c; },
      select: (cols) => { captured.selects.push({ table, cols }); return c; },
      eq: (col, v) => { state.filters.push(['eq', col, v]); return c; },
      is: (col, v) => { state.filters.push(['is', col, v]); captured.filters.push(['is', col, v]); return c; },
      // SD-EHG-IDEATION-PIPELINE-SEAMS-001 FR-1: the eligibility filter moved from JS
      // into the QUERY, so the mock must record .or() or the predicate is untestable.
      or: (expr) => { captured.ors.push(expr); return c; },
      order: (col, opts) => { captured.orders.push([col, opts]); return c; },
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

  // SD-EHG-IDEATION-PIPELINE-SEAMS-001 FR-1. Eligibility filtering moved from JS into
  // the QUERY, so these assert the PREDICATE rather than post-fetch filtering. That is
  // deliberate and it is the honest unit-level claim: a mock cannot evaluate SQL, so a
  // test that fed it two rows and expected one back would only be re-testing the mock.
  // Whether the database actually returns the right rows is TS-1, an integration test.
  test('admits NULL next_evaluation_at — the "empty selection forever" regression guard', async () => {
    const { supabase, captured } = captureSb({ selectData: [] });
    await checkNurseryTriggers({ supabase, logger: silentLogger });
    const or = captured.ors.join(' ');
    // The old code filtered `nextReview && nextReview <= now` in JS. That `&&` excluded
    // NULL, and all 16 live rows are NULL, so it returned empty PERMANENTLY.
    expect(or).toContain('next_evaluation_at.is.null');
    expect(or).toContain('next_evaluation_at.lte.');
    expect(captured.filters).toContainEqual(['is', 'promoted_to_venture_id', null]);
  });

  test('orders score-first with a STABLE tiebreak — five live rows tie at 90', async () => {
    const { supabase, captured } = captureSb({ selectData: [] });
    await checkNurseryTriggers({ supabase, logger: silentLogger });
    const cols = captured.orders.map(([c]) => c);
    expect(cols[0]).toBe('current_score');
    expect(captured.orders[0][1]).toMatchObject({ ascending: false });
    // Score alone is non-deterministic across the five 90s; created_at then id fixes it.
    expect(cols).toEqual(['current_score', 'created_at', 'id']);
  });

  test('distinguishes never_scheduled from scheduled_review, and selects live columns only', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const { supabase, captured } = captureSb({ selectData: [
      { id: 'n1', name: 'Scheduled', next_evaluation_at: pastDate, current_score: 90, trigger_conditions: ['market_shift'] },
      { id: 'n2', name: 'Never scheduled', next_evaluation_at: null, current_score: 74, trigger_conditions: [] },
    ] });
    const result = await checkNurseryTriggers({ supabase, logger: silentLogger });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'n1', reason: 'scheduled_review', trigger_conditions: ['market_shift'] });
    // A NULL schedule is not a scheduled review — it was never scheduled at all, and
    // keeping the two causes separable is what made the original defect diagnosable.
    expect(result[1]).toMatchObject({ id: 'n2', reason: 'never_scheduled', next_review_date: null });
    const sel = captured.selects.find((s) => s.table === 'venture_nursery');
    expect(sel.cols).toContain('next_evaluation_at');
    expect(sel.cols).toContain('current_score');
    expect(sel.cols).not.toContain('metadata');
    expect(sel.cols).not.toContain('status');
  });

  test('the injected clock reaches the predicate, so eligibility is testable without waiting', async () => {
    const { supabase, captured } = captureSb({ selectData: [] });
    await checkNurseryTriggers({ supabase, logger: silentLogger, now: new Date('2030-01-01T00:00:00.000Z') });
    expect(captured.ors.join(' ')).toContain('next_evaluation_at.lte.2030-01-01T00:00:00.000Z');
  });
});

describe('recordNurseryEvaluation (FR-4: the witness writer that never existed)', () => {
  test('throws on missing supabase and on missing nurseryId', async () => {
    await expect(recordNurseryEvaluation({ nurseryId: 'n1', triggerType: 'manual' }, {}))
      .rejects.toThrow('supabase client is required');
    const { supabase } = captureSb();
    await expect(recordNurseryEvaluation({ triggerType: 'manual' }, { supabase, logger: silentLogger }))
      .rejects.toThrow('nurseryId is required');
  });

  test('REJECTS nursery_reeval — the value the strategy uses is NOT a legal trigger_type', async () => {
    const { supabase } = captureSb();
    // The queue strategy is called nursery_reeval, so reaching for it here is the natural
    // mistake; the CHECK constraint does not admit it. Failing in JS names the legal set
    // instead of surfacing an opaque constraint violation from the driver.
    await expect(recordNurseryEvaluation({ nurseryId: 'n1', triggerType: 'nursery_reeval' }, { supabase, logger: silentLogger }))
      .rejects.toThrow(/nursery_reeval is NOT a valid member/);
  });

  test.each(['capability_added', 'market_shift', 'portfolio_gap', 'related_outcome', 'periodic_review', 'manual'])(
    'accepts the live CHECK member %s',
    async (triggerType) => {
      const { supabase, captured } = captureSb();
      await recordNurseryEvaluation({ nurseryId: 'n1', triggerType }, { supabase, logger: silentLogger });
      expect(captured.inserts[0].payload.trigger_type).toBe(triggerType);
    }
  );

  test('the mirror list matches the live CHECK constraint exactly', () => {
    // A mirror, never a source of truth: adding a member here without the chairman-gated
    // DDL would produce inserts the database rejects.
    expect([...NURSERY_EVAL_TRIGGER_TYPES].sort()).toEqual(
      ['capability_added', 'manual', 'market_shift', 'periodic_review', 'portfolio_gap', 'related_outcome']
    );
    expect(NURSERY_EVAL_TRIGGER_TYPES).not.toContain('nursery_reeval');
  });

  test('trigger type is a PARAMETER — a manual demo is not labelled a periodic firing', async () => {
    const { supabase, captured } = captureSb();
    await recordNurseryEvaluation({ nurseryId: 'n1', triggerType: 'manual' }, { supabase, logger: silentLogger });
    await recordNurseryEvaluation({ nurseryId: 'n2', triggerType: 'periodic_review' }, { supabase, logger: silentLogger });
    expect(captured.inserts.map((i) => i.payload.trigger_type)).toEqual(['manual', 'periodic_review']);
  });

  test('writes only live columns, and leaves evaluated_by to the DEFAULT unless named', async () => {
    const LIVE_LOG_COLUMNS = new Set([
      'nursery_id', 'trigger_type', 'trigger_details', 'previous_score', 'new_score',
      'previous_maturity', 'new_maturity', 'evaluation_notes', 'evaluated_by',
    ]);
    const { supabase, captured } = captureSb();
    await recordNurseryEvaluation({ nurseryId: 'n1', triggerType: 'manual', previousScore: 90, newScore: 92, notes: 'n' }, { supabase, logger: silentLogger });
    const payload = captured.inserts[0].payload;
    for (const k of Object.keys(payload)) expect(LIVE_LOG_COLUMNS.has(k), `phantom column: ${k}`).toBe(true);
    expect(payload).not.toHaveProperty('evaluated_by'); // column DEFAULT stage0_engine
    expect(payload).toMatchObject({ nursery_id: 'n1', previous_score: 90, new_score: 92, evaluation_notes: 'n' });
  });

  test('records a named actor when one is supplied', async () => {
    const { supabase, captured } = captureSb();
    await recordNurseryEvaluation({ nurseryId: 'n1', triggerType: 'manual', evaluatedBy: 'alpha-2-demo' }, { supabase, logger: silentLogger });
    expect(captured.inserts[0].payload.evaluated_by).toBe('alpha-2-demo');
  });

  test('non-numeric scores become NULL rather than NaN', async () => {
    const { supabase, captured } = captureSb();
    await recordNurseryEvaluation({ nurseryId: 'n1', triggerType: 'manual', previousScore: undefined, newScore: 'x' }, { supabase, logger: silentLogger });
    expect(captured.inserts[0].payload.previous_score).toBeNull();
    expect(captured.inserts[0].payload.new_score).toBeNull();
  });
});

describe('applyPendingNurseryPredicate (FR-1: the single authoritative selector)', () => {
  function fakeQuery(sink) {
    const q = {
      is: (c, v) => { sink.filters.push(['is', c, v]); return q; },
      or: (e) => { sink.ors.push(e); return q; },
      order: (c, o) => { sink.orders.push([c, o]); return q; },
    };
    return q;
  }

  test('excludes promoted rows, admits NULL schedules, and orders deterministically', () => {
    const sink = { filters: [], ors: [], orders: [] };
    applyPendingNurseryPredicate(fakeQuery(sink), { now: new Date('2026-07-25T00:00:00.000Z') });
    expect(sink.filters).toContainEqual(['is', 'promoted_to_venture_id', null]);
    expect(sink.ors[0]).toBe('next_evaluation_at.is.null,next_evaluation_at.lte.2026-07-25T00:00:00.000Z');
    expect(sink.orders.map(([c]) => c)).toEqual(['current_score', 'created_at', 'id']);
    expect(sink.orders[0][1]).toEqual({ ascending: false, nullsFirst: false });
  });

  test('returns the query so it composes with .limit() and with fetchAllPaginated', () => {
    const sink = { filters: [], ors: [], orders: [] };
    const q = fakeQuery(sink);
    expect(applyPendingNurseryPredicate(q, {})).toBe(q);
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
    // SD-EHG-IDEATION-PIPELINE-SEAMS-001 FR-1: the promoted-row filter moved OUT of this
    // block and into applyPendingNurseryPredicate. Pinning the shared selector is a
    // STRONGER assertion than the old inline-literal pin — it fails if this reader ever
    // re-grows its own private predicate, which is the drift that caused the three
    // disagreeing selectors in the first place.
    expect(reevalBlock).toContain('applyPendingNurseryPredicate');
    expect(reevalBlock).toContain('NURSERY_PENDING_COLUMNS');
    expect(reevalBlock).not.toContain("is('promoted_to_venture_id', null)");
    expect(reevalBlock).not.toContain('schema-lint-disable-line');
    expect(reevalBlock).not.toContain('original_score');
    expect(reevalBlock).not.toContain("eq('status'");
  });

  it('the authoritative predicate lives in exactly ONE place', () => {
    // The whole point of FR-1. If a second module grows its own eligibility filter, the
    // "empty selection forever" class returns. NURSERY_PENDING_COLUMNS must carry
    // current_score, since score-first ordering is what surfaces the 90s.
    expect(nurserySrc).toContain('export function applyPendingNurseryPredicate');
    expect(nurserySrc).toMatch(/next_evaluation_at\.is\.null/);
    expect(nurserySrc).toContain('current_score');
    // The JS-side truthiness guard that excluded NULL must not come back. Comments are
    // stripped first: the header deliberately QUOTES the old broken expression to explain
    // the defect, and a naive source scan would flag that documentation as the bug itself.
    const codeOnly = nurserySrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/nextReview\s*&&/);
  });
});
