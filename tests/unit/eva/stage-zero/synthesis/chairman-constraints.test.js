/**
 * Unit Tests: Chairman Constraints Synthesis Component (Component 5)
 * SD-LEO-INFRA-SYNTHESIS-SCORING-HARDENING-001 (C5, Delta-ledger 41a2e6da)
 *
 * Test Coverage:
 * - Word-boundary automation match (no substring false-positives on "maintain"/"email")
 * - No unconditional 'pass' on niche_over_crowded / moat_first / values_alignment
 *   fallback / default case — all downgrade to an honest 'warning'
 */

import { describe, test, expect } from 'vitest';
import { applyChairmanConstraints, DEFAULT_CONSTRAINTS } from '../../../../../lib/eva/stage-zero/synthesis/chairman-constraints.js';

const silentLogger = { log: () => {}, warn: () => {} };

function pathOutputWith({ name = '', problem = '', solution = '', market = '' } = {}) {
  return {
    suggested_name: name,
    suggested_problem: problem,
    suggested_solution: solution,
    target_market: market,
  };
}

describe('applyChairmanConstraints — fully_automatable word-boundary match (C5)', () => {
  test('does NOT false-positive on "maintain" or "email" (bare substring "ai")', async () => {
    const pathOutput = pathOutputWith({
      problem: 'Teams struggle to maintain their email inbox',
      solution: 'A tool to organize and retail your domain contacts',
    });
    const result = await applyChairmanConstraints(pathOutput, { logger: silentLogger });
    const automation = result.evaluations.find(e => e.key === 'fully_automatable');
    expect(automation.status).toBe('warning');
    expect(automation.rationale).toBe('No clear automation signal');
  });

  test('genuinely matches whole-word "ai" or "automat*"', async () => {
    const withAi = pathOutputWith({ solution: 'Powered by ai models end to end' });
    const resultAi = await applyChairmanConstraints(withAi, { logger: silentLogger });
    expect(resultAi.evaluations.find(e => e.key === 'fully_automatable').status).toBe('pass');

    const withAutomation = pathOutputWith({ solution: 'Fully automated pipeline' });
    const resultAuto = await applyChairmanConstraints(withAutomation, { logger: silentLogger });
    expect(resultAuto.evaluations.find(e => e.key === 'fully_automatable').status).toBe('pass');
  });
});

describe('applyChairmanConstraints — no unconditional passes (C5)', () => {
  test('niche_over_crowded is an honest warning, never an unconditional pass', async () => {
    const result = await applyChairmanConstraints(pathOutputWith(), { logger: silentLogger });
    const niche = result.evaluations.find(e => e.key === 'niche_over_crowded');
    expect(niche.status).toBe('warning');
    expect(niche.rationale).toMatch(/unscored/i);
  });

  test('moat_first is an honest warning, never an unconditional pass', async () => {
    const result = await applyChairmanConstraints(pathOutputWith(), { logger: silentLogger });
    const moat = result.evaluations.find(e => e.key === 'moat_first');
    expect(moat.status).toBe('warning');
    expect(moat.rationale).toMatch(/unscored/i);
  });

  test('values_alignment warns (not passes) when no mission core values are loaded', async () => {
    const result = await applyChairmanConstraints(pathOutputWith(), { logger: silentLogger, strategicContext: null });
    const values = result.evaluations.find(e => e.key === 'values_alignment');
    expect(values.status).toBe('warning');
    expect(values.rationale).toMatch(/unscored/i);
  });

  test('an unrecognized constraint key warns (not passes) via the default branch', async () => {
    const result = await applyChairmanConstraints(pathOutputWith(), {
      logger: silentLogger,
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({
                data: [{ key: 'unknown_future_constraint', label: 'Unknown', weight: 5, is_active: true }],
                error: null,
              }),
            }),
          }),
        }),
      },
    });
    const unknown = result.evaluations.find(e => e.key === 'unknown_future_constraint');
    expect(unknown.status).toBe('warning');
    expect(unknown.rationale).toMatch(/unscored/i);
  });

  test('no evaluation ever unconditionally passes for an empty/blank venture', async () => {
    // A venture with zero signal anywhere should not "pass" any constraint by default —
    // every DEFAULT_CONSTRAINTS key must resolve to 'warning' (or a real 'fail'), never
    // a bare unconditional 'pass', for a venture that gives the heuristic nothing to go on.
    const result = await applyChairmanConstraints(pathOutputWith(), { logger: silentLogger });
    expect(result.evaluations).toHaveLength(DEFAULT_CONSTRAINTS.length);
    for (const evaluation of result.evaluations) {
      expect(evaluation.status).not.toBe('pass');
    }
  });
});
