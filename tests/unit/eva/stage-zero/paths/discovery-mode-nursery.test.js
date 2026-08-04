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
