import { describe, it, expect } from 'vitest';
import { evaluate, PREDICATE_TYPE } from '../../../lib/governance/release-condition-predicate.js';

describe('evaluate (release_condition predicate)', () => {
  it('test_green: true when the named suite is green in state', () => {
    const predicate = { type: PREDICATE_TYPE.TEST_GREEN, params: { suite: 'switch-on-precheck' } };
    expect(evaluate(predicate, { testResults: { 'switch-on-precheck': true } })).toBe(true);
    expect(evaluate(predicate, { testResults: { 'switch-on-precheck': false } })).toBe(false);
    expect(evaluate(predicate, { testResults: {} })).toBe(false);
  });

  it('manual_flag: true when the named flag is true in state', () => {
    const predicate = { type: PREDICATE_TYPE.MANUAL_FLAG, params: { flag: 'chairman-cleared' } };
    expect(evaluate(predicate, { flags: { 'chairman-cleared': true } })).toBe(true);
    expect(evaluate(predicate, { flags: { 'chairman-cleared': false } })).toBe(false);
  });

  it('db_row_exists: true when the row count for the key is > 0', () => {
    const predicate = { type: PREDICATE_TYPE.DB_ROW_EXISTS, params: { key: 'revert-rehearsal-log' } };
    expect(evaluate(predicate, { rowCounts: { 'revert-rehearsal-log': 3 } })).toBe(true);
    expect(evaluate(predicate, { rowCounts: { 'revert-rehearsal-log': 0 } })).toBe(false);
    expect(evaluate(predicate, {})).toBe(false);
  });

  it('fails closed on unrecognized predicate type', () => {
    expect(evaluate({ type: 'unknown_type', params: {} }, { testResults: {} })).toBe(false);
  });

  it('fails closed on malformed/missing predicate', () => {
    expect(evaluate(null, {})).toBe(false);
    expect(evaluate(undefined, {})).toBe(false);
    expect(evaluate('not-an-object', {})).toBe(false);
    expect(evaluate({}, {})).toBe(false);
  });

  it('fails closed when required state is missing entirely', () => {
    const predicate = { type: PREDICATE_TYPE.TEST_GREEN, params: { suite: 'x' } };
    expect(evaluate(predicate, {})).toBe(false);
    expect(evaluate(predicate)).toBe(false);
  });

  it('never reads live state -- pure function of its two arguments', () => {
    const predicate = { type: PREDICATE_TYPE.MANUAL_FLAG, params: { flag: 'f' } };
    const stateA = { flags: { f: true } };
    const stateB = { flags: { f: false } };
    expect(evaluate(predicate, stateA)).toBe(true);
    expect(evaluate(predicate, stateB)).toBe(false);
    // Same predicate object, different injected state -> different result; no hidden I/O.
  });
});
