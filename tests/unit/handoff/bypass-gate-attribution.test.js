/**
 * Unit tests for SD-LEO-INFRA-GATE-FALSE-POSITIVE-001.
 *
 * extractBypassedGate(): derive the NAMED semantic gate a --bypass-validation targeted
 * from its free-text reason (regex UPPERCASE_SNAKE ∩ known-gate set, + explicit override,
 * graceful null). tallyBypassedGates(): pure aggregation behind the 30-day named-gate
 * false-positive leaderboard in gate-health-check.js.
 *
 * Maps to PRD test scenarios TS-1..TS-5.
 */

import { describe, it, expect } from 'vitest';
import {
  extractBypassedGate,
  tallyBypassedGates,
  KNOWN_NAMED_GATES,
} from '../../../scripts/modules/handoff/bypass-rubric.js';

describe('extractBypassedGate (SD-LEO-INFRA-GATE-FALSE-POSITIVE-001)', () => {
  it('TS-1: extracts a known named gate from the reason', () => {
    expect(
      extractBypassedGate('TOOLING_BUG: CROSS_REPO_STAGE_CONFIG_DRIFT false-positive on an audit-only migration, ticket SD-X')
    ).toBe('CROSS_REPO_STAGE_CONFIG_DRIFT');
  });

  it('TS-2: returns null when no known gate is named (no throw)', () => {
    expect(extractBypassedGate('test environment is down and unreachable for the e2e suite')).toBeNull();
  });

  it('TS-3: explicit [gate:NAME] override takes precedence over a regex token', () => {
    // reason contains GATE4_WORKFLOW_ROI as a token but overrides to a different gate
    expect(
      extractBypassedGate('GATE4_WORKFLOW_ROI scored low but [gate:WIRE_CHECK_GATE] is the real false positive')
    ).toBe('WIRE_CHECK_GATE');
  });

  it('TS-3b: explicit override trusts an operator-named gate even if not in the known set', () => {
    expect(extractBypassedGate('the [gate:SOME_FUTURE_GATE] tooling regressed')).toBe('SOME_FUTURE_GATE');
  });

  it('TS-4: uppercase non-gate tokens not in the known set are NOT matched', () => {
    // TODO has no underscore; FALSE_POSITIVE has an underscore but is not a known gate
    expect(extractBypassedGate('TODO: bypassing because of a FALSE_POSITIVE somewhere')).toBeNull();
  });

  it('prefers the longest known-gate match when several appear', () => {
    // both SCOPE_AUDIT and GATE_SD_METRICS_SUFFICIENCY are known; longest wins
    const r = extractBypassedGate('SCOPE_AUDIT and GATE_SD_METRICS_SUFFICIENCY both flagged; tooling false-positive');
    expect(r).toBe('GATE_SD_METRICS_SUFFICIENCY');
  });

  it('handles empty/invalid input gracefully', () => {
    expect(extractBypassedGate('')).toBeNull();
    expect(extractBypassedGate(null)).toBeNull();
    expect(extractBypassedGate(undefined)).toBeNull();
    expect(extractBypassedGate(42)).toBeNull();
  });

  it('recognizes extra gate names passed by the caller', () => {
    expect(extractBypassedGate('NEW_DYNAMIC_GATE regressed', ['NEW_DYNAMIC_GATE'])).toBe('NEW_DYNAMIC_GATE');
  });

  it('KNOWN_NAMED_GATES excludes numeric gates (those are handled by GATE_TO_CATEGORY)', () => {
    expect(KNOWN_NAMED_GATES).not.toContain('0');
    expect(KNOWN_NAMED_GATES).not.toContain('2A');
    expect(KNOWN_NAMED_GATES.length).toBeGreaterThan(0);
  });
});

describe('tallyBypassedGates (SD-LEO-INFRA-GATE-FALSE-POSITIVE-001)', () => {
  it('TS-5: ranks named gates by descending bypass count; excludes nulls from ranking', () => {
    const rows = [
      { metadata: { bypassed_gate: 'CROSS_REPO_STAGE_CONFIG_DRIFT' } },
      { metadata: { bypassed_gate: 'CROSS_REPO_STAGE_CONFIG_DRIFT' } },
      { metadata: { bypassed_gate: 'GATE4_WORKFLOW_ROI' } },
      { metadata: { bypassed_gate: null } },
      { metadata: {} },
      { metadata: { bypassed_gate: 'CROSS_REPO_STAGE_CONFIG_DRIFT' } },
    ];
    const lb = tallyBypassedGates(rows);
    expect(lb.total).toBe(6);
    expect(lb.unattributed).toBe(2);
    expect(lb.ranked[0]).toEqual({ gate: 'CROSS_REPO_STAGE_CONFIG_DRIFT', count: 3 });
    expect(lb.ranked[1]).toEqual({ gate: 'GATE4_WORKFLOW_ROI', count: 1 });
  });

  it('returns an empty leaderboard for no rows', () => {
    expect(tallyBypassedGates([])).toEqual({ ranked: [], unattributed: 0, total: 0 });
    expect(tallyBypassedGates(null)).toEqual({ ranked: [], unattributed: 0, total: 0 });
  });

  it('counts all-unattributed rows without ranking them', () => {
    const lb = tallyBypassedGates([{ metadata: {} }, { metadata: { bypassed_gate: null } }]);
    expect(lb.ranked).toEqual([]);
    expect(lb.unattributed).toBe(2);
    expect(lb.total).toBe(2);
  });
});
