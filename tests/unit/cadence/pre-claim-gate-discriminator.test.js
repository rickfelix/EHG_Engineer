/**
 * Unit tests for lib/cadence/pre-claim-gate.mjs computeGateState +
 * formatRefusalMessage unlock_gate vocabulary discriminator.
 *
 * SD-FDBK-ENH-CADENCE-VOCAB-DISCRIMINATOR-001
 *
 * Closes 19th-candidate witness of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001
 * (cadence-vocab variant). Covers PRD test scenarios TS-1..TS-4, TS-8, and
 * supplementary edge cases W-1, W-2, W-8 surfaced by PLAN-phase testing-agent.
 */

import { describe, it, expect } from 'vitest';
import {
  computeGateState,
  formatRefusalMessage,
  CADENCE_REFUSAL_TYPES,
} from '../../../lib/cadence/pre-claim-gate.mjs';

// Fixed "now" for deterministic time-window math (2026-05-10T00:00:00Z = 1778390400000 ms)
const FIXED_NOW = Date.UTC(2026, 4, 10);

// Future-dated next_workable_after used by multiple cases
const FUTURE_ISO = '2030-01-01T00:00:00Z';
// Past-dated for elapsed-window case
const PAST_ISO = '2020-01-01T00:00:00Z';

describe('CADENCE_REFUSAL_TYPES (export contract)', () => {
  it('is a Set instance', () => {
    expect(CADENCE_REFUSAL_TYPES).toBeInstanceOf(Set);
  });

  it('has exactly 2 entries (pr_cadence + time_window)', () => {
    expect(CADENCE_REFUSAL_TYPES.size).toBe(2);
    expect(CADENCE_REFUSAL_TYPES.has('pr_cadence')).toBe(true);
    expect(CADENCE_REFUSAL_TYPES.has('time_window')).toBe(true);
  });

  it('does NOT contain advisory types', () => {
    expect(CADENCE_REFUSAL_TYPES.has('usage_signal')).toBe(false);
    expect(CADENCE_REFUSAL_TYPES.has('value_proof')).toBe(false);
  });

  it('is frozen (TS-8 — module-load assertion)', () => {
    expect(Object.isFrozen(CADENCE_REFUSAL_TYPES)).toBe(true);
  });
});

describe('computeGateState — unlock_gate advisory discriminator', () => {
  it('TS-1: unlock_gate.type=usage_signal with future next_workable_after returns advisory', () => {
    const state = computeGateState({
      metadata: { unlock_gate: { type: 'usage_signal', trigger: 'chairman invokes /eva-support 3x/week' } },
      governance_metadata: { next_workable_after: FUTURE_ISO },
      now: FIXED_NOW,
    });
    expect(state.active).toBe(false);
    expect(state.source).toBe('unlock_gate_advisory');
    expect(state.gate_until).toBe(FUTURE_ISO);
    expect(state.days_remaining).toBeNull();
    expect(state.reason).toContain("usage_signal");
    expect(state.reason).toContain('advisory');
  });

  it('TS-2: unlock_gate.type=value_proof returns advisory (event-based)', () => {
    const state = computeGateState({
      metadata: { unlock_gate: { type: 'value_proof', trigger: 'Phase 2 ships AND chairman uses queries' } },
      governance_metadata: { next_workable_after: '2026-09-01T00:00:00Z' },
      now: FIXED_NOW,
    });
    expect(state.active).toBe(false);
    expect(state.source).toBe('unlock_gate_advisory');
    expect(state.gate_until).toBe('2026-09-01T00:00:00Z');
  });

  it('advisory path with NO next_workable_after preserves gate_until=null', () => {
    const state = computeGateState({
      metadata: { unlock_gate: { type: 'usage_signal' } },
      governance_metadata: {},
      now: FIXED_NOW,
    });
    expect(state.active).toBe(false);
    expect(state.source).toBe('unlock_gate_advisory');
    expect(state.gate_until).toBeNull();
  });
});

describe('computeGateState — refusal-eligible types fall through', () => {
  it('TS-4: unlock_gate.type=pr_cadence with future next_workable_after STILL refuses', () => {
    const state = computeGateState({
      metadata: { unlock_gate: { type: 'pr_cadence' } },
      governance_metadata: { next_workable_after: FUTURE_ISO },
      now: FIXED_NOW,
    });
    expect(state.active).toBe(true);
    expect(state.source).toBe('next_workable_after');
    expect(state.gate_until).toBe(FUTURE_ISO);
    expect(state.days_remaining).toBeGreaterThan(0);
  });

  it('unlock_gate.type=time_window with future next_workable_after STILL refuses', () => {
    const state = computeGateState({
      metadata: { unlock_gate: { type: 'time_window' } },
      governance_metadata: { next_workable_after: FUTURE_ISO },
      now: FIXED_NOW,
    });
    expect(state.active).toBe(true);
    expect(state.source).toBe('next_workable_after');
  });
});

describe('computeGateState — backward compatibility (no unlock_gate)', () => {
  it('TS-3: no metadata.unlock_gate + future next_workable_after returns existing active=true', () => {
    const state = computeGateState({
      metadata: {},
      governance_metadata: { next_workable_after: FUTURE_ISO },
      now: FIXED_NOW,
    });
    expect(state.active).toBe(true);
    expect(state.source).toBe('next_workable_after');
  });

  it('no metadata + elapsed next_workable_after returns active=false (existing behavior)', () => {
    const state = computeGateState({
      governance_metadata: { next_workable_after: PAST_ISO },
      now: FIXED_NOW,
    });
    expect(state.active).toBe(false);
    expect(state.days_remaining).toBe(0);
  });

  it('no metadata at all returns source=none (existing behavior)', () => {
    const state = computeGateState({});
    expect(state.active).toBe(false);
    expect(state.source).toBe('none');
  });
});

describe('computeGateState — edge cases (PLAN testing-agent recommendations)', () => {
  it('W-1: malformed unlock_gate (empty object) falls through (no advisory)', () => {
    const state = computeGateState({
      metadata: { unlock_gate: {} },
      governance_metadata: { next_workable_after: FUTURE_ISO },
      now: FIXED_NOW,
    });
    // unlock_gate.type is missing — advisory branch requires typeof type === 'string'
    expect(state.source).toBe('next_workable_after');
    expect(state.active).toBe(true);
  });

  it('W-1: malformed unlock_gate.type (non-string number) falls through', () => {
    const state = computeGateState({
      metadata: { unlock_gate: { type: 123 } },
      governance_metadata: { next_workable_after: FUTURE_ISO },
      now: FIXED_NOW,
    });
    expect(state.source).toBe('next_workable_after');
    expect(state.active).toBe(true);
  });

  it('W-2: unlock_gate.type=pr_cadence with NO next_workable_after AND no pr_cadence_minimum_days falls through to source=none', () => {
    const state = computeGateState({
      metadata: { unlock_gate: { type: 'pr_cadence' } },
      governance_metadata: {},
      now: FIXED_NOW,
    });
    // type is refusal-eligible (allowlist hit) — advisory branch skipped — falls through to
    // Source 1 (no next_workable_after) → Source 2 (no pr_cadence_minimum_days) → source=none
    expect(state.active).toBe(false);
    expect(state.source).toBe('none');
  });

  it('W-8: PAST next_workable_after + advisory unlock_gate returns advisory (precedence — advisory wins before timestamp eval)', () => {
    const state = computeGateState({
      metadata: { unlock_gate: { type: 'usage_signal' } },
      governance_metadata: { next_workable_after: PAST_ISO },
      now: FIXED_NOW,
    });
    expect(state.active).toBe(false);
    expect(state.source).toBe('unlock_gate_advisory');
    expect(state.gate_until).toBe(PAST_ISO);
  });

  it('null metadata + unlock_gate fixture does not crash', () => {
    const state = computeGateState({
      metadata: null,
      governance_metadata: null,
      now: FIXED_NOW,
    });
    expect(state.source).toBe('none');
  });
});

describe('formatRefusalMessage — source surfacing (FR-6)', () => {
  it('source value appears in formatted output for next_workable_after', () => {
    const msg = formatRefusalMessage({
      sdKey: 'SD-EX-001',
      gateState: {
        active: true,
        gate_until: FUTURE_ISO,
        days_remaining: 1366,
        reason: 'PR cadence: 1366 day(s) remaining',
        source: 'next_workable_after',
      },
    });
    expect(msg).toContain('source:     next_workable_after');
  });

  it('source value appears for advisory state (FR-6 AC-1)', () => {
    const msg = formatRefusalMessage({
      sdKey: 'SD-EX-001',
      gateState: {
        active: false,
        gate_until: FUTURE_ISO,
        days_remaining: null,
        reason: "unlock_gate.type='usage_signal' is event-based (advisory).",
        source: 'unlock_gate_advisory',
      },
    });
    expect(msg).toContain('source:     unlock_gate_advisory');
  });
});
