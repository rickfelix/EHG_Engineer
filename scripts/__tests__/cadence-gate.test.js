/**
 * Pre-Claim Cadence Gate — unit tests for lib/cadence/pre-claim-gate.mjs
 *
 * SD-LEO-INFRA-PR-CADENCE-PRECLAIM-GATE-001
 *
 * Covers FR-1, FR-2 helper-level acceptance criteria:
 *  (a) IN-WINDOW REFUSE — next_workable_after future
 *  (b) POST-WINDOW ALLOW — next_workable_after past
 *  (c) DERIVED FROM SESSION_LOG — pr_cadence_minimum_days + last session
 *  (d) NO-METADATA PASS-THROUGH — both inputs absent
 *  (e) DEFENSIVE INPUT HANDLING — undefined/empty inputs
 *  (f) FORMATTED REFUSAL MESSAGE — formatRefusalMessage shape
 */

import { describe, it, expect } from 'vitest';
import { computeGateState, formatRefusalMessage } from '../../lib/cadence/pre-claim-gate.mjs';

const NOW = Date.parse('2026-04-26T00:00:00Z');
const ONE_DAY = 86400000;

describe('computeGateState', () => {
  describe('source: next_workable_after', () => {
    it('case (a): IN-WINDOW REFUSE — future timestamp produces active gate with days_remaining', () => {
      const futureIso = new Date(NOW + 2 * ONE_DAY).toISOString();
      const result = computeGateState({
        governance_metadata: { next_workable_after: futureIso },
        now: NOW,
      });
      expect(result.active).toBe(true);
      expect(result.source).toBe('next_workable_after');
      expect(result.gate_until).toBe(futureIso);
      expect(result.days_remaining).toBe(2);
      expect(result.reason).toMatch(/2 day\(s\) remaining/);
    });

    it('case (b): POST-WINDOW ALLOW — past timestamp returns active=false', () => {
      const pastIso = new Date(NOW - ONE_DAY).toISOString();
      const result = computeGateState({
        governance_metadata: { next_workable_after: pastIso },
        now: NOW,
      });
      expect(result.active).toBe(false);
      expect(result.source).toBe('next_workable_after');
      expect(result.gate_until).toBe(pastIso);
      expect(result.days_remaining).toBe(0);
    });

    it('rounds days_remaining UP via ceil (1.1 days remaining → 2)', () => {
      const futureIso = new Date(NOW + Math.floor(1.1 * ONE_DAY)).toISOString();
      const result = computeGateState({
        governance_metadata: { next_workable_after: futureIso },
        now: NOW,
      });
      expect(result.days_remaining).toBe(2);
    });

    it('handles ISO with explicit timezone offset (UTC-equivalent comparison)', () => {
      // 1 day in future, expressed with non-Z offset
      const future = new Date(NOW + ONE_DAY);
      const isoWithOffset = future.toISOString().replace('Z', '+00:00');
      const result = computeGateState({
        governance_metadata: { next_workable_after: isoWithOffset },
        now: NOW,
      });
      expect(result.active).toBe(true);
      expect(result.days_remaining).toBe(1);
    });
  });

  describe('source: derived_from_session_log', () => {
    it('case (c): derives gate from session_log[last].session_ended_at + minimum_days', () => {
      const lastEndedIso = new Date(NOW - 1 * ONE_DAY).toISOString(); // 1 day ago
      const result = computeGateState({
        governance_metadata: {
          session_log: [
            { session_started_at: '2026-04-20T00:00:00Z', session_ended_at: lastEndedIso },
          ],
        },
        metadata: { pr_cadence_minimum_days: 3 }, // gate until 2 days from now
        now: NOW,
      });
      expect(result.active).toBe(true);
      expect(result.source).toBe('derived_from_session_log');
      expect(result.days_remaining).toBe(2);
    });

    it('falls back to pr_merged_at when session_ended_at is absent', () => {
      const mergedIso = new Date(NOW - 1 * ONE_DAY).toISOString();
      const result = computeGateState({
        governance_metadata: { session_log: [{ pr_merged_at: mergedIso }] },
        metadata: { pr_cadence_minimum_days: 3 },
        now: NOW,
      });
      expect(result.active).toBe(true);
      expect(result.source).toBe('derived_from_session_log');
      expect(result.days_remaining).toBe(2);
    });

    it('falls through to none when session_log empty even with minimum_days set', () => {
      const result = computeGateState({
        governance_metadata: { session_log: [] },
        metadata: { pr_cadence_minimum_days: 3 },
        now: NOW,
      });
      expect(result.active).toBe(false);
      expect(result.source).toBe('none');
    });

    it('falls through to none when session_log entries lack timestamps', () => {
      const result = computeGateState({
        governance_metadata: { session_log: [{ note: 'no timestamps here' }] },
        metadata: { pr_cadence_minimum_days: 3 },
        now: NOW,
      });
      expect(result.active).toBe(false);
      expect(result.source).toBe('none');
    });

    it('next_workable_after takes precedence over derived path', () => {
      const futureIso = new Date(NOW + 5 * ONE_DAY).toISOString();
      const lastEndedIso = new Date(NOW - 100 * ONE_DAY).toISOString(); // ancient
      const result = computeGateState({
        governance_metadata: {
          next_workable_after: futureIso,
          session_log: [{ session_ended_at: lastEndedIso }],
        },
        metadata: { pr_cadence_minimum_days: 3 },
        now: NOW,
      });
      expect(result.source).toBe('next_workable_after');
      expect(result.days_remaining).toBe(5);
    });
  });

  describe('case (d) and (e): no-metadata + defensive', () => {
    it('returns active:false, source:none when called with no inputs', () => {
      expect(computeGateState({}).active).toBe(false);
      expect(computeGateState({}).source).toBe('none');
    });

    it('returns active:false when called with completely empty payload', () => {
      const result = computeGateState();
      expect(result.active).toBe(false);
      expect(result.source).toBe('none');
    });

    it('tolerates undefined governance_metadata + undefined metadata', () => {
      const result = computeGateState({ governance_metadata: undefined, metadata: undefined });
      expect(result.active).toBe(false);
    });

    it('tolerates non-array session_log gracefully', () => {
      const result = computeGateState({
        governance_metadata: { session_log: 'not an array' },
        metadata: { pr_cadence_minimum_days: 3 },
        now: NOW,
      });
      expect(result.active).toBe(false);
      expect(result.source).toBe('none');
    });

    it('rejects non-positive pr_cadence_minimum_days', () => {
      const result = computeGateState({
        governance_metadata: { session_log: [{ session_ended_at: new Date(NOW).toISOString() }] },
        metadata: { pr_cadence_minimum_days: 0 },
        now: NOW,
      });
      expect(result.active).toBe(false);
    });

    it('rejects malformed ISO in next_workable_after — falls through to derived/none', () => {
      const result = computeGateState({
        governance_metadata: { next_workable_after: 'not an iso string' },
        now: NOW,
      });
      expect(result.active).toBe(false);
      expect(result.source).toBe('none');
    });
  });
});

describe('formatRefusalMessage', () => {
  it('case (f): builds operator-readable refusal containing all required tokens', () => {
    const futureIso = new Date(NOW + 2 * ONE_DAY).toISOString();
    const gateState = computeGateState({
      governance_metadata: { next_workable_after: futureIso },
      now: NOW,
    });
    const msg = formatRefusalMessage({ sdKey: 'SD-FIXTURE-001', gateState });
    // Must mention SD key, days remaining, override flag triplet, and the bypass-rubric anchor
    expect(msg).toContain('SD-FIXTURE-001');
    expect(msg).toMatch(/2 day\(s\) remaining/);
    expect(msg).toContain('--override-cadence-gate');
    expect(msg).toContain('--pattern-id');
    expect(msg).toContain('--followup-sd-key');
    expect(msg).toContain('bypass-rubric.js');
    expect(msg).toContain('next_workable_after');
  });
});
