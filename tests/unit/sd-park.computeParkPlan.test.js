/**
 * Pure-logic unit tests for lib/sd-park.js computeParkPlan().
 *
 * No DB: exercises the terminal-status guard, the non-EXEC actor guard, the
 * reason guard, and the progress>=100 EXEC/PLAN edge detection + metadata patch
 * that auto_transition_status would otherwise flip to 'pending_approval'.
 *
 * SD-LEO-INFRA-PARKED-STATUS-REPLACE-001 — covers the pure portion of TS-3 and TS-6.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { computeParkPlan, PARK_STATUS } from '../../lib/sd-park.js';

const NOW = '2026-06-05T00:00:00.000Z';

describe('computeParkPlan — guards', () => {
  it('PARK_STATUS is the existing deferred enum (no new status value)', () => {
    expect(PARK_STATUS).toBe('deferred');
  });

  it('throws when no reason is provided', () => {
    expect(() => computeParkPlan(
      { sd_key: 'SD-X', status: 'active', current_phase: 'EXEC', progress: 50 },
      '', 'PLAN', NOW,
    )).toThrow(/reason/i);
  });

  it('throws when actor is EXEC (non-EXEC actor guard — TS-6)', () => {
    expect(() => computeParkPlan(
      { sd_key: 'SD-X', status: 'active', current_phase: 'EXEC', progress: 50 },
      'parking it', 'EXEC', NOW,
    )).toThrow(/non-EXEC actor/i);
  });

  it('throws when actor is empty/undefined (treated like EXEC)', () => {
    expect(() => computeParkPlan(
      { sd_key: 'SD-X', status: 'active', current_phase: 'EXEC', progress: 50 },
      'parking it', undefined, NOW,
    )).toThrow(/non-EXEC actor/i);
  });

  it('throws when SD is in a terminal status (completed)', () => {
    expect(() => computeParkPlan(
      { sd_key: 'SD-X', status: 'completed', current_phase: 'EXEC', progress: 100 },
      'parking it', 'PLAN', NOW,
    )).toThrow(/terminal status/i);
  });

  it('throws when SD is in a terminal status (cancelled)', () => {
    expect(() => computeParkPlan(
      { sd_key: 'SD-X', status: 'cancelled', current_phase: 'LEAD', progress: 0 },
      'parking it', 'LEAD', NOW,
    )).toThrow(/terminal status/i);
  });
});

describe('computeParkPlan — edge detection + metadata patch', () => {
  it('flags edge=true and records original progress when progress>=100 in EXEC (TS-3)', () => {
    const plan = computeParkPlan(
      { sd_key: 'SD-X', status: 'in_progress', current_phase: 'EXEC', progress: 100 },
      'set aside', 'PLAN', NOW,
    );
    expect(plan.edge).toBe(true);
    expect(plan.parkMetaPatch.parked_progress_original).toBe(100);
    expect(plan.parkMetaPatch.parked_from_status).toBe('in_progress');
    expect(plan.parkMetaPatch.park_reason).toBe('set aside');
    expect(plan.parkMetaPatch.parked_by).toBe('PLAN');
    expect(plan.parkMetaPatch.parked_at).toBe(NOW);
  });

  it('flags edge=true when progress>=100 in PLAN', () => {
    const plan = computeParkPlan(
      { sd_key: 'SD-X', status: 'in_progress', current_phase: 'PLAN', progress: 100 },
      'set aside', 'LEAD', NOW,
    );
    expect(plan.edge).toBe(true);
    expect(plan.parkMetaPatch.parked_progress_original).toBe(100);
  });

  it('edge=false (no normalization) when progress<100 even in EXEC', () => {
    const plan = computeParkPlan(
      { sd_key: 'SD-X', status: 'in_progress', current_phase: 'EXEC', progress: 99 },
      'set aside', 'PLAN', NOW,
    );
    expect(plan.edge).toBe(false);
    expect(plan.parkMetaPatch.parked_progress_original).toBeNull();
  });

  it('edge=false when progress>=100 but phase is LEAD (auto_transition only triggers in EXEC/PLAN)', () => {
    const plan = computeParkPlan(
      { sd_key: 'SD-X', status: 'active', current_phase: 'LEAD', progress: 100 },
      'set aside', 'LEAD', NOW,
    );
    expect(plan.edge).toBe(false);
    expect(plan.parkMetaPatch.parked_progress_original).toBeNull();
  });
});

describe('computeParkPlan — hold-state contract (SD-LEO-INFRA-HOLD-STATE-CONTRACT-001)', () => {
  const ORIGINAL = process.env.HOLD_STATE_CONTRACT_MODE;
  afterEach(() => { process.env.HOLD_STATE_CONTRACT_MODE = ORIGINAL; });

  it('TS-7 (regression): omitting review_at/release_condition is unchanged behavior in observe mode (default) — no throw, existing fields unaffected', () => {
    delete process.env.HOLD_STATE_CONTRACT_MODE;
    const plan = computeParkPlan(
      { sd_key: 'SD-X', status: 'active', current_phase: 'EXEC', progress: 50 },
      'set aside', 'PLAN', NOW,
    );
    expect(plan.holdCheck.ok).toBe(false);
    expect(plan.holdCheck.mode).toBe('observe');
    expect(plan.parkMetaPatch.park_reason).toBe('set aside');
    expect(plan.parkMetaPatch).not.toHaveProperty('park_review_at');
    expect(plan.parkMetaPatch).not.toHaveProperty('park_release_condition');
  });

  it('TS-1: enforce mode rejects a park missing review_at/release_condition before any DB write', () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    expect(() => computeParkPlan(
      { sd_key: 'SD-X', status: 'active', current_phase: 'EXEC', progress: 50 },
      'set aside', 'PLAN', NOW,
    )).toThrow(/Hold-state contract violation/);
  });

  it('enforce mode accepts a park carrying the full stamp, and records review_at/release_condition', () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    const plan = computeParkPlan(
      { sd_key: 'SD-X', status: 'active', current_phase: 'EXEC', progress: 50 },
      'set aside', 'PLAN', NOW,
      { reviewAt: '2026-08-01T00:00:00Z', releaseCondition: 'sibling done', writingSessionId: 'sess-1' },
    );
    expect(plan.holdCheck.ok).toBe(true);
    expect(plan.parkMetaPatch.park_review_at).toBe('2026-08-01T00:00:00Z');
    expect(plan.parkMetaPatch.park_release_condition).toBe('sibling done');
    expect(plan.parkMetaPatch.stamped_by_session).toBe('sess-1');
  });

  it('security Q5: a caller cannot override stamped_by_session via the reason/actor fields', () => {
    const plan = computeParkPlan(
      { sd_key: 'SD-X', status: 'active', current_phase: 'EXEC', progress: 50 },
      'set aside', 'PLAN', NOW,
      { writingSessionId: 'the-real-session' },
    );
    expect(plan.parkMetaPatch.stamped_by_session).toBe('the-real-session');
  });
});
