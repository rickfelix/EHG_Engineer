/**
 * SD-LEO-INFRA-ENCODE-CHAIRMAN-VENTURE-001: evaluateConstraints() previously keyed its switch on
 * lowercase DEFAULT_CONSTRAINTS spellings only, so live chairman_constraints.constraint_key rows
 * (UPPER_SNAKE_CASE, confirmed via a live DB query) fell to the unscored default branch
 * regardless of their intended heuristic. filter_type was also never selected/read, so a
 * hard_reject constraint could never produce status='fail'. This suite proves both fixes, plus
 * coverage for the previously-uncovered existing keys and the 4 new chairman doctrine dimensions.
 */
import { describe, test, expect } from 'vitest';
import { applyChairmanConstraints } from '../../../../../lib/eva/stage-zero/synthesis/chairman-constraints.js';

const silentLogger = { log: () => {}, warn: () => {} };

function pathOutputWith({ name = '', problem = '', solution = '', market = '' } = {}) {
  return { suggested_name: name, suggested_problem: problem, suggested_solution: solution, target_market: market };
}

function sbWithRows(rows) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      }),
    }),
  };
}

describe('evaluateConstraints — FR-1: real UPPER_SNAKE_CASE DB keys reach their intended heuristic', () => {
  test('MUST_BE_AUTOMATABLE (live DB spelling) resolves the same as fully_automatable', async () => {
    const rows = [{ constraint_key: 'MUST_BE_AUTOMATABLE', name: 'Must be fully automatable', weight: 1, filter_type: 'hard_reject', is_active: true }];
    const withAi = pathOutputWith({ solution: 'Powered by ai models end to end' });
    const result = await applyChairmanConstraints(withAi, { logger: silentLogger, supabase: sbWithRows(rows) });
    const c = result.evaluations.find(e => e.key === 'MUST_BE_AUTOMATABLE');
    expect(c.status).toBe('pass');
  });

  test('all 10 real live constraint_key values reach a non-default case', async () => {
    const realKeys = [
      'MUST_BE_AUTOMATABLE', 'PROPRIETARY_DATA', 'NARROW_SPECIALIZATION', 'NICHE_OVER_CROWDED',
      'TWO_YEAR_POSITIONING', 'PORTFOLIO_INTEGRATION', 'DATA_FLYWHEEL', 'MOAT_FIRST',
      'VALUES_ALIGNMENT', 'VIRAL_POTENTIAL',
    ];
    const rows = realKeys.map((k, i) => ({ constraint_key: k, name: k, weight: 1, filter_type: 'advisory', is_active: true }));
    const result = await applyChairmanConstraints(pathOutputWith(), { logger: silentLogger, supabase: sbWithRows(rows) });
    for (const e of result.evaluations) {
      expect(e.rationale).not.toBe('Unscored - no heuristic defined for this constraint key');
    }
  });
});

describe('evaluateConstraints — FR-2: hard_reject can produce a real fail', () => {
  test('a hard_reject constraint with an unmet condition produces status=fail, not warning', async () => {
    const rows = [{ constraint_key: 'MUST_BE_AUTOMATABLE', name: 'Must be fully automatable', weight: 1, filter_type: 'hard_reject', is_active: true }];
    const noSignal = pathOutputWith({ problem: 'Teams struggle to maintain their email inbox' });
    const result = await applyChairmanConstraints(noSignal, { logger: silentLogger, supabase: sbWithRows(rows) });
    const c = result.evaluations.find(e => e.key === 'MUST_BE_AUTOMATABLE');
    expect(c.status).toBe('fail');
    expect(result.failed_count).toBe(1);
  });

  test('the same unmet condition on a score_modifier (not hard_reject) constraint stays warning, never fail', async () => {
    const rows = [{ constraint_key: 'PROPRIETARY_DATA', name: 'Proprietary data advantage', weight: 1, filter_type: 'score_modifier', is_active: true }];
    const noSignal = pathOutputWith();
    const result = await applyChairmanConstraints(noSignal, { logger: silentLogger, supabase: sbWithRows(rows) });
    const c = result.evaluations.find(e => e.key === 'PROPRIETARY_DATA');
    expect(c.status).toBe('warning');
  });
});

describe('evaluateConstraints — FR-3: previously-uncovered existing keys', () => {
  test('TWO_YEAR_POSITIONING stays advisory (never pass/fail)', async () => {
    const rows = [{ constraint_key: 'TWO_YEAR_POSITIONING', name: '2-year positioning', weight: 1, filter_type: 'advisory', is_active: true }];
    const result = await applyChairmanConstraints(pathOutputWith({ solution: 'A 2-year positioned platform' }), { logger: silentLogger, supabase: sbWithRows(rows) });
    expect(result.evaluations.find(e => e.key === 'TWO_YEAR_POSITIONING').status).toBe('warning');
  });

  test('DATA_FLYWHEEL passes when data-flywheel language is present', async () => {
    const rows = [{ constraint_key: 'DATA_FLYWHEEL', name: 'Data collection built-in', weight: 1, filter_type: 'hard_reject', is_active: true }];
    const withFlywheel = pathOutputWith({ solution: 'Builds a compounding data flywheel over time' });
    const result = await applyChairmanConstraints(withFlywheel, { logger: silentLogger, supabase: sbWithRows(rows) });
    expect(result.evaluations.find(e => e.key === 'DATA_FLYWHEEL').status).toBe('pass');
  });

  test('VIRAL_POTENTIAL passes when viral-growth language is present', async () => {
    const rows = [{ constraint_key: 'VIRAL_POTENTIAL', name: 'Viral potential', weight: 1, filter_type: 'score_bonus', is_active: true }];
    const withViral = pathOutputWith({ solution: 'Grows through referral and word-of-mouth' });
    const result = await applyChairmanConstraints(withViral, { logger: silentLogger, supabase: sbWithRows(rows) });
    expect(result.evaluations.find(e => e.key === 'VIRAL_POTENTIAL').status).toBe('pass');
  });
});

describe('evaluateConstraints — FR-4: new chairman doctrine dimensions', () => {
  const NEW_KEYS = ['AMBITION_AS_MOAT', 'JAGGED_SPACE_TARGETING', 'EDGE_OF_CAPABILITY_TIMING', 'TECHNOLOGY_CONVERGENCE'];

  test('all 4 new doctrine keys appear in the evaluations array with an explicit (non-default) rationale', async () => {
    const rows = NEW_KEYS.map(k => ({ constraint_key: k, name: k, weight: 1, filter_type: 'score_bonus', is_active: true }));
    const result = await applyChairmanConstraints(pathOutputWith(), { logger: silentLogger, supabase: sbWithRows(rows) });
    expect(result.evaluations).toHaveLength(4);
    for (const e of result.evaluations) {
      expect(NEW_KEYS).toContain(e.key);
      expect(e.rationale).not.toBe('Unscored - no heuristic defined for this constraint key');
    }
  });

  test('AMBITION_AS_MOAT passes on 5-10X/order-of-magnitude language', async () => {
    const rows = [{ constraint_key: 'AMBITION_AS_MOAT', name: 'Ambition as moat', weight: 1, filter_type: 'score_bonus', is_active: true }];
    const withAmbition = pathOutputWith({ solution: 'Delivers 10x the value of incumbent tools' });
    const result = await applyChairmanConstraints(withAmbition, { logger: silentLogger, supabase: sbWithRows(rows) });
    expect(result.evaluations.find(e => e.key === 'AMBITION_AS_MOAT').status).toBe('pass');
  });

  test('JAGGED_SPACE_TARGETING passes on capability-gap language', async () => {
    const rows = [{ constraint_key: 'JAGGED_SPACE_TARGETING', name: 'Jagged space targeting', weight: 1, filter_type: 'advisory', is_active: true }];
    const withJagged = pathOutputWith({ problem: 'Targets a jagged capability gap in current LLMs' });
    const result = await applyChairmanConstraints(withJagged, { logger: silentLogger, supabase: sbWithRows(rows) });
    expect(result.evaluations.find(e => e.key === 'JAGGED_SPACE_TARGETING').status).toBe('pass');
  });

  test('none of the 4 new rows can ever produce status=fail (score_bonus/score_modifier/advisory only, never hard_reject)', async () => {
    const rows = NEW_KEYS.map(k => ({ constraint_key: k, name: k, weight: 1, filter_type: 'score_bonus', is_active: true }));
    const result = await applyChairmanConstraints(pathOutputWith(), { logger: silentLogger, supabase: sbWithRows(rows) });
    expect(result.evaluations.every(e => e.status !== 'fail')).toBe(true);
  });
});
