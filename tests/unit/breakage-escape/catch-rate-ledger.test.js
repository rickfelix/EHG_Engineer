import { describe, test, expect } from 'vitest';
import { classifyDefectRow, computeCatchRate } from '../../../lib/breakage-escape/catch-rate-ledger.mjs';

describe('classifyDefectRow', () => {
  test('sub_agent_execution_results: BLOCKED/CONDITIONAL_PASS classify caught', () => {
    expect(classifyDefectRow({ id: '1', verdict: 'BLOCKED', phase: 'LEAD', sub_agent_code: 'VALIDATION' }, 'sub_agent_execution_results'))
      .toEqual({ classification: 'caught_pre_ship', caught_stage_or_discovery: 'LEAD:VALIDATION', source_record_id: '1' });
    expect(classifyDefectRow({ id: '2', verdict: 'CONDITIONAL_PASS' }, 'sub_agent_execution_results').classification).toBe('caught_pre_ship');
  });

  test('sub_agent_execution_results: PASS classifies unclassified (not escaped -- a pass is not a defect)', () => {
    expect(classifyDefectRow({ id: '3', verdict: 'PASS' }, 'sub_agent_execution_results').classification).toBe('unclassified');
  });

  test('root_cause_reports: pre-ship trigger sources classify caught', () => {
    for (const ts of ['QUALITY_GATE', 'CI_PIPELINE', 'SUB_AGENT', 'TEST_FAILURE', 'HANDOFF_REJECTION']) {
      expect(classifyDefectRow({ id: 'x', trigger_source: ts }, 'root_cause_reports').classification).toBe('caught_pre_ship');
    }
  });

  test('root_cause_reports: RUNTIME/MANUAL classify escaped', () => {
    expect(classifyDefectRow({ id: 'y', trigger_source: 'RUNTIME' }, 'root_cause_reports').classification).toBe('escaped_post_ship');
    expect(classifyDefectRow({ id: 'z', trigger_source: 'MANUAL' }, 'root_cause_reports').classification).toBe('escaped_post_ship');
  });

  test('quick_fixes: uat/manual-testing/code-review classify caught', () => {
    for (const fd of ['uat', 'manual-testing', 'code-review']) {
      expect(classifyDefectRow({ id: 'q', found_during: fd }, 'quick_fixes').classification).toBe('caught_pre_ship');
    }
    expect(classifyDefectRow({ id: 'q2', found_during: null }, 'quick_fixes').classification).toBe('unclassified');
  });

  test('feedback: category=ci_failure classifies caught, other categories unclassified (never guessed)', () => {
    expect(classifyDefectRow({ id: 'f', category: 'ci_failure' }, 'feedback').classification).toBe('caught_pre_ship');
    expect(classifyDefectRow({ id: 'f2', category: 'ux_issue' }, 'feedback').classification).toBe('unclassified');
  });

  test('unknown sourceType classifies unclassified rather than throwing', () => {
    expect(classifyDefectRow({ id: 'u' }, 'unknown_table').classification).toBe('unclassified');
  });
});

describe('computeCatchRate', () => {
  test('names both extents and computes the correct rate from a mixed sample', () => {
    const classifiedRows = [
      { classification: 'caught_pre_ship' },
      { classification: 'caught_pre_ship' },
      { classification: 'caught_pre_ship' },
      { classification: 'escaped_post_ship' },
      { classification: 'unclassified' },
    ];
    const result = computeCatchRate({ classifiedRows, windowStart: '2026-01-01T00:00:00Z', windowEnd: '2026-01-31T00:00:00Z' });
    expect(result.caught).toBe(3);
    expect(result.escaped).toBe(1);
    expect(result.unclassified).toBe(1);
    expect(result.total).toBe(4);
    expect(result.catch_rate).toBe(75);
    expect(result.numerator_extent).toBeTruthy();
    expect(result.denominator_extent).toBeTruthy();
    expect(result.window).toEqual({ start: '2026-01-01T00:00:00Z', end: '2026-01-31T00:00:00Z' });
  });

  test('vacuity clause: zero classified (caught+escaped) rows throws rather than reporting a rate', () => {
    const classifiedRows = [{ classification: 'unclassified' }, { classification: 'unclassified' }];
    expect(() => computeCatchRate({ classifiedRows, windowStart: '2026-01-01T00:00:00Z', windowEnd: '2026-01-31T00:00:00Z' }))
      .toThrow(/VACUITY/);
  });

  test('vacuity clause: a fully empty input also throws (never a false 100%)', () => {
    expect(() => computeCatchRate({ classifiedRows: [], windowStart: '2026-01-01T00:00:00Z', windowEnd: '2026-01-31T00:00:00Z' }))
      .toThrow(/VACUITY/);
  });

  test('100% catch rate is reachable when escaped=0 and caught>0 (not blocked by the vacuity clause)', () => {
    const classifiedRows = [{ classification: 'caught_pre_ship' }, { classification: 'caught_pre_ship' }];
    const result = computeCatchRate({ classifiedRows, windowStart: '2026-01-01T00:00:00Z', windowEnd: '2026-01-31T00:00:00Z' });
    expect(result.catch_rate).toBe(100);
  });
});
