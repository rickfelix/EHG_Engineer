/**
 * Integration tests: PBN gate flow across chairman-review.js + venture-nursery.js.
 * SD-LEO-FEAT-PROVEN-BETTER-NEW-001. PRD test scenarios: TS-5, TS-6, TS-7.
 *
 * Uses a stateful in-memory mock of venture_nursery + nursery_evaluation_log (mirrors the
 * captureSb() pattern in tests/unit/eva/stage-zero/venture-nursery.test.js) so these tests
 * exercise the REAL wiring between persistVentureBrief -> parkVenture -> recordNurseryEvaluation,
 * not a single mocked call in isolation.
 */
import { describe, it, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));
vi.mock('../../../../lib/eva/stage-zero/interfaces.js', () => ({
  validateVentureBrief: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));
vi.mock('../../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn().mockResolvedValue({ id: 'decision-1' }),
}));
// Only the LLM-calling half is mocked — the point of this suite is exercising the REAL
// parkVenture/recordNurseryEvaluation wiring (venture-nursery.js is NOT mocked here) against
// a stateful in-memory DB, unlike chairman-review.test.js which mocks venture-nursery.js too.
vi.mock('../../../../lib/eva/stage-zero/pbn-integration.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, runPbnGate: vi.fn() };
});

import { persistVentureBrief } from '../../../../lib/eva/stage-zero/chairman-review.js';
import { runPbnGate } from '../../../../lib/eva/stage-zero/pbn-integration.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

const brief = {
  name: 'PBN Flow Test Venture',
  problem_statement: 'p',
  solution: 's',
  target_market: 'm',
  origin_type: 'discovery',
  raw_chairman_intent: 'p',
  maturity: 'ready', // would go straight to ready if PBN passed — these tests force REJECT
  metadata: {},
};

const rejectVerdict = (n) => ({
  proven: { mechanic: null, citations: [], coverage: false },
  better: { hypothesis: null, citations: [], coverage: false },
  new: { wedge: null, wedge_count: 0, coverage: false },
  verdict: 'REJECT',
  measured_at: `2026-08-1${n}T00:00:00.000Z`,
  rule_trace: [{ rule_id: 'EMPTY_PROVEN', fired: true, detail: `attempt ${n}` }],
});

/** Stateful mock: venture_nursery rows get sequential ids; nursery_evaluation_log is append-only. */
function makeStatefulNurseryDb() {
  const nurseryRows = [];
  const evalLog = [];
  let nextNurseryId = 1;

  const supabase = {
    from: (table) => {
      if (table === 'venture_nursery') {
        return {
          insert: (payload) => {
            const row = { id: `nursery-${nextNurseryId++}`, ...payload };
            nurseryRows.push(row);
            return {
              select: () => ({ single: async () => ({ data: row, error: null }) }),
            };
          },
          select: () => ({
            eq: () => ({
              single: async () => {
                const row = nurseryRows[nurseryRows.length - 1];
                return { data: row, error: row ? null : { message: 'not found' } };
              },
            }),
          }),
          update: (patch) => ({
            eq: (col, val) => ({
              select: () => ({
                single: async () => {
                  const row = nurseryRows.find((r) => r.id === val);
                  if (row) Object.assign(row, patch);
                  return { data: row, error: null };
                },
              }),
            }),
          }),
        };
      }
      if (table === 'nursery_evaluation_log') {
        return {
          insert: (payload) => ({
            select: () => ({
              single: async () => {
                const row = { id: `eval-${evalLog.length + 1}`, ...payload };
                evalLog.push(row);
                return { data: row, error: null };
              },
            }),
          }),
        };
      }
      if (table === 'ventures') {
        return {
          select: (cols, opts) => (opts?.head
            ? { in: () => ({ or: () => ({ then: (r) => Promise.resolve({ count: 0, error: null }).then(r) }) }) }
            : { eq: () => ({ in: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }),
          insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'v-new' }, error: null }) }) }),
        };
      }
      if (table === 'eva_config') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      if (table === 'companies') {
        return { select: () => ({ eq: () => ({ limit: () => ({ single: async () => ({ data: { id: 'co-1' }, error: null }) }) }) }) };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
  };
  return { supabase, nurseryRows, evalLog };
}

describe('PBN gate flow — TS-5/TS-6/TS-7', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TS-6: no new writer touches venture_demand_verdicts
  test('TS-6: the full flow never opens a venture_demand_verdicts table handle', async () => {
    runPbnGate.mockResolvedValueOnce(rejectVerdict(5));
    const { supabase } = makeStatefulNurseryDb();
    const fromSpy = vi.fn(supabase.from);
    const spiedSupabase = { from: fromSpy };

    await persistVentureBrief(
      { decision: 'ready', brief, validation: { valid: true, errors: [] } },
      { supabase: spiedSupabase, logger: silentLogger },
    );

    expect(fromSpy).not.toHaveBeenCalledWith('venture_demand_verdicts');
  });

  // TS-7 (real mechanics, per direct code trace): a REJECT verdict produces an
  // independently-queryable nursery_evaluation_log row. A later, separate scoring attempt
  // (simulating reactivation -> re-review) produces its OWN nursery row + its OWN log row —
  // the first evaluation's log entry is untouched by the second (append-only, nothing lost).
  it('TS-7: each scoring attempt is independently recorded in nursery_evaluation_log; earlier entries are never lost', async () => {
    const { supabase, nurseryRows, evalLog } = makeStatefulNurseryDb();

    runPbnGate.mockResolvedValueOnce(rejectVerdict(5));
    const first = await persistVentureBrief(
      { decision: 'ready', brief, validation: { valid: true, errors: [] } },
      { supabase, logger: silentLogger },
    );

    runPbnGate.mockResolvedValueOnce(rejectVerdict(6));
    const second = await persistVentureBrief(
      { decision: 'ready', brief: { ...brief, nursery_id: first.id }, validation: { valid: true, errors: [] } },
      { supabase, logger: silentLogger },
    );

    expect(nurseryRows).toHaveLength(2); // each REJECT park creates its own row (existing parkVenture semantics)
    expect(evalLog).toHaveLength(2);
    expect(evalLog[0].nursery_id).toBe(first.id);
    expect(evalLog[0].trigger_details.measured_at).toBe('2026-08-15T00:00:00.000Z');
    expect(evalLog[1].nursery_id).toBe(second.id);
    expect(evalLog[1].trigger_details.measured_at).toBe('2026-08-16T00:00:00.000Z');
    // the first row's OWN pbn_verdict column is unaffected by the second park (different row)
    expect(nurseryRows[0].pbn_verdict.measured_at).toBe('2026-08-15T00:00:00.000Z');
  });

  it('TS-7: nursery_evaluation_log write uses trigger_type=manual and evaluated_by=pbn_gate on every attempt', async () => {
    const { supabase, evalLog } = makeStatefulNurseryDb();
    runPbnGate.mockResolvedValueOnce(rejectVerdict(5));

    await persistVentureBrief(
      { decision: 'ready', brief, validation: { valid: true, errors: [] } },
      { supabase, logger: silentLogger },
    );

    expect(evalLog[0].trigger_type).toBe('manual');
    expect(evalLog[0].evaluated_by).toBe('pbn_gate');
  });

  it('a park-then-audit failure (log insert errors) does not fail the overall review — non-fatal per chairman-review.js', async () => {
    const { supabase } = makeStatefulNurseryDb();
    const failingSupabase = {
      from: (table) => (table === 'nursery_evaluation_log'
        ? { insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'log insert failed' } }) }) }) }
        : supabase.from(table)),
    };
    runPbnGate.mockResolvedValueOnce(rejectVerdict(5));

    const result = await persistVentureBrief(
      { decision: 'ready', brief, validation: { valid: true, errors: [] } },
      { supabase: failingSupabase, logger: silentLogger },
    );

    expect(result.id).toBe('nursery-1'); // park itself still succeeded
    expect(silentLogger.error).toHaveBeenCalledWith(expect.stringContaining('log insert failed'));
  });
});
