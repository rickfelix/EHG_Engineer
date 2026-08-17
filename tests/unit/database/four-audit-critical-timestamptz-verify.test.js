/**
 * SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001 FR-2 — unit tests for the pure functions in
 * database/chairman-gated/20260817_four_audit_critical_timestamptz_verify.mjs
 * (readColumnTypes, evaluateSnapshot). Zero live DB dependency -- fixture-driven.
 */
import { describe, it, expect } from 'vitest';
import {
  readColumnTypes,
  evaluateSnapshot,
} from '../../../database/chairman-gated/20260817_four_audit_critical_timestamptz_verify.mjs';

const TARGET_PAIRS = [
  ['quick_fixes', 'completed_at'],
  ['quick_fixes', 'created_at'],
  ['quick_fixes', 'started_at'],
  ['sd_phase_handoffs', 'accepted_at'],
  ['sd_phase_handoffs', 'created_at'],
  ['sd_phase_handoffs', 'rejected_at'],
  ['strategic_directives_v2', 'approval_date'],
  ['strategic_directives_v2', 'archived_at'],
  ['strategic_directives_v2', 'created_at'],
  ['strategic_directives_v2', 'effective_date'],
  ['strategic_directives_v2', 'expiry_date'],
  ['strategic_directives_v2', 'updated_at'],
  ['user_stories', 'completed_at'],
  ['user_stories', 'created_at'],
  ['user_stories', 'updated_at'],
];

const SIBLING_PAIRS = [
  ['sd_phase_handoffs', 'resolved_at'],
  ['strategic_directives_v2', 'completion_date'],
  ['strategic_directives_v2', 'embedding_generated_at'],
  ['strategic_directives_v2', 'quality_checked_at'],
  ['quick_fixes', 'not_before'],
  ['user_stories', 'e2e_test_last_run'],
];

function fixtureClient(rows) {
  return { query: async () => ({ rows }) };
}

function allNaiveRows() {
  return TARGET_PAIRS.map(([table_name, column_name]) => ({ table_name, column_name, data_type: 'timestamp without time zone' }))
    .concat(SIBLING_PAIRS.map(([table_name, column_name]) => ({ table_name, column_name, data_type: 'timestamp with time zone' })));
}

describe('readColumnTypes (pure, fixture client)', () => {
  it('returns exactly the requested pairs, keyed table.column, in the order requested', async () => {
    const client = fixtureClient(allNaiveRows());
    const result = await readColumnTypes(client, TARGET_PAIRS);
    expect(Object.keys(result)).toHaveLength(15);
    expect(result['quick_fixes.completed_at']).toBe('timestamp without time zone');
    expect(result['strategic_directives_v2.updated_at']).toBe('timestamp without time zone');
  });

  it('returns null for a column absent from the live catalog rows (does not throw)', async () => {
    const client = fixtureClient([]); // simulates a missing/renamed column
    const result = await readColumnTypes(client, [['quick_fixes', 'completed_at']]);
    expect(result['quick_fixes.completed_at']).toBeNull();
  });
});

describe('evaluateSnapshot (pure)', () => {
  it('PASS: pre-apply expectation (15 naive, 6 aware) matches the live baseline shape', () => {
    const snapshot = {
      target: Object.fromEntries(TARGET_PAIRS.map(([t, c]) => [`${t}.${c}`, 'timestamp without time zone'])),
      sibling: Object.fromEntries(SIBLING_PAIRS.map(([t, c]) => [`${t}.${c}`, 'timestamp with time zone'])),
    };
    const verdict = evaluateSnapshot(snapshot, { targetExpected: 'timestamp without time zone', siblingExpected: 'timestamp with time zone' });
    expect(verdict.pass).toBe(true);
    expect(verdict.issues).toEqual([]);
  });

  it('PASS: post-apply expectation (all 15 flipped to aware) matches a fully-migrated snapshot', () => {
    const snapshot = {
      target: Object.fromEntries(TARGET_PAIRS.map(([t, c]) => [`${t}.${c}`, 'timestamp with time zone'])),
      sibling: Object.fromEntries(SIBLING_PAIRS.map(([t, c]) => [`${t}.${c}`, 'timestamp with time zone'])),
    };
    const verdict = evaluateSnapshot(snapshot, { targetExpected: 'timestamp with time zone', siblingExpected: 'timestamp with time zone' });
    expect(verdict.pass).toBe(true);
  });

  it('FAIL: a single unmigrated target column is caught (not a vacuously-green gate)', () => {
    const snapshot = {
      target: Object.fromEntries(TARGET_PAIRS.map(([t, c]) => [`${t}.${c}`, 'timestamp with time zone'])),
      sibling: Object.fromEntries(SIBLING_PAIRS.map(([t, c]) => [`${t}.${c}`, 'timestamp with time zone'])),
    };
    snapshot.target['user_stories.updated_at'] = 'timestamp without time zone'; // mutation: one column missed
    const verdict = evaluateSnapshot(snapshot, { targetExpected: 'timestamp with time zone', siblingExpected: 'timestamp with time zone' });
    expect(verdict.pass).toBe(false);
    expect(verdict.issues).toEqual(expect.arrayContaining([expect.stringContaining('user_stories.updated_at')]));
  });

  it('FAIL: a sibling (negative control) column changing type is flagged as scope creep', () => {
    const snapshot = {
      target: Object.fromEntries(TARGET_PAIRS.map(([t, c]) => [`${t}.${c}`, 'timestamp with time zone'])),
      sibling: Object.fromEntries(SIBLING_PAIRS.map(([t, c]) => [`${t}.${c}`, 'timestamp with time zone'])),
    };
    snapshot.sibling['quick_fixes.not_before'] = 'timestamp without time zone'; // should never happen
    const verdict = evaluateSnapshot(snapshot, { targetExpected: 'timestamp with time zone', siblingExpected: 'timestamp with time zone' });
    expect(verdict.pass).toBe(false);
    expect(verdict.issues).toEqual(expect.arrayContaining([expect.stringContaining('SIBLING quick_fixes.not_before')]));
  });
});
