/**
 * Unit test for FR-7 conservative nursery gate (TS-11, US-009 boundary case).
 * Confirms 0-input → graceful empty output (NOT undercount error).
 *
 * Part of SD-LEO-ENH-TREND-SCANNER-SCORING-001 Checkpoint 3.
 */

import { describe, test, expect, vi } from 'vitest';

vi.mock('../../../../../lib/llm/client-factory.js', () => ({
  getValidationClient: vi.fn(() => ({ complete: vi.fn() })),
}));

vi.mock('../../../../../lib/capabilities/scanner-context.js', () => ({
  getCapabilityContextBlock: vi.fn().mockResolvedValue(''),
}));

import {
  executeDiscoveryMode,
  runNurseryReeval,
  LLMUndercountError,
} from '../../../../../lib/eva/stage-zero/paths/discovery-mode.js';
import { NURSERY_PENDING_COLUMNS } from '../../../../../lib/eva/stage-zero/venture-nursery.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

function nurserySupabase(items) {
  // discovery_strategies.single() needs to return the strategy config; venture_nursery query uses
  // .from('venture_nursery').select(...).eq('status','parked').order(...).limit(...)
  const calls = [];
  return {
    from: vi.fn((table) => {
      calls.push(table);
      if (table === 'discovery_strategies') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { strategy_key: 'nursery_reeval', name: 'Nursery Re-eval', description: 'reeval', is_active: true },
            error: null,
          }),
        };
      }
      // venture_nursery — SD-LEO-INFRA-STAGE0-NURSERY-PARK-PATH-001: the live-schema
      // SELECT filters promoted_to_venture_id via .is(), replacing the phantom .eq('status').
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        // SD-EHG-IDEATION-PIPELINE-SEAMS-001 FR-1: the reader now routes through the
        // shared applyPendingNurseryPredicate, which adds .or() for the
        // "NULL means never scheduled, so eligible now" branch.
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: items, error: null }),
      };
    }),
  };
}

describe('runNurseryReeval — conservative gate (TS-11)', () => {
  test('0 nursery items → returns null (graceful empty), no LLMUndercountError', async () => {
    const result = await executeDiscoveryMode(
      { strategy: 'nursery_reeval', candidateCount: 5 },
      { supabase: nurserySupabase([]), logger: silentLogger, llmClient: { complete: vi.fn() } }
    );
    // executeDiscoveryMode returns null when no candidates returned from runner
    // (existing behavior preserved for the 0-input boundary case).
    expect(result).toBeNull();
  });

  // SD-EHG-IDEATION-PIPELINE-SEAMS-001 FR-4 / TS-16a — THE WIRING, ASSERTED AT THE CALLER.
  //
  // recordNurseryEvaluation was correct, well tested, and had ZERO PRODUCTION CALLERS: this
  // function was the only wired reader of the nursery and never invoked it, so
  // nursery_evaluation_log held 0 rows while the machinery to fill it sat finished. Its own unit
  // tests — including the TWO-RUN GUARD — all passed the whole time, because they exercised the
  // helper directly. A green suite over a path nothing walks is not coverage.
  //
  // So this test does NOT re-test the writer. It asserts the TRAVERSAL REACHES IT, which is the
  // only thing those existing tests could never say. Deleting the call in discovery-mode.js
  // leaves every venture-nursery.test.js assertion green and fails exactly here.
  test('TS-16a: the traversal REACHES recordNurseryEvaluation — a witness row per evaluated item', async () => {
    const items = [
      { id: 'n-90', name: 'Headline Transformer', current_score: 90, source_ref: { brief: {} }, next_evaluation_at: null },
      { id: 'n-65', name: 'Rejected Idea', current_score: 65, source_ref: { brief: {} }, next_evaluation_at: null },
    ];
    // The LLM revives only ONE of the two. Both were EVALUATED, so both must be witnessed —
    // recording only revivals would leave a considered-and-rejected idea indistinguishable from
    // one never looked at, which is the ambiguity that made this seam undiagnosable for 15 days.
    const llmClient = {
      complete: vi.fn().mockResolvedValue(JSON.stringify([
        { nursery_id: 'n-90', name: 'Headline Transformer', new_score: 92, revival_reason: 'costs fell' },
      ])),
    };

    const logInserts = [];
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'discovery_strategies') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { strategy_key: 'nursery_reeval', name: 'Nursery Re-eval', description: 'reeval', is_active: true },
              error: null,
            }),
          };
        }
        if (table === 'selection_postures') {
          // executeDiscoveryMode resolves an active posture before running a strategy and fails
          // CLOSED without one (spec R2). Served here so this test fails on the WIRING it is about,
          // not on unrelated preconditions — a red for the wrong reason proves nothing.
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [{
                id: 'posture-1', phase_key: 'test', version: 1, display_name: 'Test Posture',
                criteria: { weights: { market: 1 } }, status: 'active',
                ratified_by: 'test', ratified_at: '2026-01-01T00:00:00Z', expiry_condition: null,
              }],
              error: null,
            }),
          };
        }
        if (table === 'nursery_evaluation_log') {
          return {
            insert: vi.fn((row) => {
              logInserts.push(row);
              return { select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'log-1', ...row }, error: null }) })) };
            }),
          };
        }
        // venture_nursery: the pending-predicate read, plus the schedule-advance UPDATE that
        // recordNurseryEvaluation performs by construction.
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
          is: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          // Chainable no-ops for the incidental reads executeDiscoveryMode performs around the
          // strategy run. They resolve to empty rather than throwing so this test fails on its
          // own subject and not on a missing stub.
          in: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: items, error: null }),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        };
      }),
    };

    await runNurseryReeval(
      { constraints: {}, candidateCount: 5 },
      { supabase, logger: silentLogger, llmClient }
    );

    // A witness per EVALUATED item — two, not one.
    expect(logInserts).toHaveLength(2);
    const byNursery = Object.fromEntries(logInserts.map((r) => [r.nursery_id, r]));
    expect(Object.keys(byNursery).sort()).toEqual(['n-65', 'n-90']);
    expect(byNursery['n-90'].trigger_type).toBe('periodic_review');
    // The revived one carries its new score; the rejected one is still witnessed as evaluated.
    expect(byNursery['n-90'].new_score).toBe(92);
    expect(byNursery['n-65'].nursery_id).toBe('n-65');
  });

  test('LLMUndercountError class instantiation surface (constructor contract)', () => {
    // Defends against accidental constructor signature drift; the queue processor
    // catch block reads err.errorType + err.expected + err.actual.
    const e = new LLMUndercountError({
      strategyName: 'nursery_reeval',
      promptVersion: null,
      expected: 3,
      actual: 0,
    });
    expect(e.errorType).toBe('undercount');
    expect(e.expected).toBe(3);
    expect(e.actual).toBe(0);
    expect(e.strategyName).toBe('nursery_reeval');
  });
});

// ════════════════════════════════════════════════════════════════════════
// SD-LEO-FIX-FINGERPRINT-STOP-CHAIRMAN-001 — nursery_id threading + scoped
// selection. AC-1 was UNPROVABLE AS SPECIFIED: an authorised run for one
// venture could re-select and promote a different, score-tied one, because
// nursery_id was discarded before it ever reached runNurseryReeval.
// ════════════════════════════════════════════════════════════════════════

describe('nursery_id scoped selection (SD-LEO-FIX-FINGERPRINT-STOP-CHAIRMAN-001)', () => {
  // Same heavy mock shape as TS-16a above (discovery_strategies + selection_postures +
  // nursery_evaluation_log + the venture_nursery pending-predicate read), extended to
  // record every .eq(col, val) issued against the PENDING-POOL select specifically —
  // NOT venture_nursery's other traffic. recordNurseryEvaluation's witness loop calls
  // advanceNurserySchedule for EVERY returned item regardless of scoping, which also
  // reads/writes venture_nursery via .eq('id', ...); conflating that with the selection
  // query's own .eq('id', ...) would make this test pass or fail for the wrong reason.
  // v_unified_capabilities is served too — loadCapabilityEnvelope fails closed (spec R6)
  // without it, which would abort the run before selection is ever exercised.
  function scopedSupabase(items, eqCalls) {
    return {
      from: vi.fn((table) => {
        if (table === 'discovery_strategies') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { strategy_key: 'nursery_reeval', name: 'Nursery Re-eval', description: 'reeval', is_active: true },
              error: null,
            }),
          };
        }
        if (table === 'selection_postures') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [{
                id: 'posture-1', phase_key: 'test', version: 1, display_name: 'Test Posture',
                criteria: { weights: { market: 1 } }, status: 'active',
                ratified_by: 'test', ratified_at: '2026-01-01T00:00:00Z', expiry_condition: null,
              }],
              error: null,
            }),
          };
        }
        if (table === 'nursery_evaluation_log') {
          return {
            insert: vi.fn((row) => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'log-1', ...row }, error: null }) })) })),
          };
        }
        if (table === 'v_unified_capabilities') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        // venture_nursery. Track which select() this eq() belongs to so the pending-pool
        // query (NURSERY_PENDING_COLUMNS) is distinguishable from advanceNurserySchedule's
        // unrelated per-item schedule read/write.
        let lastSelectCols = null;
        const b = {
          select: vi.fn((cols) => { lastSelectCols = cols; return b; }),
          eq: vi.fn((col, val) => {
            if (lastSelectCols === NURSERY_PENDING_COLUMNS) eqCalls.push([col, val]);
            return b;
          }),
          is: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          single: vi.fn().mockResolvedValue({ data: { evaluation_interval_days: 30 }, error: null }),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: items, error: null }),
          update: vi.fn().mockReturnThis(),
        };
        return b;
      }),
    };
  }

  const tiedSiblings = [
    { id: 'n-authorized', name: 'Authorized Venture', current_score: 90, source_ref: { brief: {} }, next_evaluation_at: null },
    { id: 'n-sibling', name: 'Tied Sibling', current_score: 90, source_ref: { brief: {} }, next_evaluation_at: null },
  ];

  // POSITIVE CONTROL — enters at executeDiscoveryMode (the boundary mapRequestToParams
  // hands off to), not runNurseryReeval directly, so it fails if ANY of the three
  // downstream hops (executeDiscoveryMode's destructure, the runner dispatch, or
  // runNurseryReeval's own query) silently drops nursery_id again.
  test('AC-1: a request naming nursery_id pins the query to that row, not the whole tied pool', async () => {
    const eqCalls = [];
    const llmClient = {
      complete: vi.fn().mockResolvedValue(JSON.stringify([
        { nursery_id: 'n-authorized', name: 'Authorized Venture', new_score: 91, revival_reason: 'still the target' },
      ])),
    };

    await executeDiscoveryMode(
      { strategy: 'nursery_reeval', candidateCount: 1, nursery_id: 'n-authorized' },
      { supabase: scopedSupabase(tiedSiblings, eqCalls), logger: silentLogger, llmClient }
    );

    expect(eqCalls).toContainEqual(['id', 'n-authorized']);
  });

  // NEGATIVE / REGRESSION CONTROL — this is the exact pre-fix RED case: with no
  // nursery_id (every other discovery strategy, and pre-fix nursery_reeval requests),
  // selection must still scan the unscoped pending pool. Proves the fix is additive,
  // not a behavior change for the unscoped path.
  test('no nursery_id → selection stays unscoped (pre-fix / non-nursery_reeval behavior preserved)', async () => {
    const eqCalls = [];
    const llmClient = { complete: vi.fn().mockResolvedValue('[]') };

    await executeDiscoveryMode(
      { strategy: 'nursery_reeval', candidateCount: 5 },
      { supabase: scopedSupabase(tiedSiblings, eqCalls), logger: silentLogger, llmClient }
    );

    expect(eqCalls.find(([col]) => col === 'id')).toBeUndefined();
  });

  // SECURITY sub-agent finding (EXEC-TO-PLAN review): the query-level pin bounds WHICH
  // ROWS the LLM sees, but nothing bounded which nursery_id it hands back in its own JSON
  // response — a hallucinated or prompt-influenced id could still reach promotion
  // untouched. Drives runNurseryReeval directly (candidateCount/constraints only, no
  // executeDiscoveryMode scaffolding needed) since the defect is entirely inside this
  // function's own response handling.
  test('drops an LLM-returned candidate whose nursery_id was not in the queried pool', async () => {
    const items = [
      { id: 'n-real', name: 'Real Venture', current_score: 90, source_ref: { brief: {} }, next_evaluation_at: null },
    ];
    const llmClient = {
      complete: vi.fn().mockResolvedValue(JSON.stringify([
        { nursery_id: 'n-real', name: 'Real Venture', new_score: 91, revival_reason: 'still valid' },
        { nursery_id: 'n-hallucinated', name: 'Never Queried', new_score: 99, revival_reason: 'model invented this' },
      ])),
    };
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'nursery_evaluation_log') {
          return { insert: vi.fn((row) => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'log-1', ...row }, error: null }) })) })) };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
          is: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: items, error: null }),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        };
      }),
    };

    const result = await runNurseryReeval({ constraints: {}, candidateCount: 5 }, { supabase, logger: silentLogger, llmClient });

    expect(result).toHaveLength(1);
    expect(result[0].nursery_id).toBe('n-real');
    expect(result.find(c => c.nursery_id === 'n-hallucinated')).toBeUndefined();
  });

  // SECURITY sub-agent finding, second pass: the byId-validation filter above is only
  // viable in production if the LLM was actually TOLD each item's real id — the prompt
  // previously omitted item.id entirely while still asking the model to echo back "the
  // original ID", which a model with no way to know it can only invent, so the filter
  // would silently reject every candidate on every real run. Assert on the PROMPT itself
  // (what the mock captures as its call argument), not on a mocked response — a mock can
  // always fake a correct response even when the code that produces the real prompt is
  // broken.
  test('the prompt discloses every queried item\'s real id (so the byId filter is satisfiable)', async () => {
    const items = [
      { id: 'n-alpha', name: 'Alpha Venture', current_score: 90, source_ref: { brief: {} }, next_evaluation_at: null },
      { id: 'n-beta', name: 'Beta Venture', current_score: 90, source_ref: { brief: {} }, next_evaluation_at: null },
    ];
    const llmClient = { complete: vi.fn().mockResolvedValue('[]') };
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
        is: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: items, error: null }),
      })),
    };

    await runNurseryReeval({ constraints: {}, candidateCount: 5 }, { supabase, logger: silentLogger, llmClient });

    const [, sentPrompt] = llmClient.complete.mock.calls[0];
    expect(sentPrompt).toContain('n-alpha');
    expect(sentPrompt).toContain('n-beta');
  });
});
